import type { INestApplication } from '@nestjs/common';
import { sql } from 'kysely';
import request from 'supertest';
import { criarAplicacao } from '../src/aplicacao';
import { gerarTokenDev } from '../src/auth/verificador-dev';
import { criarConexao } from '../src/banco/conexao';
import { MIGRACOES } from '../src/banco/migracoes';
import { semearCatalogo, semearDemonstracao, semearReferencia } from '../src/banco/semear';
import type { Banco } from '../src/banco/banco.module';
import { lerConfig } from '../src/config';
import { Migrator } from 'kysely';

/**
 * Testes de ponta a ponta contra um PostgreSQL de verdade.
 * Usa TESTE_DATABASE_URL (o banco é recriado do zero a cada execução).
 */
const URL = process.env.TESTE_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/importfacil_teste';
const SEGREDO = 'segredo-dos-testes';
const config = lerConfig({ AMBIENTE: 'teste', DATABASE_URL: URL, AUTH_SEGREDO_DEV: SEGREDO, LIMITE_REQ_MINUTO: '10000' });

let app: INestApplication;
let db: Banco;
const token = (email: string, origem: 'cliente' | 'equipe') => gerarTokenDev(SEGREDO, `dev-${email}`, origem);
const COOP = 'compras@coop-demo.com.br';
const HOSP = 'compras@hospital-demo.com.br';
const ADMIN = 'admin@importfacil.dev';
let api: () => ReturnType<typeof request>;
const como = async (email: string, origem: 'cliente' | 'equipe') => `Bearer ${await token(email, origem)}`;

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
});

afterAll(async () => {
  await app?.close();
  await db?.destroy();
});

describe('acesso', () => {
  it('saúde é pública', async () => {
    const r = await api().get('/saude').expect(200);
    expect(r.body).toMatchObject({ status: 'ok', banco: 'ok' });
  });

  it('sem login, recusa', async () => {
    await api().get('/eu').expect(401);
  });

  it('token inválido, recusa', async () => {
    await api().get('/eu').set('Authorization', 'Bearer abc.def.ghi').expect(401);
  });

  it('login válido de alguém que não está cadastrado, recusa', async () => {
    await api().get('/eu').set('Authorization', await como('estranho@x.com', 'cliente')).expect(403);
  });

  it('token de cliente com o identificador de um usuário da equipe não entra no Painel', async () => {
    // mesmo sub, origem trocada: o usuário é procurado pela origem também
    await api().get('/equipe/empresas').set('Authorization', await como(ADMIN, 'cliente')).expect(403);
  });

  it('cliente não acessa rotas da equipe', async () => {
    await api().get('/equipe/empresas').set('Authorization', await como(COOP, 'cliente')).expect(403);
  });

  it('cliente vê os próprios dados e a própria empresa', async () => {
    const r = await api().get('/eu').set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(r.body.usuario).toMatchObject({ email: COOP, papel: 'aprovador', origem: 'cliente' });
    expect(r.body.empresa).toMatchObject({ razao_social: 'Cooperativa Agro Sorriso', tipo_cliente: 'cooperativa' });
  });

  it('campos desconhecidos no corpo são recusados', async () => {
    await api().post('/catalogo/cotacao').set('Authorization', await como(COOP, 'cliente'))
      .send({ itens: [{ produto_id: 1, quantidade: 1 }], hack: true }).expect(400);
  });
});

