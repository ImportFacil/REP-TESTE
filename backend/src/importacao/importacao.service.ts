import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UsuarioAutenticado } from '../auth/identidade';
import { BANCO, type Banco } from '../banco/banco.module';
import type { EtapaNumerario, Modalidade } from '../banco/tipos';
import { PagamentosService } from '../pagamentos/pagamentos.service';
import { hojeBrasil, somarDias } from '../pagamentos/regras';
import { calcularRota, porto } from './rotas';

/** Etapas de cada modalidade, em ordem. */
export const ETAPAS: Record<Modalidade, Array<{ id: string; nome: string; exige?: EtapaNumerario }>> = {
  encomenda: [
    { id: 'pedido_confirmado', nome: 'Pedido confirmado' },
    { id: 'pagamento_fornecedor', nome: 'Pagamento ao fornecedor (ImportFácil)' },
    { id: 'producao', nome: 'Produção' },
    { id: 'embarque', nome: 'Embarque' },
    { id: 'transito', nome: 'Em trânsito' },
    { id: 'desembaraco', nome: 'Desembaraço' },
    { id: 'entrega', nome: 'Entrega' },
    { id: 'concluida', nome: 'Concluída' },
  ],
  // Na conta e ordem a ImportFácil nunca adianta dinheiro próprio: câmbio e DUIMP esperam o numerário.
  conta_e_ordem: [
    { id: 'pedido_confirmado', nome: 'Pedido confirmado' },
    { id: 'cambio_fechado', nome: 'Câmbio fechado', exige: 'cambio' },
    { id: 'producao', nome: 'Produção' },
    { id: 'embarque', nome: 'Embarque' },
    { id: 'transito', nome: 'Em trânsito' },
    { id: 'duimp_registrada', nome: 'DUIMP registrada', exige: 'tributos' },
    { id: 'desembaraco', nome: 'Desembaraço' },
    { id: 'entrega', nome: 'Entrega' },
    { id: 'concluida', nome: 'Concluída' },
  ],
};

export interface NovoOrcamento {
  modalidade: Modalidade;
  itens: Array<{ produto_id?: number; descricao?: string; unidade?: string; quantidade: number }>;
  observacao?: string;
}

export interface Proposta {
  itens: Array<{ id: number; preco_unitario_centavos: number }>;
  frete_centavos: number;
  taxa_servico_bp?: number;
  condicao: string;
  prazo_entrega_dias: number;
  validade_dias: number;
}

