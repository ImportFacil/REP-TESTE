/**
 * Importação de produtos por planilha (CSV, como a "Transferência de dados" do Bagisto). Funções puras:
 * leitura do CSV (separador ";" ou ","), conversão dos campos e comparação com o produto atual.
 */

export const COLUNAS_PLANILHA = ['codigo', 'nome', 'categoria', 'preco', 'estoque', 'multiplo', 'unidade', 'marca', 'ncm', 'ativo'] as const;
export type ColunaPlanilha = (typeof COLUNAS_PLANILHA)[number];

/** Nomes aceitos no cabeçalho (sem acento, minúsculo) para cada coluna. */
const SINONIMOS: Record<string, ColunaPlanilha> = {
  codigo: 'codigo', sku: 'codigo', nome: 'nome', produto: 'nome', categoria: 'categoria', categoria_id: 'categoria',
  preco: 'preco', preco_tabela: 'preco', 'preco de tabela': 'preco', estoque: 'estoque', multiplo: 'multiplo', 'multiplo de venda': 'multiplo',
  unidade: 'unidade', marca: 'marca', ncm: 'ncm', ativo: 'ativo', situacao: 'ativo',
};

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Lê o CSV respeitando aspas ("a;b" vira um campo só) e linhas em branco. */
export function lerCsv(texto: string): string[][] {
  const limpo = texto.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const primeira = limpo.split('\n', 1)[0] ?? '';
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; } else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((x) => x.trim()));
}

/** Mapeia o cabeçalho para as colunas conhecidas; devolve também as que não reconheceu. */
export function mapearCabecalho(cab: string[]): { indices: Partial<Record<ColunaPlanilha, number>>; ignoradas: string[] } {
  const indices: Partial<Record<ColunaPlanilha, number>> = {};
  const ignoradas: string[] = [];
  cab.forEach((c, i) => {
    const col = SINONIMOS[semAcento(c)];
    if (col && indices[col] === undefined) indices[col] = i; else if (c.trim()) ignoradas.push(c.trim());
  });
  return { indices, ignoradas };
}

/** "1.234,56", "1234,56", "1234.56" ou "R$ 1.234,56" → centavos. */
export function lerPreco(t: string): number | null {
  let v = t.replace(/R\$|\s/g, '');
  if (!v) return null;
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}

export function lerInteiro(t: string): number | null {
  const v = t.replace(/\s|\./g, '');
  return /^\d+$/.test(v) ? Number(v) : null;
}

export function lerSimNao(t: string): boolean | null {
  const v = semAcento(t);
  if (['sim', 's', '1', 'true', 'ativo', 'ativa', 'yes'].includes(v)) return true;
  if (['nao', 'n', '0', 'false', 'inativo', 'inativa', 'no'].includes(v)) return false;
  return null;
}

export interface LinhaLida {
  linha: number;
  codigo: string;
  valores: Partial<{ nome: string; categoria_id: string; preco_tabela_centavos: number; estoque: number; multiplo_venda: number; unidade: string; marca: string; ncm: string; ativo: boolean }>;
  erros: string[];
}

/** Converte cada linha; campo vazio = não muda (na criação, os obrigatórios precisam vir). */
export function lerLinhas(texto: string): { linhas: LinhaLida[]; ignoradas: string[]; erroGeral: string | null } {
  const tabela = lerCsv(texto);
  if (tabela.length < 2) return { linhas: [], ignoradas: [], erroGeral: 'A planilha precisa do cabeçalho e de ao menos uma linha.' };
  const { indices, ignoradas } = mapearCabecalho(tabela[0]);
  if (indices.codigo === undefined) return { linhas: [], ignoradas, erroGeral: 'Falta a coluna "codigo" no cabeçalho.' };
  const pega = (l: string[], c: ColunaPlanilha) => (indices[c] === undefined ? '' : (l[indices[c]!] ?? '').trim());
  const linhas = tabela.slice(1).map((l, k): LinhaLida => {
    const erros: string[] = [];
    const valores: LinhaLida['valores'] = {};
    const codigo = pega(l, 'codigo').toUpperCase();
    if (!codigo) erros.push('Sem código.');
    else if (!/^[A-Z0-9._-]{2,40}$/.test(codigo)) erros.push(`Código inválido: ${codigo}.`);
    const nome = pega(l, 'nome'); if (nome) valores.nome = nome;
    const cat = pega(l, 'categoria'); if (cat) valores.categoria_id = cat.toLowerCase();
    const marca = pega(l, 'marca'); if (marca) valores.marca = marca;
    const unidade = pega(l, 'unidade'); if (unidade) valores.unidade = unidade;
    const preco = pega(l, 'preco');
    if (preco) { const v = lerPreco(preco); if (v === null) erros.push(`Preço inválido: ${preco}.`); else valores.preco_tabela_centavos = v; }
    const estoque = pega(l, 'estoque');
    if (estoque) { const v = lerInteiro(estoque); if (v === null) erros.push(`Estoque inválido: ${estoque}.`); else valores.estoque = v; }
    const mult = pega(l, 'multiplo');
    if (mult) { const v = lerInteiro(mult); if (!v) erros.push(`Múltiplo de venda inválido: ${mult}.`); else valores.multiplo_venda = v; }
    const ncm = pega(l, 'ncm').replace(/\D/g, '');
    if (ncm) { if (ncm.length !== 8) erros.push(`NCM precisa de 8 dígitos: ${pega(l, 'ncm')}.`); else valores.ncm = ncm; }
    const ativo = pega(l, 'ativo');
    if (ativo) { const v = lerSimNao(ativo); if (v === null) erros.push(`Ativo deve ser sim ou não: ${ativo}.`); else valores.ativo = v; }
    return { linha: k + 2, codigo, valores, erros };
  });
  const vistos = new Map<string, number>();
  for (const l of linhas) {
    if (!l.codigo) continue;
    const antes = vistos.get(l.codigo);
    if (antes) l.erros.push(`Código repetido (também na linha ${antes}).`); else vistos.set(l.codigo, l.linha);
  }
  return { linhas, ignoradas, erroGeral: null };
}

/** Campos que mudam em relação ao produto atual (para a prévia e para gravar só o necessário). */
export function diferencas(atual: Record<string, unknown>, novos: LinhaLida['valores']): Record<string, { de: unknown; para: unknown }> {
  const r: Record<string, { de: unknown; para: unknown }> = {};
  for (const [k, v] of Object.entries(novos)) if (atual[k] !== v) r[k] = { de: atual[k] ?? null, para: v };
  return r;
}
