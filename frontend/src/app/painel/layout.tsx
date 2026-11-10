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
  ] },
  { href: '/painel/catalogo', rotulo: 'Catálogo', icone: 'catalogo', filhos: [
    { href: '/painel/precos/', rotulo: 'Produtos e preços' },
  ] },
  { href: '/painel/clientes', rotulo: 'Clientes', icone: 'clientes', filhos: [
    { href: '/painel/empresas/', rotulo: 'Empresas' },
    { href: '/painel/credito/', rotulo: 'Crédito' },
  ] },
  { href: '/painel/importacao', rotulo: 'Importação', icone: 'importacao', filhos: [
    { href: '/painel/orcamentos/', rotulo: 'Orçamentos' },
    { href: '/painel/ordens/', rotulo: 'Ordens de importação' },
  ] },
  { href: '/painel/financeiro', rotulo: 'Financeiro', icone: 'financeiro', filhos: [
    { href: '/painel/recebiveis/', rotulo: 'Recebíveis', papeis: FIN },
    { href: '/painel/condicoes/', rotulo: 'Condições de pagamento' },
  ] },
  { href: '/painel/configuracoes', rotulo: 'Configurações', icone: 'configuracoes', papeis: ADM, filhos: [
    { href: '/painel/equipe/', rotulo: 'Equipe' },
    { href: '/painel/auditoria/', rotulo: 'Auditoria' },
  ] },
];

export default function LayoutPainel({ children }: { children: ReactNode }) {
  return <Shell origem="equipe" painel={MENU}>{children}</Shell>;
}
