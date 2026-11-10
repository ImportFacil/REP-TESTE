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
/** Atualização de jsonb feita com sql`...` (ex.: atributos || {…}). */
type RawBuilderJson = import('kysely').RawBuilder<unknown>;

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
  conta_e_ordem_liberada: Generated<boolean>;
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
  familia_id: number | null;
  /** Valores dos atributos da família ({ codigo: valor }). */
  atributos: ColumnType<Record<string, string>, string | undefined, string | RawBuilderJson>;
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

// ---------------- fase 2 ----------------

export type FormaPagamento = 'pix' | 'boleto' | 'cartao';
export type SituacaoPedido = 'novo' | 'em_separacao' | 'enviado' | 'entregue' | 'cancelado';
export type SituacaoPagamentoPedido =
  | 'aguardando_pagamento' | 'pix_expirado' | 'aguardando_faturamento' | 'em_aberto' | 'pago' | 'estornado' | 'cancelado';
export type SituacaoCadastro = 'rascunho' | 'em_analise' | 'pendente_documentos' | 'aprovado' | 'reprovado';
export type Faixa = 'A' | 'B' | 'C';
export type Modalidade = 'encomenda' | 'conta_e_ordem';
export type EtapaNumerario = 'cambio' | 'tributos' | 'despesas_finais';

export interface PoliticasPagamentoTabela {
  id: Generated<number>;
  pix_desconto_bp: number;
  pix_validade_horas: number;
  boleto_max_parcelas: number;
  cartao_max_parcelas: number;
  cartao_sem_juros_ate: number;
  cartao_juros_am_bp: number;
  multa_atraso_bp: number;
  juros_atraso_am_bp: number;
  atraso_bloqueio_dias: number;
  cliente_grande_mensal_centavos: number;
  criado_por: string | null;
  criado_em: Generated<Momento>;
}

export interface CadastrosCreditoTabela {
  empresa_id: string;
  situacao: Generated<SituacaoCadastro>;
  faturamento_mensal_centavos: number | null;
  compras_mensais_previstas_centavos: number | null;
  limite_solicitado_centavos: number | null;
  anos_cnpj: number | null;
  dados: Generated<Json<Record<string, unknown>>>;
  faixa: Faixa | null;
  limite_aprovado_centavos: Generated<number>;
  parecer: string | null;
  analista_id: string | null;
  enviado_em: Momento | null;
  decidido_em: Momento | null;
  proxima_revisao_em: ColumnType<string | null, string | null | undefined, string | null>;
  atualizado_em: Generated<Momento>;
}

export interface LimitesCreditoTabela {
  id: Generated<number>;
  empresa_id: string;
  faixa: Faixa;
  valor_centavos: number;
  aprovado_por: string;
  motivo: string | null;
  criado_em: Generated<Momento>;
}

export interface DocumentosTabela {
  id: Generated<string>;
  empresa_id: string;
  dono: 'cadastro' | 'ordem';
  dono_id: string;
  tipo: string;
  nome_arquivo: string;
  tipo_conteudo: string;
  tamanho_bytes: number;
  chave: string;
  sha256: string;
  enviado_por: string;
  substituido: Generated<boolean>;
  criado_em: Generated<Momento>;
}

export interface PedidosTabela {
  id: Generated<number>;
  empresa_id: string;
  comprador_id: string;
  tipo_cliente: string;
  forma_pagamento: FormaPagamento;
  parcelas: number;
  subtotal_centavos: number;
  desconto_centavos: Generated<number>;
  juros_centavos: Generated<number>;
  total_centavos: number;
  situacao: Generated<SituacaoPedido>;
  situacao_pagamento: SituacaoPagamentoPedido;
  politica_id: number;
  endereco_entrega: Json<Endereco> | null;
  observacao: string | null;
  faturado_em: Momento | null;
  promocao_id: number | null;
  cupom: string | null;
  promocao_centavos: Generated<number>;
  criado_em: Generated<Momento>;
  atualizado_em: Generated<Momento>;
}

export interface PedidoItensTabela {
  id: Generated<number>;
  pedido_id: number;
  produto_id: number;
  codigo: string;
  nome: string;
  unidade: string;
  quantidade: number;
  preco_tabela_centavos: number;
  preco_unitario_centavos: number;
  total_centavos: number;
}

export interface PedidoEventosTabela {
  id: Generated<number>;
  pedido_id: number;
  tipo: string;
  descricao: string;
  usuario_id: string | null;
  criado_em: Generated<Momento>;
}

