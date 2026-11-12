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
import { hojeBrasil } from '../src/pagamentos/regras';

/** Painel no formato do Bagisto, entrega 4: relatórios e configurações (permissões, impostos, locais de estoque, câmbio, importação). */

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
const produto = (codigo: string) => db.selectFrom('produtos').select(['id', 'estoque', 'multiplo_venda']).where('codigo', '=', codigo).executeTakeFirstOrThrow();
const locaisDe = (id: number) => db.selectFrom('estoque_locais').select(['local_id', 'quantidade']).where('produto_id', '=', id).orderBy('local_id').execute();

let maquina: { id: number; estoque: number };
let deposito: number;
let pedido: number;

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
  maquina = await produto('MQ-EN01');
});

afterAll(async () => {
  await app?.close();
  await db?.destroy();
});

describe('locais de estoque', () => {
  it('o catálogo semeado entra no centro de distribuição; a soma dos locais é o estoque', async () => {
    const r = await api().get('/equipe/configuracoes/locais').set('Authorization', await como(FIN, 'equipe')).expect(200);
    expect(r.body).toHaveLength(1);
    const { total } = await db.selectFrom('produtos').select(sql<number>`sum(estoque)::int`.as('total')).executeTakeFirstOrThrow();
    expect(r.body[0]).toMatchObject({ codigo: 'cd-itajai', unidades: total });
    expect(await locaisDe(maquina.id)).toEqual([{ local_id: 1, quantidade: maquina.estoque }]);
  });

  it('novo local; dividir o estoque do produto entre os locais', async () => {
    await api().post('/equipe/configuracoes/locais').set('Authorization', await como(FIN, 'equipe')).send({ codigo: 'dep-sorriso', nome: 'Depósito', cidade: 'Sorriso', uf: 'MT', prioridade: 5 }).expect(403);
    const l = await api().post('/equipe/configuracoes/locais').set('Authorization', await como(COM, 'equipe')).send({ codigo: 'dep-sorriso', nome: 'Depósito', cidade: 'Sorriso', uf: 'mt', prioridade: 5 }).expect(201);
    deposito = l.body.id;
    expect(l.body.uf).toBe('MT');
    await api().post('/equipe/configuracoes/locais').set('Authorization', await como(COM, 'equipe')).send({ codigo: 'dep-sorriso', nome: 'Outro', cidade: 'Sinop', uf: 'MT' }).expect(409);
    const e = await api().put(`/equipe/configuracoes/estoque/${maquina.id}`).set('Authorization', await como(COM, 'equipe'))
      .send({ locais: [{ local_id: 1, quantidade: 1 }, { local_id: deposito, quantidade: 5 }] }).expect(200);
    expect(e.body.estoque).toBe(6);
    expect((await produto('MQ-EN01')).estoque).toBe(6);
  });

  it('a venda tira do local de maior prioridade; o cancelamento devolve para ele', async () => {
    const r = await api().post('/pedidos').set('Authorization', await como(COOP, 'cliente')).send({ itens: [{ produto_id: maquina.id, quantidade: 2 }], forma_pagamento: 'pix' }).expect(201);
    expect(await locaisDe(maquina.id)).toEqual([{ local_id: 1, quantidade: 0 }, { local_id: deposito, quantidade: 4 }]);
    await api().post(`/equipe/pedidos/${r.body.id}/cancelar`).set('Authorization', await como(COM, 'equipe')).send({ motivo: 'Teste de estoque' }).expect(200);
    expect(await locaisDe(maquina.id)).toEqual([{ local_id: 1, quantidade: 2 }, { local_id: deposito, quantidade: 4 }]);
    expect((await produto('MQ-EN01')).estoque).toBe(6);
  });

  it('não deixa desativar o último local ativo', async () => {
    await api().patch(`/equipe/configuracoes/locais/${deposito}`).set('Authorization', await como(COM, 'equipe')).send({ ativo: false }).expect(200);
    await api().patch('/equipe/configuracoes/locais/1').set('Authorization', await como(COM, 'equipe')).send({ ativo: false }).expect(400);
    await api().patch(`/equipe/configuracoes/locais/${deposito}`).set('Authorization', await como(COM, 'equipe')).send({ ativo: true }).expect(200);
  });
});

