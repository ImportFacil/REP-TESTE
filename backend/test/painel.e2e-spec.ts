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
import { classificarProdutosSemFamilia } from '../src/catalogo/familias';
import { lerConfig } from '../src/config';

/** Painel no formato do Bagisto: painel de controle, vendas (nota, envio, reembolso, transações) e catálogo (atributos, famílias, categorias). */

const URL = process.env.TESTE_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/importfacil_teste';
const SEGREDO = 'segredo-dos-testes';
const config = lerConfig({
  AMBIENTE: 'teste', DATABASE_URL: URL, AUTH_SEGREDO_DEV: SEGREDO, LIMITE_REQ_MINUTO: '10000',
  PASTA_ARQUIVOS: mkdtempSync(join(tmpdir(), 'importfacil-arquivos-')),
});

let app: INestApplication;
let db: Banco;
let api: () => ReturnType<typeof request>;
const COOP = 'compras@coop-demo.com.br';
const ADMIN = 'admin@importfacil.dev';
const FIN = 'financeiro@importfacil.dev';
const COM = 'comercial@importfacil.dev';
const como = async (email: string, origem: 'cliente' | 'equipe') => `Bearer ${await gerarTokenDev(SEGREDO, `dev-${email}`, origem)}`;
const produto = (codigo: string) => db.selectFrom('produtos').select(['id', 'estoque']).where('codigo', '=', codigo).executeTakeFirstOrThrow();

