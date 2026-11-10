'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEu } from '@/components/Shell';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Icone } from '@/components/painel/Icone';
import { Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface ProdutoLinha {
  id: number; codigo: string; nome: string; marca: string | null; categoria_id: string; categoria: string | null; familia_id: number | null; familia: string | null;
  unidade: string; multiplo_venda: number; estoque: number; preco_tabela_centavos: number; sob_orcamento: boolean; destaque: boolean; importado: boolean; ativo: boolean; ncm: string | null;
}

const SIM: Record<string, string> = { true: 'Sim', false: 'Não' };

const COLUNAS: Coluna<ProdutoLinha>[] = [
  { chave: 'nome', titulo: 'Nome / código / família', ordenavel: true,
    render: (p) => <><b>{p.nome}</b><div className="pequeno muted">Código {p.codigo}{p.familia ? ` · ${p.familia}` : ''}</div></> },
  { chave: 'codigo', titulo: 'Código', filtro: 'texto', oculta: true },
  { chave: 'preco_tabela_centavos', titulo: 'Preço de tabela', ordenavel: true, direita: true, filtro: 'numero', valor: (p) => p.preco_tabela_centavos / 100,
    render: (p) => <><b>{reais(p.preco_tabela_centavos)}</b>{p.sob_orcamento && <div className="pequeno muted">sob orçamento</div>}</>,
    valorCsv: (p) => (p.preco_tabela_centavos / 100).toFixed(2).replace('.', ',') },
  { chave: 'estoque', titulo: 'Estoque', ordenavel: true, direita: true, filtro: 'numero',
    render: (p) => <span style={{ color: p.estoque <= Math.max(p.multiplo_venda * 3, 5) ? 'var(--ambar)' : 'var(--verde)', fontWeight: 600 }}>{p.estoque} {p.unidade}</span> },
  { chave: 'categoria', titulo: 'Categoria', ordenavel: true, filtro: 'opcoes' },
  { chave: 'familia', titulo: 'Família de atributos', filtro: 'opcoes', render: (p) => p.familia ?? <span className="muted">—</span> },
  { chave: 'ativo', titulo: 'Situação', filtro: 'opcoes', opcoes: { true: 'Ativo', false: 'Inativo' }, valor: (p) => String(p.ativo),
    render: (p) => <><Situacao valor={p.ativo ? 'ativa' : 'inativa'} nomes={{ ativa: 'Ativo', inativa: 'Inativo' }} />{p.destaque && <> <Situacao valor="aprovado" nomes={{ aprovado: 'Destaque' }} /></>}</>,
    valorCsv: (p) => (p.ativo ? 'Ativo' : 'Inativo') },
  { chave: 'destaque', titulo: 'Destaque', filtro: 'opcoes', opcoes: SIM, oculta: true, valor: (p) => String(p.destaque), valorCsv: (p) => SIM[String(p.destaque)] },
  { chave: 'importado', titulo: 'Importado', filtro: 'opcoes', opcoes: SIM, oculta: true, valor: (p) => String(p.importado), valorCsv: (p) => SIM[String(p.importado)] },
];

export default function Produtos() {
  const router = useRouter();
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const { dados, carregando, recarregar } = useDados<ProdutoLinha[]>('/equipe/catalogo/produtos');
  const emLote = async (linhas: ProdutoLinha[], corpo: Record<string, unknown>) => {
    for (const p of linhas) await api(`/equipe/produtos/${p.id}`, { metodo: 'PATCH', corpo });
    await recarregar();
  };
  return (
    <Grade
      titulo="Produtos"
      sub={dados ? `${dados.length} produto(s), ${dados.filter((p) => p.ativo).length} ativo(s)` : ' '}
      acoes={pode && <Link className="botao" href="/painel/produto/?novo=1"><Icone nome="mais" tamanho={16} /> Criar produto</Link>}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(p) => p.id}
      aoClicar={(p) => router.push(`/painel/produto/?id=${p.id}`)}
      ordemInicial={{ chave: 'nome', dir: 'asc' }}
      nomeArquivo="produtos"
      vazio="Nenhum produto."
      acoesLote={pode ? [
        { rotulo: 'Ativar', executar: (l) => emLote(l, { ativo: true }) },
        { rotulo: 'Inativar', confirmar: 'Tirar {n} produto(s) da loja? Nada é apagado.', executar: (l) => emLote(l, { ativo: false }) },
        { rotulo: 'Pôr em destaque', executar: (l) => emLote(l, { destaque: true }) },
        { rotulo: 'Tirar do destaque', executar: (l) => emLote(l, { destaque: false }) },
      ] : undefined}
    />
  );
}