/** Módulo "Importação": orçamentos, ordens de importação, numerário e prestação de contas. */
@Injectable()
export class ImportacaoService {
  constructor(
    @Inject(BANCO) private readonly db: Banco,
    private readonly pagamentos: PagamentosService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ---------- orçamentos ----------

  async solicitar(u: UsuarioAutenticado, dto: NovoOrcamento) {
    if (dto.modalidade === 'conta_e_ordem') {
      const e = await this.db.selectFrom('empresas').select('conta_e_ordem_liberada').where('id', '=', u.empresaId!).executeTakeFirstOrThrow();
      if (!e.conta_e_ordem_liberada) throw new ForbiddenException('A conta e ordem é liberada pela equipe comercial para clientes grandes (pedidos mensais a partir de R$ 400.000,00).');
    }
    const ids = dto.itens.map((i) => i.produto_id).filter((x): x is number => !!x);
    const produtos = ids.length ? await this.db.selectFrom('produtos').select(['id', 'nome', 'unidade']).where('id', 'in', ids).where('ativo', '=', true).execute() : [];
    const porId = new Map(produtos.map((p) => [p.id, p]));
    const itens = dto.itens.map((i) => {
      if (i.produto_id) {
        const p = porId.get(i.produto_id);
        if (!p) throw new BadRequestException(`Produto ${i.produto_id} indisponível.`);
        return { produto_id: p.id, descricao: p.nome, unidade: p.unidade, quantidade: i.quantidade };
      }
      if (!i.descricao?.trim()) throw new BadRequestException('Descreva o item que não está no catálogo.');
      return { produto_id: null, descricao: i.descricao.trim(), unidade: i.unidade?.trim() || 'un', quantidade: i.quantidade };
    });
    const id = await this.db.transaction().execute(async (trx) => {
      const o = await trx.insertInto('orcamentos').values({ empresa_id: u.empresaId!, solicitante_id: u.id, modalidade: dto.modalidade, observacao: dto.observacao ?? null,
        frete_centavos: null, taxa_servico_bp: null, total_centavos: null, condicao: null, prazo_entrega_dias: null, respondido_por: null, respondido_em: null, decidido_em: null })
        .returning('id').executeTakeFirstOrThrow();
      await trx.insertInto('orcamento_itens').values(itens.map((i) => ({ ...i, orcamento_id: o.id, preco_unitario_centavos: null }))).execute();
      return o.id;
    });
    return this.orcamento(id, u.empresaId!);
  }

  async listarOrcamentos(f: { empresaId?: string; situacao?: string }) {
    let q = this.db.selectFrom('orcamentos as o').innerJoin('empresas as e', 'e.id', 'o.empresa_id')
      .selectAll('o').select(['e.razao_social', sql<number>`(select count(*)::int from orcamento_itens i where i.orcamento_id = o.id)`.as('qtd_itens')])
      .orderBy('o.id', 'desc').limit(200);
    if (f.empresaId) q = q.where('o.empresa_id', '=', f.empresaId);
    if (f.situacao) q = q.where('o.situacao', '=', f.situacao as never);
    return q.execute();
  }

  async orcamento(id: number, empresaId?: string) {
    let q = this.db.selectFrom('orcamentos as o').innerJoin('empresas as e', 'e.id', 'o.empresa_id').selectAll('o').select(['e.razao_social']).where('o.id', '=', id);
    if (empresaId) q = q.where('o.empresa_id', '=', empresaId);
    const o = await q.executeTakeFirst();
    if (!o) throw new NotFoundException('Orçamento não encontrado.');
    const itens = await this.db.selectFrom('orcamento_itens').selectAll().where('orcamento_id', '=', id).orderBy('id').execute();
    const ordem = await this.db.selectFrom('ordens_importacao').select('id').where('orcamento_id', '=', id).executeTakeFirst();
    const mercadoria = itens.reduce((s, i) => s + (i.preco_unitario_centavos ?? 0) * i.quantidade, 0);
    return { ...o, itens, mercadoria_centavos: mercadoria, ordem_id: ordem?.id ?? null };
  }

  /** A equipe preenche preços, frete, prazo e validade e envia a proposta ao cliente. */
  async responder(id: number, p: Proposta, autor: UsuarioAutenticado, ip: string | null) {
    await this.db.transaction().execute(async (trx) => {
      const o = await trx.selectFrom('orcamentos').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!o) throw new NotFoundException('Orçamento não encontrado.');
      if (!['solicitado', 'enviado'].includes(o.situacao)) throw new BadRequestException('Este orçamento já foi decidido.');
      const itens = await trx.selectFrom('orcamento_itens').select(['id', 'quantidade']).where('orcamento_id', '=', id).execute();
      const precos = new Map(p.itens.map((i) => [i.id, i.preco_unitario_centavos]));
      if (itens.some((i) => !precos.has(i.id))) throw new BadRequestException('Informe o preço de todos os itens.');
      for (const i of itens) await trx.updateTable('orcamento_itens').set({ preco_unitario_centavos: precos.get(i.id)! }).where('id', '=', i.id).execute();
      const mercadoria = itens.reduce((s, i) => s + precos.get(i.id)! * i.quantidade, 0);
      const taxa = o.modalidade === 'conta_e_ordem' ? p.taxa_servico_bp ?? 0 : null;
      // Na conta e ordem o cliente paga mercadoria e tributos por numerário; o total da proposta é o serviço + frete.
      const total = o.modalidade === 'conta_e_ordem' ? Math.round((mercadoria * (taxa ?? 0)) / 10_000) + p.frete_centavos : mercadoria + p.frete_centavos;
      await trx.updateTable('orcamentos').set({
        situacao: 'enviado', frete_centavos: p.frete_centavos, taxa_servico_bp: taxa, total_centavos: total, condicao: p.condicao,
        prazo_entrega_dias: p.prazo_entrega_dias, valido_ate: somarDias(hojeBrasil(), p.validade_dias), respondido_por: autor.id, respondido_em: new Date(),
      }).where('id', '=', id).execute();
      await this.auditoria.registrar({ usuario: autor, acao: 'orcamento.responder', entidade: 'orcamento', entidadeId: id, depois: { ...p, total }, ip }, trx);
    });
    return this.orcamento(id);
  }

