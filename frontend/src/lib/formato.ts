const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const reais = (centavos: number | null | undefined) => BRL.format((centavos ?? 0) / 100);

/** "1.234,56" ou "1234.56" → centavos. Devolve null se não for número. */
export function paraCentavos(texto: string): number | null {
  const t = texto.trim().replace(/[R$\s]/g, '');
  if (!t) return null;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export const paraTexto = (centavos: number | null | undefined) =>
  centavos == null ? '' : (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function data(iso: string | Date | null | undefined) {
  if (!iso) return '—';
  const s = typeof iso === 'string' ? iso : iso.toISOString();
  // Datas sem hora (AAAA-MM-DD) não podem mudar de dia por causa do fuso.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.split('-').reverse().join('/');
  return new Date(s).toLocaleDateString('pt-BR');
}

export function dataHora(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

export function cnpj(v: string) {
  return v?.length === 14 ? `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}` : v;
}

export const pct = (bp: number) => `${(bp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

export const NOMES_TIPO: Record<string, string> = {
  cooperativa: 'Cooperativa', distribuidora: 'Distribuidora', revendedor: 'Revendedor', construtora: 'Construtora', hospital: 'Hospital',
};

export const SITUACAO_PEDIDO: Record<string, string> = {
  novo: 'Novo', em_separacao: 'Em separação', enviado: 'Enviado', entregue: 'Entregue', cancelado: 'Cancelado',
};

export const SITUACAO_PAGAMENTO: Record<string, string> = {
  aguardando_pagamento: 'Aguardando pagamento', pix_expirado: 'Pix expirado', aguardando_faturamento: 'Aguardando faturamento',
  em_aberto: 'Boletos em aberto', pago: 'Pago', estornado: 'Estornado', cancelado: 'Cancelado',
};

export const FORMA: Record<string, string> = { pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão' };

export const SITUACAO_CADASTRO: Record<string, string> = {
  rascunho: 'Em preenchimento', em_analise: 'Em análise', pendente_documentos: 'Documentos pendentes', aprovado: 'Aprovado', reprovado: 'Reprovado',
};

export const SITUACAO_ORCAMENTO: Record<string, string> = {
  solicitado: 'Aguardando proposta', enviado: 'Proposta recebida', aceito: 'Aceito', recusado: 'Recusado', expirado: 'Expirado', cancelado: 'Cancelado',
};

export const MODALIDADE: Record<string, string> = { encomenda: 'Encomenda', conta_e_ordem: 'Conta e ordem' };
export const ETAPA_NUMERARIO: Record<string, string> = { cambio: 'Câmbio', tributos: 'Tributos', despesas_finais: 'Despesas finais' };
export const PAPEL: Record<string, string> = {
  comprador: 'Comprador', aprovador: 'Aprovador', comercial: 'Comercial', financeiro: 'Financeiro', administrador: 'Administrador',
};
