'use client';
import { useRouter } from 'next/navigation';
import { Carregando, Situacao, Vazio } from './ui';
import { MODALIDADE, data } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Linha { id: number; modalidade: string; etapa_nome: string; concluida: boolean; cancelada: boolean; criado_em: string; orcamento_id: number }

export function ListaOrdens({ base, filtro = '' }: { base: string; filtro?: string }) {
  const router = useRouter();
  const { dados, carregando } = useDados<Array<Linha & { razao_social?: string }>>(`${base}${filtro}`);
  if (carregando) return <Carregando />;
  if (!dados?.length) return <Vazio>Nenhuma ordem de importação.</Vazio>;
  const destino = base.startsWith('/equipe') ? '/painel/ordem/' : '/loja/ordem/';
  return (
    <div className="cartao tabela-rolagem">
      <table>
        <thead><tr><th>Nº</th>{base.startsWith('/equipe') && <th>Empresa</th>}<th>Início</th><th>Modalidade</th><th>Etapa</th><th>Situação</th></tr></thead>
        <tbody>{dados.map((o) => (
          <tr key={o.id} className="clicavel" onClick={() => router.push(`${destino}?id=${o.id}`)}>
            <td><b>{o.id}</b></td>{base.startsWith('/equipe') && <td>{o.razao_social}</td>}<td>{data(o.criado_em)}</td><td>{MODALIDADE[o.modalidade]}</td><td>{o.etapa_nome}</td>
            <td><Situacao valor={o.cancelada ? 'cancelada' : o.concluida ? 'concluida' : 'em_aberto'} nomes={{ cancelada: 'Cancelada', concluida: 'Concluída', em_aberto: 'Em andamento' }} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

