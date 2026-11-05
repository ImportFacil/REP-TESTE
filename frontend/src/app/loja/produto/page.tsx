'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Passo, iconeCategoria, type ProdutoApi } from '@/components/Produto';
import { Aviso, Carregando } from '@/components/ui';
import { adicionar } from '@/lib/carrinho';
import { reais } from '@/lib/formato';
import { useDados, useParametro } from '@/lib/hooks';

export default function Produto() {
  const id = useParametro('id');
  const { dados: p, erro } = useDados<ProdutoApi>(id ? `/catalogo/produtos/${id}` : null);
  const cats = useDados<Array<{ id: string; icone: string | null }>>('/catalogo/categorias');
  const [qtd, setQtd] = useState<number | null>(null);
  const [ok, setOk] = useState(false);
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!p) return <Carregando />;
  const quantidade = qtd ?? p.multiplo_venda;
  const preco = p.preco_cliente_centavos ?? p.preco_tabela_centavos;

  return (
    <>
      <p className="pequeno"><Link href="/loja/catalogo/">‹ Catálogo</Link> · {p.categoria_nome}</p>
      <div className="grade grade-2">
        <div className="cartao produto" style={{ padding: 20 }}>
          <div className="foto" style={{ fontSize: '4rem' }}>{iconeCategoria(cats.dados?.find((c) => c.id === p.categoria_id)?.icone)}</div>
        </div>
        <div className="cartao pilha">
          <span className="pequeno muted">{p.marca} · {p.codigo}{p.importado ? ' · Linha de importação' : ''}</span>
          <h1>{p.nome}</h1>
          {p.descricao && <p>{p.descricao}</p>}
          {p.sob_orcamento ? (
            <>
              <Aviso tipo="info">Este produto é vendido sob orçamento.</Aviso>
              <Link className="botao" href={`/loja/orcamentos/?produto=${p.id}`}>Pedir orçamento</Link>
            </>
          ) : (
            <>
              <div>
                {preco < p.preco_tabela_centavos && <div className="de muted" style={{ textDecoration: 'line-through' }}>{reais(p.preco_tabela_centavos)}</div>}
                <span style={{ fontSize: '1.8rem', fontWeight: 700 }}>{reais(preco)}</span> <span className="muted">/ {p.unidade}</span>
              </div>
              <p className="muted pequeno">Vende de {p.multiplo_venda} em {p.multiplo_venda} · {p.estoque} em estoque</p>
              <div className="linha">
                <Passo valor={quantidade} multiplo={p.multiplo_venda} onChange={setQtd} />
                <span className="muted">= {reais(preco * quantidade)}</span>
              </div>
              <div className="linha">
                <button className="botao" disabled={quantidade <= 0} onClick={() => {
                  adicionar({ produto_id: p.id, quantidade, nome: p.nome, codigo: p.codigo, unidade: p.unidade, multiplo_venda: p.multiplo_venda, preco_cliente_centavos: preco });
                  setOk(true);
                }}>Adicionar ao carrinho</button>
                {ok && <Link className="botao secundario" href="/loja/carrinho/">Ir para o carrinho</Link>}
              </div>
            </>
          )}
          {p.especificacoes.length > 0 && (
            <table>
              <tbody>{p.especificacoes.map((e) => <tr key={e.nome}><th style={{ width: '40%' }}>{e.nome}</th><td>{e.valor}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
