/**
 * Regras de dinheiro da fase 2. Funções puras, em centavos inteiros.
 */

/** Desconto do Pix sobre o subtotal (pontos-base), arredondado ao centavo. */
export function descontoPix(subtotal: number, descontoBp: number): number {
  return Math.floor((subtotal * descontoBp + 5_000) / 10_000);
}

/**
 * Cartão: até `semJurosAte` parcelas sem juros; acima disso, juros compostos pagos pelo cliente
 * (tabela Price, taxa mensal em pontos-base). Devolve o valor de cada parcela e o total.
 */
export function parcelamentoCartao(subtotal: number, parcelas: number, semJurosAte: number, jurosAmBp: number) {
  if (!Number.isInteger(parcelas) || parcelas < 1) throw new RangeError('Número de parcelas inválido.');
  if (parcelas <= semJurosAte || jurosAmBp === 0) {
    return { valores: dividir(subtotal, parcelas), total: subtotal, juros: 0 };
  }
  const i = jurosAmBp / 10_000;
  const parcela = Math.round((subtotal * i) / (1 - Math.pow(1 + i, -parcelas)));
  const total = parcela * parcelas;
  return { valores: Array.from({ length: parcelas }, () => parcela), total, juros: total - subtotal };
}

/** Divide um valor em n parcelas inteiras; a diferença de centavos vai para a primeira. */
export function dividir(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const valores = Array.from({ length: n }, () => base);
  valores[0] += total - base * n;
  return valores;
}

/** Datas AAAA-MM-DD: soma dias sem depender de fuso. */
export function somarDias(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Hoje no horário de Brasília (AAAA-MM-DD). */
export function hojeBrasil(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

export function diasEntre(deIso: string, ateIso: string): number {
  return Math.round((Date.parse(`${ateIso}T12:00:00Z`) - Date.parse(`${deIso}T12:00:00Z`)) / 86_400_000);
}

/** Boleto parcelado: vencimentos a cada 30 dias contados do faturamento (30/60/90/120). */
export function vencimentosBoleto(faturamentoIso: string, parcelas: number): string[] {
  return Array.from({ length: parcelas }, (_, k) => somarDias(faturamentoIso, 30 * (k + 1)));
}

/** Valor atualizado de uma parcela em atraso: multa fixa + juros simples pro rata dia. */
export function valorAtualizado(valor: number, vencimentoIso: string, hojeIso: string, multaBp: number, jurosAmBp: number) {
  const atraso = Math.max(0, diasEntre(vencimentoIso, hojeIso));
  if (atraso === 0) return { atraso, multa: 0, juros: 0, total: valor };
  const multa = Math.round((valor * multaBp) / 10_000);
  const juros = Math.round((valor * jurosAmBp * atraso) / (10_000 * 30));
  return { atraso, multa, juros, total: valor + multa + juros };
}

/** Faixa de crédito: parcela máxima no boleto e fator sobre o limite de referência. */
export const FAIXAS = {
  A: { maxBoleto: 4, fator: 1, revisaoMeses: 12 },
  B: { maxBoleto: 2, fator: 0.5, revisaoMeses: 6 },
  C: { maxBoleto: 0, fator: 0, revisaoMeses: 3 },
} as const;