describe('catálogo e preços por tipo de cliente', () => {
  it('cooperativa vê as categorias dela e a de segurança, mas não as da distribuidora', async () => {
    const r = await api().get('/catalogo/categorias').set('Authorization', await como(COOP, 'cliente')).expect(200);
    const ids = r.body.map((c: { id: string }) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['maquinario', 'seguranca']));
    expect(ids).not.toContain('d-ferr');
  });

  it('preço com o desconto do tipo (cooperativa 18%) e pedido mínimo', async () => {
    const r = await api().get('/catalogo/produtos?busca=MQ-2018').set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(r.body.itens).toHaveLength(1);
    expect(r.body.itens[0]).toMatchObject({ codigo: 'MQ-2018', preco_tabela_centavos: 18_900_000, preco_cliente_centavos: 15_498_000 });
    expect(r.body.pedido_minimo_centavos).toBe(2_500_000);
  });

  it('busca sem acento e por trecho', async () => {
    const r = await api().get('/catalogo/produtos?busca=pivo').set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(r.body.itens.map((p: { nome: string }) => p.nome)).toEqual(expect.arrayContaining([expect.stringContaining('Pivô')]));
  });

  it('hospital não enxerga produto de categoria exclusiva da cooperativa', async () => {
    const lista = await api().get('/catalogo/produtos?busca=MQ-2018').set('Authorization', await como(HOSP, 'cliente')).expect(200);
    expect(lista.body.itens).toHaveLength(0);
    const p = await db.selectFrom('produtos').select('id').where('codigo', '=', 'MQ-2018').executeTakeFirstOrThrow();
    await api().get(`/catalogo/produtos/${p.id}`).set('Authorization', await como(HOSP, 'cliente')).expect(404);
  });

  it('cliente não consegue escolher outro tipo de cliente para ver preços', async () => {
    const r = await api().get('/catalogo/produtos?busca=MQ-2018&tipo_cliente=hospital').set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(r.body.itens[0].tipo_cliente_preco).toBe('cooperativa');
  });

  it('cotação confere múltiplo de venda e pedido mínimo', async () => {
    const filtro = await db.selectFrom('produtos').select(['id', 'multiplo_venda']).where('codigo', '=', 'PC-FO12').executeTakeFirstOrThrow();
    const r = await api().post('/catalogo/cotacao').set('Authorization', await como(COOP, 'cliente'))
      .send({ itens: [{ produto_id: filtro.id, quantidade: 10 }] }).expect(200);
    expect(r.body.itens[0].problema).toBe('fora_do_multiplo');
    expect(r.body.pode_fechar).toBe(false);

    const ok = await api().post('/catalogo/cotacao').set('Authorization', await como(COOP, 'cliente'))
      .send({ itens: [{ produto_id: filtro.id, quantidade: 12 }] }).expect(200);
    expect(ok.body.itens[0]).toMatchObject({ problema: null, preco_unitario_centavos: 5650, total_centavos: 67_800 });
    expect(ok.body).toMatchObject({ atinge_pedido_minimo: false, falta_para_minimo_centavos: 2_500_000 - 67_800 });
  });

  it('cotação recusa produto que o cliente não pode comprar', async () => {
    const p = await db.selectFrom('produtos').select('id').where('codigo', '=', 'MQ-2018').executeTakeFirstOrThrow();
    await api().post('/catalogo/cotacao').set('Authorization', await como(HOSP, 'cliente'))
      .send({ itens: [{ produto_id: p.id, quantidade: 1 }] }).expect(400);
  });
});

