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

/** Fase 2, a loja no formato do Bagisto: filtros por atributo, ordenação, favoritos, endereços de entrega e listas de compra. */

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
const COMPRADOR = 'joao@coop-demo.com.br';
const HOSP = 'compras@hospital-demo.com.br';
const ADMIN = 'admin@importfacil.dev';
const como = async (email: string, origem: 'cliente' | 'equipe') => `Bearer ${await gerarTokenDev(SEGREDO, `dev-${email}`, origem)}`;
const produto = (codigo: string) => db.selectFrom('produtos').select(['id', 'estoque', 'multiplo_venda']).where('codigo', '=', codigo).executeTakeFirstOrThrow();
const ENDERECO = { cep: '78890-000', logradouro: 'Rodovia BR-163', numero: 'km 740', bairro: 'Distrito Industrial', cidade: 'Sorriso', uf: 'mt' };

let maquina: { id: number };
let epi: { id: number; multiplo_venda: number };

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
  await api().post('/empresa/usuarios').set('Authorization', await como(COOP, 'cliente')).send({ nome: 'João Comprador', email: COMPRADOR, papel: 'comprador' }).expect(201);
  maquina = await produto('MQ-EN01');
  epi = await produto('EP-CP01');
});

afterAll(async () => {
  await app?.close();
  await db?.destroy();
});

describe('catálogo da loja: códigos, ids, ordenação e filtros por atributo', () => {
  it('pedido rápido: busca por códigos sem diferença de maiúsculas; ids fora do catálogo do cliente somem', async () => {
    const r = await api().get('/catalogo/produtos?codigos=ep-cp01,MQ-EN01,NAO-EXISTE').set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(r.body.itens.map((p: { codigo: string }) => p.codigo).sort()).toEqual(['EP-CP01', 'MQ-EN01']);
    const h = await api().get(`/catalogo/produtos?ids=${maquina.id}`).set('Authorization', await como(HOSP, 'cliente')).expect(200);
    expect(h.body.itens).toHaveLength(0);
    await api().get('/catalogo/produtos?ids=1;DROP').set('Authorization', await como(COOP, 'cliente')).expect(400);
  });

  it('ordena por preço', async () => {
    const r = await api().get('/catalogo/produtos?categoria=epis&ordem=menor_preco&por_pagina=100').set('Authorization', await como(COOP, 'cliente')).expect(200);
    const precos = r.body.itens.map((p: { preco_tabela_centavos: number }) => p.preco_tabela_centavos);
    expect(precos).toEqual([...precos].sort((a, b) => a - b));
    const d = await api().get('/catalogo/produtos?categoria=epis&ordem=maior_preco&por_pagina=100').set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(d.body.itens[0].preco_tabela_centavos).toBe(Math.max(...precos));
  });

  it('filtros: só atributos filtráveis com dois ou mais valores; o filtro limita a lista', async () => {
    const f = await api().get('/catalogo/filtros').set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(f.body.length).toBeGreaterThan(0);
    for (const g of f.body) expect(g.valores.length).toBeGreaterThanOrEqual(2);
    const g = f.body[0];
    const v = g.valores[0];
    const r = await api().get(`/catalogo/produtos?por_pagina=200&atributos=${encodeURIComponent(JSON.stringify({ [g.codigo]: [v.valor] }))}`)
      .set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(r.body.total).toBe(v.produtos);
    expect(r.body.itens.every((p: { atributos: Record<string, string> }) => p.atributos[g.codigo] === v.valor)).toBe(true);
    await api().get('/catalogo/produtos?atributos=nao-e-json').set('Authorization', await como(COOP, 'cliente')).expect(400);
    await api().get(`/catalogo/produtos?atributos=${encodeURIComponent('{"X; drop":["a"]}')}`).set('Authorization', await como(COOP, 'cliente')).expect(400);
    const atr = await api().get('/catalogo/atributos').set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(atr.body.map((a: { codigo: string }) => a.codigo)).toContain('tensao');
  });
});

describe('favoritos', () => {
  it('favoritar, listar com o preço do cliente e tirar; produto de outro catálogo não entra', async () => {
    await api().put(`/loja/favoritos/${maquina.id}`).set('Authorization', await como(COOP, 'cliente')).expect(200);
    await api().put(`/loja/favoritos/${maquina.id}`).set('Authorization', await como(COOP, 'cliente')).expect(200); // repetir não duplica
    await api().put(`/loja/favoritos/${epi.id}`).set('Authorization', await como(COOP, 'cliente')).expect(200);
    const l = await api().get('/loja/favoritos').set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(l.body.map((p: { codigo: string }) => p.codigo)).toEqual(['EP-CP01', 'MQ-EN01']);
    expect(l.body[0].preco_cliente_centavos).toBeLessThan(l.body[0].preco_tabela_centavos);
    expect((await api().get('/loja/favoritos/ids').set('Authorization', await como(COMPRADOR, 'cliente')).expect(200)).body).toEqual([]); // são de cada pessoa
    await api().put(`/loja/favoritos/${maquina.id}`).set('Authorization', await como(HOSP, 'cliente')).expect(404);
    await api().delete(`/loja/favoritos/${maquina.id}`).set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect((await api().get('/loja/favoritos/ids').set('Authorization', await como(COOP, 'cliente')).expect(200)).body).toEqual([epi.id]);
    await api().get('/loja/favoritos').set('Authorization', await como(ADMIN, 'equipe')).expect(403);
  });
});

