'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Aviso, Carregando } from '@/components/ui';
import { api } from '@/lib/api';
import { useAcao, useDados } from '@/lib/hooks';

interface Estoque { estoque: number; unidade: string; locais: Array<{ local_id: number; codigo: string; nome: string; cidade: string; uf: string; ativo: boolean; quantidade: number }> }

/** Estoque do produto em cada local (Configurações → Locais de estoque). O total do produto é a soma. */
export function EstoqueLocais({ produtoId, pode, aoMudar }: { produtoId: number; pode: boolean; aoMudar: (total: number) => void }) {
  const { dados, recarregar } = useDados<Estoque>(`/equipe/configuracoes/estoque/${produtoId}`);
  const [q, setQ] = useState<Record<number, string>>({});
  const acao = useAcao();
  useEffect(() => { if (dados) setQ(Object.fromEntries(dados.locais.map((l) => [l.local_id, String(l.quantidade)]))); }, [dados]);
  if (!dados) return <Carregando />;
  const total = Object.values(q).reduce((s, v) => s + (Number(v) || 0), 0);
  const mudou = dados.locais.some((l) => String(l.quantidade) !== q[l.local_id]);
  const salvar = () => acao.executar(async () => {
    const r = await api<Estoque>(`/equipe/configuracoes/estoque/${produtoId}`, { metodo: 'PUT', corpo: { locais: dados.locais.map((l) => ({ local_id: l.local_id, quantidade: Number(q[l.local_id]) || 0 })) } });
    await recarregar();
    aoMudar(r.estoque);
  }, 'Estoque salvo');
  return (
    <div className="pilha" style={{ gap: 8 }}>
      <table>
        <tbody>
          {dados.locais.map((l) => (
            <tr key={l.local_id}>
              <td><b>{l.nome}</b><div className="pequeno muted">{l.cidade}/{l.uf}{l.ativo ? '' : ' · inativo'}</div></td>
              <td style={{ width: 110 }}>
                <input type="number" min={0} value={q[l.local_id] ?? ''} disabled={!pode} onChange={(e) => setQ({ ...q, [l.local_id]: e.target.value })} aria-label={`Estoque em ${l.nome}`} />
              </td>
            </tr>
          ))}
          <tr><td><b>Total</b></td><td className="direita"><b>{total} {dados.unidade}</b></td></tr>
        </tbody>
      </table>
      {pode && <button type="button" className="botao secundario" disabled={!mudou || acao.enviando} onClick={() => void salvar()}>Salvar estoque por local</button>}
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <Aviso tipo="ok">{acao.ok}</Aviso>
      <span className="pequeno muted">Locais em <Link href="/painel/locais/">Configurações → Locais de estoque</Link>.</span>
    </div>
  );
}
