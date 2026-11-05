'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Cabecalho, Carregando, Situacao, Vazio } from '@/components/ui';
import { FORMA, SITUACAO_PAGAMENTO, SITUACAO_PEDIDO, data, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Linha { id: number; razao_social: string; criado_em: string; forma_pagamento: string; parcelas: number; total_centavos: number; situacao: string; situacao_pagamento: string }

export default function PedidosPainel() {
  const router = useRouter();
  const [f, setF] = useState({ situacao: '', situacao_pagamento: '', empresa_id: '' });
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setF({ situacao: q.get('situacao') ?? '', situacao_pagamento: q.get('situacao_pagamento') ?? '', empresa_id: q.get('empresa_id') ?? '' });
  }, []);
  const q = new URLSearchParams({ por_pagina: '100', ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) });
  const { dados, carregando } = useDados<{ itens: Linha[]; total: number }>(`/equipe/pedidos?${q}`);
  return (
    <>
      <Cabecalho titulo="Pedidos" sub={dados ? `${dados.total} pedido(s)` : ' '}>
        <select value={f.situacao} onChange={(e) => setF({ ...f, situacao: e.target.value })} aria-label="Situação">
          <option value="">Toda situação</option>{Object.entries(SITUACAO_PEDIDO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={f.situacao_pagamento} onChange={(e) => setF({ ...f, situacao_pagamento: e.target.value })} aria-label="Pagamento">
          <option value="">Todo pagamento</option>{Object.entries(SITUACAO_PAGAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Cabecalho>
      {carregando && !dados ? <Carregando /> : !dados?.itens.length ? <Vazio>Nenhum pedido.</Vazio> : (
        <div className="cartao tabela-rolagem">
          <table>
            <thead><tr><th>Nº</th><th>Empresa</th><th>Data</th><th>Pagamento</th><th>Situação</th><th className="direita">Total</th></tr></thead>
            <tbody>{dados.itens.map((p) => (
              <tr key={p.id} className="clicavel" onClick={() => router.push(`/painel/pedido/?id=${p.id}`)}>
                <td><b>{p.id}</b></td><td>{p.razao_social}</td><td>{data(p.criado_em)}</td>
                <td>{FORMA[p.forma_pagamento]}{p.forma_pagamento !== 'pix' ? ` ${p.parcelas}×` : ''}<div><Situacao valor={p.situacao_pagamento} nomes={SITUACAO_PAGAMENTO} /></div></td>
                <td><Situacao valor={p.situacao} nomes={SITUACAO_PEDIDO} /></td><td className="direita numero">{reais(p.total_centavos)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
