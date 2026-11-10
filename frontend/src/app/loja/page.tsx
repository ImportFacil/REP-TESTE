'use client';
import Link from 'next/link';
import { CartaoProduto, iconeCategoria, type ProdutoApi } from '@/components/Produto';
import { useEu } from '@/components/Shell';
import { Aviso, Carregando } from '@/components/ui';
import { NOMES_TIPO, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Categoria { id: string; nome: string; icone: string | null }

export default function InicioLoja() {
  const { eu } = useEu();
  const cats = useDados<Categoria[]>('/catalogo/categorias');
  const destaques = useDados<{ itens: ProdutoApi[]; pedido_minimo_centavos: number }>('/catalogo/produtos?destaque=true&por_pagina=8');
  const icone = (id: string) => cats.dados?.find((c) => c.id === id)?.icone;
  const primeiro = destaques.dados?.itens[0];
  const desconto = primeiro?.preco_cliente_centavos ? Math.round((1 - primeiro.preco_cliente_centavos / primeiro.preco_tabela_centavos) * 100) : null;

  return (
    <>
      <div className="banner">
        <span className="selo">{NOMES_TIPO[eu.empresa!.tipo_cliente] ?? eu.empresa!.tipo_cliente}</span>
        <h2>{desconto ? `Seu preço já está com ${desconto}% de desconto` : 'Bem-vindo à ImportFácil'}</h2>
        <p>
          {destaques.dados ? `Pedido mínimo ${reais(destaques.dados.pedido_minimo_centavos)} · ` : ''}
          Pix com desconto, boleto em até 4× para empresas aprovadas e cartão em até 12×.
        </p>
      </div>
      {eu.empresa!.situacao !== 'ativa' && <Aviso tipo="atencao">A empresa está bloqueada para novos pedidos. Fale com a ImportFácil.</Aviso>}
      <div className="linha entre" style={{ margin: '8px 0 12px' }}>
        <h2 style={{ margin: 0 }}>Categorias</h2>
        <Link href="/loja/catalogo/">Ver tudo ›</Link>
      </div>
      {cats.carregando ? <Carregando /> : (
        <div className="grade grade-auto">
          {cats.dados?.map((c) => (
            <Link key={c.id} href={`/loja/catalogo/?categoria=${c.id}`} className="cartao categoria">
              <span className="icone">{iconeCategoria(c.icone)}</span>
              {c.nome}
            </Link>
          ))}
        </div>
      )}
      <h2 style={{ margin: '28px 0 12px' }}>Destaques</h2>
      {destaques.carregando ? <Carregando /> : (
        <div className="grade grade-auto">
          {destaques.dados?.itens.map((p) => <CartaoProduto key={p.id} p={p} icone={icone(p.categoria_id)} />)}
        </div>
      )}
    </>
  );
}
