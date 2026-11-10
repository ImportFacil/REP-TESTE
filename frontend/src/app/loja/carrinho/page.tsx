'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { GuardarNaLista } from '@/components/GuardarNaLista';
import { Passo } from '@/components/Produto';
import { useEu } from '@/components/Shell';
import { Aviso, Cabecalho, Carregando, Vazio } from '@/components/ui';
import { api } from '@/lib/api';
import { definirQuantidade, esvaziar, useCarrinho } from '@/lib/carrinho';
import { data, enderecoEmLinha, reais } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface Cotacao {
  itens: Array<{ produto_id: number; quantidade: number; preco_unitario_centavos: number; total_centavos: number; problema: string | null; nome: string; unidade: string; multiplo_venda: number }>;
  subtotal_centavos: number;
  pedido_minimo_centavos: number;
  falta_para_minimo_centavos: number;
  atinge_pedido_minimo: boolean;
  pode_fechar: boolean;
  promocao: { id: number; nome: string; cupom: string | null; desconto_centavos: number } | null;
  cupom_erro: string | null;
  total_com_promocao_centavos: number;
}

interface Condicoes {
  gateway_habilitado: boolean;
  pix: { desconto_centavos: number; total_centavos: number; validade_horas: number };
  boleto: { disponivel: boolean; motivo: string | null; opcoes: Array<{ parcelas: number; valores_centavos: number[]; vencimentos_previstos: string[] }>; observacao: string };
  cartao: Array<{ parcelas: number; valor_parcela_centavos: number; total_centavos: number; juros_centavos: number; sem_juros: boolean }>;
  credito: { limite_centavos: number; disponivel_centavos: number; faixa: string | null };
}

const PROBLEMAS: Record<string, string> = {
  fora_do_multiplo: 'Quantidade fora do múltiplo de venda',
  sem_estoque: 'Sem estoque suficiente',
  sob_orcamento: 'Produto sob orçamento',
  quantidade_invalida: 'Quantidade inválida',
};

