'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEu } from '@/components/Shell';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Icone } from '@/components/painel/Icone';
import { Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { dataHora } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Pagina { id: number; slug: string; titulo: string; resumo: string | null; publicada: boolean; no_rodape: boolean; ordem: number; atualizado_em: string; atualizado_por: string | null }

const COLUNAS: Coluna<Pagina>[] = [
  { chave: 'ordem', titulo: 'Ordem', ordenavel: true, direita: true },
  { chave: 'titulo', titulo: 'Página', ordenavel: true, render: (p) => <><b>{p.titulo}</b><div className="pequeno muted">/pagina/?p={p.slug}</div></> },
  { chave: 'resumo', titulo: 'Resumo', render: (p) => <span className="pequeno">{p.resumo ?? '—'}</span> },
  { chave: 'no_rodape', titulo: 'No rodapé', filtro: 'opcoes', opcoes: { true: 'Sim', false: 'Não' }, valor: (p) => String(p.no_rodape), render: (p) => (p.no_rodape ? 'Sim' : 'Não'), valorCsv: (p) => (p.no_rodape ? 'Sim' : 'Não') },
  { chave: 'atualizado_em', titulo: 'Atualizada', ordenavel: true, render: (p) => <>{dataHora(p.atualizado_em)}{p.atualizado_por && <div className="pequeno muted">por {p.atualizado_por}</div>}</> },
  { chave: 'publicada', titulo: 'Situação', filtro: 'opcoes', opcoes: { true: 'Publicada', false: 'Rascunho' }, valor: (p) => String(p.publicada),
    render: (p) => <Situacao valor={p.publicada ? 'publicada' : 'rascunho'} nomes={{ publicada: 'Publicada', rascunho: 'Rascunho' }} />, valorCsv: (p) => (p.publicada ? 'Publicada' : 'Rascunho') },
];

/** Conteúdo → Páginas (no Bagisto, "Páginas CMS"): sobre, políticas, entrega, perguntas frequentes. */
export default function Paginas() {
  const router = useRouter();
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const { dados, carregando, recarregar } = useDados<Pagina[]>('/equipe/conteudo/paginas');
  const emLote = async (linhas: Pagina[], publicada: boolean) => {
    for (const p of linhas) await api(`/equipe/conteudo/paginas/${p.id}`, { metodo: 'PATCH', corpo: { publicada } });
    await recarregar();
  };
  return (
    <Grade
      titulo="Páginas"
      sub={<>As páginas abertas da loja, que aparecem no rodapé e em <Link href="/pagina/">/pagina/</Link>. Para tirar do ar, volte para rascunho.</>}
      acoes={pode && <Link className="botao" href="/painel/pagina/?novo=1"><Icone nome="mais" tamanho={16} /> Criar página</Link>}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(p) => p.id}
      aoClicar={(p) => router.push(`/painel/pagina/?id=${p.id}`)}
      ordemInicial={{ chave: 'ordem', dir: 'asc' }}
      nomeArquivo="paginas"
      acoesLote={pode ? [
        { rotulo: 'Publicar', executar: (l) => emLote(l, true) },
        { rotulo: 'Voltar para rascunho', confirmar: 'Tirar {n} página(s) do ar?', executar: (l) => emLote(l, false) },
      ] : undefined}
    />
  );
}
