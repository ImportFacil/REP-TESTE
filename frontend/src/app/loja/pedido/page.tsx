'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CorpoPedido, type PedidoDetalhe } from '@/components/Pedido';
import { Aviso, Cabecalho, Carregando } from '@/components/ui';
import { api } from '@/lib/api';
import { adicionar } from '@/lib/carrinho';
import { dataHora } from '@/lib/formato';
import { useAcao, useDados, useParametro } from '@/lib/hooks';

export default function Pedido() {
  const router = useRouter();
  const id = useParametro('id');
  const { dados: p, erro, recarregar } = useDados<PedidoDetalhe>(id ? `/pedidos/${id}` : null);
  const acao = useAcao();
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!p) return <Carregando />;

  const recomprar = () =>
    acao.executar(async () => {
      const itens = await api<Array<{ produto_id: number; quantidade: number }>>(`/pedidos/${p.id}/recompra`);
      for (const i of itens) {
        const prod = await api<{ nome: string; codigo: string; unidade: string; multiplo_venda: number; preco_cliente_centavos: number; ativo: boolean }>(`/catalogo/produtos/${i.produto_id}`).catch(() => null);
        if (prod) adicionar({ produto_id: i.produto_id, quantidade: i.quantidade, nome: prod.nome, codigo: prod.codigo, unidade: prod.unidade, multiplo_venda: prod.multiplo_venda, preco_cliente_centavos: prod.preco_cliente_centavos });
      }
      router.push('/loja/carrinho/');
    });

  return (
    <>
      <p className="pequeno"><Link href="/loja/pedidos/">‹ Pedidos</Link></p>
      <Cabecalho titulo={`Pedido ${p.id}`} sub={`Feito por ${p.comprador} em ${dataHora(p.criado_em)}`}>
        {p.situacao_pagamento === 'pix_expirado' && (
          <button className="botao" disabled={acao.enviando} onClick={() => void acao.executar(async () => { await api(`/pedidos/${p.id}/novo-pix`, { metodo: 'POST' }); await recarregar(); })}>
            Gerar novo Pix
          </button>
        )}
        <button className="botao secundario" disabled={acao.enviando} onClick={() => void recomprar()}>Comprar de novo</button>
      </Cabecalho>
      <Aviso tipo="erro">{acao.erro}</Aviso>
      <CorpoPedido p={p} />
    </>
  );
}
