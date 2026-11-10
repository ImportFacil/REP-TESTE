'use client';
import type { ReactNode } from 'react';
import { Copiar, Situacao } from './ui';
import { FORMA, SITUACAO_PAGAMENTO, SITUACAO_PEDIDO, data, dataHora, reais, enderecoEmLinha } from '@/lib/formato';

export interface PedidoDetalhe {
  id: number;
  razao_social: string;
  comprador: string;
  forma_pagamento: string;
  parcelas: number;
  subtotal_centavos: number;
  desconto_centavos: number;
  juros_centavos: number;
  total_centavos: number;
  promocao_centavos?: number;
  cupom?: string | null;
  ordem_compra?: string | null;
  cotacao_id?: number | null;
  requisicao_id?: number | null;
  situacao: string;
  situacao_pagamento: string;
  observacao: string | null;
  endereco_entrega?: { cep: string; logradouro: string; numero: string; complemento?: string; bairro: string; cidade: string; uf: string } | null;
  criado_em: string;
  faturado_em: string | null;
  itens: Array<{ id: number; produto_id: number; codigo: string; nome: string; unidade: string; quantidade: number; preco_unitario_centavos: number; total_centavos: number }>;
  eventos: Array<{ id: number; descricao: string; criado_em: string }>;
  cobrancas: Array<{
    id: number; meio: string; situacao: string; expira_em: string | null;
    parcelas: Array<{ id: number; numero: number; valor_centavos: number; vencimento: string; situacao: string; linha_digitavel: string | null; pix_copia_cola: string | null; pago_em: string | null }>;
  }>;
}

/** Corpo comum do pedido (cliente e equipe): itens, valores, pagamento e histórico. */
export function CorpoPedido({ p, acoesParcela }: { p: PedidoDetalhe; acoesParcela?: (parcelaId: number) => ReactNode }) {
  const pendentes = p.cobrancas.filter((c) => c.situacao === 'pendente');
  return (
    <div className="grade grade-lado">
      <div className="pilha">
        <div className="cartao">
          <h2>Itens</h2>
          <div className="tabela-rolagem">
            <table>
              <thead><tr><th>Produto</th><th className="direita">Qtd.</th><th className="direita">Unitário</th><th className="direita">Total</th></tr></thead>
              <tbody>
                {p.itens.map((i) => (
                  <tr key={i.id}>
                    <td><b>{i.nome}</b><div className="pequeno muted">{i.codigo}</div></td>
                    <td className="direita numero">{i.quantidade} {i.unidade}</td>
                    <td className="direita numero">{reais(i.preco_unitario_centavos)}</td>
                    <td className="direita numero">{reais(i.total_centavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="cartao">
          <h2>Histórico</h2>
          <ul className="etapas">
            {p.eventos.map((e) => (
              <li key={e.id} className="feita"><span className="ponto" /><span>{e.descricao}<div className="pequeno muted">{dataHora(e.criado_em)}</div></span></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="pilha">
        <div className="cartao pilha">
          <div className="linha entre"><span>Pedido</span><Situacao valor={p.situacao} nomes={SITUACAO_PEDIDO} /></div>
          <div className="linha entre"><span>Pagamento</span><Situacao valor={p.situacao_pagamento} nomes={SITUACAO_PAGAMENTO} /></div>
          <div className="linha entre"><span>Forma</span><b>{FORMA[p.forma_pagamento]}{p.forma_pagamento !== 'pix' ? ` em ${p.parcelas}×` : ''}</b></div>
          <hr style={{ border: 0, borderTop: '1px solid var(--borda)', width: '100%' }} />
          <div className="linha entre"><span>Subtotal</span><span className="numero">{reais(p.subtotal_centavos)}</span></div>
          {(p.promocao_centavos ?? 0) > 0 && <div className="linha entre"><span>{p.cupom ? `Cupom ${p.cupom}` : 'Promoção'}</span><span className="numero">− {reais(p.promocao_centavos)}</span></div>}
          {p.desconto_centavos > 0 && <div className="linha entre"><span>Desconto Pix</span><span className="numero">− {reais(p.desconto_centavos)}</span></div>}
          {p.juros_centavos > 0 && <div className="linha entre"><span>Juros do cartão</span><span className="numero">+ {reais(p.juros_centavos)}</span></div>}
          <div className="linha entre"><b>Total</b><b className="numero">{reais(p.total_centavos)}</b></div>
          {p.ordem_compra && <p className="pequeno muted">Ordem de compra: <b>{p.ordem_compra}</b></p>}
          {p.cotacao_id && <p className="pequeno muted">Preço negociado na cotação nº {p.cotacao_id}</p>}
          {p.requisicao_id && <p className="pequeno muted">Aprovado pela requisição nº {p.requisicao_id}</p>}
          {p.endereco_entrega && <p className="pequeno muted">Entrega: {enderecoEmLinha(p.endereco_entrega)}</p>}
          {p.observacao && <p className="pequeno muted">Obs.: {p.observacao}</p>}
        </div>
        {pendentes.some((c) => c.meio === 'pix') && (
          <div className="cartao pilha">
            <h2>Pague com Pix</h2>
            {pendentes.filter((c) => c.meio === 'pix').map((c) => (
              <div key={c.id} className="pilha">
                <p className="pequeno muted">Válido até {dataHora(c.expira_em)}. O pedido é liberado assim que o banco confirma.</p>
                {c.parcelas[0]?.pix_copia_cola && <Copiar texto={c.parcelas[0].pix_copia_cola} rotulo="Copiar Pix copia e cola" />}
                {acoesParcela?.(c.parcelas[0].id)}
              </div>
            ))}
          </div>
        )}
        {p.cobrancas.some((c) => c.meio === 'boleto') && (
          <div className="cartao pilha">
            <h2>Boletos</h2>
            {p.cobrancas.filter((c) => c.meio === 'boleto').flatMap((c) => c.parcelas).map((pa) => (
              <div key={pa.id} className="pilha" style={{ borderBottom: '1px solid var(--borda)', paddingBottom: 12 }}>
                <div className="linha entre">
                  <b>{pa.numero}ª · {reais(pa.valor_centavos)}</b>
                  <span className="linha"><span className="pequeno muted">vence {data(pa.vencimento)}</span><Situacao valor={pa.situacao} /></span>
                </div>
                {pa.situacao !== 'paga' && pa.linha_digitavel && <Copiar texto={pa.linha_digitavel} rotulo="Copiar linha digitável" />}
                {pa.situacao !== 'paga' && acoesParcela?.(pa.id)}
              </div>
            ))}
          </div>
        )}
        {p.forma_pagamento === 'boleto' && p.situacao_pagamento === 'aguardando_faturamento' && (
          <div className="aviso info">Os boletos são emitidos no faturamento, junto com a nota fiscal.</div>
        )}
      </div>
    </div>
  );
}
