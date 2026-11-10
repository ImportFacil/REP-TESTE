'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Estrelas } from '@/components/Estrelas';
import { useEu } from '@/components/Shell';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Aviso, Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { dataHora } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface Avaliacao {
  id: number; produto_id: number; nota: number; titulo: string; comentario: string; compra_verificada: boolean; situacao: string; motivo_recusa: string | null;
  criado_em: string; moderada_em: string | null; codigo: string; produto: string; autor: string; email: string; razao_social: string; moderada_por: string | null;
}

const SITUACOES = { pendente: 'Pendente', aprovada: 'Aprovada', recusada: 'Recusada' };

const COLUNAS: Coluna<Avaliacao>[] = [
  { chave: 'nota', titulo: 'Nota', ordenavel: true, filtro: 'opcoes', opcoes: { 1: '1 estrela', 2: '2 estrelas', 3: '3 estrelas', 4: '4 estrelas', 5: '5 estrelas' },
    render: (a) => <Estrelas nota={a.nota} /> },
  { chave: 'titulo', titulo: 'Avaliação', render: (a) => <><b>{a.titulo}</b><div className="pequeno" style={{ maxWidth: 420, whiteSpace: 'normal' }}>{a.comentario}</div>
    {a.motivo_recusa && <div className="pequeno" style={{ color: 'var(--vermelho)' }}>Recusa: {a.motivo_recusa}</div>}</> },
  { chave: 'comentario', titulo: 'Comentário', oculta: true },
  { chave: 'produto', titulo: 'Produto', ordenavel: true, filtro: 'texto',
    render: (a) => <><Link href={`/painel/produto/?id=${a.produto_id}`} onClick={(e) => e.stopPropagation()}>{a.produto}</Link><div className="pequeno muted">{a.codigo}</div></> },
  { chave: 'autor', titulo: 'Quem avaliou', filtro: 'texto', render: (a) => <>{a.autor}<div className="pequeno muted">{a.razao_social}{a.compra_verificada ? ' · compra verificada' : ''}</div></> },
  { chave: 'razao_social', titulo: 'Empresa', filtro: 'opcoes', oculta: true },
  { chave: 'compra_verificada', titulo: 'Compra verificada', filtro: 'opcoes', opcoes: { true: 'Sim', false: 'Não' }, valor: (a) => String(a.compra_verificada), oculta: true,
    valorCsv: (a) => (a.compra_verificada ? 'Sim' : 'Não') },
  { chave: 'criado_em', titulo: 'Data', ordenavel: true, filtro: 'data', render: (a) => dataHora(a.criado_em) },
  { chave: 'situacao', titulo: 'Situação', filtro: 'opcoes', opcoes: SITUACOES,
    render: (a) => <><Situacao valor={a.situacao} nomes={SITUACOES} />{a.moderada_por && <div className="pequeno muted">por {a.moderada_por}</div>}</>, valorCsv: (a) => SITUACOES[a.situacao as keyof typeof SITUACOES] },
];

/** Clientes → Avaliações (como no Bagisto): o cliente avalia na loja e a equipe aprova ou recusa antes de publicar. */
export default function Avaliacoes() {
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const { dados, carregando, recarregar } = useDados<Avaliacao[]>('/equipe/clientes/avaliacoes');
  const [aviso, setAviso] = useState<string | null>(null);
  const acao = useAcao();
  const moderar = (linhas: Avaliacao[], situacao: 'aprovada' | 'recusada') => acao.executar(async () => {
    let motivo: string | undefined;
    if (situacao === 'recusada') {
      motivo = window.prompt('Motivo da recusa (o cliente vê este texto):')?.trim();
      if (!motivo) return;
    }
    for (const a of linhas) await api(`/equipe/clientes/avaliacoes/${a.id}/moderar`, { corpo: { situacao, motivo } });
    await recarregar();
    setAviso(`${linhas.length} avaliação(ões) ${situacao === 'aprovada' ? 'publicada(s) na loja' : 'recusada(s)'}.`);
  });
  const pendentes = dados?.filter((a) => a.situacao === 'pendente').length ?? 0;
  return (
    <Grade
      titulo="Avaliações"
      sub={dados ? `${dados.length} avaliação(ões), ${pendentes} aguardando moderação. Só as aprovadas aparecem na loja.` : ' '}
      topo={<><Aviso tipo="ok">{aviso}</Aviso><Aviso tipo="erro">{acao.erro}</Aviso></>}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(a) => a.id}
      nomeArquivo="avaliacoes"
      vazio="Nenhuma avaliação ainda."
      acoesLote={pode ? [
        { rotulo: 'Aprovar e publicar', executar: (l) => moderar(l, 'aprovada') },
        { rotulo: 'Recusar', executar: (l) => moderar(l, 'recusada') },
      ] : undefined}
    />
  );
}
