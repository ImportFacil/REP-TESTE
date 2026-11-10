import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { BANCO, type Banco } from '../banco/banco.module';
import type { Database, Faixa, FormaPagamento } from '../banco/tipos';
import { GATEWAY, type GatewayPagamento } from './gateway';
import { PoliticaService } from './politica.service';
import { FAIXAS, diasEntre, dividir, hojeBrasil, valorAtualizado, vencimentosBoleto } from './regras';

type Trx = Transaction<Database>;
type Dono = { pedidoId: number } | { numerarioId: number };

export interface ResumoCredito {
  situacao_cadastro: string | null;
  faixa: Faixa | null;
  limite_centavos: number;
  usado_centavos: number;
  disponivel_centavos: number;
  maior_atraso_dias: number;
  max_parcelas_boleto: number;
  bloqueado: boolean;
  motivo_bloqueio: string | null;
}

/**
 * Módulo "Pagamentos": cobranças, parcelas e baixa.
 * Regra central: o dinheiro só muda com aviso do banco (webhook). Nenhuma tela marca pagamento.
 */
@Injectable()
export class PagamentosService {
  private readonly log = new Logger(PagamentosService.name);

  constructor(
    @Inject(BANCO) private readonly db: Banco,
    @Inject(GATEWAY) private readonly gateway: GatewayPagamento | null,
    private readonly politica: PoliticaService,
  ) {}

  /** Gateway configurado ou erro 503 (produção fica sem pagamentos até o Asaas ser ligado). */
  gw(): GatewayPagamento {
    if (!this.gateway) throw new ServiceUnavailableException('Pagamentos ainda não habilitados neste ambiente.');
    return this.gateway;
  }

  get nomeGateway(): string | null {
    return this.gateway?.nome ?? null;
  }

  // ---------- criação de cobranças ----------

  async criarPix(trx: Trx, dono: Dono, valor: number, descricao: string) {
    const pol = await this.politica.atual(trx);
    const expiraEm = new Date(Date.now() + pol.pix_validade_horas * 3600_000);
    const criada = await this.gw().criarPix(valor, expiraEm, descricao);
    const cobranca = await trx
      .insertInto('cobrancas')
      .values({ ...donoColunas(dono), meio: 'pix', valor_centavos: valor, gateway: this.gw().nome, id_gateway: criada.id_gateway, expira_em: expiraEm })
      .returningAll()
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('parcelas')
      .values({ cobranca_id: cobranca.id, numero: 1, valor_centavos: valor, vencimento: hojeBrasil(expiraEm), id_gateway: criada.id_gateway, pix_copia_cola: criada.pix_copia_cola ?? null })
      .execute();
    return cobranca;
  }

  /** Boletos do faturamento: vencimentos 30/60/90/120 dias a partir de hoje. */
  async criarBoletos(trx: Trx, pedidoId: number, total: number, parcelas: number, descricao: string) {
    const hoje = hojeBrasil();
    const valores = dividir(total, parcelas);
    const vencimentos = vencimentosBoleto(hoje, parcelas);
    const criadas = await this.gw().criarBoletos(valores.map((valor, k) => ({ valor, vencimento: vencimentos[k] })), descricao);
    const cobranca = await trx
      .insertInto('cobrancas')
      .values({ pedido_id: pedidoId, numerario_id: null, meio: 'boleto', valor_centavos: total, gateway: this.gw().nome, id_gateway: null, expira_em: null })
      .returningAll()
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('parcelas')
      .values(valores.map((valor, k) => ({
        cobranca_id: cobranca.id, numero: k + 1, valor_centavos: valor, vencimento: vencimentos[k],
        id_gateway: criadas[k].id_gateway, linha_digitavel: criadas[k].linha_digitavel ?? null, pix_copia_cola: criadas[k].pix_copia_cola ?? null,
      })))
      .execute();
    return cobranca;
  }