describe('Painel da equipe', () => {
  let empresaId: string;

  it('recusa CNPJ inválido', async () => {
    await api().post('/equipe/empresas').set('Authorization', await como(ADMIN, 'equipe'))
      .send({ cnpj: '11.222.333/0001-82', razao_social: 'Teste', tipo_cliente: 'revendedor' }).expect(400);
  });

  it('cadastra empresa com CNPJ alfanumérico e registra na auditoria', async () => {
    const r = await api().post('/equipe/empresas').set('Authorization', await como(ADMIN, 'equipe'))
      .send({ cnpj: '12.ABC.345/01DE-35', razao_social: 'Revenda Nova Ltda', tipo_cliente: 'revendedor' }).expect(201);
    empresaId = r.body.id;
    expect(r.body).toMatchObject({ cnpj: '12ABC34501DE35', situacao: 'ativa' });
    const a = await db.selectFrom('auditoria').selectAll().where('entidade', '=', 'empresa').where('entidade_id', '=', empresaId).execute();
    expect(a.map((x) => x.acao)).toContain('empresa.criar');
  });

  it('não aceita CNPJ repetido', async () => {
    await api().post('/equipe/empresas').set('Authorization', await como(ADMIN, 'equipe'))
      .send({ cnpj: '12ABC34501DE35', razao_social: 'Outra', tipo_cliente: 'revendedor' }).expect(409);
  });

  it('busca empresa por trecho do CNPJ', async () => {
    const r = await api().get('/equipe/empresas?busca=ABC345').set('Authorization', await como(ADMIN, 'equipe')).expect(200);
    expect(r.body.itens.map((e: { id: string }) => e.id)).toContain(empresaId);
  });

  it('convida o usuário da empresa, que passa a entrar com o próprio login', async () => {
    await api().post(`/equipe/empresas/${empresaId}/usuarios`).set('Authorization', await como(ADMIN, 'equipe'))
      .send({ nome: 'Ana Compras', email: 'Ana@RevendaNova.com.br', papel: 'aprovador' }).expect(201);
    const r = await api().get('/eu').set('Authorization', await como('ana@revendanova.com.br', 'cliente')).expect(200);
    expect(r.body.empresa.id).toBe(empresaId);
  });

  it('aprovador de uma empresa não altera usuário de outra', async () => {
    const outro = await db.selectFrom('usuarios').select('id').where('email', '=', COOP).executeTakeFirstOrThrow();
    await api().patch(`/empresa/usuarios/${outro.id}`).set('Authorization', await como('ana@revendanova.com.br', 'cliente'))
      .send({ ativo: false }).expect(404);
  });

  it('financeiro não muda tabela de preço; administrador muda, com antes e depois na auditoria', async () => {
    await api().post('/equipe/usuarios').set('Authorization', await como(ADMIN, 'equipe'))
      .send({ nome: 'Fábio Financeiro', email: 'fin@importfacil.dev', papel: 'financeiro' }).expect(201);
    await api().put('/equipe/tabelas-preco/cooperativa').set('Authorization', await como('fin@importfacil.dev', 'equipe'))
      .send({ desconto_bp: 2500 }).expect(403);

    await api().put('/equipe/tabelas-preco/cooperativa').set('Authorization', await como(ADMIN, 'equipe'))
      .send({ desconto_bp: 2000 }).expect(200);
    const r = await api().get('/catalogo/produtos?busca=MQ-2018').set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(r.body.itens[0].preco_cliente_centavos).toBe(15_120_000);
    const a = await db.selectFrom('auditoria').select(['antes', 'depois']).where('acao', '=', 'tabela_preco.alterar').executeTakeFirstOrThrow();
    expect(a.antes).toMatchObject({ desconto_bp: 1800 });
    expect(a.depois).toMatchObject({ desconto_bp: 2000 });
  });

  it('equipe simula preço de qualquer tipo de cliente', async () => {
    const r = await api().get('/catalogo/produtos?busca=MQ-2018&tipo_cliente=hospital').set('Authorization', await como(ADMIN, 'equipe')).expect(200);
    expect(r.body.itens[0]).toMatchObject({ tipo_cliente_preco: 'hospital', preco_cliente_centavos: 14_742_000 });
  });

  it('produto tirado do catálogo some para o cliente, mas continua no banco', async () => {
    const p = await db.selectFrom('produtos').select('id').where('codigo', '=', 'PC-FO12').executeTakeFirstOrThrow();
    await api().patch(`/equipe/produtos/${p.id}`).set('Authorization', await como(ADMIN, 'equipe')).send({ ativo: false }).expect(200);
    await api().get(`/catalogo/produtos/${p.id}`).set('Authorization', await como(COOP, 'cliente')).expect(404);
    await api().get(`/catalogo/produtos/${p.id}`).set('Authorization', await como(ADMIN, 'equipe')).expect(200);
  });

  it('usuário desativado perde o acesso', async () => {
    const u = await db.selectFrom('usuarios').select('id').where('email', '=', 'ana@revendanova.com.br').executeTakeFirstOrThrow();
    await api().patch(`/equipe/empresas/${empresaId}/usuarios/${u.id}`).set('Authorization', await como(ADMIN, 'equipe')).send({ ativo: false }).expect(200);
    await api().get('/eu').set('Authorization', await como('ana@revendanova.com.br', 'cliente')).expect(403);
  });

  it('empresa inativa perde o acesso', async () => {
    const e = await db.selectFrom('empresas').select('id').where('cnpj', '=', '55666777000181').executeTakeFirstOrThrow();
    await api().patch(`/equipe/empresas/${e.id}`).set('Authorization', await como(ADMIN, 'equipe')).send({ situacao: 'inativa' }).expect(200);
    await api().get('/eu').set('Authorization', await como(HOSP, 'cliente')).expect(403);
  });

  it('administrador não desativa a própria conta', async () => {
    const u = await db.selectFrom('usuarios').select('id').where('email', '=', ADMIN).executeTakeFirstOrThrow();
    await api().patch(`/equipe/usuarios/${u.id}`).set('Authorization', await como(ADMIN, 'equipe')).send({ ativo: false }).expect(400);
  });

  it('somente o administrador lê a auditoria', async () => {
    await api().get('/equipe/auditoria').set('Authorization', await como('fin@importfacil.dev', 'equipe')).expect(403);
    const r = await api().get('/equipe/auditoria?entidade=empresa').set('Authorization', await como(ADMIN, 'equipe')).expect(200);
    expect(r.body.length).toBeGreaterThan(0);
  });
});
