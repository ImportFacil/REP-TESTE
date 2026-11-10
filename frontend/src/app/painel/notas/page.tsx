'use client';
import { useRouter } from 'next/navigation';
import { useEu } from '@/components/Shell';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { FORMA, cnpj, dataHora, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Nota { id: number; numero: number; serie: string; chave: string; valor_centavos: number; situacao: string; emitida_em: string; cancelada_em: string | null; motivo_cancelamento: string | null; pedido_id: number; razao_social: string; cnpj: string; forma_pagamento: string }

const COLUNAS: Coluna<Nota>[] = [
  { chave: 'numero', titulo: 'Nota / série', ordenavel: true, render: (n) => <><b>Nº {n.numero}</b><div className="pequeno muted">Série {n.serie}</div></> },
  { chave: 'pedido_id', titulo: 'Pedido', ordenavel: true, filtro: 'texto' },
  { chave: 'razao_social', titulo: 'Empresa / CNPJ', ordenavel: true, filtro: 'opcoes', render: (n) => <>{n.razao_social}<div className="pequeno muted">{cnpj(n.cnpj)}</div></> },
  { chave: 'emitida_em', titulo: 'Emitida em', ordenavel: true, filtro: 'data', render: (n) => dataHora(n.emitida_em), valorCsv: (n) => dataHora(n.emitida_em) },
  { chave: 'forma_pagamento', titulo: 'Pagamento', filtro: 'opcoes', opcoes: FORMA, render: (n) => FORMA[n.forma_pagamento], valorCsv: (n) => FORMA[n.forma_pagamento] },
  { chave: 'valor_centavos', titulo: 'Valor', ordenavel: true, direita: true, filtro: 'numero', valor: (n) => n.valor_centavos / 100, render: (n) => reais(n.valor_centavos), valorCsv: (n) => (n.valor_centavos / 100).toFixed(2).replace('.', ',') },
  { chave: 'situacao', titulo: 'Situação', filtro: 'opcoes', opcoes: { emitida: 'Emitida', cancelada: 'Cancelada' },
    render: (n) => <><Situacao valor={n.situacao === 'emitida' ? 'pago' : 'cancelado'} nomes={{ pago: 'Emitida', cancelado: 'Cancelada' }} />{n.motivo_cancelamento && <div className="pequeno muted">{n.motivo_cancelamento}</div>}</> },
  { chave: 'chave', titulo: 'Chave de acesso', oculta: true },
];

export default function NotasFiscais() {
  const router = useRouter();
  const { eu } = useEu();
  const fin = ['financeiro', 'administrador'].includes(eu.usuario.papel);
  const { dados, carregando, recarregar } = useDados<Nota[]>('/equipe/vendas/notas');
  return (
    <Grade
      titulo="Notas fiscais"
      sub="Numeradas pela plataforma enquanto a NF-e não vem do ERP. Emita pela página do pedido."
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(n) => n.id}
      aoClicar={(n) => router.push(`/painel/pedido/?id=${n.pedido_id}`)}
      ordemInicial={{ chave: 'numero', dir: 'desc' }}
      nomeArquivo="notas-fiscais"
      vazio="Nenhuma nota fiscal emitida."
      acoesLote={fin ? [{
        rotulo: 'Cancelar notas', confirmar: 'Cancelar {n} nota(s) fiscal(is)? O pedido pode receber uma nota nova depois.',
        executar: async (l) => {
          const motivo = window.prompt('Motivo do cancelamento', 'Dados do destinatário incorretos');
          if (!motivo) return;
          for (const n of l.filter((x) => x.situacao === 'emitida')) await api(`/equipe/vendas/notas/${n.id}/cancelar`, { corpo: { motivo } });
          await recarregar();
        },
      }] : undefined}
    />
  );
}
