import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { BANCO, type Banco } from '../banco/banco.module';
import { lerPeriodo } from '../comum/periodo';

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
}
