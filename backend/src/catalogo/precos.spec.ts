import { cotar, precoParaTipo, problemaQuantidade } from './precos';

const produto = (o: Partial<{ id: number; preco_tabela_centavos: number; multiplo_venda: number; estoque: number; sob_orcamento: boolean }> = {}) => ({
  id: 1, preco_tabela_centavos: 10_000, multiplo_venda: 1, estoque: 1000, sob_orcamento: false, ...o,
});

describe('precoParaTipo', () => {
  it('aplica o desconto do tipo de cliente (cooperativa 18%)', () => {
    expect(precoParaTipo(18_900_000, 1800)).toBe(15_498_000); // pulverizador do protótipo
  });

  it('arredonda ao centavo, meio para cima', () => {
    expect(precoParaTipo(6890, 1800)).toBe(5650); // 56,498 → 56,50
    expect(precoParaTipo(1, 5000)).toBe(1); // 0,5 centavo → 1
    expect(precoParaTipo(3, 5000)).toBe(2); // 1,5 → 2
  });

  it('sem desconto devolve o preço de tabela', () => {
    expect(precoParaTipo(12345, 0)).toBe(12345);
  });

  it('recusa valores fora do formato', () => {
    expect(() => precoParaTipo(10.5, 0)).toThrow(RangeError);
    expect(() => precoParaTipo(100, -1)).toThrow(RangeError);
    expect(() => precoParaTipo(100, 10_001)).toThrow(RangeError);
  });
});

describe('problemaQuantidade', () => {
  it('exige múltiplo de venda', () => {
    expect(problemaQuantidade(12, produto({ multiplo_venda: 12 }))).toBeNull();
    expect(problemaQuantidade(10, produto({ multiplo_venda: 12 }))).toBe('fora_do_multiplo');
  });
  it('confere estoque e quantidade', () => {
    expect(problemaQuantidade(5, produto({ estoque: 4 }))).toBe('sem_estoque');
    expect(problemaQuantidade(0, produto())).toBe('quantidade_invalida');
    expect(problemaQuantidade(1.5, produto())).toBe('quantidade_invalida');
  });
  it('produto sob orçamento não entra no carrinho', () => {
    expect(problemaQuantidade(1, produto({ sob_orcamento: true }))).toBe('sob_orcamento');
  });
});

describe('cotar', () => {
  const condicao = { desconto_bp: 1500, pedido_minimo_centavos: 2_000_000 }; // revendedor

  it('soma os itens com desconto e aponta quanto falta para o pedido mínimo', () => {
    const r = cotar([{ quantidade: 10, produto: produto({ preco_tabela_centavos: 100_000 }) }], condicao);
    expect(r.itens[0].preco_unitario_centavos).toBe(85_000);
    expect(r.subtotal_centavos).toBe(850_000);
    expect(r.falta_para_minimo_centavos).toBe(1_150_000);
    expect(r.atinge_pedido_minimo).toBe(false);
    expect(r.pode_fechar).toBe(false);
  });

  it('libera o fechamento quando atinge o mínimo e todos os itens estão válidos', () => {
    const r = cotar([{ quantidade: 30, produto: produto({ preco_tabela_centavos: 100_000 }) }], condicao);
    expect(r.subtotal_centavos).toBe(2_550_000);
    expect(r.pode_fechar).toBe(true);
  });

  it('item com problema não soma e impede o fechamento', () => {
    const r = cotar(
      [
        { quantidade: 30, produto: produto({ preco_tabela_centavos: 100_000 }) },
        { quantidade: 5, produto: produto({ id: 2, multiplo_venda: 2 }) },
      ],
      condicao,
    );
    expect(r.itens[1].problema).toBe('fora_do_multiplo');
    expect(r.itens[1].total_centavos).toBe(0);
    expect(r.atinge_pedido_minimo).toBe(true);
    expect(r.pode_fechar).toBe(false);
  });
});
