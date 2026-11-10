'use client';
import Link from 'next/link';
import { Aviso, Cabecalho, Carregando, Situacao, Vazio } from '@/components/ui';
import { data, dataHora, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Cotacao { id: number; situacao: string; validade: string | null; criado_em: string; pedido_id: number | null; solicitante: string; qtd_itens: number; tabela_centavos: number; proposto_centavos: number | null }
const NOMES: Record<string, string> = { solicitada: 'Esperando a ImportFácil', respondida: 'Respondida', aceita: 'Aceita', recusada: 'Recusada', expirada: 'Expirada', cancelada: 'Cancelada' };
const COR: Record<string, string> = { solicitada: 'pendente', respondida: 'em_aberto', aceita: 'aprovado', recusada: 'recusado', expirada: 'expirada', cancelada: 'cancelada' };

/** Cotações de preço (B2B): a empresa pede preço negociado para volumes do catálogo; a ImportFácil responde com preço e validade. */
export default function Cotacoes() {
  const { dados, erro } = useDados<Cotacao[]>('/empresa/cotacoes');
  return (
    <>
      <Cabecalho titulo="Cotações de preço" sub="Preço negociado para produtos do catálogo, em volume. Peça pelo carrinho (“Pedir preço negociado”). Para trazer um produto de fora, use Orçamentos de importação." />
      <Aviso tipo="erro">{erro}</Aviso>
      {!dados ? <Carregando /> : !dados.length ? <Vazio>Nenhuma cotação. Monte o carrinho e clique em “Pedir preço negociado”. <Link href="/loja/carrinho/">Ir para o carrinho</Link></Vazio> : (
        <div className="cartao tabela-rolagem">
          <table>
            <thead><tr><th>Nº</th><th>Pedida</th><th className="direita">Preço da sua tabela</th><th className="direita">Preço negociado</th><th>Validade</th><th>Situação</th></tr></thead>
            <tbody>{dados.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/loja/cotacao/?id=${c.id}`}><b>{c.id}</b></Link><div className="pequeno muted">{c.qtd_itens} produto(s)</div></td>
                <td className="pequeno">{dataHora(c.criado_em)}<div className="muted">{c.solicitante}</div></td>
                <td className="direita numero">{reais(c.tabela_centavos)}</td>
                <td className="direita numero">{c.proposto_centavos !== null ? <b>{reais(c.proposto_centavos)}</b> : '—'}</td>
                <td className="pequeno">{c.validade ? data(`${c.validade}T12:00:00`) : '—'}</td>
                <td><Situacao valor={COR[c.situacao]} nomes={{ [COR[c.situacao]]: NOMES[c.situacao] }} />{c.pedido_id && <div className="pequeno"><Link href={`/loja/pedido/?id=${c.pedido_id}`}>Pedido {c.pedido_id}</Link></div>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
