import { ForbiddenException, Inject, Injectable, Logger, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BANCO, type Banco } from '../banco/banco.module';
import { META_ACESSO, META_PUBLICO, type RegraAcesso } from './decoradores';
import { VERIFICADOR_TOKEN, type UsuarioAutenticado, type VerificadorToken } from './identidade';

const INTERVALO_REGISTRO_ACESSO_MS = 5 * 60 * 1000;

/**
 * Guarda global: toda rota exige login, a menos que esteja marcada com @Publico().
 *
 * 1. confere o token (Cognito em produção);
 * 2. busca o usuário no banco pelo identificador do login e pela origem (cliente ou equipe);
 * 3. recusa usuários inativos e empresas inativas;
 * 4. aplica @SoEquipe / @SoCliente e os papéis exigidos.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly log = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(BANCO) private readonly db: Banco,
    @Inject(VERIFICADOR_TOKEN) private readonly verificador: VerificadorToken,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const alvo = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(META_PUBLICO, alvo)) return true;

    const req = ctx.switchToHttp().getRequest();
    const cabecalho: string | undefined = req.headers?.authorization;
    const token = cabecalho?.startsWith('Bearer ') ? cabecalho.slice(7).trim() : undefined;
    if (!token) throw new UnauthorizedException('Faça login para continuar.');

    let identidade;
    try {
      identidade = await this.verificador.verificar(token);
    } catch (e) {
      this.log.debug(`Token recusado: ${(e as Error).message}`);
      throw new UnauthorizedException('Sessão inválida ou expirada. Faça login novamente.');
    }

    const linha = await this.db
      .selectFrom('usuarios as u')
      .leftJoin('empresas as e', 'e.id', 'u.empresa_id')
      .select(['u.id', 'u.origem', 'u.papel', 'u.nome', 'u.email', 'u.empresa_id', 'u.ativo', 'u.ultimo_acesso_em', 'e.tipo_cliente', 'e.situacao'])
      .where('u.cognito_sub', '=', identidade.sub)
      .where('u.origem', '=', identidade.origem)
      .executeTakeFirst();

    if (!linha || !linha.ativo) throw new ForbiddenException('Usuário sem acesso à Export Fácil.');
    if (linha.origem === 'cliente' && linha.situacao === 'inativa') {
      throw new ForbiddenException('O cadastro da sua empresa está inativo. Fale com a Export Fácil.');
    }

    const usuario: UsuarioAutenticado = {
      id: linha.id,
      origem: linha.origem,
      papel: linha.papel,
      nome: linha.nome,
      email: linha.email,
      empresaId: linha.empresa_id,
      tipoCliente: linha.tipo_cliente ?? null,
      situacaoEmpresa: linha.situacao ?? null,
    };
    req.usuario = usuario;

    const ultimo = linha.ultimo_acesso_em ? new Date(linha.ultimo_acesso_em).getTime() : 0;
    if (Date.now() - ultimo > INTERVALO_REGISTRO_ACESSO_MS) {
      this.db.updateTable('usuarios').set({ ultimo_acesso_em: new Date() }).where('id', '=', usuario.id).execute()
        .catch((e) => this.log.warn(`Não registrou último acesso: ${(e as Error).message}`));
    }

    const regra = this.reflector.getAllAndOverride<RegraAcesso | undefined>(META_ACESSO, alvo);
    if (regra) {
      if (regra.origem !== usuario.origem) throw new ForbiddenException('Área sem acesso para o seu tipo de conta.');
      if (regra.papeis.length && !regra.papeis.includes(usuario.papel)) {
        throw new ForbiddenException('O seu papel não permite esta ação.');
      }
    }
    return true;
  }
}
