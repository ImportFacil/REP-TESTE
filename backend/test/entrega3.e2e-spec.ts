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

/** Painel no formato do Bagisto, entrega 3: promoções e cupons, newsletter, modelos de e-mail, avaliações, usuários e páginas. */

const URL = process.env.TESTE_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/exportfacil_teste';
const SEGREDO = 'segredo-dos-testes';
const config = lerConfig({
  AMBIENTE: 'teste', DATABASE_URL: URL, AUTH_SEGREDO_DEV: SEGREDO, LIMITE_REQ_MINUTO: '10000',
  PASTA_ARQUIVOS: mkdtempSync(join(tmpdir(), 'exportfacil-arquivos-')),
});

let app: INestApplication;
let db: Banco;
let api: () => ReturnType<typeof request>;
const COOP = 'compras@coop-demo.com.br';
const HOSP = 'compras@hospital-demo.com.br';
const ADMIN = 'admin@exportfacil.dev';
const FIN = 'financeiro@exportfacil.dev';
const COM = 'comercial@exportfacil.dev';
const como = async (email: string, origem: 'cliente' | 'equipe') => `Bearer ${await gerarTokenDev(SEGREDO, `dev-${email}`, origem)}`;
const produto = (codigo: string) => db.selectFrom('produtos').select(['id', 'estoque', 'multiplo_venda']).where('codigo', '=', codigo).executeTakeFirstOrThrow();

let maquina: { id: number; multiplo_venda: number };
let epi: { id: number; multiplo_venda: number };

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
  epi = await db.selectFrom('produtos').select(['id', 'multiplo_venda']).where('categoria_id', '=', 'epis').where('sob_orcamento', '=', false)
    .where('ativo', '=', true).where(sql<boolean>`estoque >= multiplo_venda * 4`).orderBy('id').executeTakeFirstOrThrow();
});

afterAll(async () => {
  await app?.close();
  await db?.destroy();
});

const itens = () => [{ produto_id: maquina.id, quantidade: 2 }, { produto_id: epi.id, quantidade: epi.multiplo_venda }];

