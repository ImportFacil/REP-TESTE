'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Fechamento, type CorpoFechamento } from '@/components/Fechamento';
import { useEu } from '@/components/Shell';
import { Aviso, Carregando, Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { dataHora, FORMA, reais } from '@/lib/formato';
import { useAcao, useDados, useParametro } from '@/lib/hooks';

interface Requisicao {
  id: number; situacao: string; forma_pagamento: 'pix' | 'boleto' | 'cartao'; parcelas: number; cupom: string | null; endereco_id: number | null; ordem_compra: string | null; observacao: string | null;
  total_estimado_centavos: number; criado_em: string; decidida_em: string | null; motivo: string | null; pedido_id: number | null; solicitante: string; limite_solicitante: number | null; decidida_por_nome: string | null;
  itens: Array<{ produto_id: number; quantidade: number; codigo?: string; nome?: string; unidade?: string; preco_unitario_centavos: number | null; total_centavos: number | null; problema: string | null }>;
  subtotal_hoje_centavos: number | null; pode_aprovar: boolean;
}
const NOMES: Record<string, string> = { pendente: 'Esperando aprovação', aprovado: 'Aprovada', recusada: 'Recusada', cancelada: 'Cancelada' };

/** Uma requisição de compra: o aprovador vê os preços de hoje, escolhe o pagamento e aprova (ou recusa com motivo). */
export default function Aprovacao() {
  const id = useParametro('id');
  const router = useRouter();
  const { eu } = useEu();
  const { dados: r, erro, setDados } = useDados<Requisicao>(id ? `/empresa/requisicoes/${id}` : null);
  const [corpo, setCorpo] = useState<CorpoFechamento | null>(null);
  const acao = useAcao();
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!r) return <Carregando />;
  const aprovador = eu.usuario.papel === 'aprovador';
  const pendente = r.situacao === 'pendente';
  const aprovar = () => acao.executar(async () => {
    const x = await api<{ pedido: { id: number } }>(`/empresa/requisicoes/${r.id}/aprovar`, { corpo: corpo ?? {} });
    router.push(`/loja/pedido/?id=${x.pedido.id}`);
  });
  const recusar = () => {
    const motivo = window.prompt('Motivo da recusa (quem pediu vê este texto):')?.trim();
    if (motivo) void acao.executar(async () => setDados(await api<Requisicao>(`/empresa/requisicoes/${r.id}/recusar`, { corpo: { motivo } })));
  };
  const cancelar = () => acao.executar(async () => setDados(await api<Requisicao>(`/empresa/requisicoes/${r.id}/cancelar`, { metodo: 'POST' })));
  return (
    <>
      <p className="pequeno"><Link href="/loja/aprovacoes/">‹ Aprovações de compra</Link></p>
      <div className="linha entre" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Requisição nº {r.id}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>De {r.solicitante}, {dataHora(r.criado_em)}{r.limite_solicitante ? ` · limite de compra: ${reais(r.limite_solicitante)}` : ''}</p>
        </div>
        <Situacao valor={r.situacao === 'aprovada' ? 'aprovado' : r.situacao} nomes={NOMES} />
      </div>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      {r.motivo && <Aviso tipo="atencao">Motivo da recusa: {r.motivo}</Aviso>}
      {r.pedido_id && <Aviso tipo="ok">Aprovada por {r.decidida_por_nome}. <Link href={`/loja/pedido/?id=${r.pedido_id}`}>Ver o pedido {r.pedido_id}</Link></Aviso>}
      <div className="grade grade-lado">
        <div className="cartao tabela-rolagem">
          <table>
            <thead><tr><th>Produto</th><th className="direita">Qtd.</th><th className="direita">Preço de hoje</th><th className="direita">Total</th></tr></thead>
            <tbody>{r.itens.map((i) => (
              <tr key={i.produto_id}>
                <td><b>{i.nome}</b><div className="pequeno muted">{i.codigo}</div>{i.problema && <div className="pequeno" style={{ color: 'var(--vermelho)' }}>{i.problema === 'sem_estoque' ? 'Sem estoque suficiente agora' : 'Indisponível'}</div>}</td>
                <td className="direita">{i.quantidade} {i.unidade}</td>
                <td className="direita numero">{i.preco_unitario_centavos !== null ? reais(i.preco_unitario_centavos) : '—'}</td>
                <td className="direita numero">{i.total_centavos !== null ? reais(i.total_centavos) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className="pequeno muted">Estimado quando foi pedida: {reais(r.total_estimado_centavos)} ({FORMA[r.forma_pagamento]}{r.cupom ? `, cupom ${r.cupom}` : ''}). O pedido sai com os preços do momento da aprovação.</p>
          {r.observacao && <p className="pequeno">Obs.: {r.observacao}</p>}
        </div>
        <div className="cartao pilha">
          {pendente && aprovador ? (
            <>
              <h2 style={{ margin: 0 }}>Aprovar e fechar o pedido</h2>
              <Fechamento subtotal={r.subtotal_hoje_centavos ?? r.total_estimado_centavos} inicial={{ forma_pagamento: r.forma_pagamento, parcelas: r.parcelas, endereco_id: r.endereco_id ?? undefined, ordem_compra: r.ordem_compra ?? undefined, observacao: r.observacao ?? undefined }} aoMudar={setCorpo} />
              <button className="botao largo" disabled={acao.enviando || !r.pode_aprovar} onClick={() => void aprovar()}>Aprovar e fechar o pedido</button>
              <button className="botao leve" disabled={acao.enviando} onClick={recusar}>Recusar</button>
              {!r.pode_aprovar && <span className="pequeno" style={{ color: 'var(--vermelho)' }}>Algum item mudou (estoque ou catálogo). Recuse e peça uma nova compra.</span>}
            </>
          ) : pendente ? (
            <>
              <h2 style={{ margin: 0 }}>Esperando o aprovador</h2>
              <p className="pequeno muted">O aprovador da empresa recebeu um aviso. Enquanto isso, você pode desistir.</p>
              <button className="botao leve" disabled={acao.enviando} onClick={() => void cancelar()}>Cancelar requisição</button>
            </>
          ) : <p className="muted">{NOMES[r.situacao === 'aprovada' ? 'aprovado' : r.situacao]}{r.decidida_em ? ` em ${dataHora(r.decidida_em)}` : ''}{r.decidida_por_nome ? ` por ${r.decidida_por_nome}` : ''}.</p>}
        </div>
      </div>
    </>
  );
}
