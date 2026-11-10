'use client';
import Link from 'next/link';
import { CartaoProduto, type ProdutoApi } from '@/components/Produto';
import { Aviso, Cabecalho, Carregando, Vazio } from '@/components/ui';
import { useDados } from '@/lib/hooks';
import { useFavoritos } from '@/lib/loja';

/** Favoritos (no Bagisto, "Lista de desejos"): os produtos que a pessoa marcou, com o preço de hoje. */
export default function Favoritos() {
  const { ids } = useFavoritos();
  const { dados, erro } = useDados<ProdutoApi[]>(`/loja/favoritos?v=${ids.length}`);
  const cats = useDados<Array<{ id: string; icone: string | null }>>('/catalogo/categorias');
  const lista = dados?.filter((p) => ids.includes(p.id));
  return (
    <>
      <Cabecalho titulo="Favoritos" sub="Os produtos que você marcou com o coração. São só seus; para a equipe da empresa, use as listas de compra." />
      <Aviso tipo="erro">{erro}</Aviso>
      {!lista ? <Carregando /> : !lista.length ? <Vazio>Nenhum favorito ainda. <Link href="/loja/catalogo/">Ver o catálogo</Link></Vazio> : (
        <div className="grade grade-auto">{lista.map((p) => <CartaoProduto key={p.id} p={p} icone={cats.dados?.find((c) => c.id === p.categoria_id)?.icone} />)}</div>
      )}
    </>
  );
}
