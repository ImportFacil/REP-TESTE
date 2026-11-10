'use client';
import { useRouter } from 'next/navigation';
import { Aviso, Cabecalho, Carregando, Situacao, Vazio } from '@/components/ui';
import { FORMA, SITUACAO_PAGAMENTO, SITUACAO_PEDIDO, data, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Linha { id: number; criado_em: string; forma_pagamento: string; parcelas: number; total_centavos: number; situacao: string; situacao_pagamento: string; qtd_itens: number }

export default function Pedidos() {
  const router = useRouter();
  const { dados, erro, carregando } = useDados<{ itens: Linha[] }>('/pedidos?por_pagina=100');
  return (
    <>
      <Cabecalho titulo="Pedidos" />
      <Aviso tipo="erro">{erro}</Aviso>
      {carregando ? <Carregando /> : !dados?.itens.length ? <Vazio>Nenhum pedido ainda.</Vazio> : (
        <div className="cartao tabela-rolagem">
          <table>
            <thead><tr><th>Nº</th><th>Data</th><th>Itens</th><th>Pagamento</th><th>Situação</th><th className="direita">Total</th></tr></thead>
            <tbody>
              {dados.itens.map((p) => (
                <tr key={p.id} className="clicavel" onClick={() => router.push(`/loja/pedido/?id=${p.id}`)}>
                  <td><b>{p.id}</b></td>
                  <td>{data(p.criado_em)}</td>
                  <td>{p.qtd_itens}</td>
                  <td>{FORMA[p.forma_pagamento]}{p.forma_pagamento !== 'pix' ? ` ${p.parcelas}×` : ''}<div><Situacao valor={p.situacao_pagamento} nomes={SITUACAO_PAGAMENTO} /></div></td>
                  <td><Situacao valor={p.situacao} nomes={SITUACAO_PEDIDO} /></td>
                  <td className="direita numero">{reais(p.total_centavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
