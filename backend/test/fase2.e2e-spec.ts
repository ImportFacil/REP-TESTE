import type { INestApplication } from '@nestjs/common';
import { Migrator, sql } from 'kysely';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { criarAplicacao } from '../src/aplicacao';
import { gerarTokenDev } from '../src/auth/verificador-dev';
import type { Banco } from '../src/banco/banco.module';
import { criarConexao } from '../src/banco/conexao';
import { MIGRACOES } from '../src/banco/migracoes';
import { semearCatalogo, semearDemonstracao, semearReferencia } from '../src/banco/semear';
import { lerConfig } from '../src/config';
import { documentosExigidos } from '../src/credito/documentos-exigidos';
import { GatewaySimulador } from '../src/pagamentos/gateway-simulador';
import { PagamentosService } from '../src/pagamentos/pagamentos.service';
import { hojeBrasil, somarDias } from '../src/pagamentos/regras';
import { RotinasService } from '../src/rotinas/rotinas.service';

/** Fase 2: crédito, pedidos, pagamentos (gateway simulado), orçamentos, ordens e rotinas. */
const URL = process.env.TESTE_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/importfacil_teste';
const SEGREDO = 'segredo-dos-testes';
const SEGREDO_WEBHOOK = 'segredo-webhook-testes';
const config = lerConfig({
  AMBIENTE: 'teste', DATABASE_URL: URL, AUTH_SEGREDO_DEV: SEGREDO, LIMITE_REQ_MINUTO: '10000',
  WEBHOOK_SEGREDO_SIMULADOR: SEGREDO_WEBHOOK, PASTA_ARQUIVOS: mkdtempSync(join(tmpdir(), 'importfacil-arquivos-')),
});

let app: INestApplication;
let db: Banco;
let api: () => ReturnType<typeof request>;
const COOP = 'compras@coop-demo.com.br';
const HOSP = 'compras@hospital-demo.com.br';
const ADMIN = 'admin@importfacil.dev';
const FIN = 'financeiro@importfacil.dev';
const COM = 'comercial@importfacil.dev';
const como = async (email: string, origem: 'cliente' | 'equipe') => `Bearer ${await gerarTokenDev(SEGREDO, `dev-${email}`, origem)}`;
const idProduto = async (codigo: string) => (await db.selectFrom('produtos').select(['id', 'estoque']).where('codigo', '=', codigo).executeTakeFirstOrThrow());
const PDF = Buffer.from('%PDF-1.4\n% documento de teste\n');

