'use client';
import { useMemo, useState } from 'react';
import { Aviso, Cabecalho, Carregando } from '@/components/ui';
import { PAPEL } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Rota { area: string; metodo: string; caminho: string; descricao: string; publico: boolean; origem: string | null; papeis: string[] }
const PAPEIS = ['comercial', 'financeiro', 'administrador', 'comprador', 'aprovador'];
const VERBO: Record<string, string> = { GET: 'Ver', POST: 'Criar ou executar', PUT: 'Gravar', PATCH: 'Alterar', DELETE: 'Apagar' };

/**
 * Papéis e permissões (no Bagisto, "Funções"): a matriz sai das próprias rotas da API,
 * então mostra o que o sistema realmente aplica, não uma descrição que pode ficar velha.
 */
export default function Permissoes() {
  const { dados, erro } = useDados<Rota[]>('/equipe/configuracoes/permissoes');
  const [busca, setBusca] = useState('');
  const [area, setArea] = useState('');
  const areas = useMemo(() => [...new Set((dados ?? []).map((r) => r.area))], [dados]);
  const filtradas = (dados ?? []).filter((r) => (!area || r.area === area) && (!busca || `${r.caminho} ${r.descricao}`.toLowerCase().includes(busca.toLowerCase())));
  const grupos = areas.filter((a) => filtradas.some((r) => r.area === a));
  return (
    <>
      <Cabecalho titulo="Papéis e permissões" sub="O que cada papel pode fazer, lido das regras de acesso de cada rota da API. Equipe: comercial, financeiro e administrador. Empresas clientes: comprador e aprovador." />
      <Aviso tipo="erro">{erro}</Aviso>
      <div className="linha" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        <input type="search" placeholder="Procurar ação ou endereço" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ flex: '1 1 260px' }} aria-label="Procurar" />
        <select value={area} onChange={(e) => setArea(e.target.value)} style={{ width: 'auto' }} aria-label="Área"><option value="">Todas as áreas</option>{areas.map((a) => <option key={a}>{a}</option>)}</select>
      </div>
      {!dados ? <Carregando /> : grupos.map((g) => (
        <section key={g} className="pn-caixa tabela-rolagem" style={{ marginBottom: 16 }}>
          <table className="pn-matriz">
            <thead><tr><th style={{ minWidth: 280 }}>{g}</th>{PAPEIS.map((p) => <th key={p} className="papel">{PAPEL[p]}</th>)}</tr></thead>
            <tbody>
              {filtradas.filter((r) => r.area === g).map((r) => (
                <tr key={`${r.metodo} ${r.caminho}`}>
                  <td>
                    <b>{r.descricao || VERBO[r.metodo] || r.metodo}</b>
                    <div className="pequeno muted"><code>{r.metodo} {r.caminho}</code>{r.publico && ' · aberta, sem login'}</div>
                  </td>
                  {PAPEIS.map((p) => r.papeis.includes(p)
                    ? <td key={p} className="sim" aria-label={`${PAPEL[p]}: pode`}>✓</td>
                    : <td key={p} className="nao" aria-label={`${PAPEL[p]}: não pode`}>—</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}