export interface OrcamentosTabela {
  id: Generated<number>;
  empresa_id: string;
  solicitante_id: string;
  modalidade: Modalidade;
  situacao: Generated<'solicitado' | 'enviado' | 'aceito' | 'recusado' | 'expirado' | 'cancelado'>;
  observacao: string | null;
  frete_centavos: number | null;
  taxa_servico_bp: number | null;
  total_centavos: number | null;
  condicao: string | null;
  prazo_entrega_dias: number | null;
  valido_ate: ColumnType<string | null, string | null | undefined, string | null>;
  respondido_por: string | null;
  respondido_em: Momento | null;
  decidido_em: Momento | null;
  criado_em: Generated<Momento>;
}

export interface OrcamentoItensTabela {
  id: Generated<number>;
  orcamento_id: number;
  produto_id: number | null;
  descricao: string;
  unidade: Generated<string>;
  quantidade: number;
  preco_unitario_centavos: number | null;
}

export interface OrdensImportacaoTabela {
  id: Generated<number>;
  empresa_id: string;
  orcamento_id: number;
  modalidade: Modalidade;
  etapa: string;
  concluida: Generated<boolean>;
  cancelada: Generated<boolean>;
  criado_em: Generated<Momento>;
  atualizado_em: Generated<Momento>;
}

export interface OrdemEventosTabela {
  id: Generated<number>;
  ordem_id: number;
  etapa: string;
  descricao: string;
  usuario_id: string | null;
  criado_em: Generated<Momento>;
}

export interface NumerariosTabela {
  id: Generated<number>;
  ordem_id: number;
  etapa: EtapaNumerario;
  valor_previsto_centavos: number;
  valor_pago_centavos: Generated<number>;
  situacao: Generated<'aguardando' | 'pago' | 'cancelado'>;
  criado_por: string;
  criado_em: Generated<Momento>;
  pago_em: Momento | null;
}

export interface OrdemGastosTabela {
  id: Generated<number>;
  ordem_id: number;
  etapa: EtapaNumerario;
  descricao: string;
  valor_centavos: number;
  registrado_por: string;
  criado_em: Generated<Momento>;
}

export interface CobrancasTabela {
  id: Generated<number>;
  pedido_id: number | null;
  numerario_id: number | null;
  meio: FormaPagamento;
  valor_centavos: number;
  gateway: string;
  id_gateway: string | null;
  situacao: Generated<'pendente' | 'paga' | 'expirada' | 'cancelada' | 'estornada'>;
  expira_em: Momento | null;
  criado_em: Generated<Momento>;
}

export interface ParcelasTabela {
  id: Generated<number>;
  cobranca_id: number;
  numero: number;
  valor_centavos: number;
  vencimento: ColumnType<string, string, string>;
  situacao: Generated<'aberta' | 'vencida' | 'paga' | 'cancelada'>;
  id_gateway: string | null;
  linha_digitavel: string | null;
  pix_copia_cola: string | null;
  valor_pago_centavos: number | null;
  pago_em: Momento | null;
}

export interface PagamentosTabela {
  id: Generated<number>;
  parcela_id: number;
  valor_centavos: number;
  pago_em: Momento;
  meio: string;
  id_evento_gateway: string;
  criado_em: Generated<Momento>;
}

export interface EventosWebhookTabela {
  id: Generated<number>;
  origem: string;
  id_evento: string;
  tipo: string;
  conteudo: Json<unknown>;
  assinatura_valida: boolean;
  recebido_em: Generated<Momento>;
  processado_em: Momento | null;
  erro: string | null;
}

export interface NotificacoesTabela {
  id: Generated<number>;
  empresa_id: string | null;
  destinatario: string;
  canal: 'email' | 'whatsapp';
  modelo: string;
  chave: string;
  dados: Json<Record<string, unknown>>;
  situacao: Generated<'pendente' | 'enviada' | 'falhou'>;
  criado_em: Generated<Momento>;
  enviado_em: Momento | null;
}

export interface RotinasExecucoesTabela {
  nome: string;
  referencia: string;
  iniciado_em: Generated<Momento>;
  concluido_em: Momento | null;
  resultado: Json<unknown> | null;
}


export interface NotasFiscaisTabela {
  id: Generated<number>;
  pedido_id: number;
  numero: Generated<number>;
  serie: Generated<string>;
  chave: string;
  valor_centavos: number;
  situacao: Generated<'emitida' | 'cancelada'>;
  emitida_em: Generated<Momento>;
  emitida_por: string | null;
  cancelada_em: Momento | null;
  motivo_cancelamento: string | null;
  tributos_centavos: Generated<number>;
  tributos: ColumnType<Record<string, unknown>, string | undefined, string>;
}

