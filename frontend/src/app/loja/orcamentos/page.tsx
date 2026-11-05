'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useEu } from '@/components/Shell';
import { Aviso, Cabecalho, Campo, Carregando, Situacao, Vazio } from '@/components/ui';
import { api } from '@/lib/api';
import { MODALIDADE, SITUACAO_ORCAMENTO, data, reais } from '@/lib/formato';
import { useAcao, useDados } from '@/lib/hooks';

interface Linha { id: number; modalidade: string; situacao: string; criado_em: string; total_centavos: number | null; qtd_itens: number; valido_ate: string | null }
interface ItemForm { produto_id?: number; descricao: string; unidade: string; quantidade: number }

export default function Orcamentos() {
  const router = useRouter();
  const { eu } = useEu();
  const lista = useDados<Linha[]>('/orcamentos');
  const [novo, setNovo] = useState(false);
  const [modalidade, setModalidade] = useState<'encomenda' | 'conta_e_ordem'>('encomenda');
  const [itens, setItens] = useState<ItemForm[]>([{ descricao: '', unidade: 'un', quantidade: 1 }]);
  const [observacao, setObservacao] = useState('');
  const acao = useAcao();

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('produto');
    if (!id) return;
    api<{ id: number; nome: string; unidade: string; multiplo_venda: number }>(`/catalogo/produtos/${id}`)
      .then((p) => { setItens([{ produto_id: p.id, descricao: p.nome, unidade: p.unidade, quantidade: p.multiplo_venda }]); setNovo(true); })
      .catch(() => undefined);
  }, []);

  const enviar = () =>
    acao.executar(async () => {
      const o = await api<{ id: number }>('/orcamentos', {
        corpo: {
          modalidade,
          itens: itens.filter((i) => i.produto_id || i.descricao.trim()).map((i) => (i.produto_id ? { produto_id: i.produto_id, quantidade: i.quantidade } : { descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade })),
          ...(observacao.trim() && { observacao }),
        },
      });
      router.push(`/loja/orcamento/?id=${o.id}`);
    });

  return (
    <>
      <Cabecalho titulo="Orçamentos" sub="Para itens sob orçamento, fora do catálogo ou para importar sob encomenda.">
        <button className="botao" onClick={() => setNovo(!novo)}>{novo ? 'Fechar' : 'Pedir orçamento'}</button>
      </Cabecalho>
      {novo && (
        <form className="cartao formulario" style={{ marginBottom: 20 }} onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
          <h2>Novo orçamento</h2>
          <Campo rotulo="Modalidade" dica={eu.empresa?.conta_e_ordem_liberada ? undefined : 'A conta e ordem é liberada para clientes com pedidos mensais a partir de R$ 400.000,00.'}>
            <select value={modalidade} onChange={(e) => setModalidade(e.target.value as 'encomenda')}>
              <option value="encomenda">Encomenda (a ImportFácil importa e revende)</option>
              <option value="conta_e_ordem" disabled={!eu.empresa?.conta_e_ordem_liberada}>Conta e ordem (em nome da sua empresa)</option>
            </select>
          </Campo>
          {itens.map((i, k) => (
            <div key={k} className="linha">
              <input placeholder="Descreva o item (modelo, especificação)" value={i.descricao} disabled={!!i.produto_id} onChange={(e) => setItens(itens.map((x, j) => (j === k ? { ...x, descricao: e.target.value } : x)))} style={{ flex: '3 1 240px' }} required />
              <input aria-label="Quantidade" inputMode="numeric" value={i.quantidade} onChange={(e) => setItens(itens.map((x, j) => (j === k ? { ...x, quantidade: Number(e.target.value.replace(/\D/g, '')) || 0 } : x)))} style={{ flex: '0 1 100px' }} />
              <input aria-label="Unidade" value={i.unidade} disabled={!!i.produto_id} onChange={(e) => setItens(itens.map((x, j) => (j === k ? { ...x, unidade: e.target.value } : x)))} style={{ flex: '0 1 80px' }} />
              {itens.length > 1 && <button type="button" className="botao leve" onClick={() => setItens(itens.filter((_, j) => j !== k))}>Remover</button>}
            </div>
          ))}
          <button type="button" className="botao secundario" onClick={() => setItens([...itens, { descricao: '', unidade: 'un', quantidade: 1 }])}>+ Item</button>
          <Campo rotulo="Observação"><textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={2000} /></Campo>
          <Aviso tipo="erro">{acao.erro}</Aviso>
          <button className="botao" disabled={acao.enviando}>Enviar pedido de orçamento</button>
        </form>
      )}
      {lista.carregando ? <Carregando /> : !lista.dados?.length ? <Vazio>Nenhum orçamento ainda.</Vazio> : (
        <div className="cartao tabela-rolagem">
          <table>
            <thead><tr><th>Nº</th><th>Data</th><th>Modalidade</th><th>Itens</th><th>Situação</th><th className="direita">Total</th></tr></thead>
            <tbody>{lista.dados.map((o) => (
              <tr key={o.id} className="clicavel" onClick={() => router.push(`/loja/orcamento/?id=${o.id}`)}>
                <td><b>{o.id}</b></td><td>{data(o.criado_em)}</td><td>{MODALIDADE[o.modalidade]}</td><td>{o.qtd_itens}</td>
                <td><Situacao valor={o.situacao} nomes={SITUACAO_ORCAMENTO} /></td><td className="direita numero">{o.total_centavos != null ? reais(o.total_centavos) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
