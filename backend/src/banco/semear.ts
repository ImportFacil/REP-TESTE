import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'kysely';
import { lerConfig } from '../config';
import { criarConexao } from './conexao';
import type { Banco } from './banco.module';

/**
 * Dados iniciais.
 *
 * - Tipos de cliente (tabelas de preço): em todos os ambientes, só se ainda não existirem,
 *   para nunca sobrescrever ajustes feitos pela equipe.
 * - Catálogo e empresas de demonstração: só fora de produção, ou com --catalogo.
 *
 * Uso: `node dist/banco/semear.js [--catalogo] [--demonstracao]`
 */
interface Arquivo {
  tipos_cliente: Array<{ codigo: string; nome: string; desconto_bp: number; pedido_minimo_centavos: number }>;
  categorias: Array<{ id: string; nome: string; icone: string | null; tipos_cliente: string[] | null; ordem: number }>;
  produtos: Array<{
    codigo: string; nome: string; marca: string | null; categoria_id: string; subcategoria: string | null;
    descricao: string | null; unidade: string; multiplo_venda: number; estoque: number;
    preco_tabela_centavos: number; sob_orcamento: boolean; destaque: boolean; importado: boolean;
    especificacoes: Array<{ nome: string; valor: string }>;
  }>;
}

export function lerCatalogo(): Arquivo {
  return JSON.parse(readFileSync(join(__dirname, 'dados', 'catalogo.json'), 'utf8')) as Arquivo;
}

export async function semearReferencia(db: Banco, dados = lerCatalogo()): Promise<void> {
  await db
    .insertInto('tabelas_preco')
    .values(dados.tipos_cliente.map((t) => ({
      tipo_cliente: t.codigo, nome: t.nome, desconto_bp: t.desconto_bp, pedido_minimo_centavos: t.pedido_minimo_centavos,
    })))
    .onConflict((oc) => oc.column('tipo_cliente').doNothing())
    .execute();
}

export async function semearCatalogo(db: Banco, dados = lerCatalogo()): Promise<void> {
  await db
    .insertInto('categorias')
    .values(dados.categorias.map((c) => ({ id: c.id, nome: c.nome, icone: c.icone, tipos_cliente: c.tipos_cliente, ordem: c.ordem })))
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();
  for (let i = 0; i < dados.produtos.length; i += 200) {
    await db
      .insertInto('produtos')
      .values(dados.produtos.slice(i, i + 200).map((p) => ({ ...p, especificacoes: JSON.stringify(p.especificacoes) })))
      .onConflict((oc) => oc.column('codigo').doNothing())
      .execute();
  }
}

/** Empresas e usuários fictícios, um por tipo de cliente, para testar com login de desenvolvimento. */
export const DEMONSTRACAO = [
  { tipo: 'cooperativa', razao: 'Cooperativa Agro Sorriso', cnpj: '11222333000181', email: 'compras@coop-demo.com.br' },
  { tipo: 'distribuidora', razao: 'Distribuidora Central Ltda', cnpj: '22333444000181', email: 'compras@distribuidora-demo.com.br' },
  { tipo: 'revendedor', razao: 'Revenda Ferramentas Ltda', cnpj: '33444555000181', email: 'compras@revenda-demo.com.br' },
  { tipo: 'construtora', razao: 'Construtora Horizonte Ltda', cnpj: '44555666000181', email: 'compras@construtora-demo.com.br' },
  { tipo: 'hospital', razao: 'Hospital Santa Clara', cnpj: '55666777000181', email: 'compras@hospital-demo.com.br' },
];

export async function semearDemonstracao(db: Banco): Promise<void> {
  for (const d of DEMONSTRACAO) {
    const empresa = await db
      .insertInto('empresas')
      .values({ cnpj: d.cnpj, razao_social: d.razao, nome_fantasia: null, tipo_cliente: d.tipo, endereco: null })
      .onConflict((oc) => oc.column('cnpj').doUpdateSet({ razao_social: d.razao }))
      .returning('id')
      .executeTakeFirstOrThrow();
    await db
      .insertInto('usuarios')
      .values({ origem: 'cliente', empresa_id: empresa.id, nome: `Compras ${d.razao}`, email: d.email, papel: 'aprovador', cognito_sub: `dev-${d.email}` })
      .onConflict((oc) => oc.columns(['origem', 'email']).doNothing())
      .execute();
  }
  await db
    .insertInto('usuarios')
    .values({ origem: 'equipe', empresa_id: null, nome: 'Administrador (demonstração)', email: 'admin@importfacil.dev', papel: 'administrador', cognito_sub: 'dev-admin@importfacil.dev' })
    .onConflict((oc) => oc.columns(['origem', 'email']).doNothing())
    .execute();
}

async function principal(): Promise<void> {
  const config = lerConfig();
  const args = new Set(process.argv.slice(2));
  const db = criarConexao(config.banco);
  try {
    const dados = lerCatalogo();
    await semearReferencia(db, dados);
    console.log(`Tipos de cliente: ${dados.tipos_cliente.length}`);
    if (config.ambiente !== 'prod' || args.has('--catalogo')) {
      await semearCatalogo(db, dados);
      console.log(`Catálogo: ${dados.categorias.length} categorias, ${dados.produtos.length} produtos`);
    }
    if (args.has('--demonstracao')) {
      if (config.ambiente === 'prod') throw new Error('Dados de demonstração não entram em produção.');
      await semearDemonstracao(db);
      console.log(`Demonstração: ${DEMONSTRACAO.length} empresas e 1 administrador`);
    }
    const { count } = await db.selectFrom('produtos').select(sql<number>`count(*)::int`.as('count')).executeTakeFirstOrThrow();
    console.log(`Produtos no banco: ${count}`);
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  principal().catch((e) => {
    console.error('Falha ao semear:', e);
    process.exit(1);
  });
}
