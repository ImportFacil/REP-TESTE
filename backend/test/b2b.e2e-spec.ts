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

/** Fase 3, B2B: limite do comprador e aprovação de compras, cotação de preço negociado e ordem de compra. */

const URL = process.env.TESTE_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/importfacil_teste';
const SEGREDO = 'segredo-dos-testes';
const config = lerConfig({
  AMBIENTE: 'teste', DATABASE_URL: URL, AUTH_SEGREDO_DEV: SEGREDO, LIMITE_REQ_MINUTO: '10000',
  PASTA_ARQUIVOS: mkdtempSync(join(tmpdir(), 'importfacil-arquivos-')),
});

let app: INestApplication;
let db: Banco;
let api: () => ReturnType<typeof request>;
const COOP = 'compras@coop-demo.com.br';        // aprovador
const JOAO = 'joao@coop-demo.com.br';           // comprador
const HOSP = 'compras@hospital-demo.com.br';
const ADMIN = 'admin@importfacil.dev';
const FIN = 'financeiro@importfacil.dev';
const COM = 'comercial@importfacil.dev';
const como = async (email: string, origem: 'cliente' | 'equipe') => `Bearer ${await gerarTokenDev(SEGREDO, `dev-${email}`, origem)}`;
const produto = (codigo: string) => db.selectFrom('produtos').select(['id', 'estoque', 'multiplo_venda']).where('codigo', '=', codigo).executeTakeFirstOrThrow();
const avisos = (modelo: string) => db.selectFrom('notificacoes').select(['destinatario', 'dados']).where('modelo', '=', modelo).orderBy('id').execute();

let maquina: { id: number };
let epi: { id: number };
let joaoId: string;

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
  const j = await api().post('/empresa/usuarios').set('Authorization', await como(COOP, 'cliente')).send({ nome: 'João Comprador', email: JOAO, papel: 'comprador' }).expect(201);
  joaoId = j.body.id;
  maquina = await produto('MQ-EN01');
  epi = await produto('EP-CP01');
});

afterAll(async () => {
  await app?.close();
  await db?.destroy();
});

