'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { ProdutoApi } from '@/components/Produto';
import { Aviso, Cabecalho } from '@/components/ui';
import { api } from '@/lib/api';
import { adicionar } from '@/lib/carrinho';
import { reais } from '@/lib/formato';
import { useAcao } from '@/lib/hooks';

interface Linha { n: number; codigo: string; quantidade: number; produto?: ProdutoApi; problema?: string }

/** "CODIGO;QTD", "CODIGO QTD" ou "CODIGO<tab>QTD" (copiado de uma planilha). Sem quantidade, vale o múltiplo de venda. */
function lerTexto(texto: string): Array<{ n: number; codigo: string; quantidade: number | null }> {
  return texto.split(/\r?\n/).map((l, k) => ({ l: l.trim(), n: k + 1 })).filter((x) => x.l).map(({ l, n }) => {
    const [codigo, qtd] = l.split(/[;,\t ]+/);
    const quantidade = qtd ? Number(qtd.replace(/\D/g, '')) : null;
    return { n, codigo: codigo.toUpperCase(), quantidade: quantidade && quantidade > 0 ? quantidade : null };
  });
}

/** Pedido rápido (como no B2B do Bagisto): digite ou cole códigos e quantidades e mande tudo para o carrinho. */
export default function PedidoRapido() {
  const [texto, setTexto] = useState('');
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [enviado, setEnviado] = useState(0);
  const acao = useAcao();

  const conferir = () => acao.executar(async () => {
    const lidas = lerTexto(texto).slice(0, 200);
    const codigos = [...new Set(lidas.map((l) => l.codigo))].filter((c) => /^[A-Z0-9._-]+$/.test(c));
    const r = codigos.length ? await api<{ itens: ProdutoApi[] }>(`/catalogo/produtos?por_pagina=500&codigos=${encodeURIComponent(codigos.join(','))}`) : { itens: [] };
    const porCodigo = new Map(r.itens.map((p) => [p.codigo, p]));
    setEnviado(0);
    setLinhas(lidas.map((l) => {
      const p = porCodigo.get(l.codigo);
      if (!p) return { n: l.n, codigo: l.codigo, quantidade: l.quantidade ?? 0, problema: 'Código não encontrado no seu catálogo.' };
      const q = l.quantidade ?? p.multiplo_venda;
      const problema = p.sob_orcamento ? 'Vendido sob orçamento.' : q % p.multiplo_venda ? `Use múltiplos de ${p.multiplo_venda}.` : q > p.estoque ? `Só ${p.estoque} em estoque.` : undefined;
      return { n: l.n, codigo: l.codigo, quantidade: q, produto: p, problema };
    }));
  });
  const validas = linhas?.filter((l) => l.produto && !l.problema) ?? [];
  const mandar = () => {
    for (const l of validas) {
      const p = l.produto!;
      adicionar({ produto_id: p.id, quantidade: l.quantidade, nome: p.nome, codigo: p.codigo, unidade: p.unidade, multiplo_venda: p.multiplo_venda, preco_cliente_centavos: p.preco_cliente_centavos ?? p.preco_tabela_centavos });
    }
    setEnviado(validas.length);
  };

  return (
    <>
      <Cabecalho titulo="Pedido rápido" sub="Para quem já sabe os códigos: uma linha por produto, com o código e a quantidade. Dá para colar direto de uma planilha." />
      <div className="grade grade-2" style={{ alignItems: 'start' }}>
        <div className="cartao formulario">
          <label className="campo">Códigos e quantidades
            <textarea rows={10} value={texto} onChange={(e) => { setTexto(e.target.value); setLinhas(null); }} placeholder={'EP-CP01;100\nMQ-EN01;1\nIR-TB10 20'} style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 400 }} />
          </label>
          <span className="pequeno muted">Separe por ponto e vírgula, vírgula, espaço ou tabulação. Sem quantidade, vale o múltiplo de venda do produto. Até 200 linhas.</span>
          <button className="botao" disabled={!texto.trim() || acao.enviando} onClick={() => void conferir()}>Conferir</button>
          <Aviso tipo="erro">{acao.erro}</Aviso>
        </div>
        <div className="cartao pilha">
          <h2 style={{ margin: 0 }}>Conferência</h2>
          {!linhas ? <p className="muted">Clique em Conferir para ver preço, estoque e problemas de cada linha.</p> : (
            <>
              <div className="tabela-rolagem">
                <table>
                  <thead><tr><th>Código</th><th>Produto</th><th className="direita">Qtd.</th><th className="direita">Total</th></tr></thead>
                  <tbody>{linhas.map((l) => (
                    <tr key={l.n}>
                      <td><code>{l.codigo}</code></td>
                      <td>{l.produto ? <>{l.produto.nome}<div className="pequeno muted">{reais(l.produto.preco_cliente_centavos ?? l.produto.preco_tabela_centavos)} / {l.produto.unidade}</div></> : null}
                        {l.problema && <div className="pequeno" style={{ color: 'var(--vermelho)' }}>{l.problema}</div>}</td>
                      <td className="direita">{l.quantidade || '—'}</td>
                      <td className="direita numero">{l.produto && !l.problema ? reais((l.produto.preco_cliente_centavos ?? l.produto.preco_tabela_centavos) * l.quantidade) : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="linha entre">
                <span>{validas.length} de {linhas.length} linha(s) prontas</span>
                <b className="numero">{reais(validas.reduce((s, l) => s + (l.produto!.preco_cliente_centavos ?? l.produto!.preco_tabela_centavos) * l.quantidade, 0))}</b>
              </div>
              <button className="botao" disabled={!validas.length || enviado > 0} onClick={mandar}>Adicionar {validas.length} ao carrinho</button>
              {enviado > 0 && <Aviso tipo="ok">{enviado} produto(s) no carrinho. <Link href="/loja/carrinho/">Ir para o carrinho</Link></Aviso>}
            </>
          )}
        </div>
      </div>
    </>
  );
}