describe('impostos na nota fiscal', () => {
  it('a regra por NCM vale mais que a padrão; a nota leva o valor aproximado dos tributos', async () => {
    await api().post('/equipe/configuracoes/impostos').set('Authorization', await como(COM, 'equipe')).send({ nome: 'x', aliquota_federal_bp: 1, aliquota_estadual_bp: 1 }).expect(403);
    await api().patch(`/equipe/produtos/${maquina.id}`).set('Authorization', await como(COM, 'equipe')).send({ ncm: '84335100' }).expect(200);
    const r = await api().post('/pedidos').set('Authorization', await como(COOP, 'cliente')).send({ itens: [{ produto_id: maquina.id, quantidade: 2 }], forma_pagamento: 'pix' }).expect(201);
    pedido = r.body.id;
    await api().post(`/equipe/simulador/parcelas/${r.body.cobrancas[0].parcelas[0].id}/confirmar`).set('Authorization', await como(ADMIN, 'equipe')).expect(200);
    const n = await api().post(`/equipe/vendas/pedidos/${pedido}/nota`).set('Authorization', await como(FIN, 'equipe')).expect(201);
    const esperado = Math.round((r.body.total_centavos * 1015) / 10_000) + Math.round((r.body.total_centavos * 1200) / 10_000);
    expect(n.body.tributos_centavos).toBe(esperado);
    expect(n.body.tributos.regras).toEqual([expect.objectContaining({ nome: 'Máquinas e equipamentos (NCM 84)', base_centavos: r.body.total_centavos })]);
  });

  it('regra desativada deixa de valer', async () => {
    const regras = await api().get('/equipe/configuracoes/impostos').set('Authorization', await como(COM, 'equipe')).expect(200);
    const ncm84 = regras.body.find((x: { ncm_prefixo: string | null }) => x.ncm_prefixo === '84');
    const alt = await api().patch(`/equipe/configuracoes/impostos/${ncm84.id}`).set('Authorization', await como(FIN, 'equipe')).send({ ativo: false }).expect(200);
    expect(alt.body).toMatchObject({ ativo: false, ncm_prefixo: '84', aliquota_federal_bp: 1015 });
  });
});

describe('câmbio', () => {
  it('registra, corrige a cotação do mesmo dia e mostra a mais recente', async () => {
    await api().post('/equipe/configuracoes/cambio').set('Authorization', await como(COM, 'equipe')).send({ moeda: 'USD', data: '2026-11-09', taxa: 5.4 }).expect(403);
    await api().post('/equipe/configuracoes/cambio').set('Authorization', await como(FIN, 'equipe')).send({ moeda: 'USD', data: '2026-11-09', taxa: 5.4012 }).expect(201);
    await api().post('/equipe/configuracoes/cambio').set('Authorization', await como(FIN, 'equipe')).send({ moeda: 'USD', data: '2026-11-10', taxa: 5.39 }).expect(201);
    await api().post('/equipe/configuracoes/cambio').set('Authorization', await como(FIN, 'equipe')).send({ moeda: 'USD', data: '2026-11-10', taxa: 5.3875, fonte: 'PTAX venda' }).expect(201);
    await api().post('/equipe/configuracoes/cambio').set('Authorization', await como(FIN, 'equipe')).send({ moeda: 'USD', data: '2026-11-10', taxa: 5.12345 }).expect(400);
    const h = await api().get('/equipe/configuracoes/cambio').set('Authorization', await como(COM, 'equipe')).expect(200);
    expect(h.body).toHaveLength(2);
    const atual = await api().get('/equipe/configuracoes/cambio/atual').set('Authorization', await como(COM, 'equipe')).expect(200);
    expect(atual.body).toEqual([{ moeda: 'USD', data: '2026-11-10', taxa: 5.3875 }]);
    // dólar do dia da calculadora: nos testes o Banco Central não é consultado, então vale a última cotação cadastrada
    const dia = await api().get('/equipe/configuracoes/cambio/dolar-do-dia').set('Authorization', await como(COM, 'equipe')).expect(200);
    expect(dia.body).toEqual({ moeda: 'USD', data: '2026-11-10', taxa: 5.3875, fonte: 'PTAX venda', origem: 'cadastro' });
  });
});

