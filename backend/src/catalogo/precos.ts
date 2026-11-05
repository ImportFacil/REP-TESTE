/**
 * Regras de preço da fase 1. Funções puras, sem banco, para serem testadas
 * isoladamente e reaproveitadas no carrinho e no pedido (fase 2).
 *
 * Todo valor é inteiro em centavos; o desconto é em pontos-base (1800 = 18%).
 */

export interface CondicaoTipo {
  desconto_bp: number;
  pedido_minimo_centavos: number;
}

/** Preço unitário para o tipo de cliente, arredondado ao centavo (meio para cima). */
export function precoParaTipo(precoTabelaCentavos: number, descontoBp: number): number {
  if (!Number.isInteger(precoTabelaCentavos) || precoTabelaCentavos < 0) {
    throw new RangeError('Preço de tabela deve ser inteiro em centavos.');
  }
  if (!Number.isInteger(descontoBp) || descontoBp < 0 || descontoBp > 10_000) {
    throw new RangeError('Desconto deve estar entre 0 e 10000 pontos-base.');
  }
  return Math.floor((precoTabelaCentavos * (10_000 - descontoBp) + 5_000) / 10_000);
}

export type ProblemaQuantidade = 'quantidade_invalida' | 'fora_do_multiplo' | 'sem_estoque' | 'sob_orcamento';

/** Confere a quantidade pedida contra o múltiplo de venda e o estoque. */
export function problemaQuantidade(
  quantidade: number,
  produto: { multiplo_venda: number; estoque: number; sob_orcamento: boolean },
): ProblemaQuantidade | null {
  if (produto.sob_orcamento) return 'sob_orcamento';
  if (!Number.isInteger(quantidade) || quantidade <= 0) return 'quantidade_invalida';
  if (quantidade % produto.multiplo_venda !== 0) return 'fora_do_multiplo';
  if (quantidade > produto.estoque) return 'sem_estoque';
  return null;
}

export interface ItemCotado {
  produto_id: number;
  quantidade: number;
  preco_tabela_centavos: number;
  preco_unitario_centavos: number;
  total_centavos: number;
  problema: ProblemaQuantidade | null;
}

export interface Cotacao {
  itens: ItemCotado[];
  subtotal_centavos: number;
  pedido_minimo_centavos: number;
  falta_para_minimo_centavos: number;
  atinge_pedido_minimo: boolean;
  pode_fechar: boolean;
}

/** Soma os itens válidos e compara com o pedido mínimo do tipo de cliente. */
export function cotar(
  itens: Array<{ quantidade: number; produto: { id: number; preco_tabela_centavos: number; multiplo_venda: number; estoque: number; sob_orcamento: boolean } }>,
  condicao: CondicaoTipo,
): Cotacao {
  const cotados: ItemCotado[] = itens.map(({ quantidade, produto }) => {
    const unit = precoParaTipo(produto.preco_tabela_centavos, condicao.desconto_bp);
    const problema = problemaQuantidade(quantidade, produto);
    return {
      produto_id: produto.id,
      quantidade,
      preco_tabela_centavos: produto.preco_tabela_centavos,
      preco_unitario_centavos: unit,
      total_centavos: problema ? 0 : unit * quantidade,
      problema,
    };
  });
  const subtotal = cotados.reduce((s, i) => s + i.total_centavos, 0);
  const falta = Math.max(0, condicao.pedido_minimo_centavos - subtotal);
  return {
    itens: cotados,
    subtotal_centavos: subtotal,
    pedido_minimo_centavos: condicao.pedido_minimo_centavos,
    falta_para_minimo_centavos: falta,
    atinge_pedido_minimo: falta === 0,
    pode_fechar: falta === 0 && cotados.length > 0 && cotados.every((i) => i.problema === null),
  };
}