beforeAll(async () => {
  db = criarConexao(config.banco);
  await sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`.execute(db);
  const { error } = await new Migrator({ db, provider: { getMigrations: async () => MIGRACOES }, migrationTableName: 'migracoes', migrationLockTableName: 'migracoes_trava' }).migrateToLatest();
  if (error) throw error;
  await semearReferencia(db);
  await semearCatalogo(db);
  await classificarProdutosSemFamilia(db);
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

describe('catálogo: famílias e atributos', () => {
  it('a migração cria atributos e famílias e classifica os produtos do catálogo', async () => {
    const r = await api().get('/equipe/catalogo/familias').set('Authorization', await como(COM, 'equipe')).expect(200);
    expect(r.body.map((f: { codigo: string }) => f.codigo).sort()).toEqual(['agro', 'construcao_casa', 'epi', 'ferramentas_eletrica', 'hospitalar']);
    const { semFamilia } = await db.selectFrom('produtos').select(sql<number>`count(*) FILTER (WHERE familia_id IS NULL)::int`.as('semFamilia')).executeTakeFirstOrThrow();
    expect(semFamilia).toBe(0);
    const hosp = await db.selectFrom('produtos as p').innerJoin('familias_atributos as f', 'f.id', 'p.familia_id').select(['f.codigo', 'p.atributos'])
      .where('p.categoria_id', 'like', 'h-%').where(sql<boolean>`p.atributos ? 'registro_anvisa'`).executeTakeFirst();
    expect(hosp?.codigo).toBe('hospitalar');
  });

  let lista: number;
  let familia: number;
  it('lista precisa de duas opções; só comercial e administrador criam atributos', async () => {
    await api().post('/equipe/catalogo/atributos').set('Authorization', await como(FIN, 'equipe')).send({ codigo: 'voltagem', nome: 'Voltagem', tipo: 'lista', opcoes: ['127 V', '220 V'] }).expect(403);
    await api().post('/equipe/catalogo/atributos').set('Authorization', await como(COM, 'equipe')).send({ codigo: 'voltagem', nome: 'Voltagem', tipo: 'lista', opcoes: ['127 V'] }).expect(400);
    const r = await api().post('/equipe/catalogo/atributos').set('Authorization', await como(COM, 'equipe'))
      .send({ codigo: 'voltagem', nome: 'Voltagem', tipo: 'lista', opcoes: ['127 V', '220 V', 'Bivolt'], obrigatorio: true, filtravel: true }).expect(201);
    lista = r.body.id;
    await api().post('/equipe/catalogo/atributos').set('Authorization', await como(COM, 'equipe')).send({ codigo: 'voltagem', nome: 'Outra', tipo: 'texto' }).expect(409);
  });

  it('família com o atributo novo; produto confere os valores contra a família', async () => {
    const f = await api().post('/equipe/catalogo/familias').set('Authorization', await como(COM, 'equipe')).send({ codigo: 'eletro', nome: 'Eletroportáteis', atributos: [lista] }).expect(201);
    familia = f.body.id;
    const base = { codigo: 'TS-001', nome: 'Furadeira de teste', categoria_id: 'ferramentas', unidade: 'un', multiplo_venda: 1, estoque: 10, preco_tabela_centavos: 50000, familia_id: familia };
    await api().post('/equipe/produtos').set('Authorization', await como(COM, 'equipe')).send({ ...base, atributos: {} }).expect(400);              // obrigatório
    await api().post('/equipe/produtos').set('Authorization', await como(COM, 'equipe')).send({ ...base, atributos: { voltagem: '380 V' } }).expect(400); // fora da lista
    const p = await api().post('/equipe/produtos').set('Authorization', await como(COM, 'equipe')).send({ ...base, atributos: { voltagem: 'Bivolt', outro: 'x' } }).expect(201);
    expect(p.body.atributos).toEqual({ voltagem: 'Bivolt' });   // atributo fora da família não entra
    const alt = await api().patch(`/equipe/produtos/${p.body.id}`).set('Authorization', await como(COM, 'equipe')).send({ atributos: { voltagem: '220 V' } }).expect(200);
    expect(alt.body.atributos).toEqual({ voltagem: '220 V' });
  });

  it('categoria nova e inativação; a lista da equipe inclui produtos inativos', async () => {
    const c = await api().post('/equipe/catalogo/categorias').set('Authorization', await como(COM, 'equipe')).send({ nome: 'Linha Branca', tipos_cliente: ['revendedor'] }).expect(201);
    expect(c.body).toMatchObject({ id: 'linha-branca', tipos_cliente: ['revendedor'] });
    await api().patch('/equipe/catalogo/categorias/linha-branca').set('Authorization', await como(COM, 'equipe')).send({ ativo: false }).expect(200);
    const p = await produto('TS-001');
    await api().patch(`/equipe/produtos/${p.id}`).set('Authorization', await como(COM, 'equipe')).send({ ativo: false }).expect(200);
    const lista = await api().get('/equipe/catalogo/produtos').set('Authorization', await como(FIN, 'equipe')).expect(200);
    expect(lista.body.find((x: { codigo: string }) => x.codigo === 'TS-001')).toMatchObject({ ativo: false, familia: 'Eletroportáteis' });
  });
});

describe('vendas: nota fiscal, envio, entrega, reembolso e transações', () => {
  let pedido: number;
  let envio: number;

  it('pedido no Pix pago pelo simulador', async () => {
    const p = await produto('MQ-EN01');
    const r = await api().post('/pedidos').set('Authorization', await como(COOP, 'cliente'))
      .send({ itens: [{ produto_id: p.id, quantidade: 2 }], forma_pagamento: 'pix' }).expect(201);
    pedido = r.body.id;
    await api().post(`/equipe/simulador/parcelas/${r.body.cobrancas[0].parcelas[0].id}/confirmar`).set('Authorization', await como(ADMIN, 'equipe')).expect(200);
  });

  it('nota fiscal: só financeiro e administrador; uma válida por pedido; cancelada libera outra', async () => {
    await api().post(`/equipe/vendas/pedidos/${pedido}/nota`).set('Authorization', await como(COM, 'equipe')).expect(403);
    const n = await api().post(`/equipe/vendas/pedidos/${pedido}/nota`).set('Authorization', await como(FIN, 'equipe')).expect(201);
    expect(n.body).toMatchObject({ numero: 1001, situacao: 'emitida' });
    expect(n.body.chave).toMatch(/^\d{44}$/);
    await api().post(`/equipe/vendas/pedidos/${pedido}/nota`).set('Authorization', await como(FIN, 'equipe')).expect(409);
    await api().post(`/equipe/vendas/notas/${n.body.id}/cancelar`).set('Authorization', await como(FIN, 'equipe')).send({ motivo: 'CNPJ errado' }).expect(201);
    const nova = await api().post(`/equipe/vendas/pedidos/${pedido}/nota`).set('Authorization', await como(FIN, 'equipe')).expect(201);
    expect(nova.body.numero).toBe(1002);
  });

  it('envio só em separação; registrar envia o pedido; confirmar entrega fecha', async () => {
    const dados = { transportadora: 'Jadlog', codigo_rastreio: 'JD123BR', volumes: 2, peso_kg: 120.5 };
    await api().post(`/equipe/vendas/pedidos/${pedido}/envio`).set('Authorization', await como(COM, 'equipe')).send(dados).expect(400);
    await api().post(`/equipe/pedidos/${pedido}/avancar`).set('Authorization', await como(COM, 'equipe')).expect(200);
    const e = await api().post(`/equipe/vendas/pedidos/${pedido}/envio`).set('Authorization', await como(COM, 'equipe')).send(dados).expect(201);
    envio = e.body.id;
    expect((await api().get(`/equipe/pedidos/${pedido}`).set('Authorization', await como(COM, 'equipe'))).body.situacao).toBe('enviado');
    await api().post(`/equipe/vendas/envios/${envio}/entregue`).set('Authorization', await como(COM, 'equipe')).expect(201);
    await api().post(`/equipe/vendas/envios/${envio}/entregue`).set('Authorization', await como(COM, 'equipe')).expect(409);
    const d = await api().get(`/equipe/pedidos/${pedido}`).set('Authorization', await como(COM, 'equipe')).expect(200);
    expect(d.body.situacao).toBe('entregue');
    expect(d.body.eventos.map((x: { descricao: string }) => x.descricao)).toEqual(expect.arrayContaining(['Enviado por Jadlog, rastreio JD123BR.', 'Entregue.']));
  });

  it('reembolso parcial devolve o estoque; não passa do total; o total restante estorna o pedido', async () => {
    const p = await produto('MQ-EN01');
    const d = await api().get(`/equipe/pedidos/${pedido}`).set('Authorization', await como(FIN, 'equipe')).expect(200);
    const unit = d.body.itens[0].preco_unitario_centavos;
    await api().post(`/equipe/vendas/pedidos/${pedido}/reembolso`).set('Authorization', await como(COM, 'equipe')).send({ valor_centavos: unit, motivo: 'avaria' }).expect(403);
    await api().post(`/equipe/vendas/pedidos/${pedido}/reembolso`).set('Authorization', await como(FIN, 'equipe'))
      .send({ valor_centavos: unit, motivo: 'Uma unidade com avaria', devolver_estoque: true, itens: [{ produto_id: p.id, quantidade: 1 }] }).expect(201);
    expect((await produto('MQ-EN01')).estoque).toBe(p.estoque + 1);
    await api().post(`/equipe/vendas/pedidos/${pedido}/reembolso`).set('Authorization', await como(FIN, 'equipe'))
      .send({ valor_centavos: d.body.total_centavos, motivo: 'demais' }).expect(400);
    await api().post(`/equipe/vendas/pedidos/${pedido}/reembolso`).set('Authorization', await como(FIN, 'equipe'))
      .send({ valor_centavos: d.body.total_centavos - unit, motivo: 'Desistência do restante' }).expect(201);
    const depois = await api().get(`/equipe/pedidos/${pedido}`).set('Authorization', await como(FIN, 'equipe')).expect(200);
    expect(depois.body.situacao_pagamento).toBe('estornado');
    const lista = await api().get('/equipe/vendas/reembolsos').set('Authorization', await como(COM, 'equipe')).expect(200);
    expect(lista.body).toHaveLength(2);
  });

  it('transações: o pagamento recebido aparece para o financeiro, não para o comercial', async () => {
    await api().get('/equipe/vendas/transacoes').set('Authorization', await como(COM, 'equipe')).expect(403);
    const r = await api().get('/equipe/vendas/transacoes').set('Authorization', await como(FIN, 'equipe')).expect(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({ pedido_id: pedido, cobranca_meio: 'pix', razao_social: 'Cooperativa Agro Sorriso' });
  });

  it('cliente não acessa o painel nem as vendas da equipe', async () => {
    await api().get('/equipe/painel').set('Authorization', await como(COOP, 'cliente')).expect(403);
    await api().get('/equipe/vendas/notas').set('Authorization', await como(COOP, 'cliente')).expect(403);
  });
});

describe('painel de controle', () => {
  it('soma as vendas do período, compara com o anterior e traz a série diária', async () => {
    const r = await api().get('/equipe/painel').set('Authorization', await como(COM, 'equipe')).expect(200);
    expect(r.body.periodo.dias).toBe(30);
    expect(r.body.serie).toHaveLength(30);
    expect(r.body.geral.pedidos).toBe(1);
    expect(r.body.geral.vendas_centavos).toBeGreaterThan(0);
    expect(r.body.geral.variacao.vendas).toBe(100);
    expect(r.body.produtos_mais_vendidos[0].codigo).toBe('MQ-EN01');
    expect(r.body.clientes_que_mais_compram[0].razao_social).toBe('Cooperativa Agro Sorriso');
    const a = await api().get('/equipe/painel/avisos').set('Authorization', await como(COM, 'equipe')).expect(200);
    expect(a.body.contagens).toMatchObject({ pagos_para_separar: 0, boletos_para_faturar: 0 });
    await api().get('/equipe/painel?de=2026-13-01').set('Authorization', await como(COM, 'equipe')).expect(400);
    await api().get('/equipe/painel?de=2026-05-10&ate=2026-05-01').set('Authorization', await como(COM, 'equipe')).expect(400);
  });
});