describe('promoções e cupons', () => {
  let pedidoCupom: number;

  it('só comercial e administrador criam; cupom repetido não passa', async () => {
    const auto = { nome: 'Semana do EPI', tipo_desconto: 'percentual', desconto_bp: 1000, categorias: ['epis'], tipos_cliente: ['cooperativa'] };
    await api().post('/equipe/marketing/promocoes').set('Authorization', await como(FIN, 'equipe')).send(auto).expect(403);
    await api().post('/equipe/marketing/promocoes').set('Authorization', await como(COM, 'equipe')).send({ ...auto, desconto_bp: undefined }).expect(400);
    await api().post('/equipe/marketing/promocoes').set('Authorization', await como(COM, 'equipe')).send(auto).expect(201);
    const cupom = { nome: 'Boas-vindas', cupom: ' bemvindo ', tipo_desconto: 'valor_fixo', desconto_centavos: 15_000, subtotal_minimo_centavos: 100_000, limite_por_empresa: 1 };
    const r = await api().post('/equipe/marketing/promocoes').set('Authorization', await como(COM, 'equipe')).send(cupom).expect(201);
    expect(r.body.cupom).toBe('BEMVINDO');
    await api().post('/equipe/marketing/promocoes').set('Authorization', await como(COM, 'equipe')).send({ ...cupom, nome: 'Outra' }).expect(409);
  });

  it('a cotação aplica a automática sozinha e o cupom quando informado', async () => {
    const auto = await api().post('/catalogo/cotacao').set('Authorization', await como(COOP, 'cliente')).send({ itens: itens() }).expect(200);
    const valorEpi = auto.body.itens.find((i: { produto_id: number }) => i.produto_id === epi.id).total_centavos;
    expect(auto.body.promocao).toMatchObject({ nome: 'Semana do EPI', cupom: null, desconto_centavos: Math.floor((valorEpi * 1000 + 5000) / 10000) });
    expect(auto.body.total_com_promocao_centavos).toBe(auto.body.subtotal_centavos - auto.body.promocao.desconto_centavos);

    const comCupom = await api().post('/catalogo/cotacao').set('Authorization', await como(COOP, 'cliente')).send({ itens: itens(), cupom: 'BemVindo' }).expect(200);
    expect(comCupom.body.promocao).toMatchObject({ cupom: 'BEMVINDO', desconto_centavos: 15_000 });
    expect(comCupom.body.cupom_erro).toBeNull();

    const errado = await api().post('/catalogo/cotacao').set('Authorization', await como(COOP, 'cliente')).send({ itens: itens(), cupom: 'NAOEXISTE' }).expect(200);
    expect(errado.body.cupom_erro).toBe('Cupom não encontrado.');
    expect(errado.body.promocao.nome).toBe('Semana do EPI');
  });

  it('o pedido grava a promoção e calcula o Pix sobre o valor já com o cupom', async () => {
    await api().post('/pedidos').set('Authorization', await como(COOP, 'cliente')).send({ itens: itens(), forma_pagamento: 'pix', cupom: 'NAOEXISTE' }).expect(400);
    const cot = await api().post('/catalogo/cotacao').set('Authorization', await como(COOP, 'cliente')).send({ itens: itens(), cupom: 'BEMVINDO' }).expect(200);
    const cond = await api().get(`/pedidos/condicoes?subtotal_centavos=${cot.body.total_com_promocao_centavos}`).set('Authorization', await como(COOP, 'cliente')).expect(200);
    const r = await api().post('/pedidos').set('Authorization', await como(COOP, 'cliente')).send({ itens: itens(), forma_pagamento: 'pix', cupom: 'bemvindo' }).expect(201);
    pedidoCupom = r.body.id;
    expect(r.body).toMatchObject({ cupom: 'BEMVINDO', promocao_centavos: 15_000, subtotal_centavos: cot.body.subtotal_centavos, total_centavos: cond.body.pix.total_centavos });
    expect(r.body.eventos[0].descricao).toContain('com a promoção Boas-vindas');
    await api().post(`/equipe/simulador/parcelas/${r.body.cobrancas[0].parcelas[0].id}/confirmar`).set('Authorization', await como(ADMIN, 'equipe')).expect(200);
  });

  it('limite por empresa: o mesmo cupom não vale de novo; a lista mostra usos e total descontado', async () => {
    const r = await api().post('/pedidos').set('Authorization', await como(COOP, 'cliente')).send({ itens: itens(), forma_pagamento: 'pix', cupom: 'BEMVINDO' }).expect(400);
    expect(r.body.message).toMatch(/já usou/);
    const lista = await api().get('/equipe/marketing/promocoes').set('Authorization', await como(FIN, 'equipe')).expect(200);
    expect(lista.body.find((p: { cupom: string | null }) => p.cupom === 'BEMVINDO')).toMatchObject({ usos: 1, descontado_centavos: 15_000 });
  });

  it('promoção desativada some da cotação', async () => {
    const lista = await api().get('/equipe/marketing/promocoes').set('Authorization', await como(COM, 'equipe')).expect(200);
    const auto = lista.body.find((p: { nome: string }) => p.nome === 'Semana do EPI');
    await api().patch(`/equipe/marketing/promocoes/${auto.id}`).set('Authorization', await como(COM, 'equipe')).send({ ativo: false }).expect(200);
    const cot = await api().post('/catalogo/cotacao').set('Authorization', await como(COOP, 'cliente')).send({ itens: itens() }).expect(200);
    expect(cot.body.promocao).toBeNull();
  });

  it('o envio do pedido gera o aviso "Pedido enviado" com o assunto montado', async () => {
    await api().post(`/equipe/pedidos/${pedidoCupom}/avancar`).set('Authorization', await como(COM, 'equipe')).expect(200);
    await api().post(`/equipe/vendas/pedidos/${pedidoCupom}/envio`).set('Authorization', await como(COM, 'equipe')).send({ transportadora: 'Jadlog', codigo_rastreio: 'JD9BR' }).expect(201);
    const caixa = await api().get('/equipe/marketing/caixa-de-saida').set('Authorization', await como(COM, 'equipe')).expect(200);
    const aviso = caixa.body.find((a: { modelo: string }) => a.modelo === 'pedido_enviado');
    expect(aviso).toMatchObject({ destinatario: COOP, assunto: `Pedido ${pedidoCupom} enviado por Jadlog`, situacao: 'pendente' });
    expect(aviso.corpo).toContain('Código de rastreio: JD9BR');
  });
});

