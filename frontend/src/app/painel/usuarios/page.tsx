'use client';
import { useRouter } from 'next/navigation';
import { useEu } from '@/components/Shell';
import { Grade, type Coluna } from '@/components/painel/Grade';
import { Situacao } from '@/components/ui';
import { api } from '@/lib/api';
import { dataHora, NOMES_TIPO, PAPEL, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Usuario {
  id: string; nome: string; email: string; papel: string; ativo: boolean; criado_em: string; ultimo_acesso_em: string | null;
  empresa_id: string; razao_social: string; tipo_cliente: string; situacao_empresa: string; pedidos: number; comprado_centavos: number; newsletter: boolean;
}

const COLUNAS: Coluna<Usuario>[] = [
  { chave: 'nome', titulo: 'Nome / e-mail', ordenavel: true, render: (u) => <><b>{u.nome}</b><div className="pequeno muted">{u.email}</div></> },
  { chave: 'email', titulo: 'E-mail', oculta: true },
  { chave: 'razao_social', titulo: 'Empresa', ordenavel: true, filtro: 'opcoes', render: (u) => <>{u.razao_social}<div className="pequeno muted">{NOMES_TIPO[u.tipo_cliente] ?? u.tipo_cliente}</div></> },
  { chave: 'tipo_cliente', titulo: 'Grupo', filtro: 'opcoes', opcoes: NOMES_TIPO, oculta: true, valorCsv: (u) => NOMES_TIPO[u.tipo_cliente] ?? u.tipo_cliente },
  { chave: 'papel', titulo: 'Papel', filtro: 'opcoes', opcoes: { comprador: PAPEL.comprador, aprovador: PAPEL.aprovador }, render: (u) => PAPEL[u.papel] ?? u.papel, valorCsv: (u) => PAPEL[u.papel] ?? u.papel },
  { chave: 'pedidos', titulo: 'Pedidos', ordenavel: true, direita: true, filtro: 'numero' },
  { chave: 'comprado_centavos', titulo: 'Comprado', ordenavel: true, direita: true, valor: (u) => u.comprado_centavos / 100, render: (u) => reais(u.comprado_centavos),
    valorCsv: (u) => (u.comprado_centavos / 100).toFixed(2).replace('.', ',') },
  { chave: 'ultimo_acesso_em', titulo: 'Último acesso', ordenavel: true, filtro: 'data', render: (u) => (u.ultimo_acesso_em ? dataHora(u.ultimo_acesso_em) : <span className="muted">Nunca</span>) },
  { chave: 'newsletter', titulo: 'Newsletter', filtro: 'opcoes', opcoes: { true: 'Inscrito', false: 'Não inscrito' }, valor: (u) => String(u.newsletter),
    render: (u) => (u.newsletter ? <Situacao valor="inscrito" nomes={{ inscrito: 'Inscrito' }} /> : <span className="muted">—</span>), valorCsv: (u) => (u.newsletter ? 'Sim' : 'Não') },
  { chave: 'ativo', titulo: 'Situação', filtro: 'opcoes', opcoes: { true: 'Ativo', false: 'Inativo' }, valor: (u) => String(u.ativo),
    render: (u) => <Situacao valor={u.ativo ? 'ativa' : 'inativa'} nomes={{ ativa: 'Ativo', inativa: 'Inativo' }} />, valorCsv: (u) => (u.ativo ? 'Ativo' : 'Inativo') },
];

/** Clientes → Usuários (no Bagisto, "Clientes"): as pessoas de todas as empresas, com o que compraram. */
export default function UsuariosClientes() {
  const router = useRouter();
  const { eu } = useEu();
  const pode = ['comercial', 'administrador'].includes(eu.usuario.papel);
  const { dados, carregando, recarregar } = useDados<Usuario[]>('/equipe/clientes/usuarios');
  const emLote = async (linhas: Usuario[], ativo: boolean) => {
    for (const u of linhas) await api(`/equipe/empresas/${u.empresa_id}/usuarios/${u.id}`, { metodo: 'PATCH', corpo: { ativo } });
    await recarregar();
  };
  return (
    <Grade
      titulo="Usuários dos clientes"
      sub={dados ? `${dados.length} pessoa(s) em ${new Set(dados.map((u) => u.empresa_id)).size} empresa(s). Clique para abrir a empresa.` : ' '}
      linhas={dados ?? undefined}
      carregando={carregando}
      colunas={COLUNAS}
      chave={(u) => u.id}
      aoClicar={(u) => router.push(`/painel/empresa/?id=${u.empresa_id}`)}
      ordemInicial={{ chave: 'razao_social', dir: 'asc' }}
      nomeArquivo="usuarios-clientes"
      acoesLote={pode ? [
        { rotulo: 'Reativar', executar: (l) => emLote(l, true) },
        { rotulo: 'Desativar', confirmar: 'Desativar {n} usuário(s)? Eles deixam de entrar na loja; nada é apagado.', executar: (l) => emLote(l, false) },
      ] : undefined}
    />
  );
}
