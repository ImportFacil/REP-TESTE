import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PROVEDOR_IDENTIDADE, type ProvedorIdentidade, type UsuarioAutenticado } from '../auth/identidade';
import { BANCO, type Banco } from '../banco/banco.module';
import type { OrigemUsuario, Papel, Usuario } from '../banco/tipos';
import { PG_VIOLACAO_UNICA, codigoPg } from '../comum/erros';

const CAMPOS_PUBLICOS = ['id', 'origem', 'empresa_id', 'nome', 'email', 'papel', 'ativo', 'criado_em', 'ultimo_acesso_em'] as const;
export type UsuarioPublico = Pick<Usuario, (typeof CAMPOS_PUBLICOS)[number]>;

@Injectable()
export class UsuariosService {
  private readonly log = new Logger(UsuariosService.name);

  constructor(
    @Inject(BANCO) private readonly db: Banco,
    @Inject(PROVEDOR_IDENTIDADE) private readonly identidade: ProvedorIdentidade,
    private readonly auditoria: AuditoriaService,
  ) {}

  listarDaEmpresa(empresaId: string): Promise<UsuarioPublico[]> {
    return this.db.selectFrom('usuarios').select(CAMPOS_PUBLICOS).where('empresa_id', '=', empresaId).orderBy('nome').execute();
  }

  listarEquipe(): Promise<UsuarioPublico[]> {
    return this.db.selectFrom('usuarios').select(CAMPOS_PUBLICOS).where('origem', '=', 'equipe').orderBy('nome').execute();
  }

  /**
   * Cria o usuário no banco e o login no Cognito, que envia o convite por e-mail.
   * O registro no banco vem primeiro (sem o identificador do login) para que um e-mail
   * repetido seja recusado antes de qualquer convite sair.
   */
  async criar(
    dados: { origem: OrigemUsuario; empresaId: string | null; nome: string; email: string; papel: Papel },
    autor: UsuarioAutenticado,
    ip: string | null,
  ): Promise<UsuarioPublico> {
    if (dados.origem === 'cliente') {
      const empresa = await this.db.selectFrom('empresas').select('situacao').where('id', '=', dados.empresaId!).executeTakeFirst();
      if (!empresa) throw new NotFoundException('Empresa não encontrada.');
      if (empresa.situacao === 'inativa') throw new BadRequestException('Empresa inativa não recebe novos usuários.');
    }

    let criado: UsuarioPublico;
    try {
      criado = await this.db
        .insertInto('usuarios')
        .values({ origem: dados.origem, empresa_id: dados.empresaId, nome: dados.nome, email: dados.email, papel: dados.papel, cognito_sub: null })
        .returning(CAMPOS_PUBLICOS)
        .executeTakeFirstOrThrow();
    } catch (e) {
      if (codigoPg(e) === PG_VIOLACAO_UNICA) throw new ConflictException('Já existe um usuário com este e-mail.');
      throw e;
    }

    try {
      const { sub } = await this.identidade.convidar(dados.origem, dados.email, dados.nome);
      await this.db.updateTable('usuarios').set({ cognito_sub: sub }).where('id', '=', criado.id).execute();
    } catch (e) {
      // Sem login criado, o usuário fica inativo; a equipe pode reativá-lo e o convite é refeito.
      await this.db.updateTable('usuarios').set({ ativo: false }).where('id', '=', criado.id).execute();
      this.log.error(`Falha ao convidar ${dados.email}: ${(e as Error).message}`);
      throw new BadRequestException('Não foi possível enviar o convite de acesso. Tente novamente em instantes.');
    }

    await this.auditoria.registrar({ usuario: autor, acao: 'usuario.criar', entidade: 'usuario', entidadeId: criado.id, depois: criado, ip });
    return criado;
  }

  /**
   * Muda papel ou ativa/desativa. Desativar bloqueia o login no Cognito; o usuário nunca é apagado.
   * `escopoEmpresa` garante que um cliente só altera usuários da própria empresa.
   */
  async alterar(
    id: string,
    mudancas: { papel?: Papel; ativo?: boolean },
    autor: UsuarioAutenticado,
    ip: string | null,
    escopo: { origem: OrigemUsuario; empresaId?: string },
  ): Promise<UsuarioPublico> {
    if (id === autor.id && (mudancas.ativo === false || (mudancas.papel && mudancas.papel !== autor.papel))) {
      throw new BadRequestException('Você não pode desativar nem mudar o papel da sua própria conta.');
    }
    let q = this.db.selectFrom('usuarios').selectAll().where('id', '=', id).where('origem', '=', escopo.origem);
    if (escopo.empresaId) q = q.where('empresa_id', '=', escopo.empresaId);
    const antes = await q.executeTakeFirst();
    if (!antes) throw new NotFoundException('Usuário não encontrado.');

    const set = {
      ...(mudancas.papel !== undefined && { papel: mudancas.papel }),
      ...(mudancas.ativo !== undefined && { ativo: mudancas.ativo }),
    };
    if (!Object.keys(set).length) return pick(antes);

    if (mudancas.ativo === true && !antes.cognito_sub) {
      // Reativação de quem nunca recebeu o convite: tenta convidar de novo.
      const { sub } = await this.identidade.convidar(antes.origem, antes.email, antes.nome);
      Object.assign(set, { cognito_sub: sub });
    } else if (mudancas.ativo === true && !antes.ativo) {
      await this.identidade.reativar(antes.origem, antes.email);
    }
    const depois = await this.db.updateTable('usuarios').set(set).where('id', '=', id).returning(CAMPOS_PUBLICOS).executeTakeFirstOrThrow();
    if (mudancas.ativo === false && antes.ativo && antes.cognito_sub) {
      await this.identidade.desativar(antes.origem, antes.email).catch((e) =>
        this.log.error(`Usuário ${id} inativado no banco, mas o login não foi desativado no Cognito: ${(e as Error).message}`),
      );
    }
    await this.auditoria.registrar({ usuario: autor, acao: 'usuario.alterar', entidade: 'usuario', entidadeId: id, antes: pick(antes), depois, ip });
    return depois;
  }
}

function pick(u: Usuario): UsuarioPublico {
  return Object.fromEntries(CAMPOS_PUBLICOS.map((k) => [k, u[k]])) as UsuarioPublico;
}
