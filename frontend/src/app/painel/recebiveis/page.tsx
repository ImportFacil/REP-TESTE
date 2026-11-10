'use client';
import Link from 'next/link';
import { Aviso, Cabecalho, Carregando, Indicador, Vazio } from '@/components/ui';
import { data, dataHora, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Recebiveis {
  a_receber_por_mes: Array<{ mes: string; valor: number; parcelas: number }>;
  vencidas: Array<{ id: number; numero: number; valor_centavos: number; vencimento: string; pedido_id: number; razao_social: string; empresa_id: string; dias_atraso: number }>;
  total_vencido_centavos: number;
  cartao_por_mes: Array<{ mes: string; valor: number; vendas: number }>;
  regua_recente: Array<{ id: number; destinatario: string; modelo: string; situacao: string; criado_em: string; dados: { pedido?: number; parcela?: number; dias?: number } }>;
}

const MODELOS: Record<string, string> = {
  lembrete_vencimento: 'Lembrete de vencimento', vence_hoje: 'Vence hoje', parcela_em_atraso: 'Parcela em atraso',
  aviso_negativacao: 'Aviso de negativação (30 dias)', aviso_protesto: 'Aviso de protesto (45 dias)',
};
const mes = (m: string) => { const [a, b] = m.split('-'); return `${b}/${a}`; };

export default function RecebiveisPainel() {
  const { dados: r, erro } = useDados<Recebiveis>('/equipe/recebiveis');
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!r) return <Carregando />;
  const total = r.a_receber_por_mes.reduce((s, m) => s + Number(m.valor), 0);
  return (
    <>
      <Cabecalho titulo="Recebíveis" sub="Boletos a receber, atrasos e vendas no cartão." />
      <div className="grade grade-3" style={{ marginBottom: 20 }}>
        <Indicador rotulo="Boletos a receber" valor={reais(total)} />
        <Indicador rotulo="Vencido" valor={reais(r.total_vencido_centavos)} detalhe={`${r.vencidas.length} parcela(s)`} />
        <Indicador rotulo="Cartão no último mês" valor={reais(Number(r.cartao_por_mes[0]?.valor ?? 0))} />
      </div>
      <div className="grade grade-2" style={{ alignItems: 'start' }}>
        <div className="cartao">
          <h2>A receber por mês</h2>
          {!r.a_receber_por_mes.length ? <Vazio>Nada a receber.</Vazio> : (
            <table><thead><tr><th>Mês</th><th className="direita">Parcelas</th><th className="direita">Valor</th></tr></thead>
              <tbody>{r.a_receber_por_mes.map((m) => <tr key={m.mes}><td>{mes(m.mes)}</td><td className="direita">{m.parcelas}</td><td className="direita numero">{reais(Number(m.valor))}</td></tr>)}</tbody>
            </table>
          )}
        </div>
        <div className="cartao">
          <h2>Vencidos</h2>
          {!r.vencidas.length ? <Vazio>Nenhuma parcela vencida.</Vazio> : (
            <table><thead><tr><th>Empresa</th><th>Pedido</th><th>Vencimento</th><th className="direita">Valor</th></tr></thead>
              <tbody>{r.vencidas.map((v) => (
                <tr key={v.id}><td><Link href={`/painel/empresa/?id=${v.empresa_id}`}>{v.razao_social}</Link></td><td><Link href={`/painel/pedido/?id=${v.pedido_id}`}>{v.pedido_id}</Link> · {v.numero}ª</td>
                  <td>{data(v.vencimento)}<div className="pequeno" style={{ color: 'var(--vermelho)' }}>{v.dias_atraso} dia(s)</div></td><td className="direita numero">{reais(v.valor_centavos)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      <div className="cartao" style={{ marginTop: 16 }}>
        <h2>Régua de cobrança</h2>
        <p className="pequeno muted">Avisos registrados pela rotina diária. O envio por e-mail e WhatsApp entra quando o Amazon SES e a API do WhatsApp estiverem configurados.</p>
        {!r.regua_recente.length ? <Vazio>Nenhum aviso ainda.</Vazio> : (
          <table><thead><tr><th>Quando</th><th>Aviso</th><th>Para</th><th>Pedido</th><th>Situação</th></tr></thead>
            <tbody>{r.regua_recente.map((n) => (
              <tr key={n.id}><td>{dataHora(n.criado_em)}</td><td>{MODELOS[n.modelo] ?? n.modelo}</td><td className="pequeno">{n.destinatario}</td><td>{n.dados.pedido} · {n.dados.parcela}ª</td><td>{n.situacao}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
