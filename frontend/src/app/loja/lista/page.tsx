'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Passo, type ProdutoApi } from '@/components/Produto';
import { Aviso, Carregando, Vazio } from '@/components/ui';
import { api } from '@/lib/api';
import { adicionar } from '@/lib/carrinho';
import { reais } from '@/lib/formato';
import { useAcao, useDados, useParametro } from '@/lib/hooks';

interface Detalhe { id: number; nome: string; itens: Array<{ produto: ProdutoApi; quantidade: number }>; indisponiveis: number }

/** Uma lista de compra: ajustar quantidades e mandar tudo (ou parte) para o carrinho. */
export default function ListaDeCompra() {
  const id = useParametro('id');
  const router = useRouter();
  const { dados, erro, setDados } = useDados<Detalhe>(id ? `/loja/listas/${id}` : null);
  const [ok, setOk] = useState<string | null>(null);
  const acao = useAcao();
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;
  const preco = (p: ProdutoApi) => p.preco_cliente_centavos ?? p.preco_tabela_centavos;
  const definir = (produtoId: number, quantidade: number) => acao.executar(async () => setDados(await api<Detalhe>(`/loja/listas/${dados.id}/itens/${produtoId}`, { metodo: 'PUT', corpo: { quantidade } })));
  const total = dados.itens.reduce((s, i) => s + preco(i.produto) * i.quantidade, 0);
  const tudoNoCarrinho = () => {
    for (const { produto: p, quantidade } of dados.itens) {
      if (p.sob_orcamento) continue;
      adicionar({ produto_id: p.id, quantidade, nome: p.nome, codigo: p.codigo, unidade: p.unidade, multiplo_venda: p.multiplo_venda, preco_cliente_centavos: preco(p) });
    }
    setOk(`${dados.itens.length} produto(s) no carrinho.`);
  };
  const remover = () => { if (window.confirm(`Tirar a lista "${dados.nome}"?`)) void acao.executar(async () => { await api(`/loja/listas/${dados.id}`, { metodo: 'PATCH', corpo: { ativo: false } }); router.push('/loja/listas/'); }); };
  return (
    <>
      <p className="pequeno"><Link href="/loja/listas/">‹ Listas de compra</Link></p>
      <div className="linha entre" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>{dados.nome}</h1>
        <div className="linha">
          <button className="botao leve" onClick={remover}>Tirar lista</button>
          <button className="botao" disabled={!dados.itens.length} onClick={tudoNoCarrinho}>Tudo para o carrinho · {reais(total)}</button>
        </div>
      </div>
      <Aviso tipo="ok">{ok && <>{ok} <Link href="/loja/carrinho/">Ir para o carrinho</Link></>}</Aviso>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      {dados.indisponiveis > 0 && <Aviso tipo="atencao">{dados.indisponiveis} produto(s) da lista saíram do seu catálogo e não aparecem.</Aviso>}
      {!dados.itens.length ? <Vazio>Lista vazia. Use “Guardar numa lista” no carrinho ou na página do produto.</Vazio> : (
        <div className="cartao tabela-rolagem">
          <table>
            <thead><tr><th>Produto</th><th>Quantidade</th><th className="direita">Total</th><th /></tr></thead>
            <tbody>{dados.itens.map(({ produto: p, quantidade }) => (
              <tr key={p.id}>
                <td><Link href={`/loja/produto/?id=${p.id}`}><b>{p.nome}</b></Link><div className="pequeno muted">{p.codigo} · {reais(preco(p))} / {p.unidade} · {p.estoque} em estoque</div></td>
                <td><Passo valor={quantidade} multiplo={p.multiplo_venda} onChange={(v) => v > 0 && void definir(p.id, v)} /></td>
                <td className="direita numero">{reais(preco(p) * quantidade)}</td>
                <td><button className="botao leve pequeno" onClick={() => void definir(p.id, 0)}>Tirar</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
