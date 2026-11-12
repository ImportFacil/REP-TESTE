import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { BANCO, type Banco } from '../banco/banco.module';
import { lerJanela, lerPeriodo, type Janela } from '../comum/periodo';
import { hojeBrasil } from '../pagamentos/regras';

export type Agrupamento = 'dia' | 'semana' | 'mes';
const TRUNC: Record<Agrupamento, string> = { dia: 'day', semana: 'week', mes: 'month' };
const DATA = sql`(p.criado_em AT TIME ZONE 'America/Sao_Paulo')::date`;

/** Relatórios no formato do Bagisto: vendas, produtos e clientes de um período. Cancelados não contam como venda. */
@Injectable()
export class RelatoriosService {
  constructor(@Inject(BANCO) private readonly db: Banco) {}

  async vendas(de?: string, ate?: string, agrupar: Agrupamento = 'dia') {
    const p = lerPeriodo(de, ate);
    const t = sql.lit(TRUNC[agrupar]);
    const serie = await sql<{ periodo: string; pedidos: number; subtotal: string; promocoes: string; descontos_pix: string; juros: string; vendas: string; reembolsos: string }>`
      WITH periodos AS (
        SELECT generate_series(date_trunc(${t}, ${p.de}::date), date_trunc(${t}, ${p.ate}::date), ('1 ' || ${t})::interval)::date AS periodo
      ), v AS (
        SELECT date_trunc(${t}, ${DATA})::date AS periodo, count(*)::int AS pedidos, sum(p.subtotal_centavos) AS subtotal, sum(p.promocao_centavos) AS promocoes,
               sum(p.desconto_centavos) AS descontos_pix, sum(p.juros_centavos) AS juros, sum(p.total_centavos) AS vendas
        FROM pedidos p WHERE p.situacao <> 'cancelado' AND ${DATA} BETWEEN ${p.de}::date AND ${p.ate}::date GROUP BY 1
      ), r AS (
        SELECT date_trunc(${t}, (r.criado_em AT TIME ZONE 'America/Sao_Paulo')::date)::date AS periodo, sum(r.valor_centavos) AS reembolsos
        FROM reembolsos r WHERE (r.criado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${p.de}::date AND ${p.ate}::date GROUP BY 1
      )
      SELECT to_char(periodos.periodo, 'YYYY-MM-DD') AS periodo, coalesce(v.pedidos, 0) AS pedidos, coalesce(v.subtotal, 0)::bigint AS subtotal,
             coalesce(v.promocoes, 0)::bigint AS promocoes, coalesce(v.descontos_pix, 0)::bigint AS descontos_pix, coalesce(v.juros, 0)::bigint AS juros,
             coalesce(v.vendas, 0)::bigint AS vendas, coalesce(r.reembolsos, 0)::bigint AS reembolsos
      FROM periodos LEFT JOIN v USING (periodo) LEFT JOIN r USING (periodo) ORDER BY 1`.execute(this.db);
    const linhas = serie.rows.map((x) => ({
      periodo: x.periodo, pedidos: x.pedidos, subtotal_centavos: Number(x.subtotal), promocoes_centavos: Number(x.promocoes), descontos_pix_centavos: Number(x.descontos_pix),
      juros_centavos: Number(x.juros), vendas_centavos: Number(x.vendas), reembolsos_centavos: Number(x.reembolsos),
      liquido_centavos: Number(x.vendas) - Number(x.reembolsos), ticket_medio_centavos: x.pedidos ? Math.round(Number(x.vendas) / x.pedidos) : 0,
    }));
    const soma = (k: keyof (typeof linhas)[number]) => linhas.reduce((s, l) => s + (l[k] as number), 0);
    const [porForma, porTipo, cancelados] = await Promise.all([
      sql<{ chave: string; pedidos: number; vendas: string }>`
        SELECT p.forma_pagamento AS chave, count(*)::int AS pedidos, sum(p.total_centavos)::bigint AS vendas FROM pedidos p
        WHERE p.situacao <> 'cancelado' AND ${DATA} BETWEEN ${p.de}::date AND ${p.ate}::date GROUP BY 1 ORDER BY 3 DESC`.execute(this.db),
      sql<{ chave: string; pedidos: number; vendas: string }>`
        SELECT p.tipo_cliente AS chave, count(*)::int AS pedidos, sum(p.total_centavos)::bigint AS vendas FROM pedidos p
        WHERE p.situacao <> 'cancelado' AND ${DATA} BETWEEN ${p.de}::date AND ${p.ate}::date GROUP BY 1 ORDER BY 3 DESC`.execute(this.db),
      sql<{ pedidos: number; valor: string }>`
        SELECT count(*)::int AS pedidos, coalesce(sum(p.total_centavos), 0)::bigint AS valor FROM pedidos p
        WHERE p.situacao = 'cancelado' AND ${DATA} BETWEEN ${p.de}::date AND ${p.ate}::date`.execute(this.db),
    ]);
    const pedidos = soma('pedidos');
    const vendas = soma('vendas_centavos');
    const grupo = (r: { chave: string; pedidos: number; vendas: string }) => ({ chave: r.chave, pedidos: r.pedidos, vendas_centavos: Number(r.vendas) });
    return {
      periodo: { ...p, agrupar },
      totais: {
        pedidos, subtotal_centavos: soma('subtotal_centavos'), promocoes_centavos: soma('promocoes_centavos'), descontos_pix_centavos: soma('descontos_pix_centavos'),
        juros_centavos: soma('juros_centavos'), vendas_centavos: vendas, reembolsos_centavos: soma('reembolsos_centavos'), liquido_centavos: soma('liquido_centavos'),
        ticket_medio_centavos: pedidos ? Math.round(vendas / pedidos) : 0,
        cancelados: { pedidos: cancelados.rows[0].pedidos, valor_centavos: Number(cancelados.rows[0].valor) },
      },
      serie: linhas,
      por_forma: porForma.rows.map(grupo),
      por_tipo_cliente: porTipo.rows.map(grupo),
    };
  }