  /** Cartão: aprovação imediata; o pedido já nasce pago (as parcelas são cobradas pela operadora). */
  async cobrarCartao(trx: Trx, pedidoId: number, total: number, parcelas: number, token: string, descricao: string) {
    const r = await this.gw().cobrarCartao(total, parcelas, token, descricao);
    if (!r.aprovado) return { aprovado: false as const, motivo: r.motivo ?? 'Pagamento não aprovado.' };
    const cobranca = await trx
      .insertInto('cobrancas')
      .values({ pedido_id: pedidoId, numerario_id: null, meio: 'cartao', valor_centavos: total, gateway: this.gw().nome, id_gateway: r.id_gateway, situacao: 'paga', expira_em: null })
      .returningAll()
      .executeTakeFirstOrThrow();
    const parcela = await trx
      .insertInto('parcelas')
      .values({ cobranca_id: cobranca.id, numero: 1, valor_centavos: total, vencimento: hojeBrasil(), situacao: 'paga', id_gateway: r.id_gateway, valor_pago_centavos: total, pago_em: new Date() })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx.insertInto('pagamentos').values({ parcela_id: parcela.id, valor_centavos: total, pago_em: new Date(), meio: 'cartao', id_evento_gateway: `autorizacao-${r.id_gateway}` }).execute();
    return { aprovado: true as const, cobranca };
  }

  /** Cancela cobranças ainda não pagas (pedido cancelado ou Pix substituído). */
  async cancelarPendentes(trx: Trx, dono: Dono): Promise<void> {
    let q = trx.selectFrom('cobrancas').select(['id', 'id_gateway']).where('situacao', '=', 'pendente');
    q = 'pedidoId' in dono ? q.where('pedido_id', '=', dono.pedidoId) : q.where('numerario_id', '=', dono.numerarioId);
    for (const c of await q.execute()) {
      const parcelas = await trx.selectFrom('parcelas').select('id_gateway').where('cobranca_id', '=', c.id).where('situacao', 'in', ['aberta', 'vencida']).execute();
      for (const p of parcelas) if (p.id_gateway) await this.gw().cancelar(p.id_gateway).catch((e) => this.log.warn(`Cancelamento no gateway falhou: ${(e as Error).message}`));
      await trx.updateTable('parcelas').set({ situacao: 'cancelada' }).where('cobranca_id', '=', c.id).where('situacao', 'in', ['aberta', 'vencida']).execute();
      await trx.updateTable('cobrancas').set({ situacao: 'cancelada' }).where('id', '=', c.id).execute();
    }
  }

  // ---------- baixa (só pelo aviso do banco) ----------

  /** Dá baixa na parcela e propaga para a cobrança, o pedido ou o numerário. Idempotente. */
  async baixarParcela(idGatewayParcela: string, valor: number, pagoEm: Date, idEvento: string, meio: FormaPagamento | undefined): Promise<'baixada' | 'ja_paga' | 'desconhecida'> {
    return this.db.transaction().execute(async (trx) => {
      const parcela = await trx.selectFrom('parcelas').selectAll().where('id_gateway', '=', idGatewayParcela).forUpdate().executeTakeFirst();
      if (!parcela) return 'desconhecida';
      if (parcela.situacao === 'paga') return 'ja_paga';
      await trx.updateTable('parcelas').set({ situacao: 'paga', valor_pago_centavos: valor, pago_em: pagoEm }).where('id', '=', parcela.id).execute();
      await trx.insertInto('pagamentos').values({ parcela_id: parcela.id, valor_centavos: valor, pago_em: pagoEm, meio: meio ?? 'desconhecido', id_evento_gateway: idEvento }).execute();

      const restantes = await trx.selectFrom('parcelas').select(sql<number>`count(*)::int`.as('n'))
        .where('cobranca_id', '=', parcela.cobranca_id).where('situacao', 'in', ['aberta', 'vencida']).executeTakeFirstOrThrow();
      const cobranca = await trx.selectFrom('cobrancas').selectAll().where('id', '=', parcela.cobranca_id).forUpdate().executeTakeFirstOrThrow();
      if (restantes.n > 0) return 'baixada';

      await trx.updateTable('cobrancas').set({ situacao: 'paga' }).where('id', '=', cobranca.id).execute();
      if (cobranca.pedido_id) {
        await trx.updateTable('pedidos').set({ situacao_pagamento: 'pago' }).where('id', '=', cobranca.pedido_id).execute();
        await trx.insertInto('pedido_eventos').values({
          pedido_id: cobranca.pedido_id, tipo: 'pagamento', usuario_id: null,
          descricao: cobranca.meio === 'pix' ? 'Pagamento Pix confirmado pelo banco.' : 'Todas as parcelas do boleto foram pagas.',
        }).execute();
      }
      if (cobranca.numerario_id) {
        const n = await trx.updateTable('numerarios').set({ situacao: 'pago', valor_pago_centavos: valor, pago_em: pagoEm })
          .where('id', '=', cobranca.numerario_id).returning(['ordem_id', 'etapa']).executeTakeFirstOrThrow();
        await trx.insertInto('ordem_eventos').values({ ordem_id: n.ordem_id, etapa: n.etapa, descricao: `Numerário de ${n.etapa} pago.`, usuario_id: null }).execute();
      }
      return 'baixada';
    });
  }