describe('limite do comprador e aprovação de compras', () => {
  const grande = () => [{ produto_id: maquina.id, quantidade: 2 }];
  let req: number;

  it('o aprovador define o limite; acima dele o pedido do comprador é barrado com o motivo', async () => {
    await api().patch(`/empresa/usuarios/${joaoId}`).set('Authorization', await como(JOAO, 'cliente')).send({ limite_pedido_centavos: 5_000_000 }).expect(403);
    const u = await api().patch(`/empresa/usuarios/${joaoId}`).set('Authorization', await como(COOP, 'cliente')).send({ limite_pedido_centavos: 5_000_000 }).expect(200);
    expect(u.body.limite_pedido_centavos).toBe(5_000_000);
    const r = await api().post('/pedidos').set('Authorization', await como(JOAO, 'cliente')).send({ itens: grande(), forma_pagamento: 'pix' }).expect(403);
    expect(r.body).toMatchObject({ codigo: 'precisa_aprovacao', limite_centavos: 5_000_000 });
    // abaixo do limite o comprador fecha sozinho
    await api().post('/pedidos').set('Authorization', await como(JOAO, 'cliente')).send({ itens: [{ produto_id: epi.id, quantidade: 800 }], forma_pagamento: 'pix' }).expect(201);
  });

  it('o comprador manda para o aprovador, que recebe o aviso', async () => {
    await api().post('/empresa/requisicoes').set('Authorization', await como(COOP, 'cliente')).send({ itens: grande(), forma_pagamento: 'pix' }).expect(403); // aprovador não precisa
    const r = await api().post('/empresa/requisicoes').set('Authorization', await como(JOAO, 'cliente'))
      .send({ itens: grande(), forma_pagamento: 'boleto', ordem_compra: 'OC-2026-118', observacao: 'Safra 26/27' }).expect(201);
    req = r.body.id;
    expect(r.body).toMatchObject({ situacao: 'pendente', solicitante: 'João Comprador', ordem_compra: 'OC-2026-118', pode_aprovar: true });
    expect(r.body.total_estimado_centavos).toBeGreaterThan(5_000_000);
    expect(r.body.itens[0]).toMatchObject({ codigo: 'MQ-EN01', quantidade: 2 });
    const a = await avisos('requisicao_pendente');
    expect(a).toEqual([expect.objectContaining({ destinatario: COOP, dados: expect.objectContaining({ solicitante: 'João Comprador', requisicao: req }) })]);
    expect((await api().get('/empresa/requisicoes').set('Authorization', await como(JOAO, 'cliente')).expect(200)).body).toHaveLength(1);
  });

  it('só o aprovador aprova; o pedido sai em nome do comprador, com a ordem de compra; aprovar de novo não duplica', async () => {
    await api().post(`/empresa/requisicoes/${req}/aprovar`).set('Authorization', await como(JOAO, 'cliente')).send({}).expect(403);
    const r = await api().post(`/empresa/requisicoes/${req}/aprovar`).set('Authorization', await como(COOP, 'cliente')).send({ forma_pagamento: 'pix' }).expect(200);
    expect(r.body.requisicao).toMatchObject({ situacao: 'aprovada', decidida_por_nome: 'Compras Cooperativa Agro Sorriso' });
    const p = await db.selectFrom('pedidos as p').innerJoin('usuarios as u', 'u.id', 'p.comprador_id')
      .select(['p.id', 'u.email', 'p.aprovado_por', 'p.requisicao_id', 'p.ordem_compra', 'p.forma_pagamento']).where('p.id', '=', r.body.pedido.id).executeTakeFirstOrThrow();
    expect(p).toMatchObject({ email: JOAO, requisicao_id: req, ordem_compra: 'OC-2026-118', forma_pagamento: 'pix' });
    expect(p.aprovado_por).not.toBeNull();
    expect(r.body.pedido.eventos[0].descricao).toMatch(/^Pedido de João Comprador aprovado por .* \(requisição nº \d+\).*Ordem de compra OC-2026-118\.$/);
    await api().post(`/empresa/requisicoes/${req}/aprovar`).set('Authorization', await como(COOP, 'cliente')).send({}).expect(409);
    expect((await avisos('requisicao_decidida'))[0]).toMatchObject({ destinatario: JOAO, dados: expect.objectContaining({ decisao: 'aprovada' }) });
  });

  it('recusar exige motivo e avisa; o comprador cancela as que ainda estão pendentes', async () => {
    const a = await api().post('/empresa/requisicoes').set('Authorization', await como(JOAO, 'cliente')).send({ itens: grande(), forma_pagamento: 'pix' }).expect(201);
    await api().post(`/empresa/requisicoes/${a.body.id}/recusar`).set('Authorization', await como(COOP, 'cliente')).send({}).expect(400);
    const r = await api().post(`/empresa/requisicoes/${a.body.id}/recusar`).set('Authorization', await como(COOP, 'cliente')).send({ motivo: 'Fora do orçamento do mês' }).expect(200);
    expect(r.body).toMatchObject({ situacao: 'recusada', motivo: 'Fora do orçamento do mês' });
    await api().post(`/empresa/requisicoes/${a.body.id}/cancelar`).set('Authorization', await como(JOAO, 'cliente')).expect(409);
    const b = await api().post('/empresa/requisicoes').set('Authorization', await como(JOAO, 'cliente')).send({ itens: grande(), forma_pagamento: 'pix' }).expect(201);
    expect((await api().post(`/empresa/requisicoes/${b.body.id}/cancelar`).set('Authorization', await como(JOAO, 'cliente')).expect(200)).body.situacao).toBe('cancelada');
    await api().get(`/empresa/requisicoes/${b.body.id}`).set('Authorization', await como(HOSP, 'cliente')).expect(404);
  });

  it('sem limite (null), o comprador volta a fechar sozinho', async () => {
    await api().patch(`/empresa/usuarios/${joaoId}`).set('Authorization', await como(COOP, 'cliente')).send({ limite_pedido_centavos: null }).expect(200);
    await api().post('/pedidos').set('Authorization', await como(JOAO, 'cliente')).send({ itens: [{ produto_id: maquina.id, quantidade: 1 }], forma_pagamento: 'pix' }).expect(201);
  });
});

