'use client';
import { useRouter } from 'next/navigation';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Situacao } from '@/components/ui';
import { data, dataHora, NOMES_TIPO, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Cotacao { id: number; situacao: string; validade: string | null; criado_em: string; respondida_em: string | null; pedido_id: number | null; razao_social: string; tipo_cliente: string; solicitante: string; qtd_itens: number; tabela_centavos: number; proposto_centavos: number | null }
const NOMES: Record<string, string> = { solicitada: 'Esperando resposta', respondida: 'Respondida', aceita: 'Aceita', recusada: 'Recusada', expirada: 'Expirada', cancelada: 'Cancelada' };
const COR: Record<string, string> = { solicitada: 'pendente', respondida: 'em_aberto', aceita: 'aprovado', recusada: 'recusado', expirada: 'expirada', cancelada: 'cancelada' };
const csv = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2).replace('.', ','));

const COLUNAS: Coluna<Cotacao>[] = [
  { chave: 'id', titulo: 'Nº', ordenavel: true, render: (c) => <b>{c.id}</b> },
  { chave: 'razao_social', titulo: 'Empresa', ordenavel: true, filtro: 'opcoes', render: (c) => <>{c.razao_social}<div className="pequeno muted">{NOMES_TIPO[c.tipo_cliente] ?? c.tipo_cliente} · {c.solicitante}</div></> },
  { chave: 'criado_em', titulo: 'Pedida', ordenavel: true, filtro: 'data', render: (c) => dataHora(c.criado_em) },
  { chave: 'qtd_itens', titulo: 'Itens', direita: true },
  { chave: 'tabela_centavos', titulo: 'Pela tabela', ordenavel: true, direita: true, render: (c) => reais(c.tabela_centavos), valorCsv: (c) => csv(c.tabela_centavos) },
  { chave: 'proposto_centavos', titulo: 'Proposto', ordenavel: true, direita: true, render: (c) => (c.proposto_centavos !== null ? <b>{reais(c.proposto_centavos)}</b> : '—'), valorCsv: (c) => csv(c.proposto_centavos) },
  { chave: 'validade', titulo: 'Validade', ordenavel: true, render: (c) => (c.validade ? data(`${c.validade}T12:00:00`) : '—') },
  { chave: 'situacao', titulo: 'Situação', filtro: 'opcoes', opcoes: NOMES, render: (c) => <><Situacao valor={COR[c.situacao]} nomes={{ [COR[c.situacao]]: NOMES[c.situacao] }} />{c.pedido_id && <div className="pequeno muted">pedido {c.pedido_id}</div>}</>, valorCsv: (c) => NOMES[c.situacao] },
];

/** Vendas → Cotações de preço (B2B): pedidos de preço negociado das empresas, para a equipe responder. */
export default function CotacoesPainel() {
  const router = useRouter();
  const { dados, carregando } = useDados<Cotacao[]>('/equipe/cotacoes');
  const esperando = dados?.filter((c) => c.situacao === 'solicitada').length ?? 0;
  return (
    <Grade
      titulo="Cotações de preço"
      sub={dados ? `${esperando} esperando resposta. Responda com o preço de cada item e a validade; o aprovador da empresa aceita e o pedido sai com o preço combinado.` : ' '}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(c) => c.id}
      aoClicar={(c) => router.push(`/painel/cotacao/?id=${c.id}`)}
      nomeArquivo="cotacoes-de-preco"
      vazio="Nenhuma cotação."
    />
  );
}
