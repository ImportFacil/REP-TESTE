'use client';
import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';

const FIN = ['financeiro', 'administrador'];
const SECOES = [
  { titulo: 'Visão geral', itens: [{ href: '/painel/', rotulo: 'Início', icone: '📊' }] },
  { titulo: 'Vendas', itens: [
    { href: '/painel/pedidos/', rotulo: 'Pedidos', icone: '📦' },
    { href: '/painel/orcamentos/', rotulo: 'Orçamentos', icone: '📝' },
    { href: '/painel/ordens/', rotulo: 'Ordens de importação', icone: '🚢' },
  ] },
  { titulo: 'Clientes', itens: [
    { href: '/painel/empresas/', rotulo: 'Empresas', icone: '🏢' },
    { href: '/painel/credito/', rotulo: 'Crédito', icone: '📄' },
  ] },
  { titulo: 'Financeiro', itens: [{ href: '/painel/recebiveis/', rotulo: 'Recebíveis', icone: '💰', papeis: FIN }] },
  { titulo: 'Configuração', itens: [
    { href: '/painel/precos/', rotulo: 'Preços e produtos', icone: '🏷️' },
    { href: '/painel/condicoes/', rotulo: 'Condições de pagamento', icone: '⚖️' },
    { href: '/painel/equipe/', rotulo: 'Equipe', icone: '👥', papeis: ['administrador'] },
    { href: '/painel/auditoria/', rotulo: 'Auditoria', icone: '🔍', papeis: ['administrador'] },
  ] },
];

export default function LayoutPainel({ children }: { children: ReactNode }) {
  return <Shell origem="equipe" secoes={SECOES}>{children}</Shell>;
}
