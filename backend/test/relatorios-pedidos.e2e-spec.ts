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

/** Pedidos por janela de tempo (24/48/72 horas, semana, período) e por perfil de cliente; relatórios consolidados de pedidos e financeiro. */

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
const HOSP = 'compras@hospital-demo.com.br';
const ADMIN = 'admin@importfacil.dev';
const FIN = 'financeiro@importfacil.dev';
const COM = 'comercial@importfacil.dev';
const como = async (email: string, origem: 'cliente' | 'equipe') => `Bearer ${await gerarTokenDev(SEGREDO, `dev-${email}`, origem)}`;
const produto = (codigo: string) => db.selectFrom('produtos').select('id').where('codigo', '=', codigo).executeTakeFirstOrThrow();
const ids = (r: { body: { itens: Array<{ id: number }> } }) => r.body.itens.map((p) => p.id);

/** Pedidos da cooperativa feitos agora, há 30 horas, há 60 horas e há 5 dias; um do hospital agora. */
const P: Record<'agora' | 'h30' | 'h60' | 'd5' | 'hosp', number> = { agora: 0, h30: 0, h60: 0, d5: 0, hosp: 0 };

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
  const maquina = (await produto('MQ-EN01')).id;
  for (const k of ['d5', 'h60', 'h30', 'agora'] as const) {
    const r = await api().post('/pedidos').set('Authorization', await como(COOP, 'cliente'))
      .send({ itens: [{ produto_id: maquina, quantidade: 1 }], forma_pagamento: 'pix', ...(k === 'agora' && { ordem_compra: 'OC-555' }) }).expect(201);
    P[k] = r.body.id;
  }
  const hosp = await api().post('/pedidos').set('Authorization', await como(HOSP, 'cliente'))
    .send({ itens: [{ produto_id: (await produto('HM-CR11')).id, quantidade: 88 }], forma_pagamento: 'pix' });
  if (hosp.status !== 201) throw new Error(JSON.stringify(hosp.body));
  P.hosp = hosp.body.id;
  // o pedido de agora é pago; o de 30 horas, cancelado
  await api().post(`/equipe/simulador/parcelas/${(await api().get(`/pedidos/${P.agora}`).set('Authorization', await como(COOP, 'cliente'))).body.cobrancas[0].parcelas[0].id}/confirmar`)
    .set('Authorization', await como(ADMIN, 'equipe')).expect(200);
  await api().post(`/equipe/pedidos/${P.h30}/cancelar`).set('Authorization', await como(COM, 'equipe')).send({ motivo: 'Teste do relatório' }).expect(200);
  for (const [k, horas] of [['h30', 30], ['h60', 60], ['d5', 120]] as const) {
    await sql`UPDATE pedidos SET criado_em = now() - ${sql.raw(`interval '${horas} hours'`)} WHERE id = ${P[k]}`.execute(db);
  }
});

afterAll(async () => {
  await app?.close();
  await db?.destroy();
});

describe('Painel → Pedidos: janela de tempo, perfil de cliente, busca e ordem', () => {
  const lista = async (q: string) => api().get(`/equipe/pedidos?por_pagina=100&${q}`).set('Authorization', await como(COM, 'equipe')).expect(200);

  it('mais recentes primeiro; 24, 48, 72 horas e semana', async () => {
    expect(ids(await lista(''))).toEqual([P.hosp, P.agora, P.h30, P.h60, P.d5]);
    expect(ids(await lista('horas=24'))).toEqual([P.hosp, P.agora]);
    expect(ids(await lista('horas=48'))).toEqual([P.hosp, P.agora, P.h30]);
    expect(ids(await lista('horas=72'))).toEqual([P.hosp, P.agora, P.h30, P.h60]);
    const semana = await lista('horas=168');
    expect(semana.body.total).toBe(5);
    expect(semana.body.janela.rotulo).toBe('Últimos 7 dias');
    expect(ids(await lista('ordem=antigos'))[0]).toBe(P.d5);
  });

  it('por perfil de cliente, por período de datas e pela busca', async () => {
    expect(ids(await lista('tipo_cliente=hospital'))).toEqual([P.hosp]);
    expect(ids(await lista('tipo_cliente=cooperativa&horas=24'))).toEqual([P.agora]);
    const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
    expect((await lista(`de=${hoje}&ate=${hoje}`)).body.itens.map((p: { id: number }) => p.id)).toEqual(expect.arrayContaining([P.hosp, P.agora]));
    expect(ids(await lista('busca=OC-555'))).toEqual([P.agora]);
    expect(ids(await lista(`busca=${P.h60}`))).toEqual([P.h60]);
    expect(ids(await lista('busca=hospital'))).toEqual([P.hosp]);
    await api().get('/equipe/pedidos?horas=0').set('Authorization', await como(COM, 'equipe')).expect(400);
    await api().get('/equipe/pedidos?de=2026-11-12&ate=2026-11-01').set('Authorization', await como(COM, 'equipe')).expect(400);
  });

  it('cada cliente filtra os próprios pedidos do mesmo jeito', async () => {
    const r = await api().get('/pedidos?horas=48').set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(ids(r)).toEqual([P.agora, P.h30]);
    const h = await api().get('/pedidos?horas=48&tipo_cliente=cooperativa').set('Authorization', await como(HOSP, 'cliente')).expect(200);
    expect(ids(h)).toEqual([]); // o hospital nunca vê pedidos de outra empresa
  });
});

