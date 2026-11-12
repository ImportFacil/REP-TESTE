'use client';
import { useEffect, useMemo, useState } from 'react';
import { NOMES_TIPO } from '@/lib/formato';
import { hojeIso } from '@/lib/periodos';
import './painel.css';

/** Atalhos de período: últimas horas (contadas a partir de agora), mês corrente, tudo ou um período de datas. */
export const ATALHOS: Array<{ id: string; rotulo: string; horas?: number }> = [
  { id: '24h', rotulo: '24 horas', horas: 24 },
  { id: '48h', rotulo: '48 horas', horas: 48 },
  { id: '72h', rotulo: '72 horas', horas: 72 },
  { id: '7d', rotulo: 'Semana', horas: 168 },
  { id: '30d', rotulo: '30 dias', horas: 720 },
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'periodo', rotulo: 'Período…' },
];
const PLURAL: Record<string, string> = { revendedor: 'Revendedores', distribuidora: 'Distribuidoras', construtora: 'Construtoras', cooperativa: 'Cooperativas', hospital: 'Hospitais' };
export const PERFIS: Array<[string, string]> = [['', 'Todos os perfis'], ...Object.keys(NOMES_TIPO).map((k) => [k, PLURAL[k] ?? NOMES_TIPO[k]] as [string, string])];

export interface Janela { atalho: string; de: string; ate: string; tipo: string }

/** Monta a consulta para a API: horas=… ou de=…&ate=…, e tipo_cliente=… */
export function consultaJanela(j: Janela): string {
  const q = new URLSearchParams();
  const a = ATALHOS.find((x) => x.id === j.atalho);
  if (a?.horas) q.set('horas', String(a.horas));
  else if (j.atalho === 'mes') { q.set('de', `${hojeIso().slice(0, 8)}01`); q.set('ate', hojeIso()); }
  else if (j.atalho === 'periodo' && j.de) { q.set('de', j.de); q.set('ate', j.ate || j.de); }
  if (j.tipo) q.set('tipo_cliente', j.tipo);
  return q.toString();
}

/** Estado do filtro, guardado no endereço da página (?periodo=24h&perfil=hospital) para voltar e compartilhar. */
export function useJanela(padrao: string, comTodos = false) {
  const [j, setJ] = useState<Janela>({ atalho: padrao, de: '', ate: '', tipo: '' });
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const atalho = q.get('periodo');
    setJ({
      atalho: atalho && (ATALHOS.some((a) => a.id === atalho) || (comTodos && atalho === 'todos')) ? atalho : padrao,
      de: q.get('de') ?? '', ate: q.get('ate') ?? '', tipo: q.get('perfil') ?? '',
    });
    setPronto(true);
  }, [padrao, comTodos]);
  const mudar = (m: Partial<Janela>) => {
    const novo = { ...j, ...m };
    setJ(novo);
    const q = new URLSearchParams(location.search);
    q.set('periodo', novo.atalho);
    for (const [k, v] of [['de', novo.atalho === 'periodo' ? novo.de : ''], ['ate', novo.atalho === 'periodo' ? novo.ate : ''], ['perfil', novo.tipo]] as const) {
      if (v) q.set(k, v); else q.delete(k);
    }
    history.replaceState(null, '', `?${q}`);
  };
  const consulta = useMemo(() => (j.atalho === 'todos' ? consultaJanela({ ...j, atalho: '' }) : consultaJanela(j)), [j]);
  return { janela: j, mudar, consulta, pronto };
}

/** Os botões de período e as abas de perfil de cliente. */
export function FiltroJanela({ janela, mudar, comTodos = false, comPerfil = true, extra }: { janela: Janela; mudar: (m: Partial<Janela>) => void; comTodos?: boolean; comPerfil?: boolean; extra?: React.ReactNode }) {
  const atalhos = comTodos ? [{ id: 'todos', rotulo: 'Todos' }, ...ATALHOS] : ATALHOS;
  return (
    <div className="pn-janela pilha" style={{ gap: 10, marginBottom: 14 }}>
      <div className="pn-chips" role="group" aria-label="Período">
        {atalhos.map((a) => (
          <button key={a.id} type="button" className={`pn-chip ${janela.atalho === a.id ? 'ativo' : ''}`} aria-pressed={janela.atalho === a.id} onClick={() => mudar({ atalho: a.id })}>{a.rotulo}</button>
        ))}
        {janela.atalho === 'periodo' && (
          <span className="linha" style={{ gap: 6 }}>
            <input type="date" value={janela.de} max={janela.ate || hojeIso()} onChange={(e) => mudar({ de: e.target.value })} aria-label="De" style={{ width: 'auto' }} />
            <span className="pequeno">até</span>
            <input type="date" value={janela.ate} min={janela.de} max={hojeIso()} onChange={(e) => mudar({ ate: e.target.value })} aria-label="Até" style={{ width: 'auto' }} />
          </span>
        )}
      </div>
      {comPerfil && (
        <div className="linha" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="pn-abas" role="tablist" aria-label="Perfil do cliente">
            {PERFIS.map(([k, v]) => <button key={k || 'todos'} type="button" role="tab" aria-selected={janela.tipo === k} className={`botao pequeno ${janela.tipo === k ? '' : 'leve'}`} onClick={() => mudar({ tipo: k })}>{v}</button>)}
          </div>
          {extra}
        </div>
      )}
    </div>
  );
}