describe('endereços de entrega', () => {
  let matriz: number;
  let filial: number;

  it('só o aprovador cadastra; o primeiro vira o padrão; um padrão por empresa', async () => {
    await api().post('/loja/enderecos').set('Authorization', await como(COMPRADOR, 'cliente')).send({ apelido: 'Matriz', endereco: ENDERECO }).expect(403);
    const a = await api().post('/loja/enderecos').set('Authorization', await como(COOP, 'cliente')).send({ apelido: 'Matriz', endereco: ENDERECO }).expect(201);
    matriz = a.body.id;
    expect(a.body).toMatchObject({ padrao: true, endereco: { cep: '78890000', uf: 'MT' } });
    const b = await api().post('/loja/enderecos').set('Authorization', await como(COOP, 'cliente')).send({ apelido: 'Armazém 2', endereco: { ...ENDERECO, numero: 'km 745' }, padrao: true }).expect(201);
    filial = b.body.id;
    const l = await api().get('/loja/enderecos').set('Authorization', await como(COMPRADOR, 'cliente')).expect(200);
    expect(l.body.map((e: { apelido: string; padrao: boolean }) => [e.apelido, e.padrao])).toEqual([['Armazém 2', true], ['Matriz', false]]);
    await api().post('/loja/enderecos').set('Authorization', await como(COOP, 'cliente')).send({ apelido: 'Sem CEP', endereco: { ...ENDERECO, cep: '123' } }).expect(400);
  });

  it('o pedido usa o endereço escolhido ou o padrão; endereço de outra empresa não vale', async () => {
    const itens = [{ produto_id: maquina.id, quantidade: 1 }];
    const padrao = await api().post('/pedidos').set('Authorization', await como(COMPRADOR, 'cliente')).send({ itens, forma_pagamento: 'pix' }).expect(201);
    expect(padrao.body.endereco_entrega.numero).toBe('km 745');
    const escolhido = await api().post('/pedidos').set('Authorization', await como(COMPRADOR, 'cliente')).send({ itens, forma_pagamento: 'pix', endereco_id: matriz }).expect(201);
    expect(escolhido.body.endereco_entrega.numero).toBe('km 740');
    await api().post('/pedidos').set('Authorization', await como(HOSP, 'cliente'))
      .send({ itens: [{ produto_id: (await produto('HC-6142')).id, quantidade: 1 }], forma_pagamento: 'pix', endereco_id: matriz }).expect(400);
  });

  it('não tira o endereço padrão sem escolher outro; o tirado some da lista', async () => {
    await api().patch(`/loja/enderecos/${filial}`).set('Authorization', await como(COOP, 'cliente')).send({ ativo: false }).expect(400);
    await api().patch(`/loja/enderecos/${matriz}`).set('Authorization', await como(COOP, 'cliente')).send({ padrao: true }).expect(200);
    await api().patch(`/loja/enderecos/${filial}`).set('Authorization', await como(COOP, 'cliente')).send({ ativo: false }).expect(200);
    const l = await api().get('/loja/enderecos').set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(l.body.map((e: { id: number }) => e.id)).toEqual([matriz]);
    await api().patch(`/loja/enderecos/${matriz}`).set('Authorization', await como(HOSP, 'cliente')).send({ apelido: 'Invadido' }).expect(404);
  });
});

describe('listas de compra', () => {
  let lista: number;

  it('lista da empresa: criada por um, usada por todos; quantidades se somam', async () => {
    const r = await api().post('/loja/listas').set('Authorization', await como(COMPRADOR, 'cliente'))
      .send({ nome: 'Reposição mensal', itens: [{ produto_id: epi.id, quantidade: epi.multiplo_venda }] }).expect(201);
    lista = r.body.id;
    const add = await api().post(`/loja/listas/${lista}/itens`).set('Authorization', await como(COOP, 'cliente'))
      .send({ itens: [{ produto_id: epi.id, quantidade: epi.multiplo_venda }, { produto_id: maquina.id, quantidade: 1 }] }).expect(201);
    expect(add.body.itens.map((i: { produto: { codigo: string }; quantidade: number }) => [i.produto.codigo, i.quantidade]).sort())
      .toEqual([['EP-CP01', epi.multiplo_venda * 2], ['MQ-EN01', 1]]);
    const todas = await api().get('/loja/listas').set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(todas.body[0]).toMatchObject({ nome: 'Reposição mensal', itens: 2, criado_por: 'João Comprador' });
  });

  it('quantidade zero tira o item; outra empresa não vê; produto fora do catálogo não entra', async () => {
    const r = await api().put(`/loja/listas/${lista}/itens/${maquina.id}`).set('Authorization', await como(COOP, 'cliente')).send({ quantidade: 0 }).expect(200);
    expect(r.body.itens).toHaveLength(1);
    await api().get(`/loja/listas/${lista}`).set('Authorization', await como(HOSP, 'cliente')).expect(404);
    const outra = await api().post('/loja/listas').set('Authorization', await como(HOSP, 'cliente')).send({ nome: 'Hospital' }).expect(201);
    await api().post(`/loja/listas/${outra.body.id}/itens`).set('Authorization', await como(HOSP, 'cliente')).send({ itens: [{ produto_id: maquina.id, quantidade: 1 }] }).expect(400);
  });

  it('lista desativada some', async () => {
    await api().patch(`/loja/listas/${lista}`).set('Authorization', await como(COOP, 'cliente')).send({ ativo: false }).expect(200);
    expect((await api().get('/loja/listas').set('Authorization', await como(COOP, 'cliente')).expect(200)).body).toHaveLength(0);
    await api().get(`/loja/listas/${lista}`).set('Authorization', await como(COOP, 'cliente')).expect(404);
  });
});