describe('Relatório consolidado de pedidos', () => {
  it('72 horas: cada pedido com a descrição e a situação financeira; cancelados à parte; totais por cliente e perfil', async () => {
    const r = await api().get('/equipe/relatorios/pedidos?horas=72').set('Authorization', await como(COM, 'equipe')).expect(200);
    expect(r.body.janela.rotulo).toBe('Últimas 72 horas');
    expect(r.body.pedidos.map((p: { id: number }) => p.id)).toEqual([P.hosp, P.agora, P.h30, P.h60]);
    const agora = r.body.pedidos.find((p: { id: number }) => p.id === P.agora);
    expect(agora.descricao).toMatch(/^1 un .+ \(MQ-EN01\)$/);
    expect(agora).toMatchObject({ ordem_compra: 'OC-555', pago_centavos: agora.total_centavos, aberto_centavos: 0, comprador: expect.any(String) });
    expect(r.body.totais).toMatchObject({ pedidos: 3, cancelados: 1 });
    expect(r.body.por_cliente.map((c: { razao_social: string; pedidos: number }) => [c.razao_social, c.pedidos]).sort())
      .toEqual([['Cooperativa Agro Sorriso', 2], [expect.stringMatching(/Hospital/), 1]].sort());
    expect(r.body.por_tipo.map((t: { tipo_cliente: string }) => t.tipo_cliente).sort()).toEqual(['cooperativa', 'hospital']);
  });

  it('por cliente e por perfil; sem janela, os últimos 7 dias', async () => {
    const coop = await db.selectFrom('empresas').select('id').where('razao_social', '=', 'Cooperativa Agro Sorriso').executeTakeFirstOrThrow();
    const r = await api().get(`/equipe/relatorios/pedidos?empresa_id=${coop.id}`).set('Authorization', await como(FIN, 'equipe')).expect(200);
    expect(r.body.janela.rotulo).toBe('Últimos 7 dias');
    expect(r.body.pedidos).toHaveLength(4);
    const h = await api().get('/equipe/relatorios/pedidos?horas=24&tipo_cliente=hospital').set('Authorization', await como(FIN, 'equipe')).expect(200);
    expect(h.body.pedidos.map((p: { id: number }) => p.id)).toEqual([P.hosp]);
    expect(h.body.totais.aberto_centavos).toBe(h.body.pedidos[0].total_centavos); // Pix ainda não pago
    await api().get('/equipe/relatorios/pedidos').set('Authorization', await como(COOP, 'cliente')).expect(403);
  });
});

describe('Relatório financeiro de todos os clientes', () => {
  it('24 horas: vendido e recebido na janela, em aberto hoje; só financeiro e administrador', async () => {
    await api().get('/equipe/relatorios/financeiro?horas=24').set('Authorization', await como(COM, 'equipe')).expect(403);
    const r = await api().get('/equipe/relatorios/financeiro?horas=24').set('Authorization', await como(FIN, 'equipe')).expect(200);
    expect(r.body.clientes).toHaveLength(5); // todas as empresas, mesmo sem movimento
    const coop = r.body.clientes.find((c: { razao_social: string }) => c.razao_social === 'Cooperativa Agro Sorriso');
    const pago = (await api().get(`/equipe/pedidos/${P.agora}`).set('Authorization', await como(FIN, 'equipe'))).body.total_centavos;
    expect(coop).toMatchObject({ pedidos: 1, vendas_centavos: pago, recebido_centavos: pago, pagamentos: 1 });
    expect(coop.aberto_centavos).toBeGreaterThan(0); // os Pix de 60 horas e 5 dias continuam em aberto
    const hosp = r.body.clientes.find((c: { tipo_cliente: string }) => c.tipo_cliente === 'hospital');
    expect(hosp).toMatchObject({ pedidos: 1, recebido_centavos: 0 });
    expect(r.body.totais).toMatchObject({ empresas: 5, pedidos: 2, recebido_centavos: pago });
  });

  it('semana e período; por perfil de cliente', async () => {
    const s = await api().get('/equipe/relatorios/financeiro?horas=168&tipo_cliente=cooperativa').set('Authorization', await como(ADMIN, 'equipe')).expect(200);
    expect(s.body.clientes).toHaveLength(1);
    expect(s.body.clientes[0].pedidos).toBe(3); // o cancelado não conta como venda
    const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
    const p = await api().get(`/equipe/relatorios/financeiro?de=${hoje}&ate=${hoje}`).set('Authorization', await como(ADMIN, 'equipe')).expect(200);
    expect(p.body.janela.de).toBe(hoje);
  });
});
