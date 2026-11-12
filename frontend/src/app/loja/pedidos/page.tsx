'use client';
import { useRouter } from 'next/navigation';
import { FiltroJanela, useJanela } from '@/components/painel/FiltroJanela';
import { Aviso, Cabecalho, Carregando, Situacao, Vazio } from '@/components/ui';
import { FORMA, SITUACAO_PAGAMENTO, SITUACAO_PEDIDO, dataHora, reais } from '@/lib/formato';
import { useDados } from '@/lib/hooks';

interface Linha { id: number; criado_em: string; forma_pagamento: string; parcelas: number; total_centavos: number; situacao: string; situacao_pagamento: string; qtd_itens: number }

export default function Pedidos() {
  const router = useRouter();
  const { janela, mudar, consulta, pronto } = useJanela('todos', true);
  const { dados, erro, carregando } = useDados<{ itens: Linha[]; total: number; janela: { rotulo: string } | null }>(pronto ? `/pedidos?por_pagina=200&${consulta}` : null);
  const soma = dados?.itens.filter((p) => p.situacao !== 'cancelado').reduce((s, p) => s + p.total_centavos, 0) ?? 0;
  return (
    <>
      <Cabecalho titulo="Pedidos" sub={dados ? `${dados.total} pedido(s)${dados.janela ? ` · ${dados.janela.rotulo}` : ''} · ${reais(soma)} sem os cancelados. Os mais recentes primeiro.` : ' '} />
      <FiltroJanela janela={janela} mudar={mudar} comTodos comPerfil={false} />
      <Aviso tipo="erro">{erro}</Aviso>
      {carregando ? <Carregando /> : !dados?.itens.length ? <Vazio>{janela.atalho === 'todos' ? 'Nenhum pedido ainda.' : 'Nenhum pedido neste período.'}</Vazio> : (
        <div className="cartao tabela-rolagem">
          <table>
            <thead><tr><th>Nº</th><th>Data e hora</th><th>Itens</th><th>Pagamento</th><th>Situação</th><th className="direita">Total</th></tr></thead>
            <tbody>
              {dados.itens.map((p) => (
                <tr key={p.id} className="clicavel" onClick={() => router.push(`/loja/pedido/?id=${p.id}`)}>
                  <td><b>{p.id}</b></td>
                  <td>{dataHora(p.criado_em)}</td>
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
