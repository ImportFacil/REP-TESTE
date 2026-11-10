'use client';
import Link from 'next/link';
import { Fragment } from 'react';
import type { ProdutoApi } from '@/components/Produto';
import { Aviso, Cabecalho, Carregando, Vazio } from '@/components/ui';
import { adicionar } from '@/lib/carrinho';
import { reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';
import { alternarComparar, limparComparar, useComparar } from '@/lib/loja';

interface Atributo { codigo: string; nome: string; unidade: string | null }

/** Comparar produtos (como no Bagisto): até 4 lado a lado, com preço, estoque, atributos e especificações. */
export default function Comparar() {
  const ids = useComparar();
  const { dados, erro } = useDados<{ itens: ProdutoApi[] }>(ids.length ? `/catalogo/produtos?ids=${ids.join(',')}&por_pagina=10` : null);
  const atributos = useDados<Atributo[]>('/catalogo/atributos');
  if (!ids.length) return <><Cabecalho titulo="Comparar produtos" /><Vazio>Marque até 4 produtos com o ícone da balança no catálogo. <Link href="/loja/catalogo/">Ver o catálogo</Link></Vazio></>;
  const produtos = ids.map((id) => dados?.itens.find((p) => p.id === id)).filter((p): p is ProdutoApi => !!p);
  const usados = (atributos.dados ?? []).filter((a) => produtos.some((p) => p.atributos?.[a.codigo]));
  const specs = [...new Set(produtos.flatMap((p) => p.especificacoes.map((e) => e.nome)))];
  const diferente = (valores: string[]) => new Set(valores).size > 1;
  const linha = (rotulo: string, valores: string[]) => (
    <tr key={rotulo} className={diferente(valores) ? 'difere' : ''}>
      <th scope="row">{rotulo}</th>
      {valores.map((v, k) => <td key={k}>{v || <span className="muted">—</span>}</td>)}
    </tr>
  );
  return (
    <>
      <Cabecalho titulo="Comparar produtos" sub="Linhas em destaque têm valores diferentes entre os produtos.">
        <button className="botao leve" onClick={limparComparar}>Limpar comparação</button>
      </Cabecalho>
      <Aviso tipo="erro">{erro}</Aviso>
      {!dados ? <Carregando /> : (
        <div className="cartao tabela-rolagem">
          <table className="comparar">
            <thead>
              <tr>
                <th />
                {produtos.map((p) => (
                  <th key={p.id} style={{ minWidth: 200, verticalAlign: 'top' }}>
                    <Link href={`/loja/produto/?id=${p.id}`}>{p.nome}</Link>
                    <div className="pequeno muted" style={{ fontWeight: 400 }}>{p.marca} · {p.codigo}</div>
                    <div className="linha" style={{ marginTop: 8, gap: 6 }}>
                      {!p.sob_orcamento && <button className="botao pequeno" disabled={p.estoque < p.multiplo_venda} onClick={() => adicionar({ produto_id: p.id, quantidade: p.multiplo_venda, nome: p.nome, codigo: p.codigo, unidade: p.unidade, multiplo_venda: p.multiplo_venda, preco_cliente_centavos: p.preco_cliente_centavos ?? p.preco_tabela_centavos })}>Adicionar</button>}
                      <button className="botao leve pequeno" onClick={() => alternarComparar(p.id)}>Tirar</button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linha('Seu preço', produtos.map((p) => (p.sob_orcamento ? 'Sob orçamento' : `${reais(p.preco_cliente_centavos ?? p.preco_tabela_centavos)} / ${p.unidade}`)))}
              {linha('Preço de tabela', produtos.map((p) => reais(p.preco_tabela_centavos)))}
              {linha('Categoria', produtos.map((p) => p.categoria_nome))}
              {linha('Múltiplo de venda', produtos.map((p) => `${p.multiplo_venda} ${p.unidade}`))}
              {linha('Em estoque', produtos.map((p) => `${p.estoque} ${p.unidade}`))}
              {usados.length > 0 && <tr><th colSpan={produtos.length + 1} className="secao">Atributos</th></tr>}
              {usados.map((a) => linha(`${a.nome}${a.unidade ? ` (${a.unidade})` : ''}`, produtos.map((p) => p.atributos?.[a.codigo] ?? '')))}
              {specs.length > 0 && <tr><th colSpan={produtos.length + 1} className="secao">Especificações</th></tr>}
              {specs.map((s) => <Fragment key={s}>{linha(s, produtos.map((p) => p.especificacoes.find((e) => e.nome === s)?.valor ?? ''))}</Fragment>)}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
