'use client';
import { useState } from 'react';
import { ListaOrdens } from '@/components/ListaOrdens';
import { Cabecalho } from '@/components/ui';

export default function OrdensPainel() {
  const [abertas, setAbertas] = useState(true);
  return (
    <>
      <Cabecalho titulo="Ordens de importação">
        <label className="linha pequeno"><input type="checkbox" checked={abertas} onChange={(e) => setAbertas(e.target.checked)} style={{ width: 'auto' }} /> Só em andamento</label>
      </Cabecalho>
      <ListaOrdens base="/equipe/ordens" filtro={abertas ? '?abertas=true' : ''} />
    </>
  );
}