describe('cotação de preço negociado', () => {
  let cot: number;

  it('a empresa pede; múltiplo de venda errado não passa; a equipe vê a pendência', async () => {
    await api().post('/empresa/cotacoes').set('Authorization', await como(JOAO, 'cliente')).send({ itens: [{ produto_id: epi.id, quantidade: 5 }] }).expect(400);
    const r = await api().post('/empresa/cotacoes').set('Authorization', await como(JOAO, 'cliente'))
      .send({ itens: [{ produto_id: maquina.id, quantidade: 1 }, { produto_id: epi.id, quantidade: 100 }], mensagem: 'Compra trimestral, entrega em Sorriso.' }).expect(201);
    cot = r.body.id;
    expect(r.body).toMatchObject({ situacao: 'solicitada', proposto_centavos: null });
    expect(r.body.itens).toHaveLength(2);
    const av = await api().get('/equipe/painel/avisos').set('Authorization', await como(COM, 'equipe')).expect(200);
    expect(av.body.contagens.cotacoes_aguardando).toBe(1);
    await api().post(`/empresa/cotacoes/${cot}/aceitar`).set('Authorization', await como(COOP, 'cliente')).send({ forma_pagamento: 'pix' }).expect(409);
  });

  it('a equipe responde todos os itens com validade; quem pediu recebe o aviso', async () => {
    const resposta = { itens: [{ produto_id: maquina.id, preco_proposto_centavos: 2_900_000 }, { produto_id: epi.id, preco_proposto_centavos: 2_500 }], resposta: 'Preço para o lote fechado.', validade_dias: 10 };
    await api().put(`/equipe/cotacoes/${cot}/resposta`).set('Authorization', await como(FIN, 'equipe')).send(resposta).expect(403);
    await api().put(`/equipe/cotacoes/${cot}/resposta`).set('Authorization', await como(COM, 'equipe')).send({ ...resposta, itens: resposta.itens.slice(0, 1) }).expect(400);
    const r = await api().put(`/equipe/cotacoes/${cot}/resposta`).set('Authorization', await como(COM, 'equipe')).send(resposta).expect(200);
    expect(r.body).toMatchObject({ situacao: 'respondida', proposto_centavos: 2_900_000 + 100 * 2_500, respondida_por_nome: 'comercial' });
    expect(r.body.economia_centavos).toBeGreaterThan(0);
    const cx = await api().get('/equipe/marketing/caixa-de-saida').set('Authorization', await como(COM, 'equipe')).expect(200);
    expect(cx.body.find((a: { modelo: string }) => a.modelo === 'cotacao_respondida')).toMatchObject({ destinatario: JOAO, assunto: `Cotação nº ${cot} respondida: R$ 31.500,00` });
  });

  it('só o aprovador aceita; o pedido sai com o preço negociado e sem promoção', async () => {
    await api().post('/equipe/marketing/promocoes').set('Authorization', await como(COM, 'equipe')).send({ nome: 'Tudo 5%', tipo_desconto: 'percentual', desconto_bp: 500 }).expect(201);
    await api().post(`/empresa/cotacoes/${cot}/aceitar`).set('Authorization', await como(JOAO, 'cliente')).send({ forma_pagamento: 'pix' }).expect(403);
    const r = await api().post(`/empresa/cotacoes/${cot}/aceitar`).set('Authorization', await como(COOP, 'cliente')).send({ forma_pagamento: 'pix', ordem_compra: 'OC-77' }).expect(200);
    expect(r.body.cotacao).toMatchObject({ situacao: 'aceita', pedido_id: r.body.pedido.id });
    const p = r.body.pedido;
    expect(p).toMatchObject({ subtotal_centavos: 3_150_000, promocao_centavos: 0, cotacao_id: cot, ordem_compra: 'OC-77' });
    expect(p.itens.find((i: { produto_id: number }) => i.produto_id === maquina.id).preco_unitario_centavos).toBe(2_900_000);
    expect(p.eventos[0].descricao).toContain(`preço negociado na cotação nº ${cot}`);
    await api().post(`/empresa/cotacoes/${cot}/aceitar`).set('Authorization', await como(COOP, 'cliente')).send({ forma_pagamento: 'pix' }).expect(409);
  });

  it('validade vencida: expira, não aceita; a equipe pode responder de novo; preço negociado dispensa o pedido mínimo', async () => {
    const r = await api().post('/empresa/cotacoes').set('Authorization', await como(COOP, 'cliente')).send({ itens: [{ produto_id: epi.id, quantidade: 10 }] }).expect(201);
    const resp = { itens: [{ produto_id: epi.id, preco_proposto_centavos: 2_800 }], validade_dias: 1 };
    await api().put(`/equipe/cotacoes/${r.body.id}/resposta`).set('Authorization', await como(COM, 'equipe')).send(resp).expect(200);
    await db.updateTable('cotacoes').set({ validade: '2020-01-01' }).where('id', '=', r.body.id).execute();
    expect((await api().get(`/empresa/cotacoes/${r.body.id}`).set('Authorization', await como(COOP, 'cliente')).expect(200)).body.situacao).toBe('expirada');
    const x = await api().post(`/empresa/cotacoes/${r.body.id}/aceitar`).set('Authorization', await como(COOP, 'cliente')).send({ forma_pagamento: 'pix' }).expect(409);
    expect(x.body.message).toMatch(/validade/);
    await api().put(`/equipe/cotacoes/${r.body.id}/resposta`).set('Authorization', await como(COM, 'equipe')).send({ ...resp, validade_dias: 5 }).expect(200);
    const ok = await api().post(`/empresa/cotacoes/${r.body.id}/aceitar`).set('Authorization', await como(COOP, 'cliente')).send({ forma_pagamento: 'pix' }).expect(200);
    expect(ok.body.pedido.subtotal_centavos).toBe(28_000); // abaixo do pedido mínimo da cooperativa, mas negociado
  });

  it('outra empresa não vê; cancelar só antes da resposta', async () => {
    await api().get(`/empresa/cotacoes/${cot}`).set('Authorization', await como(HOSP, 'cliente')).expect(404);
    const r = await api().post('/empresa/cotacoes').set('Authorization', await como(JOAO, 'cliente')).send({ itens: [{ produto_id: epi.id, quantidade: 10 }] }).expect(201);
    expect((await api().post(`/empresa/cotacoes/${r.body.id}/cancelar`).set('Authorization', await como(JOAO, 'cliente')).expect(200)).body.situacao).toBe('cancelada');
    await api().post(`/empresa/cotacoes/${cot}/cancelar`).set('Authorization', await como(COOP, 'cliente')).expect(409);
    const lista = await api().get('/equipe/cotacoes').set('Authorization', await como(FIN, 'equipe')).expect(200);
    expect(lista.body.map((c: { situacao: string }) => c.situacao).sort()).toEqual(['aceita', 'aceita', 'cancelada']);
  });
});