export interface EnviosTabela {
  id: Generated<number>;
  pedido_id: number;
  transportadora: string;
  codigo_rastreio: string | null;
  volumes: Generated<number>;
  peso_kg: string | null;
  observacao: string | null;
  enviado_em: Generated<Momento>;
  entregue_em: Momento | null;
  criado_por: string | null;
}

export interface ReembolsosTabela {
  id: Generated<number>;
  pedido_id: number;
  valor_centavos: number;
  meio: 'pix' | 'estorno_cartao' | 'abatimento_boleto';
  motivo: string;
  devolver_estoque: Generated<boolean>;
  itens: Json<Array<{ produto_id: number; quantidade: number }>>;
  criado_em: Generated<Momento>;
  criado_por: string | null;
}

export type TipoAtributo = 'texto' | 'numero' | 'lista' | 'sim_nao';
export interface AtributosTabela {
  id: Generated<number>;
  codigo: string;
  nome: string;
  tipo: TipoAtributo;
  opcoes: Generated<string[]>;
  unidade: string | null;
  obrigatorio: Generated<boolean>;
  filtravel: Generated<boolean>;
  visivel_na_loja: Generated<boolean>;
  ordem: Generated<number>;
  ativo: Generated<boolean>;
  criado_em: Generated<Momento>;
}

export interface FamiliasAtributosTabela {
  id: Generated<number>;
  codigo: string;
  nome: string;
  ativo: Generated<boolean>;
  criado_em: Generated<Momento>;
}

export interface FamiliaAtributosTabela {
  familia_id: number;
  atributo_id: number;
  ordem: Generated<number>;
}

export interface AvaliacoesTabela {
  id: Generated<number>;
  produto_id: number;
  empresa_id: string;
  usuario_id: string;
  nota: number;
  titulo: string;
  comentario: string;
  compra_verificada: Generated<boolean>;
  situacao: Generated<'pendente' | 'aprovada' | 'recusada'>;
  motivo_recusa: string | null;
  moderada_por: string | null;
  moderada_em: Momento | null;
  criado_em: Generated<Momento>;
}

type Data = ColumnType<string, string, string>;

export interface PromocoesTabela {
  id: Generated<number>;
  nome: string;
  descricao: string | null;
  cupom: string | null;
  tipo_desconto: 'percentual' | 'valor_fixo';
  desconto_bp: number | null;
  desconto_centavos: number | null;
  tipos_cliente: string[] | null;
  categorias: string[] | null;
  subtotal_minimo_centavos: Generated<number>;
  inicio: Data | null;
  fim: Data | null;
  limite_usos: number | null;
  limite_por_empresa: number | null;
  ativo: Generated<boolean>;
  criado_em: Generated<Momento>;
  atualizado_em: Generated<Momento>;
}

export interface NewsletterInscritosTabela {
  id: Generated<number>;
  email: string;
  nome: string | null;
  empresa_id: string | null;
  origem: Generated<'loja' | 'painel' | 'cadastro'>;
  token: Generated<string>;
  ativo: Generated<boolean>;
  inscrito_em: Momento;
  cancelado_em: Momento | null;
}

export interface ModelosEmailTabela {
  codigo: string;
  nome: string;
  descricao: string;
  assunto: string;
  corpo: string;
  variaveis: Generated<string[]>;
  ativo: Generated<boolean>;
  atualizado_em: Generated<Momento>;
  atualizado_por: string | null;
}

export interface PaginasTabela {
  id: Generated<number>;
  slug: string;
  titulo: string;
  resumo: string | null;
  conteudo: string;
  publicada: Generated<boolean>;
  no_rodape: Generated<boolean>;
  ordem: Generated<number>;
  criado_em: Generated<Momento>;
  atualizado_em: Generated<Momento>;
  atualizado_por: string | null;
}

export interface RegrasImpostosTabela {
  id: Generated<number>;
  nome: string;
  ncm_prefixo: string | null;
  uf: string | null;
  origem: 'nacional' | 'importado' | null;
  aliquota_federal_bp: number;
  aliquota_estadual_bp: number;
  ativo: Generated<boolean>;
  criado_em: Generated<Momento>;
  atualizado_em: Generated<Momento>;
}

export interface LocaisEstoqueTabela {
  id: Generated<number>;
  codigo: string;
  nome: string;
  cidade: string;
  uf: string;
  prioridade: Generated<number>;
  ativo: Generated<boolean>;
  criado_em: Generated<Momento>;
}

export interface EstoqueLocaisTabela {
  produto_id: number;
  local_id: number;
  quantidade: Generated<number>;
}

