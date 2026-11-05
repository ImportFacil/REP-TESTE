import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { ARMAZENAMENTO, type Armazenamento } from '../arquivos/armazenamento';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UsuarioAutenticado } from '../auth/identidade';
import { BANCO, type Banco } from '../banco/banco.module';
import type { CadastroCredito, Faixa } from '../banco/tipos';
import { PagamentosService } from '../pagamentos/pagamentos.service';
import { PoliticaService } from '../pagamentos/politica.service';
import { FAIXAS, hojeBrasil } from '../pagamentos/regras';
import { DOCUMENTOS, documentosExigidos, type TipoDocumento } from './documentos-exigidos';

const TIPOS_ARQUIVO = ['application/pdf', 'image/jpeg', 'image/png'];
export const TAMANHO_MAX_ARQUIVO = 10 * 1024 * 1024;
/** O financeiro aprova até este valor; acima, só o administrador (diretoria). */
export const ALCADA_FINANCEIRO_CENTAVOS = 10_000_000;
/** Nenhum limite passa de 10% do faturamento mensal declarado. */
export const TETO_FATURAMENTO_BP = 1000;

export interface ArquivoRecebido {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Módulo "Crédito": cadastro da empresa, documentos, análise e limite (só o boleto usa limite). */
@Injectable()
export class CreditoService {
  constructor(
    @Inject(BANCO) private readonly db: Banco,
    @Inject(ARMAZENAMENTO) private readonly arquivos: Armazenamento,
    private readonly auditoria: AuditoriaService,
    private readonly pagamentos: PagamentosService,
    private readonly politica: PoliticaService,
  ) {}

  private async empresa(empresaId: string) {
    const e = await this.db.selectFrom('empresas').selectAll().where('id', '=', empresaId).executeTakeFirst();
    if (!e) throw new NotFoundException('Empresa não encontrada.');
    return e;
  }

  private async cadastroOuNovo(empresaId: string): Promise<CadastroCredito> {
    await this.db.insertInto('cadastros_credito').values({ empresa_id: empresaId, faturamento_mensal_centavos: null, compras_mensais_previstas_centavos: null, limite_solicitado_centavos: null, anos_cnpj: null, faixa: null, parecer: null, analista_id: null, enviado_em: null, decidido_em: null })
      .onConflict((oc) => oc.column('empresa_id').doNothing()).execute();
    return this.db.selectFrom('cadastros_credito').selectAll().where('empresa_id', '=', empresaId).executeTakeFirstOrThrow();
  }

  /** Cadastro completo: dados, documentos enviados, documentos que faltam e o resumo do limite. */
  async detalhe(empresaId: string) {
    const empresa = await this.empresa(empresaId);
    const cadastro = await this.cadastroOuNovo(empresaId);
    const docs = await this.db.selectFrom('documentos')
      .select(['id', 'tipo', 'nome_arquivo', 'tipo_conteudo', 'tamanho_bytes', 'criado_em'])
      .where('dono', '=', 'cadastro').where('dono_id', '=', empresaId).where('substituido', '=', false).orderBy('criado_em').execute();
    const exigidos = documentosExigidos(empresa.tipo_cliente, cadastro.limite_solicitado_centavos);
    const enviados = new Set(docs.map((d) => d.tipo));
    const historico = await this.db.selectFrom('limites_credito as l').innerJoin('usuarios as u', 'u.id', 'l.aprovado_por')
      .select(['l.faixa', 'l.valor_centavos', 'l.motivo', 'l.criado_em', 'u.nome as aprovado_por']).where('l.empresa_id', '=', empresaId)
      .orderBy('l.id', 'desc').execute();
    return {
      empresa: { id: empresa.id, razao_social: empresa.razao_social, cnpj: empresa.cnpj, tipo_cliente: empresa.tipo_cliente, conta_e_ordem_liberada: empresa.conta_e_ordem_liberada },
      cadastro,
      documentos: docs.map((d) => ({ ...d, descricao: DOCUMENTOS[d.tipo as TipoDocumento] ?? d.tipo })),
      exigidos: exigidos.map((t) => ({ tipo: t, descricao: DOCUMENTOS[t], enviado: enviados.has(t) })),
      faltando: exigidos.filter((t) => !enviados.has(t)),
      resumo: await this.pagamentos.resumoCredito(empresaId),
      historico_limites: historico,
    };
  }

