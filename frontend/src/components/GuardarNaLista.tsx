'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAcao, useDados } from '@/lib/hooks';

/** Guarda itens numa lista de compra da empresa (existente ou nova). */
export function GuardarNaLista({ itens, rotulo = 'Guardar numa lista' }: { itens: Array<{ produto_id: number; quantidade: number }>; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  const listas = useDados<Array<{ id: number; nome: string }>>(aberto ? '/loja/listas' : null);
  const [escolha, setEscolha] = useState('nova');
  const [nome, setNome] = useState('');
  const [feito, setFeito] = useState<{ id: number; nome: string } | null>(null);
  const acao = useAcao();
  const guardar = () => acao.executar(async () => {
    const l = escolha === 'nova'
      ? await api<{ id: number; nome: string }>('/loja/listas', { corpo: { nome, itens } })
      : await api<{ id: number; nome: string }>(`/loja/listas/${escolha}/itens`, { corpo: { itens } });
    setFeito(l);
    setAberto(false);
  });
  if (!aberto) {
    return (
      <span className="pequeno">
        <button type="button" className="botao leve pequeno" disabled={!itens.length} onClick={() => { setAberto(true); setFeito(null); }}>{rotulo}</button>
        {feito && <> Guardado em <Link href={`/loja/lista/?id=${feito.id}`}>{feito.nome}</Link>.</>}
      </span>
    );
  }
  return (
    <form className="linha" style={{ flexWrap: 'wrap', gap: 6 }} onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
      <select value={escolha} onChange={(e) => setEscolha(e.target.value)} style={{ width: 'auto' }} aria-label="Lista">
        <option value="nova">Nova lista…</option>
        {listas.dados?.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
      </select>
      {escolha === 'nova' && <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da lista" required minLength={2} maxLength={80} style={{ flex: '1 1 160px' }} aria-label="Nome da lista" />}
      <button className="botao pequeno" disabled={acao.enviando}>Guardar</button>
      <button type="button" className="botao leve pequeno" onClick={() => setAberto(false)}>Cancelar</button>
      {acao.erro && <span className="pequeno" style={{ color: 'var(--vermelho)' }}>{acao.erro}</span>}
    </form>
  );
}
