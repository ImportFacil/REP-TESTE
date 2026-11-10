'use client';
import { useRouter } from 'next/navigation';
import { useEu } from '@/components/Shell';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { dataHora } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Envio { id: number; pedido_id: number; transportadora: string; codigo_rastreio: string | null; volumes: number; peso_kg: string | null; enviado_em: string; entregue_em: string | null; razao_social: string }
const situacao = (e: Envio) => (e.entregue_em ? 'entregue' : 'transito');
const SITUACAO: Record<string, string> = { transito: 'Em trânsito', entregue: 'Entregue' };

const COLUNAS: Coluna<Envio>[] = [
  { chave: 'id', titulo: 'Envio', ordenavel: true, render: (e) => <b>Nº {e.id}</b> },
  { chave: 'pedido_id', titulo: 'Pedido', ordenavel: true, filtro: 'texto' },
  { chave: 'razao_social', titulo: 'Empresa', ordenavel: true, filtro: 'opcoes' },
  { chave: 'transportadora', titulo: 'Transportadora / rastreio', filtro: 'opcoes', render: (e) => <>{e.transportadora}<div className="pequeno muted">{e.codigo_rastreio ?? 'sem rastreio'}</div></> },
  { chave: 'codigo_rastreio', titulo: 'Rastreio', oculta: true },
  { chave: 'volumes', titulo: 'Volumes / peso', direita: true, render: (e) => <>{e.volumes} vol.{e.peso_kg && <div className="pequeno muted">{Number(e.peso_kg).toLocaleString('pt-BR')} kg</div>}</> },
  { chave: 'enviado_em', titulo: 'Enviado em', ordenavel: true, filtro: 'data', render: (e) => dataHora(e.enviado_em), valorCsv: (e) => dataHora(e.enviado_em) },
  { chave: 'entregue_em', titulo: 'Entregue em', ordenavel: true, render: (e) => (e.entregue_em ? dataHora(e.entregue_em) : '—'), valorCsv: (e) => (e.entregue_em ? dataHora(e.entregue_em) : '') },
  { chave: 'situacao', titulo: 'Situação', filtro: 'opcoes', opcoes: SITUACAO, valor: situacao, render: (e) => <Situacao valor={situacao(e) === 'entregue' ? 'entregue' : 'enviado'} nomes={{ entregue: 'Entregue', enviado: 'Em trânsito' }} />, valorCsv: (e) => SITUACAO[situacao(e)] },
];

export default function Envios() {
  const router = useRouter();
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const { dados, carregando, recarregar } = useDados<Envio[]>('/equipe/vendas/envios');
  return (
    <Grade
      titulo="Envios"
      sub="Remessas com transportadora e rastreio. Registre o envio na página do pedido, quando ele estiver em separação."
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(e) => e.id}
      aoClicar={(e) => router.push(`/painel/pedido/?id=${e.pedido_id}`)}
      ordemInicial={{ chave: 'enviado_em', dir: 'desc' }}
      nomeArquivo="envios"
      vazio="Nenhum envio registrado."
      acoesLote={pode ? [{
        rotulo: 'Confirmar entrega', confirmar: 'Confirmar a entrega de {n} remessa(s)? Os pedidos passam para "entregue".',
        executar: async (l) => { for (const e of l.filter((x) => !x.entregue_em)) await api(`/equipe/vendas/envios/${e.id}/entregue`, { metodo: 'POST' }); await recarregar(); },
      }] : undefined}
    />
  );
}