describe('rotas marítimas', () => {
  it('a equipe consulta portos e a rota entre dois portos; clientes não', async () => {
    const portos = await api().get('/equipe/importacao/portos').set('Authorization', await como(COM, 'equipe')).expect(200);
    expect(portos.body[0]).toMatchObject({ codigo: 'BRSSZ', nome: 'Santos', pais: 'Brasil' });
    const busca = await api().get('/equipe/importacao/portos?busca=xangai').set('Authorization', await como(COM, 'equipe')).expect(200);
    expect(busca.body[0].codigo).toBe('CNSHA');
    const r = await api().get('/equipe/importacao/rota?origem=CNSHA&destino=BRSSZ&velocidade=18').set('Authorization', await como(COM, 'equipe')).expect(200);
    expect(r.body).toMatchObject({ origem: { codigo: 'CNSHA' }, destino: { codigo: 'BRSSZ' }, velocidade_nos: 18 });
    expect(r.body.distancia_mn).toBeGreaterThan(10000);
    expect(r.body.linha.length).toBeGreaterThan(20);
    await api().get('/equipe/importacao/rota?origem=CNSHA&destino=XXXXX').set('Authorization', await como(COM, 'equipe')).expect(400);
    await api().get('/equipe/importacao/rota?origem=CNSHA').set('Authorization', await como(COM, 'equipe')).expect(400);
    await api().get('/equipe/importacao/rota?origem=CNSHA&destino=BRSSZ&velocidade=90').set('Authorization', await como(COM, 'equipe')).expect(400);
    await api().get('/equipe/importacao/rota?origem=CNSHA&destino=BRSSZ').set('Authorization', await como(COOP, 'cliente')).expect(403);
  });
});

describe('importação de produtos por planilha', () => {
  const planilha = [
    'codigo;nome;categoria;preco;estoque;multiplo;ativo',
    'MQ-EN01;;;;10;;',                                       // altera só o estoque
    'NV-0001;Luva nitrílica caixa 100;epis;89,90;50;10;sim', // cria
    'NV-0002;Sem categoria válida;nao-existe;10,00;;;',      // erro
    'NV-0003;Sem preço;epis;;;;',                            // erro: produto novo sem preço
    'EP-CP01;;;;;;',                                         // sem mudança
  ].join('\n');

  it('a prévia mostra o que vai acontecer em cada linha, sem gravar', async () => {
    const r = await api().post('/equipe/configuracoes/importar/previa').set('Authorization', await como(COM, 'equipe')).send({ conteudo: planilha }).expect(200);
    expect(r.body.resumo).toEqual({ total: 5, criar: 1, alterar: 1, sem_mudanca: 1, erro: 2 });
    expect(r.body.linhas[0]).toMatchObject({ codigo: 'MQ-EN01', acao: 'alterar', mudancas: { estoque: { de: 4, para: 10 } } });
    expect(r.body.linhas[2].erros).toEqual(['Categoria não existe: nao-existe.']);
    expect(r.body.linhas[3].erros).toEqual(['Produto novo precisa de preço.']);
    expect(await db.selectFrom('produtos').select('id').where('codigo', '=', 'NV-0001').executeTakeFirst()).toBeUndefined();
  });

  it('aplica as linhas válidas; o estoque novo entra no local de maior prioridade; fica no histórico', async () => {
    await api().post('/equipe/configuracoes/importar').set('Authorization', await como(FIN, 'equipe')).send({ conteudo: planilha }).expect(403);
    const r = await api().post('/equipe/configuracoes/importar').set('Authorization', await como(COM, 'equipe')).send({ conteudo: planilha, arquivo: 'novos.csv' }).expect(200);
    expect(r.body).toMatchObject({ criados: 1, alterados: 1, erro: 2 });
    const novo = await db.selectFrom('produtos').select(['id', 'preco_tabela_centavos', 'estoque', 'familia_id']).where('codigo', '=', 'NV-0001').executeTakeFirstOrThrow();
    expect(novo).toMatchObject({ preco_tabela_centavos: 8990, estoque: 50 });
    expect(novo.familia_id).not.toBeNull();
    expect(await locaisDe(novo.id)).toEqual([{ local_id: 1, quantidade: 50 }]);
    expect(await locaisDe(maquina.id)).toEqual([{ local_id: 1, quantidade: 6 }, { local_id: deposito, quantidade: 4 }]); // 4 → 10: +6 no CD
    const h = await api().get('/equipe/configuracoes/importacoes').set('Authorization', await como(FIN, 'equipe')).expect(200);
    expect(h.body[0]).toMatchObject({ arquivo: 'novos.csv', criados: 1, alterados: 1, com_erro: 2, criado_por: 'comercial' });
  });

  it('planilha sem a coluna de código é recusada', async () => {
    const r = await api().post('/equipe/configuracoes/importar/previa').set('Authorization', await como(COM, 'equipe')).send({ conteudo: 'nome\nLuva' }).expect(400);
    expect(r.body.message).toMatch(/codigo/);
  });
});

