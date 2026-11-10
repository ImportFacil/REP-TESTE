'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

// ---------- comparação (até 4 produtos, guardada neste navegador) ----------

const CHAVE_COMPARAR = 'importfacil:comparar';
const EVENTO_COMPARAR = 'importfacil:comparar';
export const MAX_COMPARAR = 4;

export function lerComparar(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_COMPARAR) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => Number.isInteger(x)).slice(0, MAX_COMPARAR) : [];
  } catch {
    return [];
  }
}

function gravarComparar(ids: number[]) {
  try { localStorage.setItem(CHAVE_COMPARAR, JSON.stringify(ids)); } catch { /* sem armazenamento: vale só nesta página */ }
  window.dispatchEvent(new Event(EVENTO_COMPARAR));
}

/** Marca ou desmarca para comparar. Devolve false se já há o máximo de produtos. */
export function alternarComparar(id: number): boolean {
  const ids = lerComparar();
  if (ids.includes(id)) { gravarComparar(ids.filter((x) => x !== id)); return true; }
  if (ids.length >= MAX_COMPARAR) return false;
  gravarComparar([...ids, id]);
  return true;
}

export function limparComparar() { gravarComparar([]); }

export function useComparar() {
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => {
    const atualizar = () => setIds(lerComparar());
    atualizar();
    window.addEventListener(EVENTO_COMPARAR, atualizar);
    window.addEventListener('storage', atualizar);
    return () => { window.removeEventListener(EVENTO_COMPARAR, atualizar); window.removeEventListener('storage', atualizar); };
  }, []);
  return ids;
}

// ---------- favoritos (no servidor, de cada pessoa) ----------

const EVENTO_FAVORITOS = 'importfacil:favoritos';
let cache: Promise<number[]> | null = null;

export function useFavoritos() {
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => {
    let vivo = true;
    const carregar = () => { (cache ??= api<number[]>('/loja/favoritos/ids').catch(() => [])).then((v) => vivo && setIds(v)); };
    carregar();
    window.addEventListener(EVENTO_FAVORITOS, carregar);
    return () => { vivo = false; window.removeEventListener(EVENTO_FAVORITOS, carregar); };
  }, []);
  const alternar = useCallback(async (id: number) => {
    const atuais = await (cache ?? Promise.resolve([] as number[]));
    const eh = atuais.includes(id);
    await api(`/loja/favoritos/${id}`, { metodo: eh ? 'DELETE' : 'PUT' });
    cache = Promise.resolve(eh ? atuais.filter((x) => x !== id) : [...atuais, id]);
    window.dispatchEvent(new Event(EVENTO_FAVORITOS));
  }, []);
  return { ids, alternar };
}
