'use client';
import Link from 'next/link';
import { Aviso, Cabecalho, Carregando, Copiar, Indicador, Situacao, Vazio } from '@/components/ui';
import { FORMA, ETAPA_NUMERARIO, data, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Parcela {
  id: number; numero: number; total_parcelas: number; valor_centavos: number; vencimento: string; situacao: string; meio: string;
  linha_digitavel: string | null; pix_copia_cola: string | null; pedido_id: number | null; ordem_id: number | null; etapa_numerario: string | null;
  valor_pago_centavos: number | null; pago_em: string | null; situacao_cobranca: string;
  atualizado?: { atraso: number; multa: number; juros: number; total: number };
}
interface Financeiro {
  credito: { situacao_cadastro: string | null; faixa: string | null; limite_centavos: number; usado_centavos: number; disponivel_centavos: number; maior_atraso_dias: number; bloqueado: boolean; motivo_bloqueio: string | null; max_parcelas_boleto: number };
  parcelas: Parcela[];
}

export default function Financeiro() {
  const { dados, erro, carregando } = useDados<Financeiro>('/financeiro');
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (carregando || !dados) return <Carregando />;
  const c = dados.credito;
  const abertas = dados.parcelas
    .filter((p) => ['aberta', 'vencida'].includes(p.situacao) && p.situacao_cobranca !== 'expirada')
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const pagas = dados.parcelas.filter((p) => p.situacao === 'paga');
  const origem = (p: Parcela) => p.pedido_id ? <Link href={`/loja/pedido/?id=${p.pedido_id}`}>Pedido {p.pedido_id}</Link> : <Link href={`/loja/ordem/?id=${p.ordem_id}`}>Ordem {p.ordem_id} · {ETAPA_NUMERARIO[p.etapa_numerario ?? '']}</Link>;

  return (
    <>
      <Cabecalho titulo="Financeiro" sub="Os pagamentos são confirmados pelo banco; a baixa aparece aqui sozinha." />
      <div className="grade grade-4" style={{ marginBottom: 16 }}>
        <Indicador rotulo="Limite do boleto" valor={reais(c.limite_centavos)} detalhe={c.faixa ? `Faixa ${c.faixa} · até ${c.max_parcelas_boleto}×` : 'Sem cadastro aprovado'} />
        <Indicador rotulo="Em uso" valor={reais(c.usado_centavos)} />
        <Indicador rotulo="Disponível" valor={reais(c.disponivel_centavos)} />
        <Indicador rotulo="Maior atraso" valor={`${c.maior_atraso_dias} dia(s)`} />
      </div>
      {c.bloqueado && <Aviso tipo={c.situacao_cadastro === 'aprovado' ? 'erro' : 'info'}>{c.motivo_bloqueio} {c.situacao_cadastro !== 'aprovado' && <Link href="/loja/credito/">Ir para o cadastro ›</Link>}</Aviso>}

      <h2 style={{ marginTop: 24 }}>Em aberto</h2>
      {!abertas.length ? <Vazio>Nada em aberto.</Vazio> : (
        <div className="grade grade-2">
          {abertas.map((p) => (
            <div key={p.id} className="cartao pilha">
              <div className="linha entre">
                <b>{origem(p)} · {FORMA[p.meio]} {p.total_parcelas > 1 ? `${p.numero}/${p.total_parcelas}` : ''}</b>
                <Situacao valor={p.situacao} />
              </div>
              <div className="linha entre"><span className="muted">Vencimento {data(p.vencimento)}</span><b className="numero">{reais(p.valor_centavos)}</b></div>
              {p.atualizado && p.atualizado.atraso > 0 && (
                <Aviso tipo="erro">{p.atualizado.atraso} dia(s) de atraso: valor atualizado {reais(p.atualizado.total)} (multa {reais(p.atualizado.multa)} + juros {reais(p.atualizado.juros)}).</Aviso>
              )}
              {p.linha_digitavel && <Copiar texto={p.linha_digitavel} rotulo="Copiar linha digitável" />}
              {p.pix_copia_cola && <Copiar texto={p.pix_copia_cola} rotulo="Copiar Pix" />}
            </div>
          ))}
        </div>
      )}

      <h2 style={{ marginTop: 24 }}>Pagos</h2>
      {!pagas.length ? <Vazio>Nenhum pagamento ainda.</Vazio> : (
        <div className="cartao tabela-rolagem">
          <table>
            <thead><tr><th>Origem</th><th>Forma</th><th>Pago em</th><th className="direita">Valor</th></tr></thead>
            <tbody>{pagas.map((p) => (
              <tr key={p.id}><td>{origem(p)}</td><td>{FORMA[p.meio]}{p.total_parcelas > 1 ? ` ${p.numero}/${p.total_parcelas}` : ''}</td><td>{data(p.pago_em)}</td><td className="direita numero">{reais(p.valor_pago_centavos ?? p.valor_centavos)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
