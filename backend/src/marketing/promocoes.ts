/**
 * Regras de promoção (as "regras de carrinho" do Bagisto). Funções puras, sem banco.
 *
 * Um pedido recebe no máximo uma promoção: a do cupom informado ou, sem cupom, a automática
 * que der o maior desconto. O desconto vale sobre os itens das categorias da promoção (ou sobre
 * todos, se ela não restringe categorias) e nunca passa do valor desses itens.
 * Valores em centavos; percentual em pontos-base (500 = 5%).
 */

export interface RegraPromocao {
  id: number;
  nome: string;
  cupom: string | null;
  tipo_desconto: 'percentual' | 'valor_fixo';
  desconto_bp: number | null;
  desconto_centavos: number | null;
  tipos_cliente: string[] | null;
  categorias: string[] | null;
  subtotal_minimo_centavos: number;
  inicio: string | null;
  fim: string | null;
  limite_usos: number | null;
  limite_por_empresa: number | null;
  ativo: boolean;
}

export interface ItemCarrinho { categoria_id: string; total_centavos: number }
export interface UsoPromocao { total: number; daEmpresa: number }

/** Por que a promoção não vale para este carrinho (ou null se vale). */
export function motivoInvalida(p: RegraPromocao, c: { tipoCliente: string; hoje: string; subtotal: number; itens: ItemCarrinho[]; uso: UsoPromocao }): string | null {
  if (!p.ativo) return 'Esta promoção não está ativa.';
  if (p.inicio && c.hoje < p.inicio) return `A promoção começa em ${dataBr(p.inicio)}.`;
  if (p.fim && c.hoje > p.fim) return `A promoção terminou em ${dataBr(p.fim)}.`;
  if (p.tipos_cliente?.length && !p.tipos_cliente.includes(c.tipoCliente)) return 'A promoção não vale para o seu tipo de cliente.';
  if (c.subtotal < p.subtotal_minimo_centavos) return `A promoção vale a partir de ${reais(p.subtotal_minimo_centavos)} em produtos.`;
  if (p.limite_usos !== null && c.uso.total >= p.limite_usos) return 'A promoção atingiu o limite de usos.';
  if (p.limite_por_empresa !== null && c.uso.daEmpresa >= p.limite_por_empresa) return 'A sua empresa já usou esta promoção o máximo de vezes.';
  if (baseElegivel(p, c.itens) === 0) return 'Nenhum item do carrinho entra nesta promoção.';
  return null;
}

/** Soma dos itens que entram na promoção. */
export function baseElegivel(p: Pick<RegraPromocao, 'categorias'>, itens: ItemCarrinho[]): number {
  return itens.filter((i) => !p.categorias?.length || p.categorias.includes(i.categoria_id)).reduce((s, i) => s + i.total_centavos, 0);
}

/** Desconto em centavos (meio centavo arredonda para cima), limitado ao valor dos itens elegíveis. */
export function descontoPromocao(p: Pick<RegraPromocao, 'categorias' | 'tipo_desconto' | 'desconto_bp' | 'desconto_centavos'>, itens: ItemCarrinho[]): number {
  const base = baseElegivel(p, itens);
  const bruto = p.tipo_desconto === 'percentual' ? Math.floor((base * (p.desconto_bp ?? 0) + 5_000) / 10_000) : (p.desconto_centavos ?? 0);
  return Math.min(base, Math.max(0, bruto));
}

/** Entre as promoções automáticas válidas, a de maior desconto (empate: a mais antiga). */
export function melhorAutomatica<T extends RegraPromocao>(promos: Array<{ p: T; desconto: number; motivo: string | null }>): { p: T; desconto: number } | null {
  const validas = promos.filter((x) => x.p.cupom === null && x.motivo === null && x.desconto > 0);
  validas.sort((a, b) => b.desconto - a.desconto || a.p.id - b.p.id);
  return validas[0] ?? null;
}

/** Cupom digitado pelo cliente: sem espaços, maiúsculo. */
export function normalizarCupom(c: string | undefined | null): string | null {
  const v = (c ?? '').trim().toUpperCase();
  return v || null;
}

function dataBr(d: string): string {
  const [a, m, dia] = d.split('-');
  return `${dia}/${m}/${a}`;
}

function reais(c: number): string {
  return `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
