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