describe('relatórios', () => {
  it('vendas do período batem com os pedidos; cancelados ficam de fora e aparecem à parte', async () => {
    const r = await api().get('/equipe/relatorios/vendas').set('Authorization', await como(COM, 'equipe')).expect(200);
    const pedidos = await db.selectFrom('pedidos').select(['total_centavos', 'situacao']).execute();
    const validos = pedidos.filter((p) => p.situacao !== 'cancelado');
    expect(r.body.totais).toMatchObject({ pedidos: validos.length, vendas_centavos: validos.reduce((s, p) => s + p.total_centavos, 0), cancelados: { pedidos: 1 } });
    expect(r.body.serie).toHaveLength(30);
    expect(r.body.serie.at(-1).periodo).toBe(hojeBrasil());
    expect(r.body.por_forma).toEqual([expect.objectContaining({ chave: 'pix', pedidos: 1 })]);
    const mes = await api().get('/equipe/relatorios/vendas?agrupar=mes&de=2026-01-01&ate=2026-12-31').set('Authorization', await como(COM, 'equipe')).expect(200);
    expect(mes.body.serie).toHaveLength(12);
    await api().get('/equipe/relatorios/vendas?agrupar=ano').set('Authorization', await como(COM, 'equipe')).expect(400);
  });

  it('produtos e clientes do período', async () => {
    const p = await api().get('/equipe/relatorios/produtos').set('Authorization', await como(FIN, 'equipe')).expect(200);
    expect(p.body.produtos[0]).toMatchObject({ codigo: 'MQ-EN01', quantidade: 2, pedidos: 1, empresas: 1 });
    expect(p.body.categorias[0]).toMatchObject({ categoria_id: 'maquinario', produtos: 1 });
    const c = await api().get('/equipe/relatorios/clientes').set('Authorization', await como(FIN, 'equipe')).expect(200);
    expect(c.body.clientes[0]).toMatchObject({ razao_social: 'Cooperativa Agro Sorriso', pedidos: 1 });
    expect(c.body.totais).toMatchObject({ empresas: 5, compraram: 1, primeira_compra_no_periodo: 1 });
    await api().get('/equipe/relatorios/vendas').set('Authorization', await como(COOP, 'cliente')).expect(403);
  });
});

describe('papéis e permissões', () => {
  it('a matriz sai das próprias rotas: só o administrador vê', async () => {
    await api().get('/equipe/configuracoes/permissoes').set('Authorization', await como(FIN, 'equipe')).expect(403);
    const r = await api().get('/equipe/configuracoes/permissoes').set('Authorization', await como(ADMIN, 'equipe')).expect(200);
    const rota = (metodo: string, caminho: string) => r.body.find((x: { metodo: string; caminho: string }) => x.metodo === metodo && x.caminho === caminho);
    expect(rota('POST', '/equipe/vendas/pedidos/:id/nota')).toMatchObject({ origem: 'equipe', papeis: ['financeiro', 'administrador'] });
    expect(rota('GET', '/equipe/painel')).toMatchObject({ papeis: ['comercial', 'financeiro', 'administrador'] });
    expect(rota('POST', '/newsletter')).toMatchObject({ publico: true });
    expect(rota('POST', '/pedidos')).toMatchObject({ origem: 'cliente', papeis: ['comprador', 'aprovador'] });
  });
});
