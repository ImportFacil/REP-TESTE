'use client';
import type { ReactNode } from 'react';
import { Shell } from '@/components/Shell';

const SECOES = [
  { titulo: 'Loja', itens: [
    { href: '/loja/', rotulo: 'Início', icone: '🏠' },
    { href: '/loja/catalogo/', rotulo: 'Catálogo', icone: '🔎' },
    { href: '/loja/pedido-rapido/', rotulo: 'Pedido rápido', icone: '⚡' },
    { href: '/loja/carrinho/', rotulo: 'Carrinho', icone: '🛒' },
    { href: '/loja/favoritos/', rotulo: 'Favoritos', icone: '♥' },
    { href: '/loja/comparar/', rotulo: 'Comparar', icone: '⚖️' },
    { href: '/loja/listas/', rotulo: 'Listas de compra', icone: '📋' },
  ] },
  { titulo: 'Compras', itens: [
    { href: '/loja/pedidos/', rotulo: 'Pedidos', icone: '📦' },
    { href: '/loja/aprovacoes/', rotulo: 'Aprovações', icone: '✅' },
    { href: '/loja/cotacoes/', rotulo: 'Cotações de preço', icone: '🤝' },
    { href: '/loja/orcamentos/', rotulo: 'Orçamentos de importação', icone: '📝' },
    { href: '/loja/ordens/', rotulo: 'Ordens de importação', icone: '🚢' },
    { href: '/loja/financeiro/', rotulo: 'Financeiro', icone: '💳' },
  ] },
  { titulo: 'Empresa', itens: [
    { href: '/loja/credito/', rotulo: 'Cadastro e crédito', icone: '📄' },
    { href: '/loja/enderecos/', rotulo: 'Endereços de entrega', icone: '📍' },
    { href: '/loja/conta/', rotulo: 'Conta e usuários', icone: '👥' },
  ] },
];

export default function LayoutLoja({ children }: { children: ReactNode }) {
  return <Shell origem="cliente" secoes={SECOES}>{children}</Shell>;
}