  /** O cliente aceita (vira ordem de importação) ou recusa a proposta. */
  async decidir(id: number, aceitar: boolean, u: UsuarioAutenticado, ip: string | null) {
    const ordemId = await this.db.transaction().execute(async (trx) => {
      const o = await trx.selectFrom('orcamentos').selectAll().where('id', '=', id).where('empresa_id', '=', u.empresaId!).forUpdate().executeTakeFirst();
      if (!o) throw new NotFoundException('Orçamento não encontrado.');
      if (o.situacao !== 'enviado') throw new BadRequestException('Só propostas enviadas podem ser aceitas ou recusadas.');
      if (o.valido_ate && o.valido_ate < hojeBrasil()) throw new BadRequestException('A proposta venceu. Peça um novo orçamento.');
      await trx.updateTable('orcamentos').set({ situacao: aceitar ? 'aceito' : 'recusado', decidido_em: new Date() }).where('id', '=', id).execute();
      await this.auditoria.registrar({ usuario: u, acao: aceitar ? 'orcamento.aceitar' : 'orcamento.recusar', entidade: 'orcamento', entidadeId: id, ip }, trx);
      if (!aceitar) return null;
      const ordem = await trx.insertInto('ordens_importacao').values({ empresa_id: o.empresa_id, orcamento_id: id, modalidade: o.modalidade, etapa: 'pedido_confirmado' })
        .returning('id').executeTakeFirstOrThrow();
      await trx.insertInto('ordem_eventos').values({ ordem_id: ordem.id, etapa: 'pedido_confirmado', descricao: `Orçamento ${id} aceito por ${u.nome}.`, usuario_id: u.id }).execute();
      return ordem.id;
    });
    return { orcamento: await this.orcamento(id, u.empresaId!), ordem_id: ordemId };
  }

  async expirarOrcamentos(hoje = hojeBrasil()): Promise<number> {
    const r = await this.db.updateTable('orcamentos').set({ situacao: 'expirado' }).where('situacao', '=', 'enviado').where('valido_ate', '<', hoje).executeTakeFirst();
    return Number(r.numUpdatedRows);
  }

  // ---------- ordens de importação ----------

  async listarOrdens(f: { empresaId?: string; abertas?: boolean }) {
    let q = this.db.selectFrom('ordens_importacao as o').innerJoin('empresas as e', 'e.id', 'o.empresa_id').selectAll('o').select('e.razao_social').orderBy('o.id', 'desc').limit(200);
    if (f.empresaId) q = q.where('o.empresa_id', '=', f.empresaId);
    if (f.abertas) q = q.where('o.concluida', '=', false).where('o.cancelada', '=', false);
    const linhas = await q.execute();
    return linhas.map((o) => ({ ...o, etapa_nome: ETAPAS[o.modalidade].find((e) => e.id === o.etapa)?.nome ?? o.etapa }));
  }