  async produtos(de?: string, ate?: string) {
    const p = lerPeriodo(de, ate);
    const r = await sql<{ produto_id: number; codigo: string; nome: string; categoria_id: string; categoria: string; quantidade: string; vendas: string; pedidos: number; empresas: number; estoque: number }>`
      SELECT i.produto_id, i.codigo, i.nome, pr.categoria_id, c.nome AS categoria, sum(i.quantidade)::bigint AS quantidade, sum(i.total_centavos)::bigint AS vendas,
             count(DISTINCT p.id)::int AS pedidos, count(DISTINCT p.empresa_id)::int AS empresas, pr.estoque
      FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id JOIN produtos pr ON pr.id = i.produto_id JOIN categorias c ON c.id = pr.categoria_id
      WHERE p.situacao <> 'cancelado' AND ${DATA} BETWEEN ${p.de}::date AND ${p.ate}::date
      GROUP BY i.produto_id, i.codigo, i.nome, pr.categoria_id, c.nome, pr.estoque ORDER BY vendas DESC`.execute(this.db);
    const produtos = r.rows.map(({ vendas, quantidade, ...x }) => ({ ...x, quantidade: Number(quantidade), vendas_centavos: Number(vendas) }));
    const categorias = new Map<string, { categoria_id: string; categoria: string; produtos: number; quantidade: number; vendas_centavos: number }>();
    for (const x of produtos) {
      const c = categorias.get(x.categoria_id) ?? { categoria_id: x.categoria_id, categoria: x.categoria, produtos: 0, quantidade: 0, vendas_centavos: 0 };
      c.produtos++; c.quantidade += x.quantidade; c.vendas_centavos += x.vendas_centavos;
      categorias.set(x.categoria_id, c);
    }
    const semVenda = await sql<{ n: number }>`
      SELECT count(*)::int AS n FROM produtos pr WHERE pr.ativo AND NOT pr.sob_orcamento AND NOT EXISTS (
        SELECT 1 FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id
        WHERE i.produto_id = pr.id AND p.situacao <> 'cancelado' AND ${DATA} BETWEEN ${p.de}::date AND ${p.ate}::date)`.execute(this.db);
    return {
      periodo: p, produtos, categorias: [...categorias.values()].sort((a, b) => b.vendas_centavos - a.vendas_centavos),
      totais: { produtos_vendidos: produtos.length, produtos_sem_venda: semVenda.rows[0].n, quantidade: produtos.reduce((s, x) => s + x.quantidade, 0), vendas_centavos: produtos.reduce((s, x) => s + x.vendas_centavos, 0) },
    };
  }

