/**
 * Movimento de demonstração: 90 dias de pedidos, pagamentos, parcelas e orçamentos de importação,
 * para o Painel (gráficos, rankings, tabelas) não abrir vazio.
 *
 * Tudo passa pelas regras de verdade (a própria API, chamada por HTTP com tokens de desenvolvimento):
 * crédito aprovado, preço por tipo de cliente, pedido mínimo, estoque, cobranças e baixa dos pagamentos.
 * Depois, só as datas de cada pedido são deslocadas para o passado, todas juntas.
 *
 * Uso: node dist/scripts/demo-movimento.js [--forcar]   (só em ambiente local; não roda se já houver pedidos)
 */
import type { INestApplication } from '@nestjs/common';
import { sql } from 'kysely';
import type { AddressInfo } from 'node:net';
import { criarAplicacao } from '../aplicacao';
import { gerarTokenDev } from '../auth/verificador-dev';
import { criarConexao } from '../banco/conexao';
import { DEMONSTRACAO } from '../banco/semear';
import { lerConfig } from '../config';
import { documentosExigidos } from '../credito/documentos-exigidos';
import { hojeBrasil } from '../pagamentos/regras';
import { RotinasService } from '../rotinas/rotinas.service';

const DIAS = 90;
const ADMIN = 'admin@importfacil.dev';
const EQUIPE_EXTRA = [
  { email: 'financeiro@importfacil.dev', nome: 'Fernanda Lima (financeiro)', papel: 'financeiro' },
  { email: 'comercial@importfacil.dev', nome: 'Carlos Souza (comercial)', papel: 'comercial' },
];
/** Crédito de cada empresa de demonstração (o hospital compra só no Pix e no cartão). */
const CREDITO: Record<string, { faixa: 'A' | 'B'; limite: number; faturamento: number } | undefined> = {
  cooperativa: { faixa: 'A', limite: 90_000_000, faturamento: 2_000_000_000 },
  distribuidora: { faixa: 'A', limite: 60_000_000, faturamento: 1_200_000_000 },
  revendedor: { faixa: 'B', limite: 20_000_000, faturamento: 400_000_000 },
  construtora: { faixa: 'A', limite: 80_000_000, faturamento: 1_600_000_000 },
  hospital: undefined,
};
const PDF = Buffer.from('%PDF-1.4\n% documento de demonstração\n');

/** Sorteio com semente: o mesmo movimento a cada instalação. */
function sorteador(semente: number) {
  let s = semente >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { r, entre: (a: number, b: number) => a + Math.floor(r() * (b - a + 1)), um: <T>(l: T[]) => l[Math.floor(r() * l.length)] };
}

