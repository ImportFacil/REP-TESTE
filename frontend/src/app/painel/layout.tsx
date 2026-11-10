'use client';
import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import type { ItemPainel } from '@/components/painel/PainelLayout';

const FIN = ['financeiro', 'administrador'];
const ADM = ['administrador'];

/** Menu do Painel da equipe, no formato do Bagisto: um item por área, com as páginas dentro. */
const MENU: ItemPainel[] = [
  { href: '/painel/', rotulo: 'Painel de controle', icone: 'painel' },
  { href: '/painel/vendas', rotulo: 'Vendas', icone: 'vendas', filhos: [
    { href: '/painel/pedidos/', rotulo: 'Pedidos' },
    { href: '/painel/pedido/', rotulo: 'Pedido', oculto: true },
    { href: '/painel/notas/', rotulo: 'Notas fiscais' },
    { href: '/painel/envios/', rotulo: 'Envios' },
    { href: '/painel/reembolsos/', rotulo: 'Reembolsos' },
    { href: '/painel/cotacoes/', rotulo: 'Cotações de preço' },
    { href: '/painel/cotacao/', rotulo: 'Cotação', oculto: true },
    { href: '/painel/transacoes/', rotulo: 'Transações', papeis: FIN },
  ] },
  { href: '/painel/catalogo', rotulo: 'Catálogo', icone: 'catalogo', filhos: [
    { href: '/painel/produtos/', rotulo: 'Produtos' },
    { href: '/painel/produto/', rotulo: 'Produto', oculto: true },
    { href: '/painel/categorias/', rotulo: 'Categorias' },
    { href: '/painel/atributos/', rotulo: 'Atributos' },
    { href: '/painel/familias/', rotulo: 'Famílias de atributos' },
  ] },
  { href: '/painel/clientes', rotulo: 'Clientes', icone: 'clientes', filhos: [
    { href: '/painel/empresas/', rotulo: 'Empresas' },
    { href: '/painel/empresa/', rotulo: 'Empresa', oculto: true },
    { href: '/painel/analise/', rotulo: 'Análise de crédito', oculto: true },
    { href: '/painel/usuarios/', rotulo: 'Usuários' },
    { href: '/painel/precos/', rotulo: 'Grupos (tipos de cliente)' },
    { href: '/painel/avaliacoes/', rotulo: 'Avaliações' },
    { href: '/painel/credito/', rotulo: 'Crédito' },
  ] },
  { href: '/painel/marketing', rotulo: 'Marketing', icone: 'marketing', filhos: [
    { href: '/painel/promocoes/', rotulo: 'Promoções e cupons' },
    { href: '/painel/newsletter/', rotulo: 'Newsletter' },
    { href: '/painel/modelos/', rotulo: 'Modelos de e-mail' },
    { href: '/painel/modelo/', rotulo: 'Modelo', oculto: true },
    { href: '/painel/caixa-de-saida/', rotulo: 'Caixa de saída' },
  ] },
  { href: '/painel/conteudo', rotulo: 'Conteúdo', icone: 'conteudo', filhos: [
    { href: '/painel/paginas/', rotulo: 'Páginas' },
    { href: '/painel/pagina/', rotulo: 'Página', oculto: true },
  ] },
  { href: '/painel/importacao', rotulo: 'Importação', icone: 'importacao', filhos: [
    { href: '/painel/orcamentos/', rotulo: 'Orçamentos' },
    { href: '/painel/orcamento/', rotulo: 'Orçamento', oculto: true },
    { href: '/painel/ordens/', rotulo: 'Ordens de importação' },
    { href: '/painel/ordem/', rotulo: 'Ordem', oculto: true },
  ] },
  { href: '/painel/financeiro', rotulo: 'Financeiro', icone: 'financeiro', filhos: [
    { href: '/painel/recebiveis/', rotulo: 'Recebíveis', papeis: FIN },
    { href: '/painel/condicoes/', rotulo: 'Condições de pagamento' },
  ] },
  { href: '/painel/relatorios/', rotulo: 'Relatórios', icone: 'relatorios' },
  { href: '/painel/configuracoes', rotulo: 'Configurações', icone: 'configuracoes', filhos: [
    { href: '/painel/equipe/', rotulo: 'Equipe', papeis: ADM },
    { href: '/painel/permissoes/', rotulo: 'Papéis e permissões', papeis: ADM },
    { href: '/painel/impostos/', rotulo: 'Impostos' },
    { href: '/painel/locais/', rotulo: 'Locais de estoque' },
    { href: '/painel/cambio/', rotulo: 'Câmbio' },
    { href: '/painel/importar/', rotulo: 'Importar produtos' },
    { href: '/painel/auditoria/', rotulo: 'Auditoria', papeis: ADM },
  ] },
];

export default function LayoutPainel({ children }: { children: ReactNode }) {
  return <Shell origem="equipe" painel={MENU}>{children}</Shell>;
}
