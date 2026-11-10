import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { BANCO, type Banco } from '../banco/banco.module';
import { lerPeriodo, type Periodo } from '../comum/periodo';
import { hojeBrasil, somarDias } from '../pagamentos/regras';

/** Pedidos que contam como venda: tudo, menos os cancelados. */
const VENDA = sql`p.situacao <> 'cancelado'`;


/** Painel de controle da equipe (no formato do Bagisto): números do período, comparação, gráfico e rankings. */
@Injectable()
export class PainelService {
  constructor(@Inject(BANCO) private readonly db: Banco) {}

  /** Período padrão: os últimos 30 dias, até hoje (datas no fuso de Brasília). */
  periodo(de?: string, ate?: string): Periodo {
    return lerPeriodo(de, ate);
  }

  private async totais(de: string, ate: string) {
    const r = await sql<{ vendas: string; pedidos: number; ticket: string | null }>`
      SELECT coalesce(sum(p.total_centavos), 0)::bigint AS vendas, count(*)::int AS pedidos, avg(p.total_centavos)::bigint AS ticket
      FROM pedidos p
      WHERE ${VENDA} AND (p.criado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${de}::date AND ${ate}::date`.execute(this.db);
    const c = await sql<{ n: number }>`
      SELECT count(DISTINCT p.empresa_id)::int AS n FROM pedidos p
      WHERE ${VENDA} AND (p.criado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${de}::date AND ${ate}::date`.execute(this.db);
    const t = r.rows[0];
    return { vendas_centavos: Number(t.vendas), pedidos: t.pedidos, ticket_medio_centavos: Number(t.ticket ?? 0), clientes: c.rows[0].n };
  }

