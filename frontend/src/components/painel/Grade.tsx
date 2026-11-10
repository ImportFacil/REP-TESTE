'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icone } from './Icone';

/** Uma coluna da grade. `valor` serve para buscar, filtrar, ordenar e exportar; `render`, para mostrar. */
export interface Coluna<T> {
  chave: string;
  titulo: string;
  valor?: (l: T) => string | number | null | undefined;
  render?: (l: T) => ReactNode;
  ordenavel?: boolean;
  /** texto: contém; opcoes: marcar valores; data: de/até; numero: mínimo/máximo */
  filtro?: 'texto' | 'opcoes' | 'data' | 'numero';
  opcoes?: Record<string, string>;
  direita?: boolean;
  /** false: não vai para o CSV (ex.: botões) */
  exportar?: boolean;
  /** não aparece na tabela, mas filtra, busca e vai para o CSV */
  oculta?: boolean;
  /** valor no CSV, quando diferente do `valor` (ex.: nome legível da situação) */
  valorCsv?: (l: T) => string | number | null | undefined;
}

export interface AcaoLote<T> {
  rotulo: string;
  executar: (linhas: T[]) => Promise<unknown> | unknown;
  /** pergunta antes de executar */
  confirmar?: string;
}

type Filtro = { tipo: 'texto'; v: string } | { tipo: 'opcoes'; v: string[] } | { tipo: 'faixa'; de: string; ate: string };

