'use client';
import { useRouter } from 'next/navigation';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { dataHora, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Reembolso { id: number; pedido_id: number; valor_centavos: number; meio: string; motivo: string; devolver_estoque: boolean; itens: Array<{ produto_id: number; quantidade: number }>; criado_em: string; razao_social: string; total_centavos: number }
const MEIO: Record<string, string> = { pix: 'Devolução por Pix', estorno_cartao: 'Estorno no cartão', abatimento_boleto: 'Abatimento nos boletos' };

const COLUNAS: Coluna<Reembolso>[] = [
  { chave: 'id', titulo: 'Reembolso', ordenavel: true, render: (r) => <b>Nº {r.id}</b> },
  { chave: 'pedido_id', titulo: 'Pedido', ordenavel: true, filtro: 'texto' },
  { chave: 'razao_social', titulo: 'Empresa', ordenavel: true, filtro: 'opcoes' },
  { chave: 'criado_em', titulo: 'Data', ordenavel: true, filtro: 'data', render: (r) => dataHora(r.criado_em), valorCsv: (r) => dataHora(r.criado_em) },
  { chave: 'meio', titulo: 'Meio', filtro: 'opcoes', opcoes: MEIO, render: (r) => MEIO[r.meio], valorCsv: (r) => MEIO[r.meio] },
  { chave: 'motivo', titulo: 'Motivo', render: (r) => <>{r.motivo}{r.devolver_estoque && <div className="pequeno muted">{r.itens.reduce((s, i) => s + i.quantidade, 0)} unidade(s) voltaram ao estoque</div>}</> },
  { chave: 'valor_centavos', titulo: 'Valor', ordenavel: true, direita: true, filtro: 'numero', valor: (r) => r.valor_centavos / 100,
    render: (r) => <>{reais(r.valor_centavos)}<div className="pequeno muted">{r.valor_centavos === r.total_centavos ? 'total' : `de ${reais(r.total_centavos)}`}</div></>, valorCsv: (r) => (r.valor_centavos / 100).toFixed(2).replace('.', ',') },
];

export default function Reembolsos() {
  const router = useRouter();
  const { dados, carregando } = useDados<Reembolso[]>('/equipe/vendas/reembolsos');
  return (
    <Grade
      titulo="Reembolsos"
      sub="Devoluções de dinheiro, totais ou parciais. Registre o reembolso na página do pedido."
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(r) => r.id}
      aoClicar={(r) => router.push(`/painel/pedido/?id=${r.pedido_id}`)}
      ordemInicial={{ chave: 'criado_em', dir: 'desc' }}
      nomeArquivo="reembolsos"
      vazio="Nenhum reembolso."
    />
  );
}
