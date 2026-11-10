'use client';
import { useRouter } from 'next/navigation';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Situacao } from '@/components/ui';
import { NOMES_TIPO, SITUACAO_CADASTRO, data, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Linha { empresa_id: string; razao_social: string; tipo_cliente: string; situacao: string; faixa: string | null; limite_aprovado_centavos: number; limite_solicitado_centavos: number | null; enviado_em: string | null; proxima_revisao_em: string | null }

const COLUNAS: Coluna<Linha>[] = [
  { chave: 'razao_social', titulo: 'Empresa', ordenavel: true, render: (c) => <b>{c.razao_social}</b> },
  { chave: 'tipo_cliente', titulo: 'Tipo', filtro: 'opcoes', opcoes: NOMES_TIPO, render: (c) => NOMES_TIPO[c.tipo_cliente] ?? c.tipo_cliente, valorCsv: (c) => NOMES_TIPO[c.tipo_cliente] ?? c.tipo_cliente },
  { chave: 'enviado_em', titulo: 'Enviado', ordenavel: true, filtro: 'data', render: (c) => data(c.enviado_em), valorCsv: (c) => data(c.enviado_em) },
  { chave: 'situacao', titulo: 'Situação', filtro: 'opcoes', opcoes: SITUACAO_CADASTRO, render: (c) => <Situacao valor={c.situacao} nomes={SITUACAO_CADASTRO} />, valorCsv: (c) => SITUACAO_CADASTRO[c.situacao] },
  { chave: 'faixa', titulo: 'Faixa', filtro: 'opcoes', opcoes: { A: 'A', B: 'B', C: 'C' }, render: (c) => c.faixa ?? '—' },
  { chave: 'limite_solicitado_centavos', titulo: 'Solicitado', ordenavel: true, direita: true, valor: (c) => c.limite_solicitado_centavos ?? 0, render: (c) => reais(c.limite_solicitado_centavos), valorCsv: (c) => ((c.limite_solicitado_centavos ?? 0) / 100).toFixed(2).replace('.', ',') },
  { chave: 'limite_aprovado_centavos', titulo: 'Aprovado', ordenavel: true, direita: true, filtro: 'numero', render: (c) => (c.faixa ? reais(c.limite_aprovado_centavos) : '—'), valorCsv: (c) => (c.limite_aprovado_centavos / 100).toFixed(2).replace('.', ',') },
  { chave: 'proxima_revisao_em', titulo: 'Revisão', ordenavel: true, render: (c) => data(c.proxima_revisao_em), valorCsv: (c) => data(c.proxima_revisao_em) },
];

export default function CreditoPainel() {
  const router = useRouter();
  const { dados, carregando } = useDados<Linha[]>('/equipe/credito');
  return (
    <Grade
      titulo="Crédito"
      sub="Análise dos cadastros. Limites acima de R$ 100.000,00 são aprovados pelo administrador."
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(c) => c.empresa_id}
      aoClicar={(c) => router.push(`/painel/analise/?empresa=${c.empresa_id}`)}
      ordemInicial={{ chave: 'enviado_em', dir: 'desc' }}
      nomeArquivo="credito"
      vazio="Nenhum cadastro de crédito."
    />
  );
}
