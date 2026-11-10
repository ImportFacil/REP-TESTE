'use client';
import { useRouter } from 'next/navigation';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Situacao } from '@/components/ui';
import { dataHora } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Modelo { codigo: string; nome: string; descricao: string; assunto: string; corpo: string; variaveis: string[]; ativo: boolean; atualizado_em: string; avisos: number }

const COLUNAS: Coluna<Modelo>[] = [
  { chave: 'nome', titulo: 'Modelo', ordenavel: true, render: (m) => <><b>{m.nome}</b><div className="pequeno muted" style={{ whiteSpace: 'normal', maxWidth: 380 }}>{m.descricao}</div></> },
  { chave: 'assunto', titulo: 'Assunto', render: (m) => <span className="pequeno">{m.assunto}</span> },
  { chave: 'avisos', titulo: 'Avisos gerados', ordenavel: true, direita: true },
  { chave: 'atualizado_em', titulo: 'Atualizado', ordenavel: true, render: (m) => dataHora(m.atualizado_em) },
  { chave: 'ativo', titulo: 'Situação', filtro: 'opcoes', opcoes: { true: 'Ativo', false: 'Desligado' }, valor: (m) => String(m.ativo),
    render: (m) => <Situacao valor={m.ativo ? 'ativa' : 'inativa'} nomes={{ ativa: 'Ativo', inativa: 'Desligado' }} />, valorCsv: (m) => (m.ativo ? 'Ativo' : 'Desligado') },
];

/** Marketing → Modelos de e-mail (no Bagisto, "Modelos de e-mail"): o texto de cada aviso que o sistema manda. */
export default function Modelos() {
  const router = useRouter();
  const { dados, carregando } = useDados<Modelo[]>('/equipe/marketing/modelos');
  return (
    <Grade
      titulo="Modelos de e-mail"
      sub="O texto de cada aviso automático: régua de cobrança, envio do pedido e newsletter. Clique para editar e ver a prévia."
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(m) => m.codigo}
      aoClicar={(m) => router.push(`/painel/modelo/?codigo=${m.codigo}`)}
      ordemInicial={{ chave: 'nome', dir: 'asc' }}
      nomeArquivo="modelos-de-email"
    />
  );
}