  /** O cliente preenche e edita enquanto o cadastro não está em análise. */
  async salvar(empresaId: string, dados: { faturamento_mensal_centavos?: number; compras_mensais_previstas_centavos?: number; limite_solicitado_centavos?: number; anos_cnpj?: number; dados?: Record<string, unknown> }) {
    const cad = await this.cadastroOuNovo(empresaId);
    if (cad.situacao === 'em_analise') throw new BadRequestException('O cadastro está em análise e não pode ser alterado agora.');
    const set = Object.fromEntries(Object.entries({ ...dados, dados: dados.dados ? JSON.stringify(dados.dados) : undefined }).filter(([, v]) => v !== undefined));
    if (Object.keys(set).length) await this.db.updateTable('cadastros_credito').set(set).where('empresa_id', '=', empresaId).execute();
    return this.detalhe(empresaId);
  }

  async enviarDocumento(empresaId: string, tipo: string, arquivo: ArquivoRecebido | undefined, autor: UsuarioAutenticado) {
    if (!(tipo in DOCUMENTOS)) throw new BadRequestException('Tipo de documento desconhecido.');
    if (!arquivo) throw new BadRequestException('Envie o arquivo no campo "arquivo".');
    if (arquivo.size > TAMANHO_MAX_ARQUIVO) throw new PayloadTooLargeException('O arquivo passa de 10 MB.');
    if (!TIPOS_ARQUIVO.includes(arquivo.mimetype)) throw new BadRequestException('Envie PDF, JPG ou PNG.');
    const cad = await this.cadastroOuNovo(empresaId);
    if (cad.situacao === 'em_analise') throw new BadRequestException('O cadastro está em análise; aguarde a resposta para enviar novos documentos.');

    const nome = arquivo.originalname.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80) || 'arquivo';
    const chave = `empresas/${empresaId}/cadastro/${randomUUID()}-${nome}`;
    await this.arquivos.salvar(chave, arquivo.buffer, arquivo.mimetype);
    return this.db.transaction().execute(async (trx) => {
      await trx.updateTable('documentos').set({ substituido: true })
        .where('dono', '=', 'cadastro').where('dono_id', '=', empresaId).where('tipo', '=', tipo).where('substituido', '=', false).execute();
      return trx.insertInto('documentos').values({
        empresa_id: empresaId, dono: 'cadastro', dono_id: empresaId, tipo, nome_arquivo: arquivo.originalname.slice(0, 200),
        tipo_conteudo: arquivo.mimetype, tamanho_bytes: arquivo.size, chave,
        sha256: createHash('sha256').update(arquivo.buffer).digest('hex'), enviado_por: autor.id,
      }).returning(['id', 'tipo', 'nome_arquivo', 'tamanho_bytes', 'criado_em']).executeTakeFirstOrThrow();
    });
  }

  /** Baixa um documento. `empresaId` presente = acesso de cliente, preso à própria empresa. */
  async lerDocumento(documentoId: string, empresaId?: string) {
    let q = this.db.selectFrom('documentos').selectAll().where('id', '=', documentoId);
    if (empresaId) q = q.where('empresa_id', '=', empresaId);
    const d = await q.executeTakeFirst();
    if (!d) throw new NotFoundException('Documento não encontrado.');
    return { documento: d, conteudo: await this.arquivos.ler(d.chave) };
  }

  async enviarParaAnalise(empresaId: string, autor: UsuarioAutenticado, ip: string | null) {
    const det = await this.detalhe(empresaId);
    const c = det.cadastro;
    if (c.situacao === 'em_analise') throw new BadRequestException('O cadastro já está em análise.');
    if (!c.faturamento_mensal_centavos || !c.limite_solicitado_centavos) throw new BadRequestException('Informe o faturamento mensal e o limite desejado.');
    if (det.faltando.length) throw new BadRequestException(`Faltam documentos: ${det.faltando.map((t) => DOCUMENTOS[t]).join('; ')}.`);
    await this.db.updateTable('cadastros_credito').set({ situacao: 'em_analise', enviado_em: new Date() }).where('empresa_id', '=', empresaId).execute();
    await this.auditoria.registrar({ usuario: autor, acao: 'credito.enviar', entidade: 'cadastro_credito', entidadeId: empresaId, ip });
    return this.detalhe(empresaId);
  }