describe('newsletter e modelos de e-mail', () => {
  it('inscrição aberta, sem login; repetir não duplica nem reenvia as boas-vindas', async () => {
    expect((await api().post('/newsletter').send({ email: 'Compras@Exemplo.com.br', nome: 'Ana' }).expect(200)).body).toEqual({ inscrito: true, novo: true });
    expect((await api().post('/newsletter').send({ email: 'compras@exemplo.com.br' }).expect(200)).body).toEqual({ inscrito: true, novo: false });
    await api().post('/newsletter').send({ email: 'não é e-mail' }).expect(400);
    const avisos = await db.selectFrom('notificacoes').select('destinatario').where('modelo', '=', 'newsletter_boas_vindas').execute();
    expect(avisos.map((a) => a.destinatario)).toEqual(['compras@exemplo.com.br']);
  });

  it('sair pelo link do e-mail; a equipe vê a inscrição cancelada', async () => {
    const { token } = await db.selectFrom('newsletter_inscritos').select('token').where('email', '=', 'compras@exemplo.com.br').executeTakeFirstOrThrow();
    await api().post('/newsletter/sair').send({ token }).expect(200);
    await api().post('/newsletter/sair').send({ token: '00000000-0000-4000-8000-000000000000' }).expect(404);
    const lista = await api().get('/equipe/marketing/newsletter').set('Authorization', await como(FIN, 'equipe')).expect(200);
    expect(lista.body[0]).toMatchObject({ email: 'compras@exemplo.com.br', ativo: false, origem: 'loja' });
  });

  it('modelo confere as variáveis, mostra a prévia e, desativado, deixa de gerar avisos', async () => {
    await api().patch('/equipe/marketing/modelos/vence_hoje').set('Authorization', await como(COM, 'equipe')).send({ assunto: 'Vence hoje: {{pedidoo}}' }).expect(400);
    await api().patch('/equipe/marketing/modelos/vence_hoje').set('Authorization', await como(COM, 'equipe')).send({ assunto: 'Atenção: o pedido {{pedido}} vence hoje' }).expect(200);
    const previa = await api().post('/equipe/marketing/modelos/vence_hoje/previa').set('Authorization', await como(FIN, 'equipe')).send({}).expect(200);
    expect(previa.body.assunto).toBe('Atenção: o pedido 10042 vence hoje');
    await api().patch('/equipe/marketing/modelos/newsletter_boas_vindas').set('Authorization', await como(COM, 'equipe')).send({ ativo: false }).expect(200);
    await api().post('/equipe/marketing/newsletter').set('Authorization', await como(COM, 'equipe')).send({ email: 'outra@exemplo.com.br' }).expect(201);
    const avisos = await db.selectFrom('notificacoes').select('destinatario').where('modelo', '=', 'newsletter_boas_vindas').execute();
    expect(avisos).toHaveLength(1);
  });
});

