import { descontoPix, dividir, parcelamentoCartao, valorAtualizado, vencimentosBoleto } from './regras';

describe('regras de pagamento', () => {
  it('desconto do Pix de 3%', () => {
    expect(descontoPix(1_000_000, 300)).toBe(30_000);
    expect(descontoPix(3333, 300)).toBe(100); // 99,99 → 100
  });

  it('cartão sem juros até 10×, divide o total e joga os centavos na 1ª', () => {
    const r = parcelamentoCartao(100_001, 10, 10, 199);
    expect(r).toMatchObject({ total: 100_001, juros: 0 });
    expect(r.valores[0]).toBe(10_001);
    expect(r.valores.reduce((a, b) => a + b, 0)).toBe(100_001);
  });

  it('cartão em 12× cobra juros (tabela Price, 1,99% a.m.)', () => {
    const r = parcelamentoCartao(1_000_000, 12, 10, 199);
    expect(r.valores[0]).toBe(94_502);
    expect(r.total).toBe(94_502 * 12);
    expect(r.juros).toBe(r.total - 1_000_000);
  });

  it('vencimentos do boleto 30/60/90/120', () => {
    expect(vencimentosBoleto('2026-11-05', 4)).toEqual(['2026-12-05', '2027-01-04', '2027-02-03', '2027-03-05']);
  });

  it('divide sem perder centavos', () => {
    expect(dividir(1000, 3)).toEqual([334, 333, 333]);
  });

  it('parcela em atraso: multa de 2% e juros de 1% ao mês pro rata', () => {
    expect(valorAtualizado(100_000, '2026-11-01', '2026-11-01', 200, 100)).toMatchObject({ atraso: 0, total: 100_000 });
    expect(valorAtualizado(100_000, '2026-11-01', '2026-12-01', 200, 100)).toEqual({ atraso: 30, multa: 2000, juros: 1000, total: 103_000 });
  });
});