  async clientes(de?: string, ate?: string) {
    const p = lerPeriodo(de, ate);
    const r = await sql<{ empresa_id: string; razao_social: string; cnpj: string; tipo_cliente: string; situacao: string; pedidos: number; vendas: string; ultimo_pedido: string | null; primeiro_pedido: string | null; criada_em: string }>`
      SELECT e.id AS empresa_id, e.razao_social, e.cnpj, e.tipo_cliente, e.situacao, e.criado_em AS criada_em,
             count(p.id) FILTER (WHERE ${DATA} BETWEEN ${p.de}::date AND ${p.ate}::date)::int AS pedidos,
             coalesce(sum(p.total_centavos) FILTER (WHERE ${DATA} BETWEEN ${p.de}::date AND ${p.ate}::date), 0)::bigint AS vendas,
             max(p.criado_em) AS ultimo_pedido, min(p.criado_em) AS primeiro_pedido
      FROM empresas e LEFT JOIN pedidos p ON p.empresa_id = e.id AND p.situacao <> 'cancelado'
      GROUP BY e.id ORDER BY vendas DESC, e.razao_social`.execute(this.db);
    const clientes = r.rows.map(({ vendas, ...x }) => ({ ...x, vendas_centavos: Number(vendas), ticket_medio_centavos: x.pedidos ? Math.round(Number(vendas) / x.pedidos) : 0 }));
    const noPeriodo = (d: string | null) => !!d && new Date(d).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) >= p.de && new Date(d).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) <= p.ate;
    return {
      periodo: p, clientes,
      totais: {
        empresas: clientes.length, compraram: clientes.filter((c) => c.pedidos > 0).length,
        primeira_compra_no_periodo: clientes.filter((c) => noPeriodo(c.primeiro_pedido)).length, novas_empresas: clientes.filter((c) => noPeriodo(c.criada_em)).length,
        vendas_centavos: clientes.reduce((s, c) => s + c.vendas_centavos, 0),
      },
    };
  }

  // ======================= pedidos e financeiro por janela de tempo =======================

  /** Janela pedida (últimas N horas ou período); sem nada, os últimos 7 dias. */
  private janela(f: FiltroJanela): Janela {
    return lerJanela(f) ?? lerJanela({ horas: 168 })!;
  }

  /**
   * Relatório consolidado de pedidos: cada pedido com a descrição dos itens e a situação financeira dele
   * (pago, em aberto, vencido, reembolsado), mais os totais por cliente e por perfil de cliente.
   */
  async pedidos(f: FiltroJanela) {
    const j = this.janela(f);
    const hoje = hojeBrasil();
    const r = await sql<LinhaPedido>`
      SELECT p.id, p.criado_em, p.empresa_id, e.razao_social, e.cnpj, p.tipo_cliente, u.nome AS comprador, p.situacao, p.situacao_pagamento,
             p.forma_pagamento, p.parcelas, p.ordem_compra, p.cupom, p.cotacao_id,
             p.subtotal_centavos, p.promocao_centavos, p.desconto_centavos, p.juros_centavos, p.total_centavos,
             coalesce(fin.pago, 0)::bigint AS pago_centavos, coalesce(fin.aberto, 0)::bigint AS aberto_centavos,
             coalesce(fin.vencido, 0)::bigint AS vencido_centavos, coalesce(ree.valor, 0)::bigint AS reembolsado_centavos,
             -- sem cobrança em aberto: boleto ainda não faturado ou Pix que expirou sem pagamento
             CASE WHEN p.situacao = 'cancelado' THEN 0
                  ELSE greatest(p.total_centavos - coalesce(fin.pago, 0) - coalesce(fin.aberto, 0) - coalesce(ree.valor, 0), 0) END AS a_faturar_centavos,
             coalesce(it.itens, '[]'::json) AS itens, coalesce(it.unidades, 0)::bigint AS unidades
      FROM pedidos p
      JOIN empresas e ON e.id = p.empresa_id
      JOIN usuarios u ON u.id = p.comprador_id
      LEFT JOIN LATERAL (
        SELECT sum(coalesce(pa.valor_pago_centavos, pa.valor_centavos)) FILTER (WHERE pa.situacao = 'paga') AS pago,
               sum(pa.valor_centavos) FILTER (WHERE pa.situacao IN ('aberta', 'vencida')) AS aberto,
               sum(pa.valor_centavos) FILTER (WHERE pa.situacao IN ('aberta', 'vencida') AND pa.vencimento < ${hoje}::date) AS vencido
        FROM cobrancas c JOIN parcelas pa ON pa.cobranca_id = c.id WHERE c.pedido_id = p.id AND c.situacao <> 'cancelada'
      ) fin ON true
      LEFT JOIN LATERAL (SELECT sum(valor_centavos) AS valor FROM reembolsos WHERE pedido_id = p.id) ree ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('codigo', i.codigo, 'nome', i.nome, 'quantidade', i.quantidade, 'unidade', i.unidade,
                                          'preco_unitario_centavos', i.preco_unitario_centavos, 'total_centavos', i.total_centavos) ORDER BY i.id) AS itens,
               sum(i.quantidade) AS unidades
        FROM pedido_itens i WHERE i.pedido_id = p.id
      ) it ON true
      WHERE p.criado_em BETWEEN ${j.inicio}::timestamptz AND ${j.fim}::timestamptz
        ${f.tipo_cliente ? sql`AND p.tipo_cliente = ${f.tipo_cliente}` : sql``}
        ${f.empresa_id ? sql`AND p.empresa_id = ${f.empresa_id}::uuid` : sql``}
      ORDER BY p.criado_em DESC, p.id DESC
      LIMIT 5000`.execute(this.db);
    const pedidos = r.rows.map((x) => ({
      ...x, pago_centavos: Number(x.pago_centavos), aberto_centavos: Number(x.aberto_centavos), vencido_centavos: Number(x.vencido_centavos),
      reembolsado_centavos: Number(x.reembolsado_centavos), unidades: Number(x.unidades), a_faturar_centavos: Number(x.a_faturar_centavos),
      descricao: x.itens.map((i) => `${i.quantidade} ${i.unidade} ${i.nome} (${i.codigo})`).join('; '),
    }));
    const validos = pedidos.filter((p) => p.situacao !== 'cancelado');
    const somar = (lista: typeof pedidos) => ({
      pedidos: lista.length, unidades: lista.reduce((s, p) => s + p.unidades, 0),
      subtotal_centavos: lista.reduce((s, p) => s + p.subtotal_centavos, 0), descontos_centavos: lista.reduce((s, p) => s + p.promocao_centavos + p.desconto_centavos, 0),
      juros_centavos: lista.reduce((s, p) => s + p.juros_centavos, 0), vendas_centavos: lista.reduce((s, p) => s + p.total_centavos, 0),
      pago_centavos: lista.reduce((s, p) => s + p.pago_centavos, 0), aberto_centavos: lista.reduce((s, p) => s + p.aberto_centavos, 0),
      vencido_centavos: lista.reduce((s, p) => s + p.vencido_centavos, 0), reembolsado_centavos: lista.reduce((s, p) => s + p.reembolsado_centavos, 0),
      a_faturar_centavos: lista.reduce((s, p) => s + p.a_faturar_centavos, 0),
      ticket_medio_centavos: lista.length ? Math.round(lista.reduce((s, p) => s + p.total_centavos, 0) / lista.length) : 0,
    });
    const agrupar = <K extends string>(chave: (p: (typeof pedidos)[number]) => K, extra: (p: (typeof pedidos)[number]) => Record<string, unknown>) => {
      const m = new Map<K, typeof pedidos>();
      for (const p of validos) m.set(chave(p), [...(m.get(chave(p)) ?? []), p]);
      return [...m.entries()].map(([k, lista]) => ({ ...extra(lista[0]), ...somar(lista), ultimo_pedido: lista[0].criado_em, chave: k }))
        .sort((a, b) => b.vendas_centavos - a.vendas_centavos);
    };
    return {
      janela: j,
      totais: { ...somar(validos), cancelados: pedidos.length - validos.length, cancelados_centavos: pedidos.filter((p) => p.situacao === 'cancelado').reduce((s, p) => s + p.total_centavos, 0) },
      por_cliente: agrupar((p) => p.empresa_id, (p) => ({ empresa_id: p.empresa_id, razao_social: p.razao_social, cnpj: p.cnpj, tipo_cliente: p.tipo_cliente })),
      por_tipo: agrupar((p) => p.tipo_cliente, (p) => ({ tipo_cliente: p.tipo_cliente })),
      pedidos,
    };
  }

  /**
   * Financeiro de todos os clientes: o que venderam e o que pagaram na janela, e a posição de hoje
   * (em aberto, vencido, a vencer em 7 dias, maior atraso, limite e crédito disponível).
   */
  async financeiro(f: FiltroJanela) {
    const j = this.janela(f);
    const hoje = hojeBrasil();
    const r = await sql<LinhaFinanceiro>`
      WITH parc AS (
        SELECT coalesce(p.empresa_id, o.empresa_id) AS empresa_id, c.meio, pa.situacao, pa.vencimento, pa.valor_centavos
        FROM parcelas pa JOIN cobrancas c ON c.id = pa.cobranca_id
        LEFT JOIN pedidos p ON p.id = c.pedido_id
        LEFT JOIN numerarios n ON n.id = c.numerario_id LEFT JOIN ordens_importacao o ON o.id = n.ordem_id
        WHERE c.situacao <> 'cancelada'
      ), receb AS (
        SELECT coalesce(p.empresa_id, o.empresa_id) AS empresa_id, sum(pg.valor_centavos) AS valor, count(*) AS n
        FROM pagamentos pg JOIN parcelas pa ON pa.id = pg.parcela_id JOIN cobrancas c ON c.id = pa.cobranca_id
        LEFT JOIN pedidos p ON p.id = c.pedido_id
        LEFT JOIN numerarios n ON n.id = c.numerario_id LEFT JOIN ordens_importacao o ON o.id = n.ordem_id
        WHERE pg.pago_em BETWEEN ${j.inicio}::timestamptz AND ${j.fim}::timestamptz GROUP BY 1
      ), vend AS (
        SELECT empresa_id, count(*) AS pedidos, sum(total_centavos) AS valor FROM pedidos
        WHERE situacao <> 'cancelado' AND criado_em BETWEEN ${j.inicio}::timestamptz AND ${j.fim}::timestamptz GROUP BY 1
      ), ree AS (
        SELECT p.empresa_id, sum(r.valor_centavos) AS valor FROM reembolsos r JOIN pedidos p ON p.id = r.pedido_id
        WHERE r.criado_em BETWEEN ${j.inicio}::timestamptz AND ${j.fim}::timestamptz GROUP BY 1
      ), aguard AS (
        SELECT empresa_id, sum(total_centavos) AS valor FROM pedidos
        WHERE forma_pagamento = 'boleto' AND situacao_pagamento = 'aguardando_faturamento' AND situacao <> 'cancelado' GROUP BY 1
      )
      SELECT e.id AS empresa_id, e.razao_social, e.cnpj, e.tipo_cliente, e.situacao AS situacao_empresa, cc.faixa,
             CASE WHEN cc.situacao = 'aprovado' THEN cc.limite_aprovado_centavos ELSE 0 END AS limite_centavos,
             coalesce(vend.pedidos, 0)::int AS pedidos, coalesce(vend.valor, 0)::bigint AS vendas_centavos,
             coalesce(receb.valor, 0)::bigint AS recebido_centavos, coalesce(receb.n, 0)::int AS pagamentos,
             coalesce(ree.valor, 0)::bigint AS reembolsos_centavos,
             coalesce((SELECT sum(valor_centavos) FROM parc WHERE parc.empresa_id = e.id AND situacao IN ('aberta', 'vencida')), 0)::bigint AS aberto_centavos,
             coalesce((SELECT sum(valor_centavos) FROM parc WHERE parc.empresa_id = e.id AND situacao IN ('aberta', 'vencida') AND vencimento < ${hoje}::date), 0)::bigint AS vencido_centavos,
             coalesce((SELECT sum(valor_centavos) FROM parc WHERE parc.empresa_id = e.id AND situacao IN ('aberta', 'vencida')
                        AND vencimento BETWEEN ${hoje}::date AND ${hoje}::date + 7), 0)::bigint AS a_vencer_7d_centavos,
             coalesce((SELECT max(${hoje}::date - vencimento) FROM parc WHERE parc.empresa_id = e.id AND situacao IN ('aberta', 'vencida') AND vencimento < ${hoje}::date), 0)::int AS maior_atraso_dias,
             (coalesce(aguard.valor, 0) + coalesce((SELECT sum(valor_centavos) FROM parc WHERE parc.empresa_id = e.id AND meio = 'boleto' AND situacao IN ('aberta', 'vencida')), 0))::bigint AS credito_usado_centavos
      FROM empresas e
      LEFT JOIN cadastros_credito cc ON cc.empresa_id = e.id
      LEFT JOIN vend ON vend.empresa_id = e.id LEFT JOIN receb ON receb.empresa_id = e.id
      LEFT JOIN ree ON ree.empresa_id = e.id LEFT JOIN aguard ON aguard.empresa_id = e.id
      WHERE true ${f.tipo_cliente ? sql`AND e.tipo_cliente = ${f.tipo_cliente}` : sql``} ${f.empresa_id ? sql`AND e.id = ${f.empresa_id}::uuid` : sql``}
      ORDER BY vencido_centavos DESC, aberto_centavos DESC, e.razao_social`.execute(this.db);
    const n = (v: unknown) => Number(v ?? 0);
    const clientes = r.rows.map((x) => {
      const limite = n(x.limite_centavos);
      const usado = n(x.credito_usado_centavos);
      return {
        ...x, limite_centavos: limite, vendas_centavos: n(x.vendas_centavos), recebido_centavos: n(x.recebido_centavos), reembolsos_centavos: n(x.reembolsos_centavos),
        aberto_centavos: n(x.aberto_centavos), vencido_centavos: n(x.vencido_centavos), a_vencer_7d_centavos: n(x.a_vencer_7d_centavos),
        credito_usado_centavos: usado, credito_disponivel_centavos: Math.max(0, limite - usado),
      };
    });
    const soma = (k: keyof (typeof clientes)[number]) => clientes.reduce((s, c) => s + Number(c[k] ?? 0), 0);
    const porTipo = new Map<string, { tipo_cliente: string; empresas: number; vendas_centavos: number; recebido_centavos: number; aberto_centavos: number; vencido_centavos: number }>();
    for (const c of clientes) {
      const t = porTipo.get(c.tipo_cliente) ?? { tipo_cliente: c.tipo_cliente, empresas: 0, vendas_centavos: 0, recebido_centavos: 0, aberto_centavos: 0, vencido_centavos: 0 };
      t.empresas++; t.vendas_centavos += c.vendas_centavos; t.recebido_centavos += c.recebido_centavos; t.aberto_centavos += c.aberto_centavos; t.vencido_centavos += c.vencido_centavos;
      porTipo.set(c.tipo_cliente, t);
    }
    return {
      janela: j,
      totais: {
        empresas: clientes.length, pedidos: soma('pedidos'), vendas_centavos: soma('vendas_centavos'), recebido_centavos: soma('recebido_centavos'),
        reembolsos_centavos: soma('reembolsos_centavos'), aberto_centavos: soma('aberto_centavos'), vencido_centavos: soma('vencido_centavos'),
        a_vencer_7d_centavos: soma('a_vencer_7d_centavos'), limite_centavos: soma('limite_centavos'), credito_disponivel_centavos: soma('credito_disponivel_centavos'),
        empresas_com_atraso: clientes.filter((c) => c.vencido_centavos > 0).length,
      },
      por_tipo: [...porTipo.values()].sort((a, b) => b.vendas_centavos - a.vendas_centavos),
      clientes,
    };
  }
}