export interface CotacoesCambioTabela {
  id: Generated<number>;
  moeda: 'USD' | 'EUR' | 'CNY';
  data: ColumnType<string, string, string>;
  taxa: ColumnType<number, number | string, number | string>;
  fonte: Generated<string>;
  criado_por: string | null;
  criado_em: Generated<Momento>;
}

export interface ImportacoesProdutosTabela {
  id: Generated<number>;
  arquivo: string;
  linhas: number;
  criados: number;
  alterados: number;
  com_erro: number;
  erros: Json<Array<{ linha: number; mensagens: string[] }>>;
  criado_por: string | null;
  criado_em: Generated<Momento>;
}

export interface FavoritosTabela {
  usuario_id: string;
  produto_id: number;
  criado_em: Generated<Momento>;
}

export interface EnderecosEntregaTabela {
  id: Generated<number>;
  empresa_id: string;
  apelido: string;
  endereco: Json<Endereco>;
  padrao: Generated<boolean>;
  ativo: Generated<boolean>;
  criado_por: string | null;
  criado_em: Generated<Momento>;
}

export interface ListasCompraTabela {
  id: Generated<number>;
  empresa_id: string;
  nome: string;
  ativo: Generated<boolean>;
  criado_por: string | null;
  criado_em: Generated<Momento>;
  atualizado_em: Momento;
}

export interface ListaItensTabela {
  lista_id: number;
  produto_id: number;
  quantidade: number;
}

export interface Database {
  tabelas_preco: TabelasPrecoTabela;
  empresas: EmpresasTabela;
  usuarios: UsuariosTabela;
  categorias: CategoriasTabela;
  produtos: ProdutosTabela;
  auditoria: AuditoriaTabela;
  politicas_pagamento: PoliticasPagamentoTabela;
  cadastros_credito: CadastrosCreditoTabela;
  limites_credito: LimitesCreditoTabela;
  documentos: DocumentosTabela;
  pedidos: PedidosTabela;
  pedido_itens: PedidoItensTabela;
  pedido_eventos: PedidoEventosTabela;
  orcamentos: OrcamentosTabela;
  orcamento_itens: OrcamentoItensTabela;
  ordens_importacao: OrdensImportacaoTabela;
  ordem_eventos: OrdemEventosTabela;
  numerarios: NumerariosTabela;
  ordem_gastos: OrdemGastosTabela;
  cobrancas: CobrancasTabela;
  parcelas: ParcelasTabela;
  pagamentos: PagamentosTabela;
  eventos_webhook: EventosWebhookTabela;
  notificacoes: NotificacoesTabela;
  rotinas_execucoes: RotinasExecucoesTabela;
  notas_fiscais: NotasFiscaisTabela;
  envios: EnviosTabela;
  reembolsos: ReembolsosTabela;
  atributos: AtributosTabela;
  familias_atributos: FamiliasAtributosTabela;
  familia_atributos: FamiliaAtributosTabela;
  avaliacoes: AvaliacoesTabela;
  promocoes: PromocoesTabela;
  newsletter_inscritos: NewsletterInscritosTabela;
  modelos_email: ModelosEmailTabela;
  paginas: PaginasTabela;
  regras_impostos: RegrasImpostosTabela;
  locais_estoque: LocaisEstoqueTabela;
  estoque_locais: EstoqueLocaisTabela;
  cotacoes_cambio: CotacoesCambioTabela;
  importacoes_produtos: ImportacoesProdutosTabela;
  favoritos: FavoritosTabela;
  enderecos_entrega: EnderecosEntregaTabela;
  listas_compra: ListasCompraTabela;
  lista_itens: ListaItensTabela;
}

export type Politica = Selectable<PoliticasPagamentoTabela>;
export type CadastroCredito = Selectable<CadastrosCreditoTabela>;
export type Pedido = Selectable<PedidosTabela>;
export type Cobranca = Selectable<CobrancasTabela>;
export type Parcela = Selectable<ParcelasTabela>;

export type TabelaPreco = Selectable<TabelasPrecoTabela>;
export type Empresa = Selectable<EmpresasTabela>;
export type NovaEmpresa = Insertable<EmpresasTabela>;
export type Usuario = Selectable<UsuariosTabela>;
export type NovoUsuario = Insertable<UsuariosTabela>;
export type Categoria = Selectable<CategoriasTabela>;
export type Produto = Selectable<ProdutosTabela>;
export type NovoProduto = Insertable<ProdutosTabela>;
export type AlteracaoProduto = Updateable<ProdutosTabela>;