async function principal(): Promise<void> {
  const config = lerConfig({ ...process.env, LIMITE_REQ_MINUTO: '100000' });
  if (config.ambiente === 'prod' || config.auth.modo !== 'dev') throw new Error('O movimento de demonstração só roda em ambiente local, com login de desenvolvimento.');
  const db = criarConexao(config.banco);
  const { n } = await db.selectFrom('pedidos').select(sql<number>`count(*)::int`.as('n')).executeTakeFirstOrThrow();
  if (n > 0 && !process.argv.includes('--forcar')) {
    console.log(`Movimento de demonstração: já há ${n} pedido(s); nada a fazer.`);
    await db.destroy();
    return;
  }

  const app: INestApplication = await criarAplicacao(config);
  await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}${config.prefixoApi ? '/' + config.prefixoApi : ''}`;
  const segredo = config.auth.segredoDev ?? '';
  const tokens = new Map<string, string>();
  const token = async (email: string, origem: 'cliente' | 'equipe') => {
    const k = `${origem}:${email}`;
    if (!tokens.has(k)) tokens.set(k, await gerarTokenDev(segredo, `dev-${email}`, origem));
    return tokens.get(k)!;
  };
  const chamar = async <T = Record<string, unknown>>(metodo: string, caminho: string, email: string, origem: 'cliente' | 'equipe', corpo?: unknown, form?: FormData): Promise<T> => {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { Authorization: `Bearer ${await token(email, origem)}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: form ?? (corpo ? JSON.stringify(corpo) : undefined),
    });
    const dados = (r.headers.get('content-type') ?? '').includes('json') ? await r.json() : await r.text();
    if (!r.ok) throw Object.assign(new Error(`${metodo} ${caminho} → ${r.status}: ${JSON.stringify(dados).slice(0, 300)}`), { status: r.status, dados });
    return dados as T;
  };

  const s = sorteador(20261110);
  try {
    // 1) equipe: financeiro e comercial
    for (const u of EQUIPE_EXTRA) {
      await chamar('POST', '/equipe/usuarios', ADMIN, 'equipe', u).catch((e) => { if (e.status !== 409 && e.status !== 400) throw e; });
    }

    // 2) crédito aprovado (cadastro, documentos, análise)
    const empresas = await db.selectFrom('empresas').select(['id', 'cnpj', 'tipo_cliente', 'razao_social']).execute();
    for (const d of DEMONSTRACAO) {
      const c = CREDITO[d.tipo];
      const emp = empresas.find((e) => e.cnpj === d.cnpj)!;
      if (!c) continue;
      await chamar('PUT', '/credito/cadastro', d.email, 'cliente', {
        faturamento_mensal_centavos: c.faturamento, limite_solicitado_centavos: c.limite,
        compras_mensais_previstas_centavos: Math.round(c.limite * 0.6), anos_cnpj: s.entre(4, 25),
      });
      for (const tipo of documentosExigidos(d.tipo, c.limite)) {
        const f = new FormData();
        f.append('arquivo', new Blob([PDF], { type: 'application/pdf' }), `${tipo}.pdf`);
        await chamar('POST', `/credito/documentos?tipo=${tipo}`, d.email, 'cliente', undefined, f);
      }
      await chamar('POST', '/credito/cadastro/enviar', d.email, 'cliente');
      await chamar('POST', `/equipe/credito/${emp.id}/decisao`, ADMIN, 'equipe', {
        acao: 'aprovar', faixa: c.faixa, limite_centavos: c.limite, parecer: 'Cadastro completo, sem restrições (demonstração).',
      });
    }
    const coop = empresas.find((e) => e.tipo_cliente === 'cooperativa')!;
    await chamar('PUT', `/equipe/empresas/${coop.id}/conta-e-ordem`, ADMIN, 'equipe', { liberar: true });

    // 3) pedidos ao longo de 90 dias
    const tabelas = await db.selectFrom('tabelas_preco').select(['tipo_cliente', 'pedido_minimo_centavos', 'desconto_bp']).execute();
    const categorias = await db.selectFrom('categorias').select(['id', 'tipos_cliente']).execute();
    const produtos = await db.selectFrom('produtos')
      .select(['id', 'codigo', 'categoria_id', 'multiplo_venda', 'estoque', 'preco_tabela_centavos'])
      .where('ativo', '=', true).where('sob_orcamento', '=', false).where('preco_tabela_centavos', '>', 0).execute();
    const visiveis = (tipo: string) => produtos.filter((p) => {
      const c = categorias.find((x) => x.id === p.categoria_id);
      return !c?.tipos_cliente || c.tipos_cliente.includes(tipo);
    });
    const estoque = new Map(produtos.map((p) => [p.id, p.estoque]));
    const plano: Array<{ dia: number; email: string; tipo: string }> = [];
    for (let dia = DIAS; dia >= 0; dia--) {
      const qtd = s.r() < 0.35 ? 0 : s.entre(1, dia < 30 ? 2 : 1);   // mais movimento no último mês
      for (let k = 0; k < qtd; k++) { const d = s.um(DEMONSTRACAO); plano.push({ dia, email: d.email, tipo: d.tipo }); }
    }

    let criados = 0;
    const deslocar: Array<{ pedido: number; dias: number; etapas?: number }> = [];
    for (const p of plano) {
      const tab = tabelas.find((t) => t.tipo_cliente === p.tipo)!;
      const fator = 1 - tab.desconto_bp / 10000;
      const alvo = tab.pedido_minimo_centavos * (1.05 + s.r() * 1.6);
      const opcoes = visiveis(p.tipo);
      const itens = new Map<number, number>();
      let subtotal = 0;
      for (let tentativa = 0; tentativa < 40 && subtotal < alvo; tentativa++) {
        const prod = s.um(opcoes);
        const unit = Math.round(prod.preco_tabela_centavos * fator);
        const mult = Math.max(1, prod.multiplo_venda);
        const quero = mult * s.entre(1, unit * mult > alvo / 2 ? 1 : 4);
        const disp = (estoque.get(prod.id) ?? 0) - (itens.get(prod.id) ?? 0);
        if (disp < quero + mult) continue;                      // deixa sobra no estoque
        itens.set(prod.id, (itens.get(prod.id) ?? 0) + quero);
        subtotal += unit * quero;
      }
      if (subtotal < tab.pedido_minimo_centavos) continue;
      const credito = CREDITO[p.tipo];
      const sorte = s.r();
      const forma = credito && sorte < 0.45 ? 'boleto' : sorte < 0.82 ? 'pix' : 'cartao';
      const corpo: Record<string, unknown> = { itens: [...itens].map(([produto_id, quantidade]) => ({ produto_id, quantidade })), forma_pagamento: forma };
      if (forma === 'boleto') corpo.parcelas = s.entre(1, credito!.faixa === 'A' ? 4 : 2);
      if (forma === 'cartao') { corpo.parcelas = s.entre(1, 10); corpo.token_cartao = 'tok_demonstracao'; }
      let pedido: { id: number };
      try {
        pedido = await chamar('POST', '/pedidos', p.email, 'cliente', corpo);
      } catch (e) {
        if ([400, 403, 409].includes((e as { status?: number }).status ?? 0)) continue; // limite de crédito, atraso, estoque…
        throw e;
      }
      for (const [id, q] of itens) estoque.set(id, (estoque.get(id) ?? 0) - q);
      criados++;

      // pagamento e andamento, conforme a idade do pedido
      const parcelas = await db.selectFrom('parcelas as pa').innerJoin('cobrancas as c', 'c.id', 'pa.cobranca_id')
        .select(['pa.id', 'pa.numero', 'pa.situacao']).where('c.pedido_id', '=', pedido.id).orderBy('pa.numero').execute();
      if (forma === 'pix') {
        if (p.dia > 1 && s.r() < 0.9) for (const pa of parcelas) await chamar('POST', `/equipe/simulador/parcelas/${pa.id}/confirmar`, ADMIN, 'equipe');
        else if (p.dia > 3) { await chamar('POST', `/equipe/pedidos/${pedido.id}/cancelar`, ADMIN, 'equipe', { motivo: 'Pix não pago (demonstração)' }); deslocar.push({ pedido: pedido.id, dias: p.dia }); continue; }
      }
      if (forma === 'boleto' && p.dia > 0) await chamar('POST', `/equipe/pedidos/${pedido.id}/faturar`, ADMIN, 'equipe');
      const pago = forma !== 'pix' || parcelas.every(() => p.dia > 1);
      const etapas = !pago ? 0 : p.dia > 20 ? 3 : p.dia > 8 ? 2 : p.dia > 2 ? 1 : 0;   // em separação → enviado → entregue
      // nota fiscal assim que o pagamento é confirmado (ou o boleto faturado)
      if (pago && p.dia > 0) await chamar('POST', `/equipe/vendas/pedidos/${pedido.id}/nota`, ADMIN, 'equipe').catch(() => undefined);
      // em separação → enviado (com transportadora e rastreio) → entregue
      if (etapas >= 1) await chamar('POST', `/equipe/pedidos/${pedido.id}/avancar`, ADMIN, 'equipe').catch(() => undefined);
      if (etapas >= 2) {
        const transp = s.um(['Jadlog', 'Braspress', 'TNT Mercúrio', 'Rodonaves', 'Correios']);
        const envio = await chamar<{ id: number }>('POST', `/equipe/vendas/pedidos/${pedido.id}/envio`, ADMIN, 'equipe', {
          transportadora: transp, codigo_rastreio: `${transp.slice(0, 2).toUpperCase()}${s.entre(100000000, 999999999)}BR`, volumes: s.entre(1, 6), peso_kg: s.entre(5, 900),
        }).catch(() => null);
        if (etapas >= 3 && envio) await chamar('POST', `/equipe/vendas/envios/${envio.id}/entregue`, ADMIN, 'equipe').catch(() => undefined);
      }
      deslocar.push({ pedido: pedido.id, dias: p.dia, etapas });
    }

    // 4) datas no passado, todas do mesmo pedido juntas. Numa conexão só, com os gatilhos desligados
    //    (eles carimbam "atualizado em" com a hora atual e protegem os pagamentos) — só na demonstração.
    await db.connection().execute(async (db) => {
    await sql`SET session_replication_role = replica`.execute(db);
    for (const { pedido, dias } of deslocar) {
      const desl = sql.raw(`interval '${dias} days'`);
      await sql`UPDATE pedidos SET criado_em = criado_em - ${desl}, atualizado_em = atualizado_em - ${desl}, faturado_em = faturado_em - ${desl} WHERE id = ${pedido}`.execute(db);
      await sql`UPDATE pedido_eventos SET criado_em = criado_em - ${desl} WHERE pedido_id = ${pedido}`.execute(db);
      await sql`UPDATE cobrancas SET criado_em = criado_em - ${desl}, expira_em = expira_em - ${desl} WHERE pedido_id = ${pedido}`.execute(db);
      await sql`UPDATE parcelas SET vencimento = vencimento - ${dias}::int, pago_em = pago_em - ${desl} WHERE cobranca_id IN (SELECT id FROM cobrancas WHERE pedido_id = ${pedido})`.execute(db);
      await sql`UPDATE pagamentos SET pago_em = pago_em - ${desl}, criado_em = criado_em - ${desl} WHERE parcela_id IN (SELECT pa.id FROM parcelas pa JOIN cobrancas c ON c.id = pa.cobranca_id WHERE c.pedido_id = ${pedido})`.execute(db);
      await sql`UPDATE notas_fiscais SET emitida_em = emitida_em - ${desl} WHERE pedido_id = ${pedido}`.execute(db);
      // envio dois dias depois do pedido; entrega de 3 a 6 dias depois do envio
      await sql`UPDATE envios SET enviado_em = enviado_em - ${desl} + interval '2 days', entregue_em = entregue_em - ${desl} + interval '2 days' + (${3 + (pedido % 4)}::int * interval '1 day') WHERE pedido_id = ${pedido}`.execute(db);
      await sql`UPDATE pedido_eventos SET criado_em = criado_em + interval '2 days' WHERE pedido_id = ${pedido} AND descricao LIKE 'Enviado%'`.execute(db);
      await sql`UPDATE pedido_eventos SET criado_em = criado_em + interval '2 days' + (${3 + (pedido % 4)}::int * interval '1 day') WHERE pedido_id = ${pedido} AND descricao = 'Entregue.'`.execute(db);
    }

    await sql`SET session_replication_role = DEFAULT`.execute(db);
    });

    // 5) boletos: as parcelas já vencidas foram pagas perto do vencimento; algumas ficaram em atraso
    const vencidas = await db.selectFrom('parcelas as pa').innerJoin('cobrancas as c', 'c.id', 'pa.cobranca_id')
      .select(['pa.id', 'pa.vencimento']).where('c.meio', '=', 'boleto').where('pa.situacao', 'in', ['aberta', 'vencida'])
      .where('pa.vencimento', '<', hojeBrasil()).execute();
    let atrasadas = 0;
    const pagas: Array<{ id: number; antes: number }> = [];
    for (const pa of vencidas) {
      if (s.r() < 0.18) { atrasadas++; continue; }
      await chamar('POST', `/equipe/simulador/parcelas/${pa.id}/confirmar`, ADMIN, 'equipe');
      pagas.push({ id: pa.id, antes: s.entre(0, 4) });
    }
    await db.connection().execute(async (db) => {
      await sql`SET session_replication_role = replica`.execute(db);
      for (const { id, antes } of pagas) {
        await sql`UPDATE parcelas SET pago_em = (vencimento - ${antes}::int)::timestamptz + interval '10 hours' WHERE id = ${id}`.execute(db);
        await sql`UPDATE pagamentos SET pago_em = (SELECT pago_em FROM parcelas WHERE id = ${id}), criado_em = (SELECT pago_em FROM parcelas WHERE id = ${id}) WHERE parcela_id = ${id}`.execute(db);
      }
      await sql`SET session_replication_role = DEFAULT`.execute(db);
    });
    await app.get(RotinasService).diaria(hojeBrasil());

    // 6) reembolsos de exemplo: um parcial (com devolução ao estoque) e um total no cartão
    const entregues = await db.selectFrom('pedidos').select(['id', 'forma_pagamento', 'total_centavos']).where('situacao', '=', 'entregue').where('situacao_pagamento', '=', 'pago').orderBy('id').execute();
    const parcial = entregues.find((x) => x.forma_pagamento === 'pix');
    if (parcial) {
      const item = await db.selectFrom('pedido_itens').select(['produto_id', 'preco_unitario_centavos']).where('pedido_id', '=', parcial.id).executeTakeFirstOrThrow();
      await chamar('POST', `/equipe/vendas/pedidos/${parcial.id}/reembolso`, ADMIN, 'equipe', {
        valor_centavos: item.preco_unitario_centavos, motivo: 'Uma unidade chegou com avaria no transporte.', devolver_estoque: true, itens: [{ produto_id: item.produto_id, quantidade: 1 }],
      }).catch((e) => console.warn('Reembolso parcial de exemplo não registrado:', (e as Error).message));
    }
    const total = entregues.find((x) => x.forma_pagamento === 'cartao');
    if (total) {
      await chamar('POST', `/equipe/vendas/pedidos/${total.id}/reembolso`, ADMIN, 'equipe', { valor_centavos: total.total_centavos, motivo: 'Cliente desistiu da compra dentro do prazo.' })
        .catch((e) => console.warn('Reembolso total de exemplo não registrado:', (e as Error).message));
    }
    await db.connection().execute(async (db) => {
      await sql`SET session_replication_role = replica`.execute(db);
      await sql`UPDATE reembolsos r SET criado_em = (SELECT max(v.entregue_em) FROM envios v WHERE v.pedido_id = r.pedido_id) + interval '2 days'
                WHERE EXISTS (SELECT 1 FROM envios v WHERE v.pedido_id = r.pedido_id AND v.entregue_em IS NOT NULL)`.execute(db);
      await sql`UPDATE pedido_eventos e SET criado_em = r.criado_em FROM reembolsos r WHERE e.pedido_id = r.pedido_id AND e.tipo = 'reembolso'`.execute(db);
      await sql`SET session_replication_role = DEFAULT`.execute(db);
    });

    // 7) importação: um orçamento aguardando proposta, um aceito (ordem em andamento) e um recusado
    const imp = DEMONSTRACAO.find((d) => d.tipo === 'cooperativa')!;
    await chamar('POST', '/orcamentos', imp.email, 'cliente', { modalidade: 'encomenda', itens: [{ descricao: 'Drone pulverizador 40 L', quantidade: 4 }, { descricao: 'Baterias extras para drone', quantidade: 12 }] });
    const aceito = await chamar<{ id: number; itens: Array<{ id: number }> }>('POST', '/orcamentos', imp.email, 'cliente', { modalidade: 'conta_e_ordem', itens: [{ descricao: 'Plantadeira pneumática 12 linhas', quantidade: 2 }] });
    await chamar('PUT', `/equipe/orcamentos/${aceito.id}/proposta`, ADMIN, 'equipe', {
      itens: aceito.itens.map((i) => ({ id: i.id, preco_unitario_centavos: 38_500_000 })), frete_centavos: 1_200_000, taxa_servico_bp: 300,
      condicao: 'Numerário do câmbio no fechamento e dos tributos antes do registro (FOB Xangai, câmbio estimado a 5,20).',
      prazo_entrega_dias: 75, validade_dias: 15,
    }).catch((e) => console.warn('Proposta de demonstração não registrada:', (e as Error).message));
    await chamar('POST', `/orcamentos/${aceito.id}/aceitar`, imp.email, 'cliente').catch(() => undefined);
    const hosp = DEMONSTRACAO.find((d) => d.tipo === 'hospital')!;
    await chamar('POST', '/orcamentos', hosp.email, 'cliente', { modalidade: 'encomenda', itens: [{ descricao: 'Monitor multiparamétrico', quantidade: 10 }] });

    const tot = await db.selectFrom('pedidos').select([sql<number>`count(*)::int`.as('n'), sql<number>`coalesce(sum(total_centavos),0)::bigint`.as('v')]).executeTakeFirstOrThrow();
    console.log(`Movimento de demonstração: ${criados} pedidos em ${DIAS} dias (R$ ${(Number(tot.v) / 100).toLocaleString('pt-BR')}), ${atrasadas} parcela(s) em atraso, 3 orçamentos de importação, notas, envios e 2 reembolsos.`);
  } finally {
    await app.close();
    await db.destroy();
  }
}

principal().catch((e) => {
  console.error('Falha no movimento de demonstração:', e);
  process.exit(1);
});
