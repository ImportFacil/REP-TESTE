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
import { hojeBrasil, somarDias } from '../pagamentos/regras';
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

    // 2b) promoções: uma automática (EPI), um cupom de parceiro, um de boas-vindas e uma já encerrada
    const hojeD = hojeBrasil();
    for (const promo of [
      { nome: 'EPI com 8% de desconto', descricao: 'Equipamentos de proteção para cooperativas e construtoras.', tipo_desconto: 'percentual', desconto_bp: 800, categorias: ['epis', 'c-epi'] },
      { nome: 'Parceiro 5%', descricao: 'Cupom dos representantes comerciais.', cupom: 'PARCEIRO5', tipo_desconto: 'percentual', desconto_bp: 500, subtotal_minimo_centavos: 500_000, limite_usos: 200 },
      { nome: 'Boas-vindas', descricao: 'R$ 300 no primeiro pedido acima de R$ 5.000.', cupom: 'BEMVINDO', tipo_desconto: 'valor_fixo', desconto_centavos: 30_000, subtotal_minimo_centavos: 500_000, limite_por_empresa: 1 },
      { nome: 'Feira Agrishow', descricao: 'Condição da feira, encerrada.', cupom: 'AGRISHOW', tipo_desconto: 'percentual', desconto_bp: 700, tipos_cliente: ['cooperativa'],
        inicio: somarDias(hojeD, -200), fim: somarDias(hojeD, -180) },
    ]) await chamar('POST', '/equipe/marketing/promocoes', ADMIN, 'equipe', promo).catch((e) => { if (e.status !== 409) throw e; });

    // 2c) um segundo local de estoque (depósito em Mato Grosso, perto das cooperativas) com parte das máquinas e insumos
    const dep = await chamar<{ id: number }>('POST', '/equipe/configuracoes/locais', ADMIN, 'equipe', { codigo: 'dep-sorriso', nome: 'Depósito avançado', cidade: 'Sorriso', uf: 'MT', prioridade: 5 })
      .catch(() => null);
    if (dep) {
      const agro = await db.selectFrom('produtos').select(['id', 'estoque']).where('categoria_id', 'in', ['maquinario', 'fertilizantes', 'irrigacao', 'pecas', 'tratores'])
        .where('estoque', '>', 4).orderBy('id').execute();
      for (const pr of agro.filter((_, k) => k % 2 === 0)) {
        const la = Math.floor(pr.estoque * 0.4);
        await chamar('PUT', `/equipe/configuracoes/estoque/${pr.id}`, ADMIN, 'equipe', { locais: [{ local_id: 1, quantidade: pr.estoque - la }, { local_id: dep.id, quantidade: la }] });
      }
    }

    // 2d) câmbio dos últimos 60 dias (PTAX de venda, aproximada)
    let usd = 5.52, eur = 5.98, cny = 0.762;
    for (let d = 60; d >= 0; d--) {
      const dia = somarDias(hojeD, -d);
      const sem = new Date(`${dia}T12:00:00Z`).getUTCDay();
      if (sem === 0 || sem === 6) continue;
      usd = Math.round((usd + (s.r() - 0.52) * 0.045) * 10_000) / 10_000;
      eur = Math.round((eur + (s.r() - 0.52) * 0.05) * 10_000) / 10_000;
      cny = Math.round((cny + (s.r() - 0.52) * 0.006) * 10_000) / 10_000;
      for (const [moeda, taxa] of [['USD', usd], ['EUR', eur], ['CNY', cny]] as const) {
        await chamar('POST', '/equipe/configuracoes/cambio', ADMIN, 'equipe', { moeda, data: dia, taxa, fonte: 'PTAX venda (Banco Central)' });
      }
    }

    // 2e) endereços de entrega de cada empresa (o padrão vai nos pedidos) e um segundo armazém da cooperativa
    const ENDERECOS: Record<string, Array<{ apelido: string; endereco: Record<string, string> }>> = {
      cooperativa: [
        { apelido: 'Matriz', endereco: { cep: '78890000', logradouro: 'Avenida Blumenau', numero: '2150', bairro: 'Centro', cidade: 'Sorriso', uf: 'MT' } },
        { apelido: 'Armazém de grãos', endereco: { cep: '78890000', logradouro: 'Rodovia BR-163', numero: 'km 740', bairro: 'Distrito Industrial', cidade: 'Sorriso', uf: 'MT' } },
      ],
      distribuidora: [{ apelido: 'Centro de distribuição', endereco: { cep: '13087000', logradouro: 'Rua Lauro Vannucci', numero: '1020', bairro: 'Jardim Santa Cândida', cidade: 'Campinas', uf: 'SP' } }],
      revendedor: [{ apelido: 'Loja', endereco: { cep: '89010001', logradouro: 'Rua XV de Novembro', numero: '510', bairro: 'Centro', cidade: 'Blumenau', uf: 'SC' } }],
      construtora: [{ apelido: 'Escritório', endereco: { cep: '30130010', logradouro: 'Avenida Afonso Pena', numero: '1500', complemento: 'sala 801', bairro: 'Centro', cidade: 'Belo Horizonte', uf: 'MG' } }],
      hospital: [{ apelido: 'Almoxarifado', endereco: { cep: '80060000', logradouro: 'Rua General Carneiro', numero: '181', bairro: 'Alto da Glória', cidade: 'Curitiba', uf: 'PR' } }],
    };
    for (const d of DEMONSTRACAO) {
      for (const e of ENDERECOS[d.tipo] ?? []) await chamar('POST', '/loja/enderecos', d.email, 'cliente', e).catch(() => undefined);
    }

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
      const cupomSorte = s.r();
      if (cupomSorte < 0.12) corpo.cupom = 'PARCEIRO5';
      else if (cupomSorte < 0.2) corpo.cupom = 'BEMVINDO';
      let pedido: { id: number };
      try {
        pedido = await chamar('POST', '/pedidos', p.email, 'cliente', corpo);
      } catch (e) {
        const st = (e as { status?: number }).status ?? 0;
        if (st === 400 && corpo.cupom) {                         // cupom que a empresa já usou: fecha sem ele
          delete corpo.cupom;
          try { pedido = await chamar('POST', '/pedidos', p.email, 'cliente', corpo); } catch { continue; }
        } else if ([400, 403, 409].includes(st)) continue;        // limite de crédito, atraso, estoque…
        else throw e;
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

    // 6b) avaliações dos produtos entregues: a maioria publicada, algumas aguardando moderação e uma recusada
    const COMENTARIOS: Array<[number, string, string]> = [
      [5, 'Chegou antes do prazo', 'Entrega rápida e bem embalada. O produto é exatamente o da descrição.'],
      [5, 'Recompramos sempre', 'Qualidade constante entre os lotes; já é o terceiro pedido do mesmo item.'],
      [4, 'Bom custo-benefício', 'Atende bem ao uso diário. Só a embalagem poderia ser mais resistente.'],
      [5, 'Equipe atenciosa', 'Tivemos uma dúvida sobre a nota e o comercial resolveu no mesmo dia.'],
      [4, 'Funciona bem', 'Instalação simples e manual em português. Recomendo.'],
      [3, 'Dentro do esperado', 'Cumpre o que promete, mas o prazo de entrega para o interior foi longo.'],
      [5, 'Excelente acabamento', 'Material resistente, muito superior ao que usávamos antes.'],
      [4, 'Boa compra', 'Preço da tabela da cooperativa compensa bastante no volume.'],
      [2, 'Uma unidade com defeito', 'Uma das unidades veio com avaria; o reembolso foi feito sem problema.'],
      [5, 'Perfeito para a obra', 'Usamos em três canteiros e não tivemos nenhuma reclamação.'],
      [4, 'Recomendo', 'Produto bom e a nota fiscal chegou junto com o rastreio.'],
      [1, 'Entrem em contato pelo meu WhatsApp', 'Vendo o mesmo produto mais barato, chama no 11 9xxxx-xxxx.'],
    ];
    const comprados = await db.selectFrom('pedido_itens as i').innerJoin('pedidos as p', 'p.id', 'i.pedido_id').innerJoin('usuarios as u', 'u.id', 'p.comprador_id')
      .innerJoin('envios as v', 'v.pedido_id', 'p.id')
      .select(['i.produto_id', 'u.email', 'v.entregue_em']).distinctOn(['i.produto_id', 'u.email'])
      .where('p.situacao', '=', 'entregue').orderBy('i.produto_id').orderBy('u.email').limit(60).execute();
    let avaliadas = 0;
    for (const [k, c] of comprados.filter((_, i) => i % 4 === 0).slice(0, COMENTARIOS.length).entries()) {
      const [nota, titulo, comentario] = COMENTARIOS[k];
      const a = await chamar<{ id: number }>('POST', `/catalogo/produtos/${c.produto_id}/avaliacoes`, c.email, 'cliente', { nota, titulo, comentario }).catch(() => null);
      if (!a) continue;
      avaliadas++;
      if (nota === 1) await chamar('POST', `/equipe/clientes/avaliacoes/${a.id}/moderar`, ADMIN, 'equipe', { situacao: 'recusada', motivo: 'Contém propaganda e contato pessoal.' });
      else if (k % 5 !== 2) await chamar('POST', `/equipe/clientes/avaliacoes/${a.id}/moderar`, ADMIN, 'equipe', { situacao: 'aprovada' });
      await db.connection().execute(async (db) => {
        await sql`SET session_replication_role = replica`.execute(db);
        await sql`UPDATE avaliacoes SET criado_em = ${c.entregue_em}::timestamptz + interval '3 days', moderada_em = CASE WHEN moderada_em IS NULL THEN NULL ELSE ${c.entregue_em}::timestamptz + interval '4 days' END WHERE id = ${a.id}`.execute(db);
        await sql`SET session_replication_role = DEFAULT`.execute(db);
      });
    }

    // 6c) newsletter: inscrições do rodapé da loja ao longo dos meses (uma pessoa saiu da lista)
    const inscritos = ['compras@agropecuaria-vale.com.br', 'suprimentos@hospitalsaolucas.org.br', 'gerencia@ferragensdocentro.com.br', 'obras@construtorahorizonte.com.br',
      'marina.souza@coop-demo.com.br', 'compras@distribuidora-demo.com.br', 'contato@revendasul.com.br', 'engenharia@solarcampo.com.br'];
    for (const [k, email] of inscritos.entries()) {
      await chamar('POST', '/equipe/marketing/newsletter', ADMIN, 'equipe', { email }).catch(() => undefined);
      await db.connection().execute(async (db) => {
        await sql`SET session_replication_role = replica`.execute(db);
        await sql`UPDATE newsletter_inscritos SET inscrito_em = now() - ${sql.raw(`interval '${80 - k * 9} days'`)}, origem = 'loja' WHERE email = ${email}`.execute(db);
        await sql`SET session_replication_role = DEFAULT`.execute(db);
      });
    }
    const saiu = await db.selectFrom('newsletter_inscritos').select('id').where('email', '=', inscritos[2]).executeTakeFirst();
    if (saiu) await chamar('PATCH', `/equipe/marketing/newsletter/${saiu.id}`, ADMIN, 'equipe', { ativo: false });

    // 6d) uma lista de compra da cooperativa e alguns favoritos, a partir do que ela já comprou
    const coopDemo = DEMONSTRACAO.find((d) => d.tipo === 'cooperativa')!;
    const jaComprou = await db.selectFrom('pedido_itens as i').innerJoin('pedidos as p', 'p.id', 'i.pedido_id').innerJoin('empresas as e', 'e.id', 'p.empresa_id')
      .select(['i.produto_id', sql<number>`max(i.quantidade)::int`.as('quantidade')]).where('e.cnpj', '=', coopDemo.cnpj).where('p.situacao', '<>', 'cancelado')
      .groupBy('i.produto_id').orderBy('i.produto_id').limit(6).execute();
    if (jaComprou.length) {
      await chamar('POST', '/loja/listas', coopDemo.email, 'cliente', { nome: 'Reposição mensal', itens: jaComprou.slice(0, 5) }).catch(() => undefined);
      for (const f of jaComprou.slice(0, 3)) await chamar('PUT', `/loja/favoritos/${f.produto_id}`, coopDemo.email, 'cliente').catch(() => undefined);
    }

    // 6e) B2B: uma compradora com limite, uma compra esperando aprovação e cotações de preço em vários estágios
    const MARINA = 'marina.souza@coop-demo.com.br';
    const marina = await chamar<{ id: string }>('POST', '/empresa/usuarios', coopDemo.email, 'cliente', { nome: 'Marina Souza', email: MARINA, papel: 'comprador' }).catch(() => null);
    if (marina) {
      await chamar('PATCH', `/empresa/usuarios/${marina.id}`, coopDemo.email, 'cliente', { limite_pedido_centavos: 2_000_000 });
      const caros = await db.selectFrom('produtos').select(['id', 'multiplo_venda']).where('categoria_id', 'in', ['irrigacao', 'pecas', 'maquinario']).where('ativo', '=', true)
        .where('sob_orcamento', '=', false).where(sql<boolean>`estoque >= multiplo_venda * 3`).where('preco_tabela_centavos', '>', 1_500_000).orderBy('preco_tabela_centavos').limit(2).execute();
      if (caros.length) {
        await chamar('POST', '/empresa/requisicoes', MARINA, 'cliente', {
          itens: caros.map((c) => ({ produto_id: c.id, quantidade: c.multiplo_venda })), forma_pagamento: 'boleto', parcelas: 2, ordem_compra: 'OC-2026-0457', observacao: 'Reposição para a safra.',
        }).catch((e) => console.warn('Requisição de demonstração não registrada:', (e as Error).message));
      }
    }
    const cotar = async (email: string, tipo: string, n: number) => {
      const visiveis = await db.selectFrom('produtos as p').innerJoin('categorias as c', 'c.id', 'p.categoria_id').select(['p.id', 'p.multiplo_venda'])
        .where('p.ativo', '=', true).where('p.sob_orcamento', '=', false).where(sql<boolean>`(c.tipos_cliente IS NULL OR ${tipo} = ANY(c.tipos_cliente))`)
        .where(sql<boolean>`p.estoque >= p.multiplo_venda * 20`).orderBy('p.id').limit(n * 7).execute();
      const itens = visiveis.filter((_, k) => k % 7 === 0).slice(0, n).map((p) => ({ produto_id: p.id, quantidade: p.multiplo_venda * 10 }));
      return itens.length ? chamar<{ id: number; itens: Array<{ produto_id: number; preco_cliente_centavos: number }> }>('POST', '/empresa/cotacoes', email, 'cliente', { itens, mensagem: 'Compra recorrente: pedimos condição para estas quantidades.' }).catch(() => null) : null;
    };
    const responder = (c: { id: number; itens: Array<{ produto_id: number; preco_cliente_centavos: number }> }, bp: number, dias: number) =>
      chamar('PUT', `/equipe/cotacoes/${c.id}/resposta`, ADMIN, 'equipe', {
        itens: c.itens.map((i) => ({ produto_id: i.produto_id, preco_proposto_centavos: Math.round((i.preco_cliente_centavos * (10_000 - bp)) / 10_000) })),
        resposta: 'Preço especial para o volume, frete CIF.', validade_dias: dias,
      });
    const porTipo = (t: string) => DEMONSTRACAO.find((d) => d.tipo === t)!;
    await cotar(porTipo('construtora').email, 'construtora', 3);                                       // esperando resposta
    const c2 = await cotar(coopDemo.email, 'cooperativa', 2);
    if (c2) await responder(c2, 700, 15);                                                              // respondida, para o aprovador aceitar
    const c3 = await cotar(porTipo('hospital').email, 'hospital', 3);
    if (c3) {
      await responder(c3, 900, 10);
      await chamar('POST', `/empresa/cotacoes/${c3.id}/aceitar`, porTipo('hospital').email, 'cliente', { forma_pagamento: 'pix', ordem_compra: 'HSC-2026-1189' })
        .catch((e) => console.warn('Aceite de cotação de demonstração não registrado:', (e as Error).message));
    }

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
    const ordemDemo = await db.selectFrom('ordens_importacao').select(['id', 'criado_em']).where('orcamento_id', '=', aceito.id).executeTakeFirst();
    if (ordemDemo) {
      await chamar('PUT', `/equipe/ordens/${ordemDemo.id}/rota`, ADMIN, 'equipe', {
        porto_embarque: 'CNSHA', porto_chegada: 'BRSSZ', embarque_em: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      }).catch(() => undefined);
    }
    const hosp = DEMONSTRACAO.find((d) => d.tipo === 'hospital')!;
    await chamar('POST', '/orcamentos', hosp.email, 'cliente', { modalidade: 'encomenda', itens: [{ descricao: 'Monitor multiparamétrico', quantidade: 10 }] });

    const tot = await db.selectFrom('pedidos').select([sql<number>`count(*)::int`.as('n'), sql<number>`coalesce(sum(total_centavos),0)::bigint`.as('v')]).executeTakeFirstOrThrow();
    console.log(`Movimento de demonstração: ${criados} pedidos em ${DIAS} dias (R$ ${(Number(tot.v) / 100).toLocaleString('pt-BR')}), ${atrasadas} parcela(s) em atraso, 3 orçamentos de importação, notas, envios, 2 reembolsos, ${avaliadas} avaliações e ${inscritos.length} inscritos na newsletter.`);
  } finally {
    await app.close();
    await db.destroy();
  }
}

principal().catch((e) => {
  console.error('Falha no movimento de demonstração:', e);
  process.exit(1);
});