  // ---------- Painel da equipe ----------

  async fila(situacao?: string) {
    let q = this.db.selectFrom('cadastros_credito as c').innerJoin('empresas as e', 'e.id', 'c.empresa_id')
      .select(['c.empresa_id', 'c.situacao', 'c.faixa', 'c.limite_aprovado_centavos', 'c.limite_solicitado_centavos', 'c.faturamento_mensal_centavos',
        'c.enviado_em', 'c.decidido_em', 'c.proxima_revisao_em', 'e.razao_social', 'e.cnpj', 'e.tipo_cliente'])
      .orderBy(sql`c.enviado_em`, sql`desc nulls last`);
    if (situacao) q = q.where('c.situacao', '=', situacao as never);
    return q.execute();
  }

  /** Limite sugerido: 2× o pedido mínimo do tipo, ajustado pela faixa, respeitando o teto de 10% do faturamento. */
  async sugestao(empresaId: string, faixa: Faixa) {
    const e = await this.empresa(empresaId);
    const cad = await this.cadastroOuNovo(empresaId);
    const tabela = await this.db.selectFrom('tabelas_preco').select('pedido_minimo_centavos').where('tipo_cliente', '=', e.tipo_cliente).executeTakeFirstOrThrow();
    const referencia = 2 * tabela.pedido_minimo_centavos;
    const teto = cad.faturamento_mensal_centavos ? Math.floor((cad.faturamento_mensal_centavos * TETO_FATURAMENTO_BP) / 10_000) : 0;
    return { referencia_centavos: referencia, teto_faturamento_centavos: teto, sugerido_centavos: Math.min(Math.round(referencia * FAIXAS[faixa].fator), teto) };
  }

  async decidir(
    empresaId: string,
    d: { acao: 'aprovar' | 'pedir_documentos' | 'reprovar'; faixa?: Faixa; limite_centavos?: number; parecer: string },
    autor: UsuarioAutenticado,
    ip: string | null,
  ) {
    const antes = await this.cadastroOuNovo(empresaId);
    if (d.acao !== 'aprovar') {
      if (antes.situacao !== 'em_analise') throw new BadRequestException('Só cadastros em análise podem ser devolvidos ou reprovados.');
      const situacao = d.acao === 'reprovar' ? 'reprovado' : 'pendente_documentos';
      const depois = await this.db.updateTable('cadastros_credito')
        .set({ situacao, parecer: d.parecer, analista_id: autor.id, decidido_em: new Date(), ...(d.acao === 'reprovar' && { limite_aprovado_centavos: 0, faixa: null }) })
        .where('empresa_id', '=', empresaId).returningAll().executeTakeFirstOrThrow();
      await this.auditoria.registrar({ usuario: autor, acao: `credito.${d.acao}`, entidade: 'cadastro_credito', entidadeId: empresaId, antes, depois, ip });
      return this.detalhe(empresaId);
    }

    if (!['em_analise', 'aprovado'].includes(antes.situacao)) throw new BadRequestException('Aprove um cadastro em análise (ou revise um já aprovado).');
    if (!d.faixa) throw new BadRequestException('Informe a faixa de risco (A, B ou C).');
    const limite = d.faixa === 'C' ? 0 : d.limite_centavos ?? -1;
    if (limite < 0) throw new BadRequestException('Informe o limite aprovado.');
    const { teto_faturamento_centavos: teto } = await this.sugestao(empresaId, d.faixa);
    if (limite > teto) throw new BadRequestException(`O limite passa de 10% do faturamento mensal declarado (máximo ${teto / 100} reais).`);
    if (limite > ALCADA_FINANCEIRO_CENTAVOS && autor.papel !== 'administrador') {
      throw new ForbiddenException('Limites acima de R$ 100.000,00 são aprovados pela diretoria (administrador), com garantia.');
    }
    const revisao = new Date(`${hojeBrasil()}T12:00:00Z`);
    revisao.setUTCMonth(revisao.getUTCMonth() + FAIXAS[d.faixa].revisaoMeses);

    return this.db.transaction().execute(async (trx) => {
      const depois = await trx.updateTable('cadastros_credito')
        .set({ situacao: 'aprovado', faixa: d.faixa!, limite_aprovado_centavos: limite, parecer: d.parecer, analista_id: autor.id, decidido_em: new Date(), proxima_revisao_em: revisao.toISOString().slice(0, 10) })
        .where('empresa_id', '=', empresaId).returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('limites_credito').values({ empresa_id: empresaId, faixa: d.faixa!, valor_centavos: limite, aprovado_por: autor.id, motivo: d.parecer }).execute();
      await this.auditoria.registrar({ usuario: autor, acao: 'credito.aprovar', entidade: 'cadastro_credito', entidadeId: empresaId, antes, depois, ip }, trx);
      return depois;
    }).then(() => this.detalhe(empresaId));
  }