export default function Carrinho() {
  const router = useRouter();
  const { eu } = useEu();
  const itens = useCarrinho();
  const [cotacao, setCotacao] = useState<Cotacao | null>(null);
  const [condicoes, setCondicoes] = useState<Condicoes | null>(null);
  const [erroCotacao, setErroCotacao] = useState<string | null>(null);
  const [forma, setForma] = useState<'pix' | 'boleto' | 'cartao'>('pix');
  const [parcelas, setParcelas] = useState(1);
  const [recusar, setRecusar] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [cupomTexto, setCupomTexto] = useState('');
  const [cupom, setCupom] = useState('');
  const enderecos = useDados<Array<{ id: number; apelido: string; padrao: boolean; endereco: { cep: string; logradouro: string; numero: string; complemento?: string; bairro: string; cidade: string; uf: string } }>>('/loja/enderecos');
  const [enderecoId, setEnderecoId] = useState<number | null>(null);
  const fechar = useAcao();
  const chave = useMemo(() => JSON.stringify(itens.map((i) => [i.produto_id, i.quantidade])), [itens]);

  useEffect(() => {
    if (!itens.length) {
      setCotacao(null);
      return;
    }
    const t = setTimeout(() => {
      api<Cotacao>('/catalogo/cotacao', { corpo: { itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade })), ...(cupom && { cupom }) } })
        .then((c) => { setCotacao(c); setErroCotacao(null); })
        .catch((e) => setErroCotacao(e.message));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, cupom]);

  useEffect(() => {
    if (!cotacao?.pode_fechar) {
      setCondicoes(null);
      return;
    }
    api<Condicoes>(`/pedidos/condicoes?subtotal_centavos=${cotacao.total_com_promocao_centavos}`).then(setCondicoes).catch(() => setCondicoes(null));
  }, [cotacao]);

  useEffect(() => {
    if (forma === 'boleto' && condicoes && !condicoes.boleto.disponivel) setForma('pix');
    setParcelas(1);
  }, [forma, condicoes]);

  if (!itens.length) {
    return (
      <>
        <Cabecalho titulo="Carrinho" />
        <Vazio>O carrinho está vazio. <Link href="/loja/catalogo/">Ver o catálogo</Link></Vazio>
      </>
    );
  }

  const linha = (id: number) => cotacao?.itens.find((i) => i.produto_id === id);
  const totalEscolhido =
    forma === 'pix' ? condicoes?.pix.total_centavos : forma === 'cartao' ? condicoes?.cartao[parcelas - 1]?.total_centavos : cotacao?.total_com_promocao_centavos;

  const confirmar = () =>
    fechar.executar(async () => {
      const p = await api<{ id: number }>('/pedidos', {
        corpo: {
          itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade })),
          forma_pagamento: forma,
          parcelas,
          ...(forma === 'cartao' && { token_cartao: recusar ? 'tok_recusado' : 'tok_teste' }),
          ...(observacao.trim() && { observacao: observacao.trim() }),
          ...(cupom && !cotacao?.cupom_erro && { cupom }),
          ...(enderecoId && { endereco_id: enderecoId }),
        },
      });
      esvaziar();
      router.push(`/loja/pedido/?id=${p.id}`);
    });

  return (
    <>
      <Cabecalho titulo="Carrinho" sub="Os preços são os da sua tabela e ficam congelados quando o pedido é fechado." />
      <div className="grade grade-lado">
        <div className="cartao">
          <div className="tabela-rolagem">
            <table>
              <thead><tr><th>Produto</th><th>Quantidade</th><th className="direita">Total</th></tr></thead>
              <tbody>
                {itens.map((i) => {
                  const l = linha(i.produto_id);
                  return (
                    <tr key={i.produto_id}>
                      <td>
                        <b>{i.nome}</b>
                        <div className="pequeno muted">{i.codigo} · {reais(l?.preco_unitario_centavos ?? i.preco_cliente_centavos)} / {i.unidade} · múltiplo {i.multiplo_venda}</div>
                        {l?.problema && <div className="pequeno" style={{ color: 'var(--vermelho)' }}>{PROBLEMAS[l.problema] ?? l.problema}</div>}
                      </td>
                      <td>
                        <Passo valor={i.quantidade} multiplo={i.multiplo_venda} onChange={(v) => definirQuantidade(i.produto_id, v)} />
                        <div><button className="botao leve pequeno" onClick={() => definirQuantidade(i.produto_id, 0)}>Remover</button></div>
                      </td>
                      <td className="direita numero">{l ? reais(l.total_centavos) : '…'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="linha entre" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            <GuardarNaLista itens={itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade }))} rotulo="Guardar o carrinho numa lista" />
            <Link className="pequeno" href="/loja/pedido-rapido/">Pedido rápido por código ›</Link>
          </div>
        </div>

        <div className="pilha">
          <div className="cartao pilha">
            <h2>Resumo</h2>
            <Aviso tipo="erro">{erroCotacao}</Aviso>
            {!cotacao ? <Carregando texto="Calculando…" /> : (
              <>
                <div className="linha entre"><span>Subtotal</span><b className="numero">{reais(cotacao.subtotal_centavos)}</b></div>
                <div className="linha entre muted pequeno"><span>Pedido mínimo</span><span>{reais(cotacao.pedido_minimo_centavos)}</span></div>
                {!cotacao.atinge_pedido_minimo && <Aviso tipo="atencao">Faltam {reais(cotacao.falta_para_minimo_centavos)} para o pedido mínimo.</Aviso>}
                {cotacao.atinge_pedido_minimo && !cotacao.pode_fechar && <Aviso tipo="atencao">Ajuste os itens marcados em vermelho.</Aviso>}
                {cotacao.promocao && (
                  <>
                    <div className="linha entre" style={{ color: 'var(--verde)' }}>
                      <span>{cotacao.promocao.cupom ? `Cupom ${cotacao.promocao.cupom}` : 'Promoção'} · {cotacao.promocao.nome}</span>
                      <b className="numero">− {reais(cotacao.promocao.desconto_centavos)}</b>
                    </div>
                    <div className="linha entre"><span>Total dos produtos</span><b className="numero">{reais(cotacao.total_com_promocao_centavos)}</b></div>
                  </>
                )}
                <form className="linha" onSubmit={(e) => { e.preventDefault(); setCupom(cupomTexto.trim().toUpperCase()); }}>
                  <input value={cupomTexto} onChange={(e) => setCupomTexto(e.target.value)} placeholder="Cupom de desconto" aria-label="Cupom de desconto" style={{ flex: 1, minWidth: 0, textTransform: 'uppercase' }} maxLength={30} />
                  {cupom ? <button type="button" className="botao leve" onClick={() => { setCupom(''); setCupomTexto(''); }}>Tirar</button> : <button className="botao secundario" disabled={!cupomTexto.trim()}>Aplicar</button>}
                </form>
                {cupom && cotacao.cupom_erro && <Aviso tipo="atencao">{cotacao.cupom_erro}</Aviso>}
              </>
            )}
          </div>

          {condicoes && (
            <div className="cartao pilha">
              <h2>Pagamento</h2>
              {!condicoes.gateway_habilitado && <Aviso tipo="atencao">Pix e cartão ainda não estão habilitados neste ambiente. O boleto continua disponível para empresas aprovadas.</Aviso>}
              <label className={`opcao ${forma === 'pix' ? 'marcada' : ''}`}>
                <input type="radio" name="forma" checked={forma === 'pix'} onChange={() => setForma('pix')} />
                <span>
                  <b>Pix à vista · {reais(condicoes.pix.total_centavos)}</b>
                  <div className="pequeno muted">Desconto de {reais(condicoes.pix.desconto_centavos)}. O código vale {condicoes.pix.validade_horas} h; o pedido é liberado quando o banco confirma.</div>
                </span>
              </label>
              <label className={`opcao ${forma === 'boleto' ? 'marcada' : ''} ${condicoes.boleto.disponivel ? '' : 'desabilitada'}`}>
                <input type="radio" name="forma" disabled={!condicoes.boleto.disponivel} checked={forma === 'boleto'} onChange={() => setForma('boleto')} />
                <span>
                  <b>Boleto parcelado (30/60/90/120 dias)</b>
                  <div className="pequeno muted">{condicoes.boleto.disponivel ? `Limite disponível: ${reais(condicoes.credito.disponivel_centavos)}. ${condicoes.boleto.observacao}` : condicoes.boleto.motivo}</div>
                  {!condicoes.boleto.disponivel && condicoes.credito.faixa === null && <Link className="pequeno" href="/loja/credito/">Fazer o cadastro de crédito ›</Link>}
                </span>
              </label>
              {forma === 'boleto' && (
                <select value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} aria-label="Parcelas do boleto">
                  {condicoes.boleto.opcoes.map((o) => (
                    <option key={o.parcelas} value={o.parcelas}>
                      {o.parcelas}× de {reais(o.valores_centavos[o.valores_centavos.length - 1])} (previsão: {o.vencimentos_previstos.map((v) => data(v)).join(', ')})
                    </option>
                  ))}
                </select>
              )}
              <label className={`opcao ${forma === 'cartao' ? 'marcada' : ''}`}>
                <input type="radio" name="forma" checked={forma === 'cartao'} onChange={() => setForma('cartao')} />
                <span>
                  <b>Cartão de crédito em até {condicoes.cartao.length}×</b>
                  <div className="pequeno muted">Aprovação na hora. Sem juros até {condicoes.cartao.filter((c) => c.sem_juros).length}×.</div>
                </span>
              </label>
              {forma === 'cartao' && (
                <>
                  <select value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} aria-label="Parcelas do cartão">
                    {condicoes.cartao.map((c) => (
                      <option key={c.parcelas} value={c.parcelas}>
                        {c.parcelas}× de {reais(c.valor_parcela_centavos)} {c.sem_juros ? 'sem juros' : `(total ${reais(c.total_centavos)})`}
                      </option>
                    ))}
                  </select>
                  <Aviso tipo="info">
                    Os dados do cartão são digitados no formulário seguro do gateway de pagamento; a ImportFácil nunca vê o número do cartão.
                    Neste ambiente de testes o pagamento é simulado.
                  </Aviso>
                  <label className="linha pequeno"><input type="checkbox" checked={recusar} onChange={(e) => setRecusar(e.target.checked)} style={{ width: 'auto' }} /> Simular cartão recusado</label>
                </>
              )}
              <label className="campo">Entrega
                {enderecos.dados?.length ? (
                  <select value={enderecoId ?? enderecos.dados.find((x) => x.padrao)?.id ?? ''} onChange={(e) => setEnderecoId(Number(e.target.value))} aria-label="Endereço de entrega">
                    {enderecos.dados.map((x) => <option key={x.id} value={x.id}>{x.apelido}{x.padrao ? ' (padrão)' : ''}: {enderecoEmLinha(x.endereco)}</option>)}
                  </select>
                ) : <span className="pequeno muted" style={{ fontWeight: 400 }}>Sem endereço cadastrado: a ImportFácil combina a entrega. <Link href="/loja/enderecos/">Cadastrar endereços</Link></span>}
              </label>
              <textarea placeholder="Observação para a ImportFácil (opcional)" value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} />
              <div className="linha entre"><span>Total</span><b style={{ fontSize: '1.2rem' }} className="numero">{reais(totalEscolhido)}</b></div>
              <Aviso tipo="erro">{fechar.erro}</Aviso>
              <button className="botao largo" disabled={fechar.enviando || eu.empresa?.situacao !== 'ativa'} onClick={() => void confirmar()}>
                {fechar.enviando ? 'Fechando o pedido…' : 'Fechar pedido'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
