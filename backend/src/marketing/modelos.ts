/**
 * Modelos de e-mail: o texto usa {{variavel}}. Os dados guardados com cada aviso são formatados
 * aqui (valor em reais, datas no formato brasileiro), para o modelo não depender do formato interno.
 */

/** Deixa os dados do aviso prontos para o texto: `valor_centavos` vira `valor` em reais, datas viram dd/mm/aaaa. */
export function variaveisDoAviso(dados: Record<string, unknown>): Record<string, string> {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(dados)) {
    if (v === null || v === undefined) continue;
    if (k.endsWith('_centavos') && typeof v === 'number') {
      r[k.replace(/_centavos$/, '')] = reais(v);
      continue;
    }
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [a, m, d] = v.split('-');
      r[k] = `${d}/${m}/${a}`;
      continue;
    }
    r[k] = String(v);
  }
  return r;
}

/** Troca cada {{variavel}} pelo valor; variável sem valor fica como está, para a equipe notar. */
export function renderizar(texto: string, variaveis: Record<string, string>): string {
  return texto.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi, (inteiro, nome: string) => variaveis[nome] ?? inteiro);
}

/** Variáveis usadas no texto que o modelo não declara (erro de digitação, quase sempre). */
export function variaveisDesconhecidas(texto: string, permitidas: string[]): string[] {
  const usadas = [...texto.matchAll(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi)].map((m) => m[1]);
  return [...new Set(usadas.filter((v) => !permitidas.includes(v)))];
}

/** Dados de exemplo para a prévia de cada modelo. */
export const EXEMPLO: Record<string, string> = {
  empresa: 'Cooperativa Agro Sorriso', nome: 'Marina Souza', pedido: '10042', parcela: '2', valor: 'R$ 12.480,00',
  vencimento: '15/12/2026', dias: '3', transportadora: 'Jadlog', rastreio: 'JD000123456BR', volumes: '4',
  link_sair: 'https://loja.exportfacil.com.br/newsletter/sair/?t=…',
};

function reais(c: number): string {
  return `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
