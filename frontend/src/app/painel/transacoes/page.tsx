'use client';
import { useRouter } from 'next/navigation';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { FORMA, dataHora, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Transacao { id: number; pago_em: string; valor_centavos: number; meio: string; id_evento_gateway: string; parcela: number; cobranca_meio: string; gateway: string; pedido_id: number | null; ordem_id: number | null; razao_social: string | null }
const origem = (t: Transacao) => (t.pedido_id ? 'pedido' : 'numerario');

const COLUNAS: Coluna<Transacao>[] = [
  { chave: 'id', titulo: 'Transação', ordenavel: true, render: (t) => <><b>Nº {t.id}</b><div className="pequeno muted">{t.id_evento_gateway}</div></> },
  { chave: 'pago_em', titulo: 'Pago em', ordenavel: true, filtro: 'data', render: (t) => dataHora(t.pago_em), valorCsv: (t) => dataHora(t.pago_em) },
  { chave: 'razao_social', titulo: 'Empresa', ordenavel: true, filtro: 'opcoes' },
  { chave: 'origem', titulo: 'Origem', filtro: 'opcoes', opcoes: { pedido: 'Pedido', numerario: 'Numerário de importação' }, valor: origem,
    render: (t) => (t.pedido_id ? `Pedido ${t.pedido_id} · ${t.parcela}ª parcela` : `Ordem de importação ${t.ordem_id}`), valorCsv: (t) => (t.pedido_id ? `Pedido ${t.pedido_id}` : `Ordem ${t.ordem_id}`) },
  { chave: 'cobranca_meio', titulo: 'Meio', filtro: 'opcoes', opcoes: FORMA, render: (t) => FORMA[t.cobranca_meio] ?? t.cobranca_meio, valorCsv: (t) => FORMA[t.cobranca_meio] ?? t.cobranca_meio },
  { chave: 'gateway', titulo: 'Gateway', filtro: 'opcoes' },
  { chave: 'valor_centavos', titulo: 'Valor', ordenavel: true, direita: true, filtro: 'numero', valor: (t) => t.valor_centavos / 100, render: (t) => <b>{reais(t.valor_centavos)}</b>, valorCsv: (t) => (t.valor_centavos / 100).toFixed(2).replace('.', ',') },
];

export default function Transacoes() {
  const router = useRouter();
  const { dados, carregando } = useDados<Transacao[]>('/equipe/vendas/transacoes');
  const total = (dados ?? []).reduce((s, t) => s + t.valor_centavos, 0);
  return (
    <Grade
      titulo="Transações"
      sub={dados ? `${dados.length} pagamento(s) recebido(s), ${reais(total)}` : ' '}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(t) => t.id}
      aoClicar={(t) => router.push(t.pedido_id ? `/painel/pedido/?id=${t.pedido_id}` : `/painel/ordem/?id=${t.ordem_id}`)}
      ordemInicial={{ chave: 'pago_em', dir: 'desc' }}
      nomeArquivo="transacoes"
      vazio="Nenhum pagamento recebido."
    />
  );
}