export interface FiltroJanela { horas?: number; de?: string; ate?: string; tipo_cliente?: string; empresa_id?: string }

interface LinhaPedido {
  id: number; criado_em: string; empresa_id: string; razao_social: string; cnpj: string; tipo_cliente: string; comprador: string; situacao: string; situacao_pagamento: string;
  forma_pagamento: string; parcelas: number; ordem_compra: string | null; cupom: string | null; cotacao_id: number | null;
  subtotal_centavos: number; promocao_centavos: number; desconto_centavos: number; juros_centavos: number; total_centavos: number;
  pago_centavos: string; aberto_centavos: string; vencido_centavos: string; reembolsado_centavos: string; unidades: string; a_faturar_centavos: string;
  itens: Array<{ codigo: string; nome: string; quantidade: number; unidade: string; preco_unitario_centavos: number; total_centavos: number }>;
}

interface LinhaFinanceiro {
  empresa_id: string; razao_social: string; cnpj: string; tipo_cliente: string; situacao_empresa: string; faixa: string | null; limite_centavos: string;
  pedidos: number; vendas_centavos: string; recebido_centavos: string; pagamentos: number; reembolsos_centavos: string; aberto_centavos: string;
  vencido_centavos: string; a_vencer_7d_centavos: string; maior_atraso_dias: number; credito_usado_centavos: string;
}
