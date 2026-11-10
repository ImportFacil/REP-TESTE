'use client';
import { useEffect, useState } from 'react';

/** Item guardado no carrinho (o preço é sempre recalculado pela API na cotação). */
export interface ItemCarrinho {
  produto_id: number;
  quantidade: number;
  nome: string;
  codigo: string;
  unidade: string;
  multiplo_venda: number;
  preco_cliente_centavos: number;
}

const CHAVE = 'importfacil:carrinho';
const EVENTO = 'importfacil:carrinho';

export function lerCarrinho(): ItemCarrinho[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? '[]');
  } catch {
    return [];
  }
}

function gravar(itens: ItemCarrinho[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(itens));
  } catch {
    /* sem armazenamento: o carrinho dura só esta página */
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function adicionar(item: ItemCarrinho) {
  const itens = lerCarrinho();
  const atual = itens.find((i) => i.produto_id === item.produto_id);
  if (atual) atual.quantidade += item.quantidade;
  else itens.push(item);
  gravar(itens);
}

export function definirQuantidade(produtoId: number, quantidade: number) {
  gravar(lerCarrinho().map((i) => (i.produto_id === produtoId ? { ...i, quantidade } : i)).filter((i) => i.quantidade > 0));
}

export function esvaziar() {
  gravar([]);
}

export function useCarrinho() {
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  useEffect(() => {
    const atualizar = () => setItens(lerCarrinho());
    atualizar();
    window.addEventListener(EVENTO, atualizar);
    window.addEventListener('storage', atualizar);
    return () => {
      window.removeEventListener(EVENTO, atualizar);
      window.removeEventListener('storage', atualizar);
    };
  }, []);
  return itens;
}