  async ordem(id: number, empresaId?: string) {
    let q = this.db.selectFrom('ordens_importacao as o').innerJoin('empresas as e', 'e.id', 'o.empresa_id').selectAll('o').select('e.razao_social').where('o.id', '=', id);
    if (empresaId) q = q.where('o.empresa_id', '=', empresaId);
    const o = await q.executeTakeFirst();
    if (!o) throw new NotFoundException('Ordem não encontrada.');
    const [eventos, numerarios, orcamento] = await Promise.all([
      this.db.selectFrom('ordem_eventos').selectAll().where('ordem_id', '=', id).orderBy('id').execute(),
      this.db.selectFrom('numerarios').selectAll().where('ordem_id', '=', id).orderBy('id').execute(),
      this.orcamento(o.orcamento_id),
    ]);
    const cobrancas = numerarios.length
      ? await this.db.selectFrom('cobrancas as c').innerJoin('parcelas as p', 'p.cobranca_id', 'c.id')
        .select(['c.numerario_id', 'c.situacao', 'c.expira_em', 'p.id as parcela_id', 'p.pix_copia_cola', 'p.situacao as situacao_parcela'])
        .where('c.numerario_id', 'in', numerarios.map((n) => n.id)).orderBy('c.id', 'desc').execute()
      : [];
    const etapas = ETAPAS[o.modalidade];
    const atual = etapas.findIndex((e) => e.id === o.etapa);
    return {
      ...o,
      etapas: etapas.map((e, k) => ({ ...e, situacao: k < atual ? 'feita' : k === atual ? 'atual' : 'pendente' })),
      eventos,
      numerarios: numerarios.map((n) => ({ ...n, cobranca: cobrancas.find((c) => c.numerario_id === n.id) ?? null })),
      orcamento,
      prestacao_contas: o.modalidade === 'conta_e_ordem' ? await this.prestacao(id) : null,
      rota: this.rotaDaOrdem(o),
    };
  }

  /** Rota pelo mar e prazo estimado da ordem (a 16 nós); com a data de embarque, a chegada prevista. */
  private rotaDaOrdem(o: { porto_embarque: string | null; porto_chegada: string | null; embarque_em: string | Date | null }) {
    if (!o.porto_embarque || !o.porto_chegada) return null;
    try {
      const r = calcularRota(o.porto_embarque, o.porto_chegada, 16);
      const embarque = o.embarque_em ? (o.embarque_em instanceof Date ? o.embarque_em.toISOString() : String(o.embarque_em)).slice(0, 10) : null;
      const chegada = embarque ? new Date(new Date(`${embarque}T12:00:00Z`).getTime() + Math.ceil(r.dias) * 86_400_000).toISOString().slice(0, 10) : null;
      return { ...r, embarque_em: embarque, chegada_prevista: chegada };
    } catch {
      return null;
    }
  }

