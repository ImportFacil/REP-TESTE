'use client';
import Link from 'next/link';
import { useEu } from '@/components/Shell';
import { Aviso, Cabecalho, Carregando, Situacao, Vazio } from '@/components/ui';
import { dataHora, FORMA, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Requisicao { id: number; situacao: string; forma_pagamento: string; total_estimado_centavos: number; ordem_compra: string | null; criado_em: string; solicitante: string; decidida_por: string | null; pedido_id: number | null; qtd_itens: number; motivo: string | null }
const SITUACAO_REQUISICAO: Record<string, string> = { pendente: 'Esperando aprovação', aprovada: 'Aprovada', recusada: 'Recusada', cancelada: 'Cancelada' };

/** Aprovações (B2B): compras acima do limite do comprador, esperando o aprovador da empresa. */
export default function Aprovacoes() {
  const { eu } = useEu();
  const aprovador = eu.usuario.papel === 'aprovador';
  const { dados, erro } = useDados<Requisicao[]>('/empresa/requisicoes');
  return (
    <>
      <Cabecalho titulo="Aprovações de compra" sub={aprovador
        ? 'Compras dos compradores que passaram do limite de cada um. Ao aprovar, o pedido é fechado em nome de quem pediu.'
        : 'As compras que você mandou para o aprovador da empresa. O limite de cada comprador é definido pelo aprovador, em Conta e usuários.'} />
      <Aviso tipo="erro">{erro}</Aviso>
      {!dados ? <Carregando /> : !dados.length ? <Vazio>Nenhuma requisição.</Vazio> : (
        <div className="cartao tabela-rolagem">
          <table>
            <thead><tr><th>Nº</th><th>Quem pediu</th><th>Quando</th><th className="direita">Valor estimado</th><th>Situação</th><th /></tr></thead>
            <tbody>{dados.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/loja/aprovacao/?id=${r.id}`}><b>{r.id}</b></Link></td>
                <td>{r.solicitante}<div className="pequeno muted">{r.qtd_itens} produto(s) · {FORMA[r.forma_pagamento]}{r.ordem_compra ? ` · OC ${r.ordem_compra}` : ''}</div></td>
                <td className="pequeno">{dataHora(r.criado_em)}</td>
                <td className="direita numero">{reais(r.total_estimado_centavos)}</td>
                <td><Situacao valor={r.situacao === 'aprovada' ? 'aprovado' : r.situacao} nomes={{ ...SITUACAO_REQUISICAO, aprovado: 'Aprovada' }} />{r.decidida_por && <div className="pequeno muted">{r.decidida_por}</div>}</td>
                <td>{r.pedido_id ? <Link href={`/loja/pedido/?id=${r.pedido_id}`}>Pedido {r.pedido_id}</Link> : <Link href={`/loja/aprovacao/?id=${r.id}`}>{aprovador && r.situacao === 'pendente' ? 'Decidir ›' : 'Ver ›'}</Link>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
