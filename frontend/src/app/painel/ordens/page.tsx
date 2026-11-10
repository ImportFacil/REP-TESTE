'use client';
import { useRouter } from 'next/navigation';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Situacao } from '@/components/ui';
import { MODALIDADE, data } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Linha { id: number; razao_social: string; modalidade: string; etapa_nome: string; concluida: boolean; cancelada: boolean; criado_em: string; orcamento_id: number }

const SITUACAO: Record<string, string> = { em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' };
const situacao = (o: Linha) => (o.cancelada ? 'cancelada' : o.concluida ? 'concluida' : 'em_andamento');

const COLUNAS: Coluna<Linha>[] = [
  { chave: 'id', titulo: 'Nº', ordenavel: true, render: (o) => <b>{o.id}</b> },
  { chave: 'razao_social', titulo: 'Empresa', ordenavel: true, filtro: 'opcoes' },
  { chave: 'criado_em', titulo: 'Início', ordenavel: true, filtro: 'data', render: (o) => data(o.criado_em), valorCsv: (o) => data(o.criado_em) },
  { chave: 'modalidade', titulo: 'Modalidade', filtro: 'opcoes', opcoes: MODALIDADE, render: (o) => MODALIDADE[o.modalidade], valorCsv: (o) => MODALIDADE[o.modalidade] },
  { chave: 'etapa_nome', titulo: 'Etapa', filtro: 'opcoes' },
  { chave: 'orcamento_id', titulo: 'Orçamento', direita: true },
  { chave: 'situacao', titulo: 'Situação', filtro: 'opcoes', opcoes: SITUACAO, valor: situacao, render: (o) => <Situacao valor={situacao(o)} nomes={SITUACAO} />, valorCsv: (o) => SITUACAO[situacao(o)] },
];

export default function OrdensPainel() {
  const router = useRouter();
  const { dados, carregando } = useDados<Linha[]>('/equipe/ordens');
  return (
    <Grade
      titulo="Ordens de importação"
      sub={dados ? `${dados.length} ordem(ns)` : ' '}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(o) => o.id}
      aoClicar={(o) => router.push(`/painel/ordem/?id=${o.id}`)}
      ordemInicial={{ chave: 'id', dir: 'desc' }}
      nomeArquivo="ordens-importacao"
      vazio="Nenhuma ordem de importação."
    />
  );
}
