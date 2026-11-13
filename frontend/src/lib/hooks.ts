'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ErroApi } from './api';

/** Carrega dados da API; `recarregar` busca de novo depois de uma ação. */
export function useDados<T>(caminho: string | null) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    if (!caminho) return;
    setCarregando(true);
    try {
      setDados(await api<T>(caminho));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [caminho]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { dados, erro, carregando, recarregar, setDados };
}

/** Lê um parâmetro da URL (?id=123) sem exigir renderização no servidor. */
export function useParametro(nome: string): string | null {
  const [valor, setValor] = useState<string | null>(null);
  useEffect(() => {
    setValor(new URLSearchParams(location.search).get(nome));
  }, [nome]);
  return valor;
}

/** Executa uma ação (botão) com estado de "enviando" e mensagem de erro ou sucesso. */
export function useAcao() {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const executar = useCallback(async <T,>(fn: () => Promise<T>, sucesso?: string): Promise<T | undefined> => {
    setEnviando(true);
    setErro(null);
    setOk(null);
    try {
      const r = await fn();
      if (sucesso) setOk(sucesso);
      return r;
    } catch (e) {
      setErro(e instanceof ErroApi || e instanceof Error ? e.message : 'Algo deu errado.');
      return undefined;
    } finally {
      setEnviando(false);
    }
  }, []);
  return { enviando, erro, ok, executar, setErro, setOk };
}

/**
 * Lista grande do Painel paginada na API: a grade informa a consulta (página, busca, filtros, ordem)
 * e este gancho busca só aquela página. `base` é o caminho com os filtros fixos da página (ex.: período).
 * Para exportar, `todas` percorre as páginas de 100 em 100, só quando a pessoa pede.
 */
export function useListaServidor<T>(base: string | null) {
  const [consulta, setConsulta] = useState<string | null>(null);
  const juntar = useCallback((c: string) => {
    if (!base) return null;
    const [caminho, fixos = ''] = base.split('?');
    const q = new URLSearchParams(fixos);
    new URLSearchParams(c).forEach((v, k) => q.set(k, v)); // o filtro da coluna vale mais que o fixo
    return `${caminho}?${q}`;
  }, [base]);
  const caminho = consulta === null ? null : juntar(consulta);
  const r = useDados<{ itens: T[]; total: number } & Record<string, unknown>>(caminho);
  const todas = useCallback(async (c: string) => {
    const linhas: T[] = [];
    for (let pagina = 1; pagina <= 500; pagina++) {
      const q = new URLSearchParams(c);
      q.set('pagina', String(pagina));
      q.set('por_pagina', '100');
      const p = await api<{ itens: T[]; total: number }>(juntar(q.toString())!);
      linhas.push(...p.itens);
      if (!p.itens.length || linhas.length >= p.total) break;
    }
    return linhas;
  }, [juntar]);
  return {
    ...r,
    // sem consulta ainda (a grade monta a primeira) conta como carregando
    carregando: r.carregando || caminho === null,
    servidor: { total: r.dados?.total ?? 0, aoMudar: setConsulta, todas },
  };
}