  // ---------- rotinas ----------

  /** Pix vencido: cobrança expirada; o pedido fica "Pix expirado" e o cliente pode gerar outro. */
  async expirarPix(agora = new Date()): Promise<number> {
    return this.db.transaction().execute(async (trx) => {
      const vencidas = await trx.updateTable('cobrancas').set({ situacao: 'expirada' })
        .where('meio', '=', 'pix').where('situacao', '=', 'pendente').where('expira_em', '<', agora)
        .returning(['id', 'pedido_id']).execute();
      for (const c of vencidas) {
        await trx.updateTable('parcelas').set({ situacao: 'cancelada' }).where('cobranca_id', '=', c.id).where('situacao', '!=', 'paga').execute();
        if (c.pedido_id) {
          await trx.updateTable('pedidos').set({ situacao_pagamento: 'pix_expirado' })
            .where('id', '=', c.pedido_id).where('situacao_pagamento', '=', 'aguardando_pagamento').execute();
          await trx.insertInto('pedido_eventos').values({ pedido_id: c.pedido_id, tipo: 'pix_expirado', descricao: 'O Pix venceu sem pagamento.', usuario_id: null }).execute();
        }
      }
      return vencidas.length;
    });
  }

  /** Parcelas com vencimento passado viram "vencida". */
  async marcarVencidas(hoje = hojeBrasil()): Promise<number> {
    const r = await this.db.updateTable('parcelas').set({ situacao: 'vencida' })
      .where('situacao', '=', 'aberta').where('vencimento', '<', hoje).executeTakeFirst();
    return Number(r.numUpdatedRows);
  }

  // ---------- consultas ----------

  /** Limite de crédito (só vale para boleto), quanto está usado e se há bloqueio por atraso. */
  async resumoCredito(empresaId: string, trx?: Trx): Promise<ResumoCredito> {
    const db = trx ?? this.db;
    const pol = await this.politica.atual(trx);
    const cad = await db.selectFrom('cadastros_credito').select(['situacao', 'faixa', 'limite_aprovado_centavos'])
      .where('empresa_id', '=', empresaId).executeTakeFirst();
    const aguardando = await db.selectFrom('pedidos').select(sql<number>`coalesce(sum(total_centavos), 0)::bigint`.as('v'))
      .where('empresa_id', '=', empresaId).where('forma_pagamento', '=', 'boleto')
      .where('situacao_pagamento', '=', 'aguardando_faturamento').where('situacao', '!=', 'cancelado').executeTakeFirstOrThrow();
    const abertas = await db.selectFrom('parcelas as pa').innerJoin('cobrancas as c', 'c.id', 'pa.cobranca_id').innerJoin('pedidos as p', 'p.id', 'c.pedido_id')
      .select([sql<number>`coalesce(sum(pa.valor_centavos), 0)::bigint`.as('v'), sql<string | null>`min(pa.vencimento)::text`.as('mais_antiga')])
      .where('p.empresa_id', '=', empresaId).where('c.meio', '=', 'boleto').where('pa.situacao', 'in', ['aberta', 'vencida'])
      .executeTakeFirstOrThrow();
    const hoje = hojeBrasil();
    const atraso = abertas.mais_antiga ? Math.max(0, diasEntre(abertas.mais_antiga, hoje)) : 0;
    const limite = cad?.situacao === 'aprovado' ? cad.limite_aprovado_centavos : 0;
    const usado = Number(aguardando.v) + Number(abertas.v);
    const faixa = (cad?.faixa ?? null) as Faixa | null;

    let motivo: string | null = null;
    if (cad?.situacao !== 'aprovado') motivo = 'O cadastro de crédito ainda não foi aprovado.';
    else if (faixa === 'C') motivo = 'A faixa de crédito da empresa não permite boleto parcelado.';
    else if (atraso > pol.atraso_bloqueio_dias) motivo = `Há parcela com ${atraso} dias de atraso. Regularize para voltar a comprar no boleto.`;

    return {
      situacao_cadastro: cad?.situacao ?? null,
      faixa,
      limite_centavos: limite,
      usado_centavos: usado,
      disponivel_centavos: Math.max(0, limite - usado),
      maior_atraso_dias: atraso,
      max_parcelas_boleto: faixa ? Math.min(FAIXAS[faixa].maxBoleto, pol.boleto_max_parcelas) : 0,
      bloqueado: motivo !== null,
      motivo_bloqueio: motivo,
    };
  }

