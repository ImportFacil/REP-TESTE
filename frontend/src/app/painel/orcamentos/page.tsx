'use client';
import { useRouter } from 'next/navigation';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Situacao } from '@/components/ui';
import { MODALIDADE, SITUACAO_ORCAMENTO, data, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Linha { id: number; razao_social: string; modalidade: string; situacao: string; criado_em: string; total_centavos: number | null; qtd_itens: number }

const COLUNAS: Coluna<Linha>[] = [
  { chave: 'id', titulo: 'Nº', ordenavel: true, render: (o) => <b>{o.id}</b> },
  { chave: 'razao_social', titulo: 'Empresa', ordenavel: true, filtro: 'opcoes' },
  { chave: 'criado_em', titulo: 'Data', ordenavel: true, filtro: 'data', render: (o) => data(o.criado_em), valorCsv: (o) => data(o.criado_em) },
  { chave: 'modalidade', titulo: 'Modalidade', filtro: 'opcoes', opcoes: MODALIDADE, render: (o) => MODALIDADE[o.modalidade], valorCsv: (o) => MODALIDADE[o.modalidade] },
  { chave: 'qtd_itens', titulo: 'Itens', ordenavel: true, direita: true },
  { chave: 'situacao', titulo: 'Situação', filtro: 'opcoes', opcoes: SITUACAO_ORCAMENTO, render: (o) => <Situacao valor={o.situacao} nomes={SITUACAO_ORCAMENTO} />, valorCsv: (o) => SITUACAO_ORCAMENTO[o.situacao] },
  { chave: 'total_centavos', titulo: 'Total', ordenavel: true, direita: true, filtro: 'numero', valor: (o) => o.total_centavos ?? 0,
    render: (o) => (o.total_centavos != null ? reais(o.total_centavos) : '—'), valorCsv: (o) => (o.total_centavos != null ? (o.total_centavos / 100).toFixed(2).replace('.', ',') : '') },
];

export default function OrcamentosPainel() {
  const router = useRouter();
  const { dados, carregando } = useDados<Linha[]>('/equipe/orcamentos');
  return (
    <Grade
      titulo="Orçamentos de importação"
      sub={dados ? `${dados.length} orçamento(s)` : ' '}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(o) => o.id}
      aoClicar={(o) => router.push(`/painel/orcamento/?id=${o.id}`)}
      ordemInicial={{ chave: 'id', dir: 'desc' }}
      nomeArquivo="orcamentos"
      vazio="Nenhum orçamento."
    />
  );
}