beforeAll(async () => {
  db = criarConexao(config.banco);
  await sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`.execute(db);
  const { error } = await new Migrator({ db, provider: { getMigrations: async () => MIGRACOES }, migrationTableName: 'migracoes', migrationLockTableName: 'migracoes_trava' }).migrateToLatest();
  if (error) throw error;
  await semearReferencia(db);
  await semearCatalogo(db);
  await semearDemonstracao(db);
  app = await criarAplicacao(config);
  await app.init();
  api = () => request(app.getHttpServer());
  for (const [email, papel] of [[FIN, 'financeiro'], [COM, 'comercial']] as const) {
    await api().post('/equipe/usuarios').set('Authorization', await como(ADMIN, 'equipe')).send({ nome: papel, email, papel }).expect(201);
  }
});

afterAll(async () => {
  await app?.close();
  await db?.destroy();
});

let pedidoPix: number;

describe('pedido no Pix', () => {
  it('condições: Pix com 3% de desconto, cartão sem juros até 10×, boleto bloqueado sem crédito', async () => {
    const r = await api().get('/pedidos/condicoes?subtotal_centavos=1000000').set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(r.body.pix).toMatchObject({ desconto_centavos: 30_000, total_centavos: 970_000, validade_horas: 24 });
    expect(r.body.cartao).toHaveLength(12);
    expect(r.body.cartao[9]).toMatchObject({ parcelas: 10, sem_juros: true, total_centavos: 1_000_000 });
    expect(r.body.cartao[11].sem_juros).toBe(false);
    expect(r.body.boleto).toMatchObject({ disponivel: false });
    expect(r.body.boleto.motivo).toMatch(/cadastro/);
  });

  it('recusa pedido abaixo do pedido mínimo', async () => {
    const p = await idProduto('PC-FO12');
    const r = await api().post('/pedidos').set('Authorization', await como(COOP, 'cliente'))
      .send({ itens: [{ produto_id: p.id, quantidade: 12 }], forma_pagamento: 'pix' }).expect(400);
    expect(r.body.cotacao.atinge_pedido_minimo).toBe(false);
  });

  it('fecha pedido no Pix: preço congelado, estoque reservado, Pix com validade', async () => {
    const p = await idProduto('MQ-EN01'); // R$ 38.900,00 de tabela; cooperativa -18% = R$ 31.898,00
    const r = await api().post('/pedidos').set('Authorization', await como(COOP, 'cliente'))
      .send({ itens: [{ produto_id: p.id, quantidade: 1 }], forma_pagamento: 'pix' }).expect(201);
    pedidoPix = r.body.id;
    expect(r.body).toMatchObject({ subtotal_centavos: 3_189_800, desconto_centavos: 95_694, total_centavos: 3_094_106, situacao: 'novo', situacao_pagamento: 'aguardando_pagamento' });
    expect(r.body.itens[0]).toMatchObject({ preco_unitario_centavos: 3_189_800, preco_tabela_centavos: 3_890_000 });
    expect(r.body.cobrancas[0].parcelas[0].pix_copia_cola).toContain('SIMULADOR');
    expect((await idProduto('MQ-EN01')).estoque).toBe(p.estoque - 1);
  });

  it('a equipe não separa pedido no Pix antes do pagamento', async () => {
    await api().post(`/equipe/pedidos/${pedidoPix}/avancar`).set('Authorization', await como(COM, 'equipe')).expect(400);
  });

  it('webhook com assinatura errada é recusado', async () => {
    await api().post('/pagamentos/webhook/simulador').set('x-assinatura', 'abc').set('Content-Type', 'application/json')
      .send('{"id":"evt_x","tipo":"pagamento_confirmado"}').expect(401);
  });

  it('o banco confirma (webhook assinado); aviso repetido é ignorado', async () => {
    const parcela = await db.selectFrom('parcelas as pa').innerJoin('cobrancas as c', 'c.id', 'pa.cobranca_id')
      .select(['pa.id_gateway', 'pa.valor_centavos']).where('c.pedido_id', '=', pedidoPix).executeTakeFirstOrThrow();
    const sim = new GatewaySimulador(SEGREDO_WEBHOOK);
    const { corpo, assinatura } = sim.eventoPagamento(parcela.id_gateway!, parcela.valor_centavos, 'pix');
    const enviar = () => api().post('/pagamentos/webhook/simulador').set('x-assinatura', assinatura).set('Content-Type', 'application/json').send(corpo);
    expect((await enviar().expect(200)).body).toEqual({ recebido: true });
    expect((await enviar().expect(200)).body).toEqual({ recebido: true, repetido: true });
    const d = await api().get(`/pedidos/${pedidoPix}`).set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(d.body.situacao_pagamento).toBe('pago');
    const pags = await db.selectFrom('pagamentos').select(sql<number>`count(*)::int`.as('n')).executeTakeFirstOrThrow();
    expect(pags.n).toBe(1);
  });

  it('depois de pago, a equipe separa o pedido', async () => {
    const r = await api().post(`/equipe/pedidos/${pedidoPix}/avancar`).set('Authorization', await como(COM, 'equipe')).expect(200);
    expect(r.body.situacao).toBe('em_separacao');
  });

  it('pedido pago não é cancelado sem estorno', async () => {
    await api().post(`/equipe/pedidos/${pedidoPix}/cancelar`).set('Authorization', await como(COM, 'equipe')).send({ motivo: 'teste' }).expect(409);
  });
});

describe('cartão', () => {
  it('12× com juros: aprovado na hora, pedido já nasce pago', async () => {
    const p = await idProduto('MQ-DC40');
    const r = await api().post('/pedidos').set('Authorization', await como(COOP, 'cliente'))
      .send({ itens: [{ produto_id: p.id, quantidade: 1 }], forma_pagamento: 'cartao', parcelas: 12, token_cartao: 'tok_teste' }).expect(201);
    expect(r.body.situacao_pagamento).toBe('pago');
    expect(r.body.juros_centavos).toBeGreaterThan(0);
  });

  it('cartão recusado: nada é gravado e o estoque volta', async () => {
    const p = await idProduto('MQ-DC40');
    const antes = await db.selectFrom('pedidos').select(sql<number>`count(*)::int`.as('n')).executeTakeFirstOrThrow();
    await api().post('/pedidos').set('Authorization', await como(COOP, 'cliente'))
      .send({ itens: [{ produto_id: p.id, quantidade: 1 }], forma_pagamento: 'cartao', parcelas: 1, token_cartao: 'tok_recusado' }).expect(402);
    expect((await idProduto('MQ-DC40')).estoque).toBe(p.estoque);
    expect((await db.selectFrom('pedidos').select(sql<number>`count(*)::int`.as('n')).executeTakeFirstOrThrow()).n).toBe(antes.n);
  });
});

describe('crédito e boleto', () => {
  it('boleto sem cadastro aprovado é recusado', async () => {
    const p = await idProduto('MQ-EN01');
    await api().post('/pedidos').set('Authorization', await como(COOP, 'cliente'))
      .send({ itens: [{ produto_id: p.id, quantidade: 1 }], forma_pagamento: 'boleto', parcelas: 1 }).expect(403);
  });

  it('cadastro: não envia para análise sem os documentos', async () => {
    await api().put('/credito/cadastro').set('Authorization', await como(COOP, 'cliente'))
      .send({ faturamento_mensal_centavos: 200_000_000, limite_solicitado_centavos: 5_000_000, compras_mensais_previstas_centavos: 45_000_000, anos_cnpj: 8 }).expect(200);
    const r = await api().post('/credito/cadastro/enviar').set('Authorization', await como(COOP, 'cliente')).expect(400);
    expect(r.body.message).toMatch(/Faltam documentos/);
  });

  it('envia os documentos exigidos para cooperativa e manda para análise', async () => {
    const auth = await como(COOP, 'cliente');
    await api().post('/credito/documentos?tipo=cartao_cnpj').set('Authorization', auth).attach('arquivo', Buffer.from('texto'), { filename: 'a.txt', contentType: 'text/plain' }).expect(400);
    for (const tipo of documentosExigidos('cooperativa', 5_000_000)) {
      await api().post(`/credito/documentos?tipo=${tipo}`).set('Authorization', auth).attach('arquivo', PDF, { filename: `${tipo}.pdf`, contentType: 'application/pdf' }).expect(201);
    }
    const r = await api().post('/credito/cadastro/enviar').set('Authorization', auth).expect(201);
    expect(r.body.cadastro.situacao).toBe('em_analise');
    expect(r.body.faltando).toEqual([]);
  });

  it('documento de uma empresa não abre para outra', async () => {
    const doc = await db.selectFrom('documentos').select('id').executeTakeFirstOrThrow();
    const ok = await api().get(`/credito/documentos/${doc.id}`).set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(Buffer.from(ok.body).toString()).toContain('%PDF');
    await api().get(`/credito/documentos/${doc.id}`).set('Authorization', await como(HOSP, 'cliente')).expect(404);
  });

  it('alçada: financeiro não aprova acima de R$ 100 mil; limite respeita 10% do faturamento', async () => {
    const coop = await db.selectFrom('empresas').select('id').where('cnpj', '=', '11222333000181').executeTakeFirstOrThrow();
    const fin = await como(FIN, 'equipe');
    await api().post(`/equipe/credito/${coop.id}/decisao`).set('Authorization', fin).send({ acao: 'aprovar', faixa: 'A', limite_centavos: 15_000_000, parecer: 'acima da alçada' }).expect(403);
    await api().post(`/equipe/credito/${coop.id}/decisao`).set('Authorization', fin).send({ acao: 'aprovar', faixa: 'A', limite_centavos: 25_000_000, parecer: 'acima do teto' }).expect(400);
    const r = await api().post(`/equipe/credito/${coop.id}/decisao`).set('Authorization', fin).send({ acao: 'aprovar', faixa: 'A', limite_centavos: 5_000_000, parecer: 'Cadastro completo, sem restrições.' }).expect(201);
    expect(r.body.cadastro).toMatchObject({ situacao: 'aprovado', faixa: 'A', limite_aprovado_centavos: 5_000_000 });
    expect(r.body.historico_limites).toHaveLength(1);
  });

  let pedidoBoleto: number;

  it('boleto em 3×: aguarda o faturamento e já consome o limite', async () => {
    const p = await idProduto('MQ-EN01');
    const r = await api().post('/pedidos').set('Authorization', await como(COOP, 'cliente'))
      .send({ itens: [{ produto_id: p.id, quantidade: 1 }], forma_pagamento: 'boleto', parcelas: 3 }).expect(201);
    pedidoBoleto = r.body.id;
    expect(r.body).toMatchObject({ situacao_pagamento: 'aguardando_faturamento', total_centavos: 3_189_800 });
    const fin = await api().get('/financeiro').set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(fin.body.credito).toMatchObject({ limite_centavos: 5_000_000, usado_centavos: 3_189_800, disponivel_centavos: 1_810_200 });
  });

  it('segundo boleto que passa do limite disponível é recusado', async () => {
    const p = await idProduto('MQ-EN01');
    await api().post('/pedidos').set('Authorization', await como(COOP, 'cliente'))
      .send({ itens: [{ produto_id: p.id, quantidade: 1 }], forma_pagamento: 'boleto', parcelas: 1 }).expect(403);
  });

  it('faturamento emite 3 boletos com vencimentos 30/60/90', async () => {
    await api().post(`/equipe/pedidos/${pedidoBoleto}/faturar`).set('Authorization', await como(COM, 'equipe')).expect(403);
    const r = await api().post(`/equipe/pedidos/${pedidoBoleto}/faturar`).set('Authorization', await como(FIN, 'equipe')).expect(200);
    const parcelas = r.body.cobrancas[0].parcelas;
    const hoje = hojeBrasil();
    expect(parcelas.map((p: { vencimento: string }) => p.vencimento)).toEqual([somarDias(hoje, 30), somarDias(hoje, 60), somarDias(hoje, 90)]);
    expect(parcelas.reduce((s: number, p: { valor_centavos: number }) => s + p.valor_centavos, 0)).toBe(3_189_800);
    expect(parcelas[0].linha_digitavel).toHaveLength(47);
    expect(r.body.situacao_pagamento).toBe('em_aberto');
  });

  it('atraso: rotina marca vencida, registra a régua sem repetir e bloqueia novos boletos', async () => {
    const atrasada = await db.selectFrom('parcelas as pa').innerJoin('cobrancas as c', 'c.id', 'pa.cobranca_id')
      .select('pa.id').where('c.pedido_id', '=', pedidoBoleto).where('pa.numero', '=', 1).executeTakeFirstOrThrow();
    await db.updateTable('parcelas').set({ vencimento: somarDias(hojeBrasil(), -10) }).where('id', '=', atrasada.id).execute();
    const rotinas = app.get(RotinasService);
    const r1 = await rotinas.diaria();
    expect(r1.parcelas_vencidas).toBe(1);
    expect(r1.avisos_registrados).toBeGreaterThan(0);
    expect((await rotinas.diaria()).avisos_registrados).toBe(0);
    const c = await api().get('/pedidos/condicoes?subtotal_centavos=100000').set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(c.body.boleto.disponivel).toBe(false);
    expect(c.body.boleto.motivo).toMatch(/10 dias de atraso/);
    const fin = await api().get('/financeiro').set('Authorization', await como(COOP, 'cliente')).expect(200);
    const parcela = fin.body.parcelas.find((p: { id: number }) => p.id === atrasada.id);
    expect(parcela.atualizado.atraso).toBe(10);
    expect(parcela.atualizado.total).toBeGreaterThan(parcela.valor_centavos);
  });

  it('recebíveis no Painel da equipe', async () => {
    await api().get('/equipe/recebiveis').set('Authorization', await como(COM, 'equipe')).expect(403);
    const r = await api().get('/equipe/recebiveis').set('Authorization', await como(FIN, 'equipe')).expect(200);
    expect(r.body.vencidas).toHaveLength(1);
    expect(r.body.regua_recente.length).toBeGreaterThan(0);
  });
});

describe('Pix vencido', () => {
  it('rotina expira o Pix; o cliente gera outro no mesmo pedido; cancelar devolve o estoque', async () => {
    const hosp = await db.selectFrom('empresas').select('id').where('cnpj', '=', '55666777000181').executeTakeFirstOrThrow();
    // Produto do hospital em quantidade suficiente para o pedido mínimo (R$ 60 mil), respeitando o múltiplo de venda.
    const p = await db.selectFrom('produtos').select(['id', 'estoque', 'preco_tabela_centavos', 'multiplo_venda']).where('categoria_id', 'like', 'h-%')
      .where('sob_orcamento', '=', false).orderBy(sql`preco_tabela_centavos * estoque`, 'desc').executeTakeFirstOrThrow();
    const unidade = Math.floor((p.preco_tabela_centavos * 7800 + 5000) / 10000);
    const qtd = Math.ceil(6_000_000 / unidade / p.multiplo_venda) * p.multiplo_venda;
    expect(qtd).toBeLessThanOrEqual(p.estoque);
    const r = await api().post('/pedidos').set('Authorization', await como(HOSP, 'cliente'))
      .send({ itens: [{ produto_id: p.id, quantidade: qtd }], forma_pagamento: 'pix' }).expect(201);
    await db.updateTable('cobrancas').set({ expira_em: new Date(Date.now() - 60_000) }).where('pedido_id', '=', r.body.id).execute();
    expect(await app.get(PagamentosService).expirarPix()).toBe(1);
    const d = await api().get(`/pedidos/${r.body.id}`).set('Authorization', await como(HOSP, 'cliente')).expect(200);
    expect(d.body.situacao_pagamento).toBe('pix_expirado');
    const n = await api().post(`/pedidos/${r.body.id}/novo-pix`).set('Authorization', await como(HOSP, 'cliente')).expect(200);
    expect(n.body.situacao_pagamento).toBe('aguardando_pagamento');
    expect(n.body.cobrancas.map((c: { situacao: string }) => c.situacao)).toEqual(['expirada', 'pendente']);
    await api().post(`/equipe/pedidos/${r.body.id}/cancelar`).set('Authorization', await como(COM, 'equipe')).send({ motivo: 'Cliente desistiu' }).expect(200);
    expect((await db.selectFrom('produtos').select('estoque').where('id', '=', p.id).executeTakeFirstOrThrow()).estoque).toBe(p.estoque);
    expect(hosp.id).toBeTruthy();
  });
});

describe('conta e ordem e orçamentos', () => {
  let coopId: string;
  let ordemId: number;

  it('sem liberação, a conta e ordem é recusada', async () => {
    await api().post('/orcamentos').set('Authorization', await como(COOP, 'cliente'))
      .send({ modalidade: 'conta_e_ordem', itens: [{ descricao: 'Trator 120 cv', quantidade: 2 }] }).expect(403);
  });

  it('libera só para cliente grande (pedidos mensais a partir de R$ 400 mil e faixa A)', async () => {
    coopId = (await db.selectFrom('empresas').select('id').where('cnpj', '=', '11222333000181').executeTakeFirstOrThrow()).id;
    const hosp = (await db.selectFrom('empresas').select('id').where('cnpj', '=', '55666777000181').executeTakeFirstOrThrow()).id;
    const r = await api().put(`/equipe/empresas/${hosp}/conta-e-ordem`).set('Authorization', await como(COM, 'equipe')).send({ liberar: true }).expect(400);
    expect(r.body.message).toMatch(/400\.000/);
    await api().put(`/equipe/empresas/${hosp}/conta-e-ordem`).set('Authorization', await como(COM, 'equipe')).send({ liberar: true, forcar: true, motivo: 'x' }).expect(403);
    const ok = await api().put(`/equipe/empresas/${coopId}/conta-e-ordem`).set('Authorization', await como(COM, 'equipe')).send({ liberar: true }).expect(200);
    expect(ok.body.avaliacao).toMatchObject({ elegivel: true, minimo_mensal_centavos: 40_000_000 });
  });

  it('orçamento → proposta → aceite vira ordem de importação', async () => {
    const p = await idProduto('IR-MB10');
    const o = await api().post('/orcamentos').set('Authorization', await como(COOP, 'cliente'))
      .send({ modalidade: 'conta_e_ordem', itens: [{ produto_id: p.id, quantidade: 10 }, { descricao: 'Trator 120 cv cabinado', quantidade: 2 }] }).expect(201);
    expect(o.body.itens).toHaveLength(2);
    await api().post(`/orcamentos/${o.body.id}/aceitar`).set('Authorization', await como(COOP, 'cliente')).expect(400);
    const proposta = await api().put(`/equipe/orcamentos/${o.body.id}/proposta`).set('Authorization', await como(COM, 'equipe')).send({
      itens: o.body.itens.map((i: { id: number }, k: number) => ({ id: i.id, preco_unitario_centavos: k === 0 ? 500_000 : 40_000_000 })),
      frete_centavos: 1_000_000, taxa_servico_bp: 300, condicao: 'Numerário por etapa', prazo_entrega_dias: 120, validade_dias: 15,
    }).expect(200);
    // mercadoria 10×5.000 + 2×400.000 = 850.000,00 → taxa 3% = 25.500,00 + frete 10.000,00
    expect(proposta.body).toMatchObject({ situacao: 'enviado', mercadoria_centavos: 85_000_000, total_centavos: 3_550_000 });
    const a = await api().post(`/orcamentos/${o.body.id}/aceitar`).set('Authorization', await como(COOP, 'cliente')).expect(200);
    ordemId = a.body.ordem_id;
    expect(ordemId).toBeGreaterThan(0);
  });

  it('câmbio não avança sem o numerário pago; com ele pago, avança', async () => {
    const com = await como(COM, 'equipe');
    const r = await api().post(`/equipe/ordens/${ordemId}/avancar`).set('Authorization', com).send({}).expect(400);
    expect(r.body.message).toMatch(/numerário de cambio/);
    const n = await api().post(`/equipe/ordens/${ordemId}/numerarios`).set('Authorization', await como(FIN, 'equipe')).send({ etapa: 'cambio', valor_centavos: 85_000_000 }).expect(201);
    const parcelaId = n.body.numerarios[0].cobranca.parcela_id;
    const cliente = await api().get(`/ordens/${ordemId}`).set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(cliente.body.numerarios[0].cobranca.pix_copia_cola).toBeTruthy();
    await api().post(`/equipe/simulador/parcelas/${parcelaId}/confirmar`).set('Authorization', com).expect(200);
    const ok = await api().post(`/equipe/ordens/${ordemId}/avancar`).set('Authorization', com).send({ observacao: 'Câmbio fechado a 5,20' }).expect(200);
    expect(ok.body.etapa).toBe('cambio_fechado');
    expect(ok.body.numerarios[0].situacao).toBe('pago');
  });

  it('prestação de contas: recebido menos gasto real = saldo a devolver', async () => {
    const r = await api().post(`/equipe/ordens/${ordemId}/gastos`).set('Authorization', await como(FIN, 'equipe'))
      .send({ etapa: 'cambio', descricao: 'Remessa ao fornecedor', valor_centavos: 84_500_000 }).expect(201);
    expect(r.body.prestacao_contas).toMatchObject({ saldo_centavos: 500_000, resultado: 'devolver_ao_cliente' });
  });

  it('encomenda: recusar proposta; propostas vencidas expiram pela rotina', async () => {
    const auth = await como(HOSP, 'cliente');
    const o1 = await api().post('/orcamentos').set('Authorization', auth).send({ modalidade: 'encomenda', itens: [{ descricao: 'Monitor multiparamétrico', quantidade: 20 }] }).expect(201);
    const proposta = { itens: [{ id: o1.body.itens[0].id, preco_unitario_centavos: 1_500_000 }], frete_centavos: 0, condicao: 'Boleto 30/60/90', prazo_entrega_dias: 90, validade_dias: 1 };
    await api().put(`/equipe/orcamentos/${o1.body.id}/proposta`).set('Authorization', await como(COM, 'equipe')).send(proposta).expect(200);
    await api().post(`/orcamentos/${o1.body.id}/recusar`).set('Authorization', auth).expect(200);
    const o2 = await api().post('/orcamentos').set('Authorization', auth).send({ modalidade: 'encomenda', itens: [{ descricao: 'Cama hospitalar', quantidade: 5 }] }).expect(201);
    await api().put(`/equipe/orcamentos/${o2.body.id}/proposta`).set('Authorization', await como(COM, 'equipe')).send({ ...proposta, itens: [{ id: o2.body.itens[0].id, preco_unitario_centavos: 900_000 }] }).expect(200);
    expect(await app.get(RotinasService).diaria(somarDias(hojeBrasil(), 5)).then((r) => r.orcamentos_expirados)).toBe(1);
  });
});

describe('condições de pagamento', () => {
  it('só o administrador muda; a mudança vale na hora e fica versionada', async () => {
    await api().put('/equipe/politica-pagamento').set('Authorization', await como(FIN, 'equipe')).send({ pix_desconto_bp: 500 }).expect(403);
    await api().put('/equipe/politica-pagamento').set('Authorization', await como(ADMIN, 'equipe')).send({ pix_desconto_bp: 500 }).expect(200);
    const r = await api().get('/pedidos/condicoes?subtotal_centavos=1000000').set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(r.body.pix.desconto_centavos).toBe(50_000);
    const versoes = await db.selectFrom('politicas_pagamento').select(sql<number>`count(*)::int`.as('n')).executeTakeFirstOrThrow();
    expect(versoes.n).toBe(2);
  });
});