  /** Financeiro do cliente: parcelas em aberto e pagas, com valor atualizado em caso de atraso. */
  async financeiroCliente(empresaId: string) {
    const pol = await this.politica.atual();
    const hoje = hojeBrasil();
    const parcelas = await this.db.selectFrom('parcelas as pa').innerJoin('cobrancas as c', 'c.id', 'pa.cobranca_id')
      .leftJoin('pedidos as p', 'p.id', 'c.pedido_id')
      .leftJoin('numerarios as n', 'n.id', 'c.numerario_id')
      .leftJoin('ordens_importacao as o', 'o.id', 'n.ordem_id')
      .select([
        'pa.id', 'pa.numero', 'pa.valor_centavos', 'pa.vencimento', 'pa.situacao', 'pa.linha_digitavel', 'pa.pix_copia_cola',
        'pa.valor_pago_centavos', 'pa.pago_em', 'c.meio', 'c.pedido_id', 'c.expira_em', 'c.situacao as situacao_cobranca',
        'n.ordem_id', 'n.etapa as etapa_numerario',
        sql<number>`(select count(*)::int from parcelas x where x.cobranca_id = c.id)`.as('total_parcelas'),
      ])
      .where((eb) => eb.or([eb('p.empresa_id', '=', empresaId), eb('o.empresa_id', '=', empresaId)]))
      .where('pa.situacao', '!=', 'cancelada')
      .orderBy('pa.vencimento', 'desc')
      .limit(500)
      .execute();
    return {
      credito: await this.resumoCredito(empresaId),
      parcelas: parcelas.map((p) => ({
        ...p,
        ...(p.situacao === 'paga' ? {} : { atualizado: valorAtualizado(p.valor_centavos, p.vencimento, hoje, pol.multa_atraso_bp, pol.juros_atraso_am_bp) }),
      })),
    };
  }

  /** Painel da equipe: a receber por mês, vencidos e vendas no cartão. */
  async recebiveis() {
    const hoje = hojeBrasil();
    const porMes = await this.db.selectFrom('parcelas as pa').innerJoin('cobrancas as c', 'c.id', 'pa.cobranca_id')
      .select([sql<string>`to_char(pa.vencimento, 'YYYY-MM')`.as('mes'), sql<number>`sum(pa.valor_centavos)::bigint`.as('valor'), sql<number>`count(*)::int`.as('parcelas')])
      .where('c.meio', '=', 'boleto').where('pa.situacao', 'in', ['aberta', 'vencida'])
      .groupBy(sql`to_char(pa.vencimento, 'YYYY-MM')`).orderBy('mes').execute();
    const vencidas = await this.db.selectFrom('parcelas as pa').innerJoin('cobrancas as c', 'c.id', 'pa.cobranca_id')
      .innerJoin('pedidos as p', 'p.id', 'c.pedido_id').innerJoin('empresas as e', 'e.id', 'p.empresa_id')
      .select(['pa.id', 'pa.numero', 'pa.valor_centavos', 'pa.vencimento', 'p.id as pedido_id', 'e.razao_social', 'e.id as empresa_id'])
      .where('pa.situacao', 'in', ['aberta', 'vencida']).where('pa.vencimento', '<', hoje).orderBy('pa.vencimento').execute();
    const cartao = await this.db.selectFrom('cobrancas')
      .select([sql<string>`to_char(criado_em, 'YYYY-MM')`.as('mes'), sql<number>`sum(valor_centavos)::bigint`.as('valor'), sql<number>`count(*)::int`.as('vendas')])
      .where('meio', '=', 'cartao').where('situacao', '=', 'paga')
      .groupBy(sql`to_char(criado_em, 'YYYY-MM')`).orderBy('mes', 'desc').limit(12).execute();
    const notificacoes = await this.db.selectFrom('notificacoes').selectAll().orderBy('id', 'desc').limit(50).execute();
    return {
      a_receber_por_mes: porMes,
      vencidas: vencidas.map((v) => ({ ...v, dias_atraso: diasEntre(v.vencimento, hoje) })),
      total_vencido_centavos: vencidas.reduce((s, v) => s + v.valor_centavos, 0),
      cartao_por_mes: cartao,
      regua_recente: notificacoes,
    };
  }
}

function donoColunas(dono: Dono) {
  return 'pedidoId' in dono ? { pedido_id: dono.pedidoId, numerario_id: null } : { pedido_id: null, numerario_id: dono.numerarioId };
}