  /** Define (ou troca) os portos e a data de embarque da ordem. */
  async definirRota(id: number, d: { porto_embarque: string; porto_chegada: string; embarque_em?: string | null }, autor: UsuarioAutenticado, ip: string | null) {
    const origem = porto(d.porto_embarque);
    const destino = porto(d.porto_chegada);
    if (!origem) throw new BadRequestException(`Porto de embarque desconhecido: ${d.porto_embarque}`);
    if (!destino) throw new BadRequestException(`Porto de chegada desconhecido: ${d.porto_chegada}`);
    if (origem.codigo === destino.codigo) throw new BadRequestException('Escolha portos diferentes para o embarque e a chegada.');
    if (d.embarque_em && Number.isNaN(new Date(`${d.embarque_em}T12:00:00Z`).getTime())) throw new BadRequestException('Data de embarque inválida.');
    calcularRota(origem.codigo, destino.codigo); // recusa pares de portos sem ligação pelo mar
    await this.db.transaction().execute(async (trx) => {
      const o = await trx.selectFrom('ordens_importacao').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!o) throw new NotFoundException('Ordem não encontrada.');
      const depois = { porto_embarque: origem.codigo, porto_chegada: destino.codigo, embarque_em: d.embarque_em || null };
      await trx.updateTable('ordens_importacao').set(depois).where('id', '=', id).execute();
      await this.auditoria.registrar({ usuario: autor, acao: 'ordem.rota', entidade: 'ordem_importacao', entidadeId: id,
        antes: { porto_embarque: o.porto_embarque, porto_chegada: o.porto_chegada, embarque_em: o.embarque_em }, depois, ip }, trx);
    });
    return this.ordem(id);
  }

  /** Avança a etapa. Na conta e ordem, câmbio e DUIMP só avançam com o numerário da etapa pago. */
  async avancar(id: number, observacao: string | undefined, autor: UsuarioAutenticado, ip: string | null) {
    await this.db.transaction().execute(async (trx) => {
      const o = await trx.selectFrom('ordens_importacao').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!o) throw new NotFoundException('Ordem não encontrada.');
      if (o.concluida || o.cancelada) throw new BadRequestException('Esta ordem já foi encerrada.');
      const etapas = ETAPAS[o.modalidade];
      const proxima = etapas[etapas.findIndex((e) => e.id === o.etapa) + 1];
      if (!proxima) throw new BadRequestException('A ordem já está na última etapa.');
      if (proxima.exige) {
        const pago = await trx.selectFrom('numerarios').select('id').where('ordem_id', '=', id).where('etapa', '=', proxima.exige).where('situacao', '=', 'pago').executeTakeFirst();
        if (!pago) throw new BadRequestException(`"${proxima.nome}" só avança depois que o numerário de ${proxima.exige} estiver pago.`);
      }
      await trx.updateTable('ordens_importacao').set({ etapa: proxima.id, concluida: proxima.id === 'concluida' }).where('id', '=', id).execute();
      await trx.insertInto('ordem_eventos').values({ ordem_id: id, etapa: proxima.id, descricao: observacao?.trim() || `${proxima.nome}.`, usuario_id: autor.id }).execute();
      await this.auditoria.registrar({ usuario: autor, acao: 'ordem.avancar', entidade: 'ordem_importacao', entidadeId: id, antes: { etapa: o.etapa }, depois: { etapa: proxima.id }, ip }, trx);
    });
    return this.ordem(id);
  }

  async cancelarOrdem(id: number, motivo: string, autor: UsuarioAutenticado, ip: string | null) {
    await this.db.transaction().execute(async (trx) => {
      const o = await trx.selectFrom('ordens_importacao').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!o) throw new NotFoundException('Ordem não encontrada.');
      if (o.concluida || o.cancelada) throw new BadRequestException('Esta ordem já foi encerrada.');
      const nums = await trx.selectFrom('numerarios').select('id').where('ordem_id', '=', id).where('situacao', '=', 'aguardando').execute();
      for (const n of nums) {
        await this.pagamentos.cancelarPendentes(trx, { numerarioId: n.id });
        await trx.updateTable('numerarios').set({ situacao: 'cancelado' }).where('id', '=', n.id).execute();
      }
      await trx.updateTable('ordens_importacao').set({ cancelada: true }).where('id', '=', id).execute();
      await trx.insertInto('ordem_eventos').values({ ordem_id: id, etapa: o.etapa, descricao: `Cancelada: ${motivo}`, usuario_id: autor.id }).execute();
      await this.auditoria.registrar({ usuario: autor, acao: 'ordem.cancelar', entidade: 'ordem_importacao', entidadeId: id, depois: { motivo }, ip }, trx);
    });
    return this.ordem(id);
  }

  /** Cobra o numerário de uma etapa por Pix (conta e ordem). */
  async cobrarNumerario(id: number, etapa: EtapaNumerario, valor: number, autor: UsuarioAutenticado, ip: string | null) {
    await this.db.transaction().execute(async (trx) => {
      const o = await trx.selectFrom('ordens_importacao').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!o) throw new NotFoundException('Ordem não encontrada.');
      if (o.modalidade !== 'conta_e_ordem') throw new BadRequestException('Numerário só existe na conta e ordem.');
      if (o.concluida || o.cancelada) throw new BadRequestException('Esta ordem já foi encerrada.');
      const aberto = await trx.selectFrom('numerarios').select('id').where('ordem_id', '=', id).where('etapa', '=', etapa).where('situacao', '=', 'aguardando').executeTakeFirst();
      if (aberto) throw new BadRequestException('Já há um numerário desta etapa aguardando pagamento.');
      const n = await trx.insertInto('numerarios').values({ ordem_id: id, etapa, valor_previsto_centavos: valor, criado_por: autor.id, pago_em: null }).returning('id').executeTakeFirstOrThrow();
      await this.pagamentos.criarPix(trx, { numerarioId: n.id }, valor, `Numerário ${etapa} da ordem ${id}`);
      await trx.insertInto('ordem_eventos').values({ ordem_id: id, etapa: o.etapa, descricao: `Numerário de ${etapa} cobrado por Pix.`, usuario_id: autor.id }).execute();
      await this.auditoria.registrar({ usuario: autor, acao: 'ordem.numerario', entidade: 'ordem_importacao', entidadeId: id, depois: { etapa, valor }, ip }, trx);
    });
    return this.ordem(id);
  }

  /** Novo Pix para um numerário cujo Pix expirou (cliente ou equipe). */
  async novoPixNumerario(numerarioId: number, empresaId?: string) {
    const n = await this.db.selectFrom('numerarios as n').innerJoin('ordens_importacao as o', 'o.id', 'n.ordem_id')
      .select(['n.id', 'n.ordem_id', 'n.etapa', 'n.situacao', 'n.valor_previsto_centavos', 'o.empresa_id']).where('n.id', '=', numerarioId).executeTakeFirst();
    if (!n || (empresaId && n.empresa_id !== empresaId)) throw new NotFoundException('Numerário não encontrado.');
    if (n.situacao !== 'aguardando') throw new BadRequestException('Este numerário não está aguardando pagamento.');
    await this.db.transaction().execute(async (trx) => {
      await this.pagamentos.cancelarPendentes(trx, { numerarioId: n.id });
      await this.pagamentos.criarPix(trx, { numerarioId: n.id }, n.valor_previsto_centavos, `Numerário ${n.etapa} da ordem ${n.ordem_id}`);
    });
    return this.ordem(n.ordem_id, empresaId);
  }

  async registrarGasto(id: number, g: { etapa: EtapaNumerario; descricao: string; valor_centavos: number }, autor: UsuarioAutenticado, ip: string | null) {
    const o = await this.db.selectFrom('ordens_importacao').select(['modalidade']).where('id', '=', id).executeTakeFirst();
    if (!o) throw new NotFoundException('Ordem não encontrada.');
    if (o.modalidade !== 'conta_e_ordem') throw new BadRequestException('Gastos com numerário só existem na conta e ordem.');
    await this.db.insertInto('ordem_gastos').values({ ordem_id: id, etapa: g.etapa, descricao: g.descricao, valor_centavos: g.valor_centavos, registrado_por: autor.id }).execute();
    await this.auditoria.registrar({ usuario: autor, acao: 'ordem.gasto', entidade: 'ordem_importacao', entidadeId: id, depois: g, ip });
    return this.ordem(id);
  }

  /** Prestação de contas: numerário recebido, gastos reais e saldo a devolver (ou a cobrar). */
  async prestacao(id: number) {
    const recebido = await this.db.selectFrom('numerarios').select(['etapa', sql<number>`coalesce(sum(valor_pago_centavos), 0)::bigint`.as('v')])
      .where('ordem_id', '=', id).where('situacao', '=', 'pago').groupBy('etapa').execute();
    const gastos = await this.db.selectFrom('ordem_gastos').selectAll().where('ordem_id', '=', id).orderBy('id').execute();
    const etapas: EtapaNumerario[] = ['cambio', 'tributos', 'despesas_finais'];
    const porEtapa = etapas.map((etapa) => {
      const r = Number(recebido.find((x) => x.etapa === etapa)?.v ?? 0);
      const g = gastos.filter((x) => x.etapa === etapa).reduce((s, x) => s + x.valor_centavos, 0);
      return { etapa, recebido_centavos: r, gasto_centavos: g, saldo_centavos: r - g };
    });
    const saldo = porEtapa.reduce((s, e) => s + e.saldo_centavos, 0);
    return { por_etapa: porEtapa, gastos, saldo_centavos: saldo, resultado: saldo > 0 ? 'devolver_ao_cliente' : saldo < 0 ? 'cobrar_do_cliente' : 'zerado' };
  }
}
