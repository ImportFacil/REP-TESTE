import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

/**
 * Tipos das tabelas do banco (fase 1).
 *
 * Regras que valem para todas as tabelas (documento de arquitetura):
 * - dinheiro em centavos, como número inteiro;
 * - nada é apagado: registros são inativados (um gatilho no banco bloqueia DELETE);
 * - toda leitura de cliente é filtrada pela empresa do usuário.
 */

type Momento = ColumnType<Date, Date | string | undefined, Date | string>;
type Json<T> = ColumnType<T, string, string>;

export type TipoCliente = 'cooperativa' | 'distribuidora' | 'revendedor' | 'construtora' | 'hospital';
export type SituacaoEmpresa = 'ativa' | 'bloqueada' | 'inativa';
export type OrigemUsuario = 'cliente' | 'equipe';
export type PapelCliente = 'comprador' | 'aprovador';
export type PapelEquipe = 'comercial' | 'financeiro' | 'administrador';
export type Papel = PapelCliente | PapelEquipe;

export const PAPEIS_CLIENTE: PapelCliente[] = ['comprador', 'aprovador'];
export const PAPEIS_EQUIPE: PapelEquipe[] = ['comercial', 'financeiro', 'administrador'];

export interface Endereco {
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export interface Especificacao {
  nome: string;
  valor: string;
}

export interface TabelasPrecoTabela {
  tipo_cliente: string;
  nome: string;
  /** Desconto sobre o preço de tabela, em pontos-base (1800 = 18%). */
  desconto_bp: number;
  pedido_minimo_centavos: number;
  ativo: Generated<boolean>;
  atualizado_em: Generated<Momento>;
}

export interface EmpresasTabela {
  id: Generated<string>;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  tipo_cliente: string;
  endereco: Json<Endereco> | null;
  situacao: Generated<SituacaoEmpresa>;
  criado_em: Generated<Momento>;
  atualizado_em: Generated<Momento>;
}

export interface UsuariosTabela {
  id: Generated<string>;
  origem: OrigemUsuario;
  empresa_id: string | null;
  nome: string;
  email: string;
  papel: Papel;
  cognito_sub: string | null;
  ativo: Generated<boolean>;
  criado_em: Generated<Momento>;
  ultimo_acesso_em: Momento | null;
}

export interface CategoriasTabela {
  id: string;
  nome: string;
  icone: string | null;
  /** Tipos de cliente que veem a categoria; null = todos. */
  tipos_cliente: string[] | null;
  ordem: number;
  ativo: Generated<boolean>;
}

export interface ProdutosTabela {
  id: Generated<number>;
  codigo: string;
  nome: string;
  marca: string | null;
  categoria_id: string;
  subcategoria: string | null;
  descricao: string | null;
  ncm: string | null;
  unidade: string;
  multiplo_venda: number;
  estoque: number;
  preco_tabela_centavos: number;
  sob_orcamento: Generated<boolean>;
  destaque: Generated<boolean>;
  importado: Generated<boolean>;
  especificacoes: Json<Especificacao[]>;
  ativo: Generated<boolean>;
  criado_em: Generated<Momento>;
  atualizado_em: Generated<Momento>;
}

export interface AuditoriaTabela {
  id: Generated<number>;
  usuario_id: string | null;
  acao: string;
  entidade: string;
  entidade_id: string;
  antes: Json<unknown> | null;
  depois: Json<unknown> | null;
  ip: string | null;
  criado_em: Generated<Momento>;
}

export interface Database {
  tabelas_preco: TabelasPrecoTabela;
  empresas: EmpresasTabela;
  usuarios: UsuariosTabela;
  categorias: CategoriasTabela;
  produtos: ProdutosTabela;
  auditoria: AuditoriaTabela;
}

export type TabelaPreco = Selectable<TabelasPrecoTabela>;
export type Empresa = Selectable<EmpresasTabela>;
export type NovaEmpresa = Insertable<EmpresasTabela>;
export type Usuario = Selectable<UsuariosTabela>;
export type NovoUsuario = Insertable<UsuariosTabela>;
export type Categoria = Selectable<CategoriasTabela>;
export type Produto = Selectable<ProdutosTabela>;
export type NovoProduto = Insertable<ProdutosTabela>;
export type AlteracaoProduto = Updateable<ProdutosTabela>;
