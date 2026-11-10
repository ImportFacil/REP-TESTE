'use client';
import { ListaOrdens } from '@/components/ListaOrdens';
import { Cabecalho } from '@/components/ui';

export default function Ordens() {
  return (
    <>
      <Cabecalho titulo="Ordens de importação" sub="Acompanhe cada etapa, do pedido ao fornecedor até a entrega." />
      <ListaOrdens base="/ordens" />
    </>
  );
}