describe('avaliações de produtos', () => {
  let avaliacao: number;

  it('cliente avalia uma vez; compra verificada quando a empresa comprou; fica pendente', async () => {
    const r = await api().post(`/catalogo/produtos/${maquina.id}/avaliacoes`).set('Authorization', await como(COOP, 'cliente'))
      .send({ nota: 5, titulo: 'Ótima máquina', comentario: 'Chegou bem embalada e funciona perfeitamente.' }).expect(201);
    avaliacao = r.body.id;
    expect(r.body).toMatchObject({ situacao: 'pendente', compra_verificada: true });
    await api().post(`/catalogo/produtos/${maquina.id}/avaliacoes`).set('Authorization', await como(COOP, 'cliente'))
      .send({ nota: 4, titulo: 'De novo', comentario: 'Tentando avaliar outra vez.' }).expect(409);
    const loja = await api().get(`/catalogo/produtos/${maquina.id}/avaliacoes`).set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(loja.body).toMatchObject({ total: 0, media: null, minha: { situacao: 'pendente' } });
  });

  it('produto fora do catálogo do cliente não pode ser avaliado; equipe não avalia', async () => {
    await api().post(`/catalogo/produtos/${maquina.id}/avaliacoes`).set('Authorization', await como(HOSP, 'cliente'))
      .send({ nota: 1, titulo: 'Não vejo', comentario: 'Produto de outro catálogo.' }).expect(404);
    await api().post(`/catalogo/produtos/${maquina.id}/avaliacoes`).set('Authorization', await como(COM, 'equipe'))
      .send({ nota: 1, titulo: 'Equipe', comentario: 'A equipe não avalia.' }).expect(403);
  });

  it('moderação: recusa exige motivo; aprovada aparece na loja com o nome curto', async () => {
    await api().post(`/equipe/clientes/avaliacoes/${avaliacao}/moderar`).set('Authorization', await como(FIN, 'equipe')).send({ situacao: 'aprovada' }).expect(403);
    await api().post(`/equipe/clientes/avaliacoes/${avaliacao}/moderar`).set('Authorization', await como(COM, 'equipe')).send({ situacao: 'recusada' }).expect(400);
    await api().post(`/equipe/clientes/avaliacoes/${avaliacao}/moderar`).set('Authorization', await como(COM, 'equipe')).send({ situacao: 'aprovada' }).expect(200);
    const loja = await api().get(`/catalogo/produtos/${maquina.id}/avaliacoes`).set('Authorization', await como(COOP, 'cliente')).expect(200);
    expect(loja.body).toMatchObject({ total: 1, media: 5, distribuicao: [0, 0, 0, 0, 1] });
    expect(loja.body.avaliacoes[0].autor).toMatch(/^\S+( \S\.)?$/);
    const painel = await api().get('/equipe/clientes/avaliacoes').set('Authorization', await como(FIN, 'equipe')).expect(200);
    expect(painel.body[0]).toMatchObject({ situacao: 'aprovada', codigo: 'MQ-EN01', moderada_por: 'comercial' });
  });
});

describe('usuários dos clientes', () => {
  it('lista os usuários de todas as empresas, com pedidos e newsletter', async () => {
    await api().get('/equipe/clientes/usuarios').set('Authorization', await como(COOP, 'cliente')).expect(403);
    const r = await api().get('/equipe/clientes/usuarios').set('Authorization', await como(FIN, 'equipe')).expect(200);
    expect(r.body.every((u: { email: string }) => !u.email.endsWith('@exportfacil.dev'))).toBe(true);
    expect(r.body.find((u: { email: string }) => u.email === COOP)).toMatchObject({ razao_social: 'Cooperativa Agro Sorriso', pedidos: 1, newsletter: false });
  });
});

describe('páginas de conteúdo', () => {
  it('as páginas publicadas são abertas, sem login', async () => {
    const r = await api().get('/conteudo/paginas').expect(200);
    expect(r.body.map((p: { slug: string }) => p.slug)).toEqual(['sobre', 'entrega-e-frete', 'trocas-e-devolucoes', 'pagamentos-e-credito', 'politica-de-privacidade', 'perguntas-frequentes']);
    expect((await api().get('/conteudo/paginas/sobre').expect(200)).body.conteudo).toContain('## O que fazemos');
  });

  it('página nova nasce como rascunho; publicada, aparece; endereço repetido não passa', async () => {
    await api().post('/equipe/conteudo/paginas').set('Authorization', await como(FIN, 'equipe')).send({ titulo: 'Trabalhe conosco', conteudo: 'Vagas.' }).expect(403);
    const p = await api().post('/equipe/conteudo/paginas').set('Authorization', await como(COM, 'equipe')).send({ titulo: 'Trabalhe Conosco!', conteudo: '## Vagas\nEnvie o currículo.' }).expect(201);
    expect(p.body).toMatchObject({ slug: 'trabalhe-conosco', publicada: false });
    await api().get('/conteudo/paginas/trabalhe-conosco').expect(404);
    await api().patch(`/equipe/conteudo/paginas/${p.body.id}`).set('Authorization', await como(COM, 'equipe')).send({ publicada: true }).expect(200);
    await api().get('/conteudo/paginas/trabalhe-conosco').expect(200);
    await api().post('/equipe/conteudo/paginas').set('Authorization', await como(COM, 'equipe')).send({ titulo: 'Trabalhe conosco', conteudo: 'x' }).expect(409);
  });
});