  /** Contagens do que pede atenção (o sino do Painel e os cartões de pendências). */
  async avisos() {
    const r = await sql<Record<string, number>>`
      SELECT
        (SELECT count(*) FROM cadastros_credito WHERE situacao = 'em_analise')::int AS cadastros_em_analise,
        (SELECT count(*) FROM pedidos WHERE situacao_pagamento = 'aguardando_faturamento' AND situacao <> 'cancelado')::int AS boletos_para_faturar,
        (SELECT count(*) FROM pedidos WHERE situacao = 'novo' AND situacao_pagamento = 'pago')::int AS pagos_para_separar,
        (SELECT count(*) FROM orcamentos WHERE situacao = 'solicitado')::int AS orcamentos_aguardando,
        (SELECT count(*) FROM cotacoes WHERE situacao = 'solicitada')::int AS cotacoes_aguardando,
        (SELECT count(*) FROM ordens_importacao WHERE NOT concluida AND NOT cancelada)::int AS ordens_em_andamento,
        (SELECT count(*) FROM parcelas WHERE situacao = 'vencida')::int AS parcelas_vencidas,
        (SELECT coalesce(sum(valor_centavos), 0) FROM parcelas WHERE situacao = 'vencida')::bigint AS vencido_centavos`.execute(this.db);
    const c = r.rows[0];
    return {
      geral: { parcelas_vencidas: Number(c.parcelas_vencidas), vencido_centavos: Number(c.vencido_centavos) },
      contagens: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)])),
    };
  }

  async resumo(de: string, ate: string) {
    const dias = Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000) + 1;
    const anteriorAte = somarDias(de, -1);
    const anteriorDe = somarDias(anteriorAte, -(dias - 1));
    const hoje = hojeBrasil();
    const ontem = somarDias(hoje, -1);

    const [atual, anterior, hojeT, ontemT] = await Promise.all([
      this.totais(de, ate), this.totais(anteriorDe, anteriorAte), this.totais(hoje, hoje), this.totais(ontem, ontem),
    ]);
    const variacao = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : Math.round(((a - b) / b) * 1000) / 10);

    const serie = await sql<{ dia: string; vendas: string; pedidos: number }>`
      SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia, coalesce(sum(p.total_centavos), 0)::bigint AS vendas, count(p.id)::int AS pedidos
      FROM generate_series(${de}::date, ${ate}::date, interval '1 day') AS d(dia)
      LEFT JOIN pedidos p ON (p.criado_em AT TIME ZONE 'America/Sao_Paulo')::date = d.dia AND ${VENDA}
      GROUP BY d.dia ORDER BY d.dia`.execute(this.db);

    const produtos = await sql<{ id: number; codigo: string; nome: string; quantidade: number; vendas: string }>`
      SELECT i.produto_id AS id, i.codigo, i.nome, sum(i.quantidade)::int AS quantidade, sum(i.total_centavos)::bigint AS vendas
      FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id
      WHERE ${VENDA} AND (p.criado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${de}::date AND ${ate}::date
      GROUP BY i.produto_id, i.codigo, i.nome ORDER BY vendas DESC LIMIT 5`.execute(this.db);

    const clientes = await sql<{ id: string; razao_social: string; tipo_cliente: string; pedidos: number; vendas: string }>`
      SELECT e.id, e.razao_social, e.tipo_cliente, count(p.id)::int AS pedidos, sum(p.total_centavos)::bigint AS vendas
      FROM pedidos p JOIN empresas e ON e.id = p.empresa_id
      WHERE ${VENDA} AND (p.criado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${de}::date AND ${ate}::date
      GROUP BY e.id, e.razao_social, e.tipo_cliente ORDER BY vendas DESC LIMIT 5`.execute(this.db);

    const estoqueBaixo = await this.db.selectFrom('produtos')
      .select(['id', 'codigo', 'nome', 'estoque', 'multiplo_venda', 'preco_tabela_centavos', 'categoria_id'])
      .where('ativo', '=', true).where('sob_orcamento', '=', false)
      .where(sql<boolean>`estoque <= greatest(multiplo_venda * 3, 5)`)
      .orderBy('estoque').orderBy('nome').limit(8).execute();

    const aReceber = await sql<{ abertas: string; vencidas: string; n_vencidas: number }>`
      SELECT coalesce(sum(valor_centavos) FILTER (WHERE situacao = 'aberta'), 0)::bigint AS abertas,
             coalesce(sum(valor_centavos) FILTER (WHERE situacao = 'vencida'), 0)::bigint AS vencidas,
             count(*) FILTER (WHERE situacao = 'vencida')::int AS n_vencidas
      FROM parcelas`.execute(this.db);

    const recentes = await this.db.selectFrom('pedidos as p').innerJoin('empresas as e', 'e.id', 'p.empresa_id')
      .select(['p.id', 'e.razao_social', 'p.total_centavos', 'p.situacao', 'p.situacao_pagamento', 'p.forma_pagamento', 'p.criado_em'])
      .orderBy('p.criado_em', 'desc').limit(6).execute();

    const r = aReceber.rows[0];
    return {
      periodo: { de, ate, dias, anterior: { de: anteriorDe, ate: anteriorAte } },
      geral: {
        ...atual,
        variacao: {
          vendas: variacao(atual.vendas_centavos, anterior.vendas_centavos),
          pedidos: variacao(atual.pedidos, anterior.pedidos),
          clientes: variacao(atual.clientes, anterior.clientes),
          ticket_medio: variacao(atual.ticket_medio_centavos, anterior.ticket_medio_centavos),
        },
        a_receber_centavos: Number(r.abertas),
        vencido_centavos: Number(r.vencidas),
        parcelas_vencidas: r.n_vencidas,
      },
      hoje: {
        ...hojeT,
        variacao: {
          vendas: variacao(hojeT.vendas_centavos, ontemT.vendas_centavos),
          pedidos: variacao(hojeT.pedidos, ontemT.pedidos),
          clientes: variacao(hojeT.clientes, ontemT.clientes),
        },
      },
      serie: serie.rows.map((x) => ({ dia: x.dia, vendas_centavos: Number(x.vendas), pedidos: x.pedidos })),
      produtos_mais_vendidos: produtos.rows.map((x) => ({ ...x, vendas_centavos: Number(x.vendas) })),
      clientes_que_mais_compram: clientes.rows.map((x) => ({ ...x, vendas_centavos: Number(x.vendas) })),
      estoque_baixo: estoqueBaixo,
      pedidos_recentes: recentes,
    };
  }
}