const tira = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Grade de dados no formato do Bagisto: busca, filtros por coluna, ordenação, paginação, exportação e ações em lote. */
export function Grade<T>({
  titulo, sub, acoes, topo, linhas, colunas, chave, aoClicar, acoesLote, carregando, vazio = 'Nenhum registro.', nomeArquivo, porPaginaInicial = 10, ordemInicial,
}: {
  titulo?: string;
  sub?: ReactNode;
  acoes?: ReactNode;
  /** conteúdo entre o título e a lista (ex.: formulário de cadastro) */
  topo?: ReactNode;
  linhas: T[] | undefined;
  colunas: Coluna<T>[];
  chave: (l: T) => string | number;
  aoClicar?: (l: T) => void;
  acoesLote?: AcaoLote<T>[];
  carregando?: boolean;
  vazio?: string;
  nomeArquivo?: string;
  porPaginaInicial?: number;
  ordemInicial?: { chave: string; dir: 'asc' | 'desc' };
}) {
  const [busca, setBusca] = useState('');
  const [filtros, setFiltros] = useState<Record<string, Filtro>>({});
  const [verFiltros, setVerFiltros] = useState(false);
  const [ordem, setOrdem] = useState(ordemInicial ?? null);
  const [porPagina, setPorPagina] = useState(porPaginaInicial);
  const [pagina, setPagina] = useState(1);
  const [marcadas, setMarcadas] = useState<Set<string | number>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // filtros vindos do endereço (?situacao=novo,enviado&busca=…), para os links do painel de controle
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const f: Record<string, Filtro> = {};
    for (const c of colunas) {
      const v = q.get(c.chave);
      if (!v || !c.filtro) continue;
      if (c.filtro === 'opcoes') f[c.chave] = { tipo: 'opcoes', v: v.split(',') };
      else if (c.filtro === 'texto') f[c.chave] = { tipo: 'texto', v };
    }
    if (Object.keys(f).length) setFiltros(f);
    if (q.get('busca')) setBusca(q.get('busca')!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => setPagina(1), [busca, filtros, porPagina]);

  const val = (c: Coluna<T>, l: T) => (c.valor ? c.valor(l) : (l as Record<string, unknown>)[c.chave] as string | number | null | undefined);

  const filtradas = useMemo(() => {
    if (!linhas) return [];
    const q = tira(busca.trim());
    let r = linhas.filter((l) => {
      if (q && !colunas.some((c) => c.exportar !== false && tira(String(c.valorCsv?.(l) ?? val(c, l) ?? '')).includes(q))) return false;
      for (const [k, f] of Object.entries(filtros)) {
        const c = colunas.find((x) => x.chave === k);
        if (!c) continue;
        const v = val(c, l);
        if (f.tipo === 'texto' && f.v && !tira(String(v ?? '')).includes(tira(f.v))) return false;
        if (f.tipo === 'opcoes' && f.v.length && !f.v.includes(String(v))) return false;
        if (f.tipo === 'faixa') {
          if (c.filtro === 'data') {
            const d = String(v ?? '').slice(0, 10);
            if (f.de && d < f.de) return false;
            if (f.ate && d > f.ate) return false;
          } else {
            const n = Number(v ?? 0);
            if (f.de !== '' && n < Number(f.de)) return false;
            if (f.ate !== '' && n > Number(f.ate)) return false;
          }
        }
      }
      return true;
    });
    if (ordem) {
      const c = colunas.find((x) => x.chave === ordem.chave);
      if (c) {
        r = [...r].sort((a, b) => {
          const va = val(c, a), vb = val(c, b);
          const x = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR', { numeric: true });
          return ordem.dir === 'asc' ? x : -x;
        });
      }
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, busca, filtros, ordem, colunas]);

  const paginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  const atual = Math.min(pagina, paginas);
  const visiveis = filtradas.slice((atual - 1) * porPagina, atual * porPagina);
  const chavesVisiveis = visiveis.map(chave);
  const todasMarcadas = chavesVisiveis.length > 0 && chavesVisiveis.every((k) => marcadas.has(k));
  const selecionadas = (linhas ?? []).filter((l) => marcadas.has(chave(l)));
  const nFiltros = Object.values(filtros).filter((f) => (f.tipo === 'opcoes' ? f.v.length : f.tipo === 'texto' ? f.v : f.de || f.ate)).length;

  const alternarOrdem = (c: Coluna<T>) => {
    if (!c.ordenavel) return;
    setOrdem(ordem?.chave === c.chave ? (ordem.dir === 'asc' ? { chave: c.chave, dir: 'desc' } : null) : { chave: c.chave, dir: 'asc' });
  };

  const exportar = () => {
    const cols = colunas.filter((c) => c.exportar !== false);
    const esc = (v: unknown) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [cols.map((c) => esc(c.titulo)).join(';'), ...filtradas.map((l) => cols.map((c) => esc(c.valorCsv?.(l) ?? val(c, l))).join(';'))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nomeArquivo ?? 'lista'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const executarLote = async (a: AcaoLote<T>) => {
    if (a.confirmar && !window.confirm(a.confirmar.replace('{n}', String(selecionadas.length)))) return;
    setOcupado(true); setAviso(null);
    try {
      await a.executar(selecionadas);
      setAviso(`${a.rotulo}: ${selecionadas.length} registro(s).`);
      setMarcadas(new Set());
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const filtraveis = colunas.filter((c) => c.filtro);
  const muda = (k: string, f: Filtro) => setFiltros({ ...filtros, [k]: f });

  return (
    <div>
      {(titulo || acoes) && (
        <div className="pn-cabecalho">
          <div>
            {titulo && <h1>{titulo}</h1>}
            {sub && <p className="sub muted">{sub}</p>}
          </div>
          <div className="pn-cabecalho-acoes">
            <button className="pn-botao-leve" onClick={exportar} disabled={!filtradas.length}><Icone nome="exportar" tamanho={18} /> Exportar</button>
            {acoes}
          </div>
        </div>
      )}

      {topo}
      <div className="pn-ferramentas">
        <div className="pn-pesquisa">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Para pesquisar" aria-label="Pesquisar na lista" />
          <Icone nome="busca" tamanho={18} />
        </div>
        <span className="pn-resultados">{linhas ? `${filtradas.length} resultado${filtradas.length === 1 ? '' : 's'}` : ''}</span>
        <div className="pn-paginacao">
          {filtraveis.length > 0 && (
            <button className="pn-botao-borda" aria-pressed={verFiltros} onClick={() => setVerFiltros(!verFiltros)}>
              <Icone nome="filtro" tamanho={16} /> Filtro{nFiltros ? ` (${nFiltros})` : ''}
            </button>
          )}
          <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} aria-label="Itens por página">
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>Por página</span>
          <input type="number" min={1} max={paginas} value={atual} onChange={(e) => setPagina(Math.min(paginas, Math.max(1, Number(e.target.value) || 1)))} aria-label="Página" />
          <span>de {paginas}</span>
          <button className="pn-seta" onClick={() => setPagina(atual - 1)} disabled={atual <= 1} aria-label="Página anterior"><Icone nome="anterior" /></button>
          <button className="pn-seta" onClick={() => setPagina(atual + 1)} disabled={atual >= paginas} aria-label="Próxima página"><Icone nome="proximo" /></button>
        </div>
      </div>

      {verFiltros && (
        <div className="pn-caixa pn-filtros">
          {filtraveis.map((c) => {
            const f = filtros[c.chave];
            if (c.filtro === 'texto') return (
              <fieldset key={c.chave}><legend>{c.titulo}</legend>
                <input type="text" value={f?.tipo === 'texto' ? f.v : ''} onChange={(e) => muda(c.chave, { tipo: 'texto', v: e.target.value })} aria-label={`Filtrar por ${c.titulo}`} />
              </fieldset>
            );
            if (c.filtro === 'opcoes') {
              const marcados = f?.tipo === 'opcoes' ? f.v : [];
              const opcoes = c.opcoes ?? Object.fromEntries([...new Set((linhas ?? []).map((l) => String(val(c, l) ?? '')))].filter(Boolean).sort().map((v) => [v, v]));
              return (
                <fieldset key={c.chave}><legend>{c.titulo}</legend>
                  {Object.entries(opcoes).map(([k, rot]) => (
                    <label key={k}><input type="checkbox" checked={marcados.includes(k)} onChange={(e) => muda(c.chave, { tipo: 'opcoes', v: e.target.checked ? [...marcados, k] : marcados.filter((x) => x !== k) })} /> {rot}</label>
                  ))}
                </fieldset>
              );
            }
            const fx = f?.tipo === 'faixa' ? f : { tipo: 'faixa' as const, de: '', ate: '' };
            const tipo = c.filtro === 'data' ? 'date' : 'number';
            return (
              <fieldset key={c.chave}><legend>{c.titulo}</legend>
                <div className="pn-faixa">
                  <input type={tipo} value={fx.de} onChange={(e) => muda(c.chave, { ...fx, de: e.target.value })} aria-label={`${c.titulo}: de`} placeholder="de" />
                  <input type={tipo} value={fx.ate} onChange={(e) => muda(c.chave, { ...fx, ate: e.target.value })} aria-label={`${c.titulo}: até`} placeholder="até" />
                </div>
              </fieldset>
            );
          })}
        </div>
      )}
      {nFiltros > 0 && (
        <div className="pn-chips">
          {Object.entries(filtros).map(([k, f]) => {
            const c = colunas.find((x) => x.chave === k);
            const ativo = f.tipo === 'opcoes' ? f.v.length : f.tipo === 'texto' ? f.v : f.de || f.ate;
            if (!c || !ativo) return null;
            const texto = f.tipo === 'opcoes' ? f.v.map((v) => c.opcoes?.[v] ?? v).join(', ') : f.tipo === 'texto' ? f.v : `${f.de || '…'} a ${f.ate || '…'}`;
            return (
              <button key={k} className="pn-chip" onClick={() => { const n = { ...filtros }; delete n[k]; setFiltros(n); }} aria-label={`Tirar o filtro ${c.titulo}`}>
                {c.titulo}: {texto} <Icone nome="fechar" tamanho={14} />
              </button>
            );
          })}
          <button className="pn-chip" onClick={() => setFiltros({})}>Limpar filtros</button>
        </div>
      )}

      {acoesLote && selecionadas.length > 0 && (
        <div className="pn-lote" role="region" aria-label="Ações em lote">
          <b>{selecionadas.length} selecionado(s)</b>
          {acoesLote.map((a) => <button key={a.rotulo} className="pn-botao-borda" disabled={ocupado} onClick={() => void executarLote(a)}>{a.rotulo}</button>)}
          <button className="pn-botao-leve" onClick={() => setMarcadas(new Set())}>Desmarcar</button>
        </div>
      )}
      {aviso && <div className="aviso info" style={{ marginBottom: 12 }} role="status">{aviso}</div>}

      <div className="pn-caixa" style={{ overflow: 'hidden' }}>
        {carregando && !linhas ? <div className="pn-vazio">Carregando…</div> : !filtradas.length ? (
          <div className="pn-vazio"><Icone nome="caixa" tamanho={40} />{linhas?.length ? 'Nada encontrado com essa busca ou filtro.' : vazio}</div>
        ) : (
          <table className="pn-tabela">
            <thead>
              <tr>
                {acoesLote && (
                  <th className="pn-caixinha">
                    <input type="checkbox" aria-label="Selecionar todos desta página" checked={todasMarcadas}
                      onChange={(e) => { const n = new Set(marcadas); chavesVisiveis.forEach((k) => (e.target.checked ? n.add(k) : n.delete(k))); setMarcadas(n); }} />
                  </th>
                )}
                {colunas.filter((c) => !c.oculta).map((c) => (
                  <th key={c.chave} className={c.direita ? 'direita' : undefined} aria-sort={ordem?.chave === c.chave ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.ordenavel ? (
                      <button onClick={() => alternarOrdem(c)}>
                        {c.titulo}{ordem?.chave === c.chave && <Icone nome={ordem.dir === 'asc' ? 'acima' : 'abaixo'} tamanho={14} />}
                      </button>
                    ) : c.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => {
                const k = chave(l);
                return (
                  <tr key={k} className={`${aoClicar ? 'pn-clicavel' : ''} ${marcadas.has(k) ? 'pn-marcada' : ''}`} onClick={aoClicar ? () => aoClicar(l) : undefined}>
                    {acoesLote && (
                      <td className="pn-caixinha" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label="Selecionar" checked={marcadas.has(k)}
                          onChange={(e) => { const n = new Set(marcadas); if (e.target.checked) n.add(k); else n.delete(k); setMarcadas(n); }} />
                      </td>
                    )}
                    {colunas.filter((c) => !c.oculta).map((c) => (
                      <td key={c.chave} data-rotulo={c.titulo} className={c.direita ? 'direita numero' : undefined}>{c.render ? c.render(l) : String(val(c, l) ?? '')}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
