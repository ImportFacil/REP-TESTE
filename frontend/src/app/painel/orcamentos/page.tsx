'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Cabecalho, Carregando, Situacao, Vazio } from '@/components/ui';
import { MODALIDADE, SITUACAO_ORCAMENTO, data, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Linha { id: number; razao_social: string; modalidade: string; situacao: string; criado_em: string; total_centavos: number | null; qtd_itens: number }

export default function OrcamentosPainel() {
  const router = useRouter();
  const [situacao, setSituacao] = useState('solicitado');
  const { dados, carregando } = useDados<Linha[]>(`/equipe/orcamentos${situacao ? `?situacao=${situacao}` : ''}`);
  return (
    <>
      <Cabecalho titulo="Orçamentos">
        <select value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Situação">
          <option value="">Todos</option>{Object.entries(SITUACAO_ORCAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Cabecalho>
      {carregando ? <Carregando /> : !dados?.length ? <Vazio>Nenhum orçamento nesta situação.</Vazio> : (
        <div className="cartao tabela-rolagem">
          <table>
            <thead><tr><th>Nº</th><th>Empresa</th><th>Data</th><th>Modalidade</th><th>Itens</th><th>Situação</th><th className="direita">Total</th></tr></thead>
            <tbody>{dados.map((o) => (
              <tr key={o.id} className="clicavel" onClick={() => router.push(`/painel/orcamento/?id=${o.id}`)}>
                <td><b>{o.id}</b></td><td>{o.razao_social}</td><td>{data(o.criado_em)}</td><td>{MODALIDADE[o.modalidade]}</td><td>{o.qtd_itens}</td>
                <td><Situacao valor={o.situacao} nomes={SITUACAO_ORCAMENTO} /></td><td className="direita numero">{o.total_centavos != null ? reais(o.total_centavos) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
