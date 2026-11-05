'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Cabecalho, Carregando, Situacao, Vazio } from '@/components/ui';
import { NOMES_TIPO, SITUACAO_CADASTRO, data, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Linha { empresa_id: string; razao_social: string; tipo_cliente: string; situacao: string; faixa: string | null; limite_aprovado_centavos: number; limite_solicitado_centavos: number | null; enviado_em: string | null; proxima_revisao_em: string | null }

export default function CreditoPainel() {
  const router = useRouter();
  const [situacao, setSituacao] = useState('em_analise');
  const { dados, carregando } = useDados<Linha[]>(`/equipe/credito${situacao ? `?situacao=${situacao}` : ''}`);
  return (
    <>
      <Cabecalho titulo="Crédito" sub="Análise dos cadastros. Limites acima de R$ 100.000,00 são aprovados pelo administrador.">
        <select value={situacao} onChange={(e) => setSituacao(e.target.value)} aria-label="Situação">
          <option value="">Todos</option>
          {Object.entries(SITUACAO_CADASTRO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Cabecalho>
      {carregando ? <Carregando /> : !dados?.length ? <Vazio>Nenhum cadastro nesta situação.</Vazio> : (
        <div className="cartao tabela-rolagem">
          <table>
            <thead><tr><th>Empresa</th><th>Tipo</th><th>Enviado</th><th>Situação</th><th className="direita">Solicitado</th><th className="direita">Aprovado</th><th>Revisão</th></tr></thead>
            <tbody>{dados.map((c) => (
              <tr key={c.empresa_id} className="clicavel" onClick={() => router.push(`/painel/analise/?empresa=${c.empresa_id}`)}>
                <td><b>{c.razao_social}</b></td><td>{NOMES_TIPO[c.tipo_cliente] ?? c.tipo_cliente}</td><td>{data(c.enviado_em)}</td>
                <td><Situacao valor={c.situacao} nomes={SITUACAO_CADASTRO} /></td>
                <td className="direita numero">{reais(c.limite_solicitado_centavos)}</td>
                <td className="direita numero">{c.faixa ? `${c.faixa} · ${reais(c.limite_aprovado_centavos)}` : '—'}</td>
                <td>{data(c.proxima_revisao_em)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
