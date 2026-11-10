'use client';
import { useState } from 'react';
import { alternarComparar, MAX_COMPARAR, useComparar, useFavoritos } from '@/lib/loja';

const CORACAO = 'M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 6.9 4.5c2.1 0 3.6 1.2 5.1 3 1.5-1.8 3-3 5.1-3 3.5 0 5.5 3.5 4.2 6.8-1.8 4.6-9.3 9.2-9.3 9.2z';
const BALANCA = 'M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z';

/** Favoritar e comparar, como no Bagisto (ícones no cartão e na página do produto). */
export function AcoesProduto({ produtoId, rotulos = false }: { produtoId: number; rotulos?: boolean }) {
  const fav = useFavoritos();
  const comparar = useComparar();
  const [cheio, setCheio] = useState(false);
  const favorito = fav.ids.includes(produtoId);
  const comparando = comparar.includes(produtoId);
  const icone = (d: string, preenchido: boolean) => (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true"><path d={d} fill={preenchido ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" /></svg>
  );
  return (
    <span className="acoes-produto">
      <button type="button" className={`icone-acao ${favorito ? 'ligado' : ''}`} aria-pressed={favorito} aria-label={favorito ? 'Tirar dos favoritos' : 'Favoritar'} title={favorito ? 'Tirar dos favoritos' : 'Favoritar'}
        onClick={() => void fav.alternar(produtoId)}>{icone(CORACAO, favorito)}{rotulos && <span>{favorito ? 'Favorito' : 'Favoritar'}</span>}</button>
      <button type="button" className={`icone-acao ${comparando ? 'ligado' : ''}`} aria-pressed={comparando} aria-label={comparando ? 'Tirar da comparação' : 'Comparar'} title={cheio ? `Compare até ${MAX_COMPARAR} produtos` : comparando ? 'Tirar da comparação' : 'Comparar'}
        onClick={() => { const ok = alternarComparar(produtoId); setCheio(!ok); if (!ok) setTimeout(() => setCheio(false), 2500); }}>{icone(BALANCA, false)}{rotulos && <span>{cheio ? `Até ${MAX_COMPARAR}` : comparando ? 'Comparando' : 'Comparar'}</span>}</button>
    </span>
  );
}
