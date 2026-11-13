import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UsuarioAutenticado } from '../auth/identidade';
import { BANCO, type Banco } from '../banco/banco.module';
import type { FormaPagamento } from '../banco/tipos';
import { CatalogoService } from '../catalogo/catalogo.service';
import { LojaService } from '../loja/loja.service';
import { MarketingService } from '../marketing/marketing.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { hojeBrasil, somarDias } from '../pagamentos/regras';
import { PedidosService, type NovoPedido } from '../pedidos/pedidos.service';

export interface NovaRequisicao {
  itens: Array<{ produto_id: number; quantidade: number }>;
  forma_pagamento: FormaPagamento; parcelas?: number; cupom?: string; endereco_id?: number; ordem_compra?: string; observacao?: string;
}
export interface Fechamento { forma_pagamento?: FormaPagamento; parcelas?: number; token_cartao?: string; endereco_id?: number; ordem_compra?: string; observacao?: string }

/** B2B no formato do Bagisto B2B: aprovação de compras acima do limite do comprador e cotações de preço negociado. */
@Injectable()
export class B2bService {
  constructor(
    @Inject(BANCO) private readonly db: Banco,
    private readonly pedidos: PedidosService,
    private readonly catalogo: CatalogoService,
    private readonly marketing: MarketingService,
    private readonly loja: LojaService,
    private readonly notificacoes: NotificacoesService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private async nomesDosProdutos(ids: number[]) {
    if (!ids.length) return new Map<number, { codigo: string; nome: string; unidade: string }>();
    const r = await this.db.selectFrom('produtos').select(['id', 'codigo', 'nome', 'unidade']).where('id', 'in', ids).execute();
    return new Map(r.map((p) => [p.id, p]));
  }

  // ======================= requisições (aprovação de compra) =======================

  /** O comprador manda a compra para o aprovador. Os preços valem na hora da aprovação. */
  async criarRequisicao(u: UsuarioAutenticado, d: NovaRequisicao, ip: string | null) {
    const cot = await this.pedidos.cotarParaPedido(u, d.itens);
    if (!cot.pode_fechar) {
      throw new BadRequestException(cot.atinge_pedido_minimo ? 'Há itens com problema (múltiplo de venda, estoque ou produto sob orçamento).' : 'A compra não atinge o pedido mínimo do seu tipo de cliente.');
    }
    if (d.endereco_id) await this.loja.enderecoDaEmpresa(u.empresaId!, d.endereco_id);
    const promo = await this.marketing.avaliar(this.db, { empresaId: u.empresaId!, tipoCliente: cot.tipo_cliente }, cot.itens, cot.subtotal_centavos, d.cupom);
    if (d.cupom?.trim() && promo.cupom_erro) throw new BadRequestException(promo.cupom_erro);
    const total = cot.subtotal_centavos - Math.min(promo.promocao?.desconto_centavos ?? 0, cot.subtotal_centavos - 1);
    const r = await this.db.insertInto('requisicoes').values({
      empresa_id: u.empresaId!, solicitante_id: u.id, itens: JSON.stringify(cot.itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade }))),
      forma_pagamento: d.forma_pagamento, parcelas: d.parcelas ?? 1, cupom: d.cupom?.trim().toUpperCase() || null, endereco_id: d.endereco_id ?? null,
      ordem_compra: d.ordem_compra?.trim() || null, observacao: d.observacao?.trim() || null, total_estimado_centavos: total,
    }).returningAll().executeTakeFirstOrThrow();
    await this.auditoria.registrar({ usuario: u, acao: 'requisicao.criar', entidade: 'requisicao', entidadeId: r.id, depois: { total, itens: cot.itens.length }, ip });
    const empresa = await this.db.selectFrom('empresas').select('razao_social').where('id', '=', u.empresaId!).executeTakeFirstOrThrow();
    await this.notificacoes.registrar({
      empresaId: u.empresaId!, destinatarios: await this.notificacoes.contatosFinanceiros(u.empresaId!), modelo: 'requisicao_pendente', chave: `requisicao:${r.id}`,
      dados: { solicitante: u.nome, empresa: empresa.razao_social, valor_centavos: total, requisicao: r.id },
    });
    return this.requisicao(u, r.id);
  }

  /** Aprovador vê todas as da empresa; comprador, só as dele. */
  async requisicoes(u: UsuarioAutenticado) {
    let q = this.db.selectFrom('requisicoes as r').innerJoin('usuarios as s', 's.id', 'r.solicitante_id').leftJoin('usuarios as d', 'd.id', 'r.decidida_por')
      .select(['r.id', 'r.situacao', 'r.forma_pagamento', 'r.parcelas', 'r.total_estimado_centavos', 'r.ordem_compra', 'r.criado_em', 'r.decidida_em', 'r.motivo', 'r.pedido_id',
        's.nome as solicitante', 'd.nome as decidida_por', sql<number>`jsonb_array_length(r.itens)`.as('qtd_itens')])
      .where('r.empresa_id', '=', u.empresaId!);
    if (u.papel !== 'aprovador') q = q.where('r.solicitante_id', '=', u.id);
    return q.orderBy(sql`r.situacao = 'pendente'`, 'desc').orderBy('r.id', 'desc').execute();
  }

  /** Detalhe com o preço de hoje de cada item (é o que vale se for aprovada agora). */
  async requisicao(u: UsuarioAutenticado, id: number) {
    let q = this.db.selectFrom('requisicoes as r').innerJoin('usuarios as s', 's.id', 'r.solicitante_id').leftJoin('usuarios as d', 'd.id', 'r.decidida_por')
      .selectAll('r').select(['s.nome as solicitante', 's.limite_pedido_centavos as limite_solicitante', 'd.nome as decidida_por_nome'])
      .where('r.id', '=', id).where('r.empresa_id', '=', u.empresaId!);
    if (u.papel !== 'aprovador') q = q.where('r.solicitante_id', '=', u.id);
    const r = await q.executeTakeFirst();
    if (!r) throw new NotFoundException('Requisição não encontrada.');
    const cot = await this.pedidos.cotarParaPedido(u, r.itens).catch(() => null);
    const nomes = await this.nomesDosProdutos(r.itens.map((i) => i.produto_id));
    return {
      ...r,
      itens: r.itens.map((i) => {
        const c = cot?.itens.find((x) => x.produto_id === i.produto_id);
        return { ...i, ...nomes.get(i.produto_id), preco_unitario_centavos: c?.preco_unitario_centavos ?? null, total_centavos: c?.total_centavos ?? null, problema: c?.problema ?? (cot ? null : 'indisponivel') };
      }),
      subtotal_hoje_centavos: cot?.subtotal_centavos ?? null,
      pode_aprovar: !!cot?.pode_fechar,
    };
  }

  /** O aprovador fecha o pedido (pode trocar a forma de pagamento). A requisição é reservada antes, para não sair em dobro. */
  async aprovarRequisicao(u: UsuarioAutenticado, id: number, f: Fechamento, ip: string | null) {
    const r = await this.db.updateTable('requisicoes').set({ situacao: 'aprovada', decidida_por: u.id, decidida_em: new Date() })
      .where('id', '=', id).where('empresa_id', '=', u.empresaId!).where('situacao', '=', 'pendente').returningAll().executeTakeFirst();
    if (!r) throw await this.naoPendente(u, id);
    const solicitante = await this.db.selectFrom('usuarios').select(['nome', 'email']).where('id', '=', r.solicitante_id).executeTakeFirstOrThrow();
    const dto: NovoPedido = {
      itens: r.itens, forma_pagamento: f.forma_pagamento ?? r.forma_pagamento, parcelas: f.parcelas ?? r.parcelas, token_cartao: f.token_cartao,
      cupom: r.cupom ?? undefined, endereco_id: f.endereco_id ?? r.endereco_id ?? undefined, ordem_compra: f.ordem_compra ?? r.ordem_compra ?? undefined,
      observacao: f.observacao ?? r.observacao ?? undefined,
    };
    let pedido: { id: number };
    try {
      pedido = await this.pedidos.criar(u, dto, ip, { compradorId: r.solicitante_id, compradorNome: solicitante.nome, aprovadoPor: u.id, requisicaoId: r.id });
    } catch (e) {
      await this.db.updateTable('requisicoes').set({ situacao: 'pendente', decidida_por: null, decidida_em: null }).where('id', '=', id).execute();
      throw e;
    }
    await this.db.updateTable('requisicoes').set({ pedido_id: pedido.id }).where('id', '=', id).execute();
    await this.auditoria.registrar({ usuario: u, acao: 'requisicao.aprovar', entidade: 'requisicao', entidadeId: id, depois: { pedido_id: pedido.id }, ip });
    await this.notificacoes.registrar({
      empresaId: u.empresaId!, destinatarios: [solicitante.email], modelo: 'requisicao_decidida', chave: `requisicao-decidida:${id}`,
      dados: { nome: solicitante.nome, requisicao: id, decisao: 'aprovada', aprovador: u.nome, detalhe: `O pedido nº ${pedido.id} foi fechado.` },
    });
    return { requisicao: await this.requisicao(u, id), pedido };
  }

  async recusarRequisicao(u: UsuarioAutenticado, id: number, motivo: string, ip: string | null) {
    const r = await this.db.updateTable('requisicoes').set({ situacao: 'recusada', decidida_por: u.id, decidida_em: new Date(), motivo })
      .where('id', '=', id).where('empresa_id', '=', u.empresaId!).where('situacao', '=', 'pendente').returningAll().executeTakeFirst();
    if (!r) throw await this.naoPendente(u, id);
    const s = await this.db.selectFrom('usuarios').select(['nome', 'email']).where('id', '=', r.solicitante_id).executeTakeFirstOrThrow();
    await this.auditoria.registrar({ usuario: u, acao: 'requisicao.recusar', entidade: 'requisicao', entidadeId: id, depois: { motivo }, ip });
    await this.notificacoes.registrar({
      empresaId: u.empresaId!, destinatarios: [s.email], modelo: 'requisicao_decidida', chave: `requisicao-decidida:${id}`,
      dados: { nome: s.nome, requisicao: id, decisao: 'recusada', aprovador: u.nome, detalhe: `Motivo: ${motivo}` },
    });
    return this.requisicao(u, id);
  }

  async cancelarRequisicao(u: UsuarioAutenticado, id: number, ip: string | null) {
    const r = await this.db.updateTable('requisicoes').set({ situacao: 'cancelada', decidida_por: u.id, decidida_em: new Date() })
      .where('id', '=', id).where('solicitante_id', '=', u.id).where('situacao', '=', 'pendente').returning('id').executeTakeFirst();
    if (!r) throw await this.naoPendente(u, id);
    await this.auditoria.registrar({ usuario: u, acao: 'requisicao.cancelar', entidade: 'requisicao', entidadeId: id, ip });
    return this.requisicao(u, id);
  }

  private async naoPendente(u: UsuarioAutenticado, id: number) {
    const r = await this.db.selectFrom('requisicoes').select('situacao').where('id', '=', id).where('empresa_id', '=', u.empresaId!).executeTakeFirst();
    return r ? new ConflictException(`A requisição já está ${r.situacao}.`) : new NotFoundException('Requisição não encontrada.');
  }

  // ======================= cotações de preço negociado =======================

  /** Respondidas com a validade vencida passam a "expirada" (verificado a cada consulta). */
  private async expirar() {
    await this.db.updateTable('cotacoes').set({ situacao: 'expirada' }).where('situacao', '=', 'respondida').where('validade', '<', hojeBrasil()).execute();
  }

  async criarCotacao(u: UsuarioAutenticado, d: { itens: Array<{ produto_id: number; quantidade: number }>; mensagem?: string }, ip: string | null) {
    const cot = await this.catalogo.cotar(u, { itens: d.itens });
    const ruins = cot.itens.filter((i) => i.problema === 'quantidade_invalida' || i.problema === 'fora_do_multiplo');
    if (ruins.length) throw new BadRequestException(`Quantidade fora do múltiplo de venda: ${ruins.map((i) => i.codigo).join(', ')}.`);
    const c = await this.db.transaction().execute(async (trx) => {
      const c = await trx.insertInto('cotacoes').values({ empresa_id: u.empresaId!, solicitante_id: u.id, mensagem: d.mensagem?.trim() || null, atualizado_em: new Date() })
        .returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('cotacao_itens').values(cot.itens.map((i) => ({ cotacao_id: c.id, produto_id: i.produto_id, quantidade: i.quantidade, preco_cliente_centavos: i.preco_unitario_centavos }))).execute();
      await this.auditoria.registrar({ usuario: u, acao: 'cotacao.criar', entidade: 'cotacao', entidadeId: c.id, depois: { itens: cot.itens.length }, ip }, trx);
      return c;
    });
    return this.cotacao(c.id, u.empresaId!);
  }

  async cotacoes(empresaId?: string) {
    await this.expirar();
    let q = this.db.selectFrom('cotacoes as c').innerJoin('empresas as e', 'e.id', 'c.empresa_id').innerJoin('usuarios as s', 's.id', 'c.solicitante_id')
      .select(['c.id', 'c.situacao', 'c.validade', 'c.criado_em', 'c.respondida_em', 'c.pedido_id', 'e.razao_social', 'e.tipo_cliente', 's.nome as solicitante',
        sql<number>`(select count(*)::int from cotacao_itens i where i.cotacao_id = c.id)`.as('qtd_itens'),
        sql<number>`(select sum(i.quantidade * i.preco_cliente_centavos)::bigint from cotacao_itens i where i.cotacao_id = c.id)`.as('tabela_centavos'),
        sql<number | null>`(select sum(i.quantidade * i.preco_proposto_centavos)::bigint from cotacao_itens i where i.cotacao_id = c.id and c.situacao <> 'solicitada')`.as('proposto_centavos')]);
    if (empresaId) q = q.where('c.empresa_id', '=', empresaId);
    const r = await q.orderBy(sql`c.situacao = 'solicitada'`, 'desc').orderBy('c.id', 'desc').execute();
    return r.map((x) => ({ ...x, tabela_centavos: Number(x.tabela_centavos ?? 0), proposto_centavos: x.proposto_centavos === null ? null : Number(x.proposto_centavos) }));
  }

  async cotacao(id: number, empresaId?: string) {
    await this.expirar();
    let q = this.db.selectFrom('cotacoes as c').innerJoin('empresas as e', 'e.id', 'c.empresa_id').innerJoin('usuarios as s', 's.id', 'c.solicitante_id')
      .leftJoin('usuarios as r', 'r.id', 'c.respondida_por').selectAll('c')
      .select(['e.razao_social', 'e.tipo_cliente', 's.nome as solicitante', 's.email as solicitante_email', 'r.nome as respondida_por_nome']).where('c.id', '=', id);
    if (empresaId) q = q.where('c.empresa_id', '=', empresaId);
    const c = await q.executeTakeFirst();
    if (!c) throw new NotFoundException('Cotação não encontrada.');
    const itens = await this.db.selectFrom('cotacao_itens as i').innerJoin('produtos as p', 'p.id', 'i.produto_id')
      .select(['i.id', 'i.produto_id', 'i.quantidade', 'i.preco_cliente_centavos', 'i.preco_proposto_centavos', 'p.codigo', 'p.nome', 'p.unidade', 'p.estoque', 'p.preco_tabela_centavos'])
      .where('i.cotacao_id', '=', id).orderBy('i.id').execute();
    const tabela = itens.reduce((s, i) => s + i.quantidade * i.preco_cliente_centavos, 0);
    const proposto = itens.every((i) => i.preco_proposto_centavos) ? itens.reduce((s, i) => s + i.quantidade * i.preco_proposto_centavos!, 0) : null;
    return { ...c, itens, tabela_centavos: tabela, proposto_centavos: proposto, economia_centavos: proposto === null ? null : tabela - proposto };
  }

  /** A equipe responde com o preço de cada item e a validade (pode responder de novo enquanto não for aceita). */
  async responderCotacao(id: number, d: { itens: Array<{ produto_id: number; preco_proposto_centavos: number }>; resposta?: string; validade_dias: number }, autor: UsuarioAutenticado, ip: string | null) {
    await this.expirar();
    const validade = somarDias(hojeBrasil(), d.validade_dias);
    await this.db.transaction().execute(async (trx) => {
      const c = await trx.selectFrom('cotacoes').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!c) throw new NotFoundException('Cotação não encontrada.');
      if (!['solicitada', 'respondida', 'expirada'].includes(c.situacao)) throw new ConflictException(`A cotação já está ${c.situacao}.`);
      const itens = await trx.selectFrom('cotacao_itens').select(['id', 'produto_id']).where('cotacao_id', '=', id).execute();
      const precos = new Map(d.itens.map((i) => [i.produto_id, i.preco_proposto_centavos]));
      const faltam = itens.filter((i) => !precos.has(i.produto_id));
      if (faltam.length) throw new BadRequestException('Informe o preço de todos os itens da cotação.');
      for (const i of itens) await trx.updateTable('cotacao_itens').set({ preco_proposto_centavos: precos.get(i.produto_id)! }).where('id', '=', i.id).execute();
      await trx.updateTable('cotacoes').set({ situacao: 'respondida', resposta: d.resposta?.trim() || null, validade, respondida_por: autor.id, respondida_em: new Date() }).where('id', '=', id).execute();
      await this.auditoria.registrar({ usuario: autor, acao: 'cotacao.responder', entidade: 'cotacao', entidadeId: id, antes: { situacao: c.situacao }, depois: { validade, itens: d.itens }, ip }, trx);
    });
    const c = await this.cotacao(id);
    await this.notificacoes.registrar({
      empresaId: c.empresa_id, destinatarios: [c.solicitante_email], modelo: 'cotacao_respondida', chave: `cotacao:${id}:${c.respondida_em ? new Date(c.respondida_em).getTime() : 0}`,
      dados: { nome: c.solicitante, cotacao: id, valor_centavos: c.proposto_centavos, validade, resposta: c.resposta ?? '' },
    });
    return c;
  }

  /** O aprovador aceita: o pedido sai com o preço negociado (sem promoção e sem pedido mínimo). */
  async aceitarCotacao(u: UsuarioAutenticado, id: number, f: Fechamento & { forma_pagamento: FormaPagamento }, ip: string | null) {
    await this.expirar();
    const c = await this.db.updateTable('cotacoes').set({ situacao: 'aceita', decidida_por: u.id, decidida_em: new Date() })
      .where('id', '=', id).where('empresa_id', '=', u.empresaId!).where('situacao', '=', 'respondida').returningAll().executeTakeFirst();
    if (!c) throw await this.cotacaoNaoRespondida(u, id);
    const itens = await this.db.selectFrom('cotacao_itens').select(['produto_id', 'quantidade', 'preco_proposto_centavos']).where('cotacao_id', '=', id).execute();
    let pedido: { id: number };
    try {
      pedido = await this.pedidos.criar(u, {
        itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade })), forma_pagamento: f.forma_pagamento, parcelas: f.parcelas, token_cartao: f.token_cartao,
        endereco_id: f.endereco_id, ordem_compra: f.ordem_compra, observacao: f.observacao,
      }, ip, { precosNegociados: new Map(itens.map((i) => [i.produto_id, i.preco_proposto_centavos!])), cotacaoId: id });
    } catch (e) {
      await this.db.updateTable('cotacoes').set({ situacao: 'respondida', decidida_por: null, decidida_em: null }).where('id', '=', id).execute();
      throw e;
    }
    await this.db.updateTable('cotacoes').set({ pedido_id: pedido.id }).where('id', '=', id).execute();
    await this.auditoria.registrar({ usuario: u, acao: 'cotacao.aceitar', entidade: 'cotacao', entidadeId: id, depois: { pedido_id: pedido.id }, ip });
    return { cotacao: await this.cotacao(id, u.empresaId!), pedido };
  }

  async recusarCotacao(u: UsuarioAutenticado, id: number, ip: string | null) {
    const c = await this.db.updateTable('cotacoes').set({ situacao: 'recusada', decidida_por: u.id, decidida_em: new Date() })
      .where('id', '=', id).where('empresa_id', '=', u.empresaId!).where('situacao', '=', 'respondida').returning('id').executeTakeFirst();
    if (!c) throw await this.cotacaoNaoRespondida(u, id);
    await this.auditoria.registrar({ usuario: u, acao: 'cotacao.recusar', entidade: 'cotacao', entidadeId: id, ip });
    return this.cotacao(id, u.empresaId!);
  }

  /** Antes da resposta, quem pediu (ou o aprovador) pode desistir. */
  async cancelarCotacao(u: UsuarioAutenticado, id: number, ip: string | null) {
    let q = this.db.updateTable('cotacoes').set({ situacao: 'cancelada', decidida_por: u.id, decidida_em: new Date() })
      .where('id', '=', id).where('empresa_id', '=', u.empresaId!).where('situacao', '=', 'solicitada');
    if (u.papel !== 'aprovador') q = q.where('solicitante_id', '=', u.id);
    const c = await q.returning('id').executeTakeFirst();
    if (!c) {
      const x = await this.db.selectFrom('cotacoes').select('situacao').where('id', '=', id).where('empresa_id', '=', u.empresaId!).executeTakeFirst();
      throw x ? new ConflictException(`A cotação já está ${x.situacao}.`) : new NotFoundException('Cotação não encontrada.');
    }
    await this.auditoria.registrar({ usuario: u, acao: 'cotacao.cancelar', entidade: 'cotacao', entidadeId: id, ip });
    return this.cotacao(id, u.empresaId!);
  }

  private async cotacaoNaoRespondida(u: UsuarioAutenticado, id: number) {
    const x = await this.db.selectFrom('cotacoes').select('situacao').where('id', '=', id).where('empresa_id', '=', u.empresaId!).executeTakeFirst();
    if (!x) return new NotFoundException('Cotação não encontrada.');
    if (x.situacao === 'expirada') return new ConflictException('A validade da cotação venceu. Peça à Export Fácil para responder de novo.');
    if (x.situacao === 'solicitada') return new ConflictException('A cotação ainda não foi respondida.');
    return new ConflictException(`A cotação já está ${x.situacao}.`);
  }
}
