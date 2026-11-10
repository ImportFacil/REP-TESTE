/**
 * CNPJ numérico e alfanumérico.
 *
 * Desde julho de 2026 a Receita Federal emite CNPJs alfanuméricos
 * (IN RFB 2.229/2024): os 12 primeiros caracteres podem ter letras e os
 * 2 dígitos verificadores continuam numéricos. Cada caractere vale o seu
 * código ASCII menos 48, o que mantém o cálculo antigo para os números.
 */

/** Remove pontuação e espaços e passa letras para maiúsculas. */
export function normalizarCnpj(valor: string): string {
  return (valor ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

const FORMATO = /^[0-9A-Z]{12}[0-9]{2}$/;

/** Valida formato e dígitos verificadores de um CNPJ (numérico ou alfanumérico). */
export function cnpjValido(valor: string): boolean {
  const cnpj = normalizarCnpj(valor);
  if (!FORMATO.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const digito = (base: string): number => {
    let soma = 0;
    let peso = base.length - 7;
    for (const c of base) {
      soma += (c.charCodeAt(0) - 48) * peso--;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(cnpj.slice(0, 12));
  const d2 = digito(cnpj.slice(0, 12) + d1);
  return cnpj.endsWith(`${d1}${d2}`);
}

export function formatarCnpj(valor: string): string {
  const c = normalizarCnpj(valor);
  return c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : valor;
}
