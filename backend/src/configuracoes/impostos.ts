/**
 * Valor aproximado dos tributos (Lei 12.741/2012), por regra: a mais específica que vale para o item
 * (prefixo de NCM mais longo, depois UF de destino, depois origem nacional/importada). Funções puras.
 */

export interface RegraImposto {
  id: number;
  nome: string;
  ncm_prefixo: string | null;
  uf: string | null;
  origem: 'nacional' | 'importado' | null;
  aliquota_federal_bp: number;
  aliquota_estadual_bp: number;
}

export interface ItemTributavel { ncm: string | null; importado: boolean; valor_centavos: number }

export interface TributosNota {
  federal_centavos: number;
  estadual_centavos: number;
  total_centavos: number;
  regras: Array<{ id: number; nome: string; base_centavos: number }>;
}

/** A regra que vale para o item, ou null se nenhuma vale. */
export function escolherRegra(regras: RegraImposto[], item: { ncm: string | null; importado: boolean }, uf: string | null): RegraImposto | null {
  const ncm = (item.ncm ?? '').replace(/\D/g, '');
  const origem = item.importado ? 'importado' : 'nacional';
  let melhor: RegraImposto | null = null;
  let pontos = -1;
  for (const r of regras) {
    if (r.ncm_prefixo && !ncm.startsWith(r.ncm_prefixo)) continue;
    if (r.uf && r.uf !== uf) continue;
    if (r.origem && r.origem !== origem) continue;
    const p = (r.ncm_prefixo?.length ?? 0) * 100 + (r.uf ? 10 : 0) + (r.origem ? 1 : 0);
    if (p > pontos || (p === pontos && melhor && r.id < melhor.id)) { melhor = r; pontos = p; }
  }
  return melhor;
}

/** Divide `total` entre os itens na proporção do valor de cada um (o último fica com a sobra do arredondamento). */
export function ratear(total: number, pesos: number[]): number[] {
  const soma = pesos.reduce((s, p) => s + p, 0);
  if (soma === 0) return pesos.map(() => 0);
  let usado = 0;
  return pesos.map((p, i) => {
    if (i === pesos.length - 1) return total - usado;
    const v = Math.floor((total * p) / soma);
    usado += v;
    return v;
  });
}

/**
 * Tributos da nota: o valor da nota (já com descontos e juros) é rateado entre os itens
 * e cada parte recebe as alíquotas da sua regra.
 */
export function calcularTributos(regras: RegraImposto[], itens: ItemTributavel[], valorNota: number, uf: string | null): TributosNota {
  const bases = ratear(valorNota, itens.map((i) => i.valor_centavos));
  let federal = 0;
  let estadual = 0;
  const porRegra = new Map<number, { id: number; nome: string; base_centavos: number }>();
  itens.forEach((item, k) => {
    const r = escolherRegra(regras, item, uf);
    if (!r) return;
    federal += Math.round((bases[k] * r.aliquota_federal_bp) / 10_000);
    estadual += Math.round((bases[k] * r.aliquota_estadual_bp) / 10_000);
    const atual = porRegra.get(r.id) ?? { id: r.id, nome: r.nome, base_centavos: 0 };
    atual.base_centavos += bases[k];
    porRegra.set(r.id, atual);
  });
  return { federal_centavos: federal, estadual_centavos: estadual, total_centavos: federal + estadual, regras: [...porRegra.values()] };
}