  /**
   * Conta e ordem só para "cliente grande": pedidos mensais a partir do valor da política
   * (R$ 400.000,00), previstos no cadastro ou na média dos últimos 3 meses, e crédito na faixa A.
   * O administrador pode liberar fora da regra, com motivo registrado.
   */
  async definirContaEOrdem(empresaId: string, d: { liberar: boolean; motivo?: string; forcar?: boolean }, autor: UsuarioAutenticado, ip: string | null) {
    const empresa = await this.empresa(empresaId);
    const avaliacao = await this.avaliarClienteGrande(empresaId);
    if (d.liberar && !avaliacao.elegivel) {
      if (!d.forcar) throw new BadRequestException(`A empresa ainda não atende à regra de cliente grande: ${avaliacao.motivos.join(' ')}`);
      if (autor.papel !== 'administrador') throw new ForbiddenException('Só o administrador libera a conta e ordem fora da regra.');
      if (!d.motivo?.trim()) throw new BadRequestException('Informe o motivo da liberação fora da regra.');
    }
    await this.db.updateTable('empresas').set({ conta_e_ordem_liberada: d.liberar }).where('id', '=', empresaId).execute();
    await this.auditoria.registrar({
      usuario: autor, acao: d.liberar ? 'empresa.liberar_conta_e_ordem' : 'empresa.bloquear_conta_e_ordem', entidade: 'empresa', entidadeId: empresaId,
      antes: { conta_e_ordem_liberada: empresa.conta_e_ordem_liberada }, depois: { conta_e_ordem_liberada: d.liberar, motivo: d.motivo ?? null, avaliacao }, ip,
    });
    return { conta_e_ordem_liberada: d.liberar, avaliacao };
  }

  async avaliarClienteGrande(empresaId: string) {
    const pol = await this.politica.atual();
    const cad = await this.cadastroOuNovo(empresaId);
    const media = await this.db.selectFrom('pedidos').select(sql<number>`coalesce(sum(total_centavos), 0)::bigint / 3`.as('v'))
      .where('empresa_id', '=', empresaId).where('situacao', '!=', 'cancelado').where(sql<boolean>`criado_em >= now() - interval '90 days'`)
      .executeTakeFirstOrThrow();
    const previsto = cad.compras_mensais_previstas_centavos ?? 0;
    const minimo = pol.cliente_grande_mensal_centavos;
    const volumeOk = previsto >= minimo || Number(media.v) >= minimo;
    const faixaOk = cad.situacao === 'aprovado' && cad.faixa === 'A';
    const motivos: string[] = [];
    if (!volumeOk) motivos.push(`Pedidos mensais previstos ou médios abaixo de R$ ${(minimo / 100).toLocaleString('pt-BR')}.`);
    if (!faixaOk) motivos.push('O crédito precisa estar aprovado na faixa A.');
    return { elegivel: volumeOk && faixaOk, minimo_mensal_centavos: minimo, previsto_mensal_centavos: previsto, media_3_meses_centavos: Number(media.v), faixa: cad.faixa, motivos };
  }
}
