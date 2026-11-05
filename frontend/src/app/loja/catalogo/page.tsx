'use client';
import { useEffect, useState } from 'react';
import { CartaoProduto, type ProdutoApi } from '@/components/Produto';
import { Aviso, Cabecalho, Carregando, Vazio } from '@/components/ui';
import { useDados } from '@/lib/hooks';

interface Categoria { id: string; nome: string; icone: string | null }
interface Lista { itens: ProdutoApi[]; total: number; pagina: number; por_pagina: number }

export default function Catalogo() {
  const cats = useDados<Categoria[]>('/catalogo/categorias');
  const [categoria, setCategoria] = useState('');
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setCategoria(q.get('categoria') ?? '');
    setBusca(q.get('busca') ?? '');
    setTermo(q.get('busca') ?? '');
  }, []);
  useEffect(() => {
    const t = setTimeout(() => { setTermo(busca); setPagina(1); }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const q = new URLSearchParams({ pagina: String(pagina), por_pagina: '24', ...(categoria && { categoria }), ...(termo.trim() && { busca: termo.trim() }) });
  const lista = useDados<Lista>(`/catalogo/produtos?${q}`);
  const icone = (id: string) => cats.dados?.find((c) => c.id === id)?.icone;
  const paginas = lista.dados ? Math.ceil(lista.dados.total / lista.dados.por_pagina) : 1;

  return (
    <>
      <Cabecalho titulo="Catálogo" sub={lista.dados ? `${lista.dados.total} produto(s)` : ' '} />
      <div className="linha" style={{ marginBottom: 16 }}>
        <input type="search" placeholder="Buscar por produto, marca ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ flex: '1 1 260px' }} />
        <select value={categoria} onChange={(e) => { setCategoria(e.target.value); setPagina(1); }} style={{ flex: '0 1 280px' }} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {cats.dados?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
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
    </>
  );
}
