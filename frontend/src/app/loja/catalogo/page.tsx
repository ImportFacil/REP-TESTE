'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CartaoProduto, type ProdutoApi } from '@/components/Produto';
import { Aviso, Cabecalho, Carregando, Vazio } from '@/components/ui';
import { useDados } from '@/lib/hooks';
import { limparComparar, useComparar } from '@/lib/loja';

interface Categoria { id: string; nome: string; icone: string | null }
interface Lista { itens: ProdutoApi[]; total: number; pagina: number; por_pagina: number }
interface Filtro { codigo: string; nome: string; unidade: string | null; valores: Array<{ valor: string; produtos: number }> }

const ORDENS: Record<string, string> = { relevancia: 'Destaques primeiro', nome: 'Nome (A–Z)', menor_preco: 'Menor preço', maior_preco: 'Maior preço', novidades: 'Novidades' };

/** Catálogo da loja (como no Bagisto): busca, categoria, filtros por atributo, ordenação, favoritar e comparar. */
export default function Catalogo() {
  const cats = useDados<Categoria[]>('/catalogo/categorias');
  const [categoria, setCategoria] = useState('');
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const [pagina, setPagina] = useState(1);
  const [ordem, setOrdem] = useState('relevancia');
  const [marcados, setMarcados] = useState<Record<string, string[]>>({});
  const [verFiltros, setVerFiltros] = useState(false);
  const comparar = useComparar();
  const [lido, setLido] = useState(false); // só consulta depois de ler a categoria e a busca do endereço

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setCategoria(q.get('categoria') ?? '');
    setBusca(q.get('busca') ?? '');
    setTermo(q.get('busca') ?? '');
    setLido(true);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => { setTermo(busca); setPagina(1); }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const base = { ...(categoria && { categoria }), ...(termo.trim() && { busca: termo.trim() }) };
  const ativos = Object.fromEntries(Object.entries(marcados).filter(([, v]) => v.length));
  const q = new URLSearchParams({ pagina: String(pagina), por_pagina: '24', ordem, ...base, ...(Object.keys(ativos).length && { atributos: JSON.stringify(ativos) }) });
  const lista = useDados<Lista>(lido ? `/catalogo/produtos?${q}` : null);
  const filtros = useDados<Filtro[]>(lido ? `/catalogo/filtros?${new URLSearchParams(base)}` : null);
  const icone = (id: string) => cats.dados?.find((c) => c.id === id)?.icone;
  const paginas = lista.dados ? Math.ceil(lista.dados.total / lista.dados.por_pagina) : 1;
  const nFiltros = useMemo(() => Object.values(ativos).reduce((s, v) => s + v.length, 0), [ativos]);
  const marcar = (codigo: string, valor: string, sim: boolean) => {
    const atual = marcados[codigo] ?? [];
    setMarcados({ ...marcados, [codigo]: sim ? [...atual, valor] : atual.filter((v) => v !== valor) });
    setPagina(1);
  };

  return (
    <>
      <Cabecalho titulo="Catálogo" sub={lista.dados ? `${lista.dados.total} produto(s)` : ' '} />
      <div className="linha" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="search" placeholder="Buscar por produto, marca ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ flex: '1 1 260px' }} />
        <select value={categoria} onChange={(e) => { setCategoria(e.target.value); setMarcados({}); setPagina(1); }} style={{ flex: '0 1 260px' }} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {cats.dados?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select value={ordem} onChange={(e) => { setOrdem(e.target.value); setPagina(1); }} style={{ flex: '0 1 200px' }} aria-label="Ordenar">
          {Object.entries(ORDENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="button" className="botao secundario so-celular" onClick={() => setVerFiltros(!verFiltros)} aria-expanded={verFiltros}>Filtros{nFiltros ? ` (${nFiltros})` : ''}</button>
      </div>
      <div className="catalogo-com-filtros">
        <aside className={`filtros-loja ${verFiltros ? '' : 'esconde-celular'}`} aria-label="Filtros">
          {!filtros.dados || filtros.carregando ? null : filtros.dados.length === 0 ? <span className="pequeno muted">Sem filtros para esta seleção.</span> : filtros.dados.map((f) => (
            <fieldset key={f.codigo}>
              <legend>{f.nome}{f.unidade ? ` (${f.unidade})` : ''}</legend>
              {f.valores.slice(0, 12).map((v) => (
                <label key={v.valor} className="linha pequeno" style={{ gap: 6 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={marcados[f.codigo]?.includes(v.valor) ?? false} onChange={(e) => marcar(f.codigo, v.valor, e.target.checked)} />
                  {v.valor} <span className="muted">({v.produtos})</span>
                </label>
              ))}
            </fieldset>
          ))}
          {nFiltros > 0 && <button type="button" className="botao leve pequeno" onClick={() => { setMarcados({}); setPagina(1); }}>Limpar filtros</button>}
        </aside>
        <div>
          <Aviso tipo="erro">{lista.erro}</Aviso>
          {lista.carregando && !lista.dados ? <Carregando /> : lista.dados?.itens.length ? (
            <div className="grade grade-auto">
              {lista.dados.itens.map((p) => <CartaoProduto key={p.id} p={p} icone={icone(p.categoria_id)} />)}
            </div>
          ) : (
            <Vazio>Nenhum produto encontrado.</Vazio>
          )}
          {paginas > 1 && (
            <div className="linha" style={{ justifyContent: 'center', marginTop: 20 }}>
              <button className="botao secundario" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>‹ Anterior</button>
              <span className="muted">Página {pagina} de {paginas}</span>
              <button className="botao secundario" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>Próxima ›</button>
            </div>
          )}
        </div>
      </div>
      {comparar.length > 0 && (
        <div className="barra-comparar" role="region" aria-label="Comparação">
          <span>{comparar.length} produto(s) para comparar</span>
          <span className="linha"><button className="botao leve" onClick={limparComparar}>Limpar</button><Link className="botao" href="/loja/comparar/">Comparar</Link></span>
        </div>
      )}
    </>
  );
}
