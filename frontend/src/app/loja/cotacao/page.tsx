'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Fechamento, type CorpoFechamento } from '@/components/Fechamento';
import { useEu } from '@/components/Shell';
import { Aviso, Carregando, Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { data, dataHora, reais } from '@/lib/formato';
import { useAcao, useDados, useParametro } from '@/lib/hooks';

interface Item { id: number; produto_id: number; quantidade: number; preco_cliente_centavos: number; preco_proposto_centavos: number | null; codigo: string; nome: string; unidade: string; estoque: number }
interface Cotacao {
  id: number; situacao: string; mensagem: string | null; resposta: string | null; validade: string | null; criado_em: string; respondida_em: string | null; pedido_id: number | null;
  solicitante: string; respondida_por_nome: string | null; itens: Item[]; tabela_centavos: number; proposto_centavos: number | null; economia_centavos: number | null;
}
const NOMES: Record<string, string> = { solicitada: 'Esperando a ImportFácil', respondida: 'Respondida', aceita: 'Aceita', recusada: 'Recusada', expirada: 'Expirada', cancelada: 'Cancelada' };
const COR: Record<string, string> = { solicitada: 'pendente', respondida: 'em_aberto', aceita: 'aprovado', recusada: 'recusado', expirada: 'expirada', cancelada: 'cancelada' };

/** Uma cotação de preço: itens com o preço da tabela e o negociado; o aprovador aceita e o pedido sai com o preço combinado. */
export default function CotacaoDePreco() {
  const id = useParametro('id');
  const router = useRouter();
  const { eu } = useEu();
  const { dados: c, erro, setDados } = useDados<Cotacao>(id ? `/empresa/cotacoes/${id}` : null);
  const [corpo, setCorpo] = useState<CorpoFechamento | null>(null);
  const acao = useAcao();
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!c) return <Carregando />;
  const aprovador = eu.usuario.papel === 'aprovador';
  const aceitar = () => acao.executar(async () => {
    const r = await api<{ pedido: { id: number } }>(`/empresa/cotacoes/${c.id}/aceitar`, { corpo });
    router.push(`/loja/pedido/?id=${r.pedido.id}`);
  });
  const mudar = (acaoNome: 'recusar' | 'cancelar') => acao.executar(async () => setDados(await api<Cotacao>(`/empresa/cotacoes/${c.id}/${acaoNome}`, { metodo: 'POST' })));
  return (
    <>
      <p className="pequeno"><Link href="/loja/cotacoes/">‹ Cotações de preço</Link></p>
      <div className="linha entre" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Cotação nº {c.id}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Pedida por {c.solicitante} em {dataHora(c.criado_em)}{c.validade ? ` · válida até ${data(`${c.validade}T12:00:00`)}` : ''}</p>
        </div>
        <Situacao valor={COR[c.situacao]} nomes={{ [COR[c.situacao]]: NOMES[c.situacao] }} />
      </div>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      {c.pedido_id && <Aviso tipo="ok">Aceita. <Link href={`/loja/pedido/?id=${c.pedido_id}`}>Ver o pedido {c.pedido_id}</Link></Aviso>}
      {c.situacao === 'expirada' && <Aviso tipo="atencao">A validade venceu. Fale com a ImportFácil para receber uma nova resposta.</Aviso>}
      <div className="grade grade-lado">
        <div className="cartao tabela-rolagem">
          <table>
            <thead><tr><th>Produto</th><th className="direita">Qtd.</th><th className="direita">Sua tabela</th><th className="direita">Negociado</th><th className="direita">Total</th></tr></thead>
            <tbody>{c.itens.map((i) => (
              <tr key={i.id}>
                <td><Link href={`/loja/produto/?id=${i.produto_id}`}><b>{i.nome}</b></Link><div className="pequeno muted">{i.codigo}</div></td>
                <td className="direita">{i.quantidade} {i.unidade}</td>
                <td className="direita numero">{reais(i.preco_cliente_centavos)}</td>
                <td className="direita numero">{i.preco_proposto_centavos ? <b>{reais(i.preco_proposto_centavos)}</b> : '—'}</td>
                <td className="direita numero">{reais(i.quantidade * (i.preco_proposto_centavos ?? i.preco_cliente_centavos))}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="linha entre" style={{ marginTop: 10 }}><span>Pela sua tabela</span><span className="numero">{reais(c.tabela_centavos)}</span></div>
          {c.proposto_centavos !== null && <>
            <div className="linha entre"><b>Negociado</b><b className="numero">{reais(c.proposto_centavos)}</b></div>
            {(c.economia_centavos ?? 0) > 0 && <div className="linha entre" style={{ color: 'var(--verde)' }}><span>Economia</span><span className="numero">{reais(c.economia_centavos)}</span></div>}
          </>}
          {c.mensagem && <p className="pequeno"><b>Seu pedido:</b> {c.mensagem}</p>}
          {c.resposta && <p className="pequeno"><b>Resposta{c.respondida_por_nome ? ` de ${c.respondida_por_nome}` : ''}:</b> {c.resposta}</p>}
        </div>
        <div className="cartao pilha">
          {c.situacao === 'respondida' && aprovador ? (
            <>
              <h2 style={{ margin: 0 }}>Aceitar e fechar o pedido</h2>
              <p className="pequeno muted" style={{ margin: 0 }}>O pedido sai com o preço negociado (sem promoções). O Pix ainda tem o desconto da política.</p>
              <Fechamento subtotal={c.proposto_centavos ?? 0} aoMudar={setCorpo} />
              <button className="botao largo" disabled={acao.enviando || !corpo} onClick={() => void aceitar()}>Aceitar e fechar o pedido</button>
              <button className="botao leve" disabled={acao.enviando} onClick={() => void mudar('recusar')}>Recusar a proposta</button>
            </>
          ) : c.situacao === 'respondida' ? <p className="muted">A proposta está pronta. Só o aprovador da empresa aceita cotações.</p>
            : c.situacao === 'solicitada' ? (
              <>
                <p className="muted">A ImportFácil vai responder com o preço de cada item e a validade da proposta.</p>
                <button className="botao leve" disabled={acao.enviando} onClick={() => void mudar('cancelar')}>Cancelar a cotação</button>
              </>
            ) : <p className="muted">{NOMES[c.situacao]}.</p>}
        </div>
      </div>
    </>
  );
}
