/**
 * Calculadora de importação (Painel → Importação → Calculadora de importação).
 * Baseada na planilha "FINAL IMPORT COSTS DRONES" (contêiner 20' e 40'), com as correções do protótipo:
 * frete e seguro contados uma vez só, estadia no custo por item, capatazia no valor aduaneiro,
 * AFRMM como % do frete e Taxa Siscomex calculada pelo número de adições.
 * Os custos cobrados antes da chegada ao Brasil são informados em dólar. Aqui fica só o cálculo (sem tela).
 */

export interface ItemCalc { desc: string; ncm: string; fob: number; qtd: number; peso: number; ii: number; ipi: number; pis: number; cofins: number; mercado: number }
export interface DespExterior { rot: string; usd: number; va: boolean }
export type ChaveDesp = 'outros' | 'desDI' | 'dta' | 'transp' | 'estadia' | 'arm1' | 'arm2' | 'demurrage';
export interface EstadoCalc {
  modelo: '20' | '40' | 'vazio' | 'importado';
  origem?: { arquivo: string; aba: string; em: string };
  cambioDI: number; cambioFrete: number; cambioPag: number;
  freteUSD: number; seguroPct: number; seguroUSD: number;
  exterior: DespExterior[];
  capatazia: number; siscomexAuto: boolean; siscomex: number; afrmmPct: number;
  desp: Record<ChaveDesp, number>;
  lucroReal: boolean; icmsImp: number; finimp: number; icmsVenda: number; piscofVenda: number; margem: number;
  itens: ItemCalc[];
}

/** Despesas no Brasil (R$), rateadas pelo valor FOB de cada item. */
export const DESPESAS: Array<[ChaveDesp, string]> = [
  ['outros', 'Taxas do armador e do terminal (ISPS, handling etc.)'], ['desDI', 'Desembaraço da DI/DUIMP (despachante)'], ['dta', 'Desembaraço da DTA'],
  ['transp', 'Transporte rodoviário'], ['estadia', 'Estadia'], ['arm1', 'Armazenagem 1'], ['arm2', 'Armazenagem 2 (EADI)'], ['demurrage', 'Demurrage'],
];

// descrição, NCM, FOB unit. US$, qtd 20', peso 20' (kg), qtd 40', peso 40', preço de mercado no Brasil (aeronave, Agridrones nov/2026)
const DRONES: Array<[string, string, number, number, number, number, number, number]> = [
  ['DJI Agras T100', '8806.99.00', 36000, 2, 170, 5, 425, 130000],
  ['DJI Agras T70P', '8806.94.00', 20000, 3, 180, 6, 360, 85000],
  ['DJI Agras T55', '8806.94.00', 17000, 3, 165, 6, 330, 82000],
  ['DJI Agras T25P', '8806.94.00', 16500, 8, 500, 20, 1250, 54000],
  ['DJI Agras T50', '8806.94.00', 11000, 6, 220, 15, 550, 0],
  ['DJI Agras T25', '8806.94.00', 10500, 6, 220, 15, 550, 0],
  ['DJI Agras T20P', '8806.94.00', 14500, 4, 230, 10, 580, 0],
  ['DJI Agras T40', '8806.94.00', 9500, 6, 210, 15, 525, 0],
  ['DJI Mavic 3M', '8806.92.00', 4500, 10, 20, 18, 36, 0],
];
const EXTERIOR: DespExterior[] = [
  { rot: 'Frete interno na origem (até o porto ou aeroporto de embarque)', usd: 0, va: true },
  { rot: 'Taxas na origem (THC, BL, documentação, despacho de exportação)', usd: 0, va: true },
  { rot: 'Inspeção ou certificação na origem', usd: 0, va: false },
  { rot: 'Comissão do agente de compras no exterior', usd: 0, va: false },
  { rot: 'Outras despesas no exterior', usd: 0, va: true },
];

export const itemNovo = (): ItemCalc => ({ desc: '', ncm: '', fob: 0, qtd: 1, peso: 0, ii: 0, ipi: 6.5, pis: 2.1, cofins: 9.65, mercado: 0 });

export function padrao(cont: '20' | '40'): EstadoCalc {
  const c40 = cont === '40';
  return {
    modelo: cont, cambioDI: 5.45, cambioFrete: 5.45, cambioPag: 5.45, freteUSD: 3300, seguroPct: 0.6, seguroUSD: 0,
    exterior: EXTERIOR.map((x) => ({ ...x })),
    capatazia: 3500, siscomexAuto: true, siscomex: 154.23, afrmmPct: 8,
    desp: { outros: 13000, desDI: 1621, dta: 688, transp: 9000, estadia: 5000, arm1: 3000, arm2: 3500, demurrage: 0 },
    lucroReal: true, icmsImp: 0, finimp: 11, icmsVenda: 12, piscofVenda: 9.25, margem: 21,
    itens: DRONES.map((d) => ({ desc: d[0], ncm: d[1], fob: d[2], qtd: c40 ? d[5] : d[3], peso: c40 ? d[6] : d[4], ii: 0, ipi: 6.5, pis: 2.1, cofins: 9.65, mercado: d[7] })),
  };
}

export function vazio(): EstadoCalc {
  return { ...padrao('20'), modelo: 'vazio', itens: [{ ...itemNovo(), ipi: 0 }] };
}

/** Lê o estado salvo; o que faltar vem do padrão (versões antigas continuam abrindo). */
export function restaurar(bruto: unknown): EstadoCalc | null {
  if (!bruto || typeof bruto !== 'object' || !Array.isArray((bruto as EstadoCalc).itens)) return null;
  const d = bruto as Partial<EstadoCalc>;
  const p = padrao('20');
  return { ...p, ...d, desp: { ...p.desp, ...(d.desp ?? {}) }, exterior: Array.isArray(d.exterior) ? d.exterior : p.exterior } as EstadoCalc;
}

/** Taxa Siscomex (Portaria ME nº 4.131/2021): R$ 115,67 por declaração + valor por adição, por faixa. */
export function taxaSiscomex(adicoes: number) {
  const faixas: Array<[number, number]> = [[2, 38.56], [5, 30.85], [10, 23.14], [20, 15.42], [50, 7.71], [Infinity, 3.86]];
  let total = 115.67;
  let n = 0;
  for (let a = 1; a <= adicoes; a++) { while (a > faixas[n][0]) n++; total += faixas[n][1]; }
  return Math.round(total * 100) / 100;
}

const CHAVES_T = ['fobUSD', 'fob', 'frete', 'seguro', 'origemVA', 'origemFora', 'capatazia', 'va', 'ii', 'ipi', 'pis', 'cofins', 'icms', 'afrmm', 'siscomex', 'desp', 'varCamb', 'desembolso', 'creditos', 'liquido'] as const;
export type Totais = Record<(typeof CHAVES_T)[number], number>;
export interface LinhaCalc extends Totais {
  qtd: number; desembolsoU: number; liqU: number; finU: number; totU: number; pv: number; merc: number; margemMerc: number | null; fobMax: number | null;
}
export interface ResultadoCalc {
  T: Totais; linhas: Array<LinhaCalc | null>; adicoes: number; siscomex: number; pesoTot: number; qtdTot: number;
  exterior: { fobUSD: number; freteUSD: number; seguroUSD: number; origemUSD: number; totalUSD: number; itens: Array<DespExterior & { brl: number }> };
  fatorDesembolso: number; fatorLiquido: number;
}

const N = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const P = (v: unknown) => N(v) / 100;

/** Cálculo puro: recebe o estado e devolve os totais do embarque e o resultado por item. */
export function calcular(s: EstadoCalc): ResultadoCalc {
  const itens = s.itens.filter((i) => N(i.qtd) > 0);
  const fobTot = itens.reduce((a, i) => a + N(i.qtd) * N(i.fob), 0) * N(s.cambioDI);
  const pesoTot = itens.reduce((a, i) => a + N(i.peso), 0);
  const qtdTot = itens.reduce((a, i) => a + N(i.qtd), 0);
  const adicoes = new Set(itens.map((i) => [String(i.ncm || '').trim(), N(i.ii), N(i.ipi)].join('|'))).size;
  const siscomex = s.siscomexAuto ? (adicoes ? taxaSiscomex(adicoes) : 0) : N(s.siscomex);
  const freteR = N(s.freteUSD) * N(s.cambioFrete);
  const afrmm = freteR * P(s.afrmmPct);
  const despRateio = DESPESAS.reduce((a, [k]) => a + N(s.desp[k]), 0);
  const ext = (s.exterior || []).map((x) => ({ rot: x.rot, usd: N(x.usd), va: !!x.va, brl: N(x.usd) * N(s.cambioDI) }));
  const extVA = ext.filter((x) => x.va).reduce((a, x) => a + x.brl, 0);
  const extFora = ext.filter((x) => !x.va).reduce((a, x) => a + x.brl, 0);
  const seguroFixo = N(s.seguroUSD) > 0 ? N(s.seguroUSD) * N(s.cambioDI) : null; // seguro em US$; 0 = % de FOB + frete
  const icmsImp = Math.min(P(s.icmsImp), 0.95);
  const T = Object.fromEntries(CHAVES_T.map((k) => [k, 0])) as Totais;
  const linhas = s.itens.map((i): LinhaCalc | null => {
    const q = N(i.qtd);
    if (q <= 0) return null;
    const fobUSD = q * N(i.fob);
    const fob = fobUSD * N(s.cambioDI);
    const shFob = fobTot ? fob / fobTot : 0;
    const shPeso = pesoTot ? N(i.peso) / pesoTot : shFob;
    const frete = freteR * shPeso;
    const seguro = seguroFixo != null ? seguroFixo * shFob : (fob + frete) * P(s.seguroPct);
    const origemVA = extVA * shFob;
    const origemFora = extFora * shFob;
    const capatazia = N(s.capatazia) * shFob;
    const va = fob + frete + seguro + origemVA + capatazia;
    const ii = va * P(i.ii);
    const ipi = (va + ii) * P(i.ipi);
    const pis = va * P(i.pis);
    const cofins = va * P(i.cofins);
    const af = afrmm * shPeso;
    const sc = qtdTot ? (siscomex * q) / qtdTot : 0;
    const icms = ((va + ii + ipi + pis + cofins + af + sc) / (1 - icmsImp)) * icmsImp;
    const desp = despRateio * shFob;
    const varCamb = fobUSD * (N(s.cambioPag) - N(s.cambioDI));
    const desembolso = va + ii + ipi + pis + cofins + icms + af + sc + desp + origemFora + varCamb;
    const creditos = ipi + icms + (s.lucroReal ? pis + cofins : 0);
    const liquido = desembolso - creditos;
    const r: Totais = { fobUSD, fob, frete, seguro, origemVA, origemFora, capatazia, va, ii, ipi, pis, cofins, icms, afrmm: af, siscomex: sc, desp, varCamb, desembolso, creditos, liquido };
    CHAVES_T.forEach((k) => { T[k] += r[k]; });
    const liqU = liquido / q;
    const finU = liqU * P(s.finimp);
    const totU = liqU + finU;
    const dedVenda = P(s.icmsVenda) + P(s.piscofVenda);
    const pv = (totU / (1 - P(s.margem)) / (1 - dedVenda)) * (1 + P(i.ipi));
    const merc = N(i.mercado);
    const rlMerc = merc ? (merc / (1 + P(i.ipi))) * (1 - dedVenda) : 0;
    const margemMerc = merc ? (rlMerc - totU) / rlMerc : null;
    return { ...r, qtd: q, desembolsoU: desembolso / q, liqU, finU, totU, pv, merc, margemMerc, fobMax: merc ? (N(i.fob) * rlMerc * (1 - P(s.margem))) / totU : null };
  });
  const cDI = N(s.cambioDI) || 1;
  const origemUSD = ext.reduce((a, x) => a + x.usd, 0);
  const seguroUSD = seguroFixo != null ? N(s.seguroUSD) : T.seguro / cDI;
  const exterior = { fobUSD: T.fobUSD, freteUSD: N(s.freteUSD), seguroUSD, itens: ext, origemUSD, totalUSD: T.fobUSD + N(s.freteUSD) + seguroUSD + origemUSD };
  return { T, linhas, adicoes, siscomex, pesoTot, qtdTot, exterior, fatorDesembolso: T.fob ? T.desembolso / T.fob : 0, fatorLiquido: T.fob ? T.liquido / T.fob : 0 };
}

/** Resultado em CSV (separado por ponto e vírgula, decimal com vírgula, para abrir no Excel em português). */
export function resultadoCsv(s: EstadoCalc): string {
  const R = calcular(s);
  const n = (v: unknown) => (v == null || v === '' ? '' : typeof v === 'number' ? v.toFixed(2).replace('.', ',') : `"${String(v).replace(/"/g, '""')}"`);
  const cab = ['Item', 'NCM', 'Qtd', 'FOB unit US$', 'FOB R$', 'Frete R$', 'Seguro R$', 'Despesas na origem (no valor aduaneiro) R$', 'Despesas na origem (fora do valor aduaneiro) R$', 'Capatazia R$', 'Valor aduaneiro R$', 'II R$', 'IPI R$', 'PIS R$', 'COFINS R$', 'ICMS R$', 'AFRMM R$', 'Siscomex R$', 'Despesas R$', 'Variação cambial R$', 'Desembolso R$', 'Créditos R$', 'Custo líquido R$', 'Desembolso unit R$', 'Custo líquido + FINIMP unit R$', 'Preço sugerido unit R$', 'Preço de mercado R$', 'Margem no preço de mercado %', 'FOB máximo US$'];
  const linhas: string[] = [];
  R.linhas.forEach((l, ix) => {
    if (!l) return;
    const it = s.itens[ix];
    linhas.push([it.desc, it.ncm, l.qtd, N(it.fob), l.fob, l.frete, l.seguro, l.origemVA, l.origemFora, l.capatazia, l.va, l.ii, l.ipi, l.pis, l.cofins, l.icms, l.afrmm, l.siscomex, l.desp, l.varCamb, l.desembolso, l.creditos, l.liquido, l.desembolsoU, l.totU, l.pv, l.merc || '', l.margemMerc == null ? '' : l.margemMerc * 100, l.fobMax == null ? '' : l.fobMax].map(n).join(';'));
  });
  const T = R.T;
  linhas.push(['TOTAL', '', R.qtdTot, '', T.fob, T.frete, T.seguro, T.origemVA, T.origemFora, T.capatazia, T.va, T.ii, T.ipi, T.pis, T.cofins, T.icms, T.afrmm, T.siscomex, T.desp, T.varCamb, T.desembolso, T.creditos, T.liquido].map(n).join(';'));
  const X = R.exterior;
  linhas.push('', [n('Custos antes da chegada ao Brasil'), n('US$'), n('R$')].join(';'));
  linhas.push([n('FOB'), n(X.fobUSD), n(T.fob)].join(';'), [n('Frete internacional'), n(X.freteUSD), n(T.frete)].join(';'), [n('Seguro internacional'), n(X.seguroUSD), n(T.seguro)].join(';'));
  X.itens.forEach((x) => linhas.push([n(x.rot + (x.va ? ' (no valor aduaneiro)' : ' (fora do valor aduaneiro)')), n(x.usd), n(x.brl)].join(';')));
  linhas.push([n('Total no exterior'), n(X.totalUSD), ''].join(';'));
  return `﻿${cab.join(';')}\n${linhas.join('\n')}`;
}

export const MODELO_CSV = '﻿DESCRIÇÃO DO PRODUTO;NCM;QUANT. UNIT;$ / UNIT;NET WT KG;II;IPI;PIS;COFINS\nDJI Agras T25P;8806.94.00;8;16500;500;0%;6,5%;2,1%;9,65%\n';

/* ---------- Leitura de planilha (.xlsx, .xls, .csv) ----------
   Itens pela linha de cabeçalho (DESCRIÇÃO, QUANT., $ / UNIT, NET WT, NCM, II, IPI...),
   câmbios pelos rótulos "Tx Cambial" e despesas pelo bloco "Despesas de Desembaraço". */

export const normalizar = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Número do Excel ou texto "1.234,56", "6,5%", "R$ 3.500". Com pct, devolve fração (6,5% → 0,065). */
export function numeroLido(v: unknown, pct = false): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? (pct && v > 1 ? v / 100 : v) : null;
  let t = String(v).trim();
  const temPct = t.includes('%');
  t = t.replace(/[^\d,.-]/g, '');
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (t.includes(',')) t = t.replace(',', '.');
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return temPct ? n / 100 : pct && n > 1 ? n / 100 : n;
}

type CampoPlan = 'seq' | 'totvs' | 'desc' | 'model' | 'qtd' | 'usd' | 'peso' | 'ex' | 'ncm' | 'ii' | 'ipi' | 'pis' | 'cofins' | 'icms' | 'ind';
const CABECALHOS: Array<[CampoPlan, (h: string) => boolean, boolean?]> = [
  ['seq', (h) => /^seq/.test(h)], ['totvs', (h) => /totvs/.test(h)], ['desc', (h) => /descri|^produto$|^item$/.test(h)], ['model', (h) => /^model/.test(h)],
  ['qtd', (h) => /^quant|^qtd|quantidade/.test(h)],
  ['usd', (h) => /^\$ ?\/ ?unit|^us\$|usd.*unit|unit.*usd|fob.*unit|unit.*fob|valor unit.*(us|usd|\$)|preco unit.*(us|usd|\$)/.test(h) && !/^r\$/.test(h)],
  ['peso', (h) => /net ?wt|peso/.test(h)], ['ex', (h) => /^ex\b|ex.?tarif/.test(h)], ['ncm', (h) => /^ncm/.test(h)],
  ['ii', (h) => /^ii( ?%)?$|imposto de importacao/.test(h), true], ['ipi', (h) => /^ipi( ?%)?$/.test(h), true], ['pis', (h) => /^pis( ?%)?$/.test(h), true],
  ['cofins', (h) => /^cofins( ?%)?$/.test(h), true], ['icms', (h) => /^icms( ?%)?$/.test(h), true], ['ind', (h) => /industrializa/.test(h)],
];
const ROTULOS_DESP: Array<[RegExp, string | null]> = [
  [/frete internacional/, 'freteUSD'], [/^seguro/, null], [/capatazia/, 'capatazia'], [/siscomex/, 'siscomex'], [/^s\.?d\.?a/, 'sda'], [/marinha/, 'marinha'],
  [/other charges|outras taxas/, 'outros'], [/desembaraco di/, 'desDI'], [/desembaraco dta|^dta/, 'dta'], [/transporte/, 'transp'], [/estadia/, 'estadia'],
  [/armazenagem 2|eadi/, 'arm2'], [/armazenagem/, 'arm1'], [/dif\.? cambial/, 'difCamb'], [/demurrage/, 'demurrage'], [/^ii total/, null],
];

export interface AbaLida {
  itens: Array<Partial<Record<CampoPlan, string | number>>>;
  cambios: Partial<Pick<EstadoCalc, 'cambioDI' | 'cambioFrete' | 'cambioPag'>>;
  desp: Record<string, number>; freteUSD: number | null; avisos: string[];
}

/** Lê uma aba (matriz de células, como o sheet_to_json com header:1 do SheetJS). Sem tabela de itens, devolve null. */
export function lerAba(linhas: unknown[][]): AbaLida | null {
  const R: AbaLida = { itens: [], cambios: {}, desp: {}, freteUSD: null, avisos: [] };
  let hRow = -1;
  const cols: Partial<Record<CampoPlan, number>> = {};
  for (let r = 0; r < Math.min(linhas.length, 60) && hRow < 0; r++) {
    const ns = (linhas[r] || []).map(normalizar);
    if (ns.some((h) => /descri|^produto$/.test(h)) && ns.some((h) => /^quant|^qtd|quantidade/.test(h))) {
      hRow = r;
      ns.forEach((h, c) => { if (!h) return; for (const [campo, teste] of CABECALHOS) { if (cols[campo] == null && teste(h)) { cols[campo] = c; break; } } });
    }
  }
  if (hRow < 0) return null;
  const ehPct = Object.fromEntries(CABECALHOS.map((x) => [x[0], !!x[2]])) as Record<CampoPlan, boolean>;
  for (let r = hRow + 1; r < linhas.length; r++) {
    const row = linhas[r] || [];
    const g = (c: CampoPlan) => (cols[c] == null ? null : row[cols[c] as number]);
    const vazio = (v: unknown) => v == null || v === '';
    if (vazio(g('desc')) && vazio(g('totvs')) && vazio(g('model'))) { if (R.itens.length) break; else continue; }
    const it: Partial<Record<CampoPlan, string | number>> = {};
    (['seq', 'totvs', 'desc', 'model', 'ex', 'ncm'] as const).forEach((c) => { const v = g(c); if (!vazio(v)) it[c] = String(v).trim(); });
    (['qtd', 'usd', 'peso', 'ii', 'ipi', 'pis', 'cofins', 'icms', 'ind'] as const).forEach((c) => { if (cols[c] == null) return; const v = numeroLido(g(c), ehPct[c]); if (v != null) it[c] = v; });
    R.itens.push(it);
    if (R.itens.length >= 500) { R.avisos.push('Lidas só as primeiras 500 linhas.'); break; }
  }
  const nomes: Record<string, string> = { qtd: 'quantidade', usd: '$ / unit', peso: 'peso (net wt)', ncm: 'NCM' };
  (['qtd', 'usd', 'peso', 'ncm'] as const).forEach((c) => { if (cols[c] == null) R.avisos.push(`Coluna "${nomes[c]}" não encontrada.`); });
  // câmbios
  linhas.forEach((row, r) => (row || []).forEach((v, c) => {
    const h = normalizar(v);
    if (!/tx cambial|taxa cambial|taxa de cambio|cambio/.test(h) || /valor cambio|cambio pago|total cambio/.test(h)) return;
    let val: number | null = null;
    for (let k = 1; k <= 3 && val == null; k++) val = numeroLido(row[c + k]);
    if (val == null && linhas[r + 1]) val = numeroLido(linhas[r + 1][c]);
    if (val == null || val <= 0) return;
    if (/frete/.test(h)) R.cambios.cambioFrete = val;
    else if (/registro|\bdi\b/.test(h)) R.cambios.cambioDI = val;
    else if (/pgt|pagamento|final/.test(h)) R.cambios.cambioPag = val;
  }));
  // despesas de desembaraço
  let dRow = -1, cUSD = -1, cBRL = -1, cRot = -1;
  for (let r = 0; r < linhas.length && dRow < 0; r++) {
    const ns = (linhas[r] || []).map(normalizar);
    const iu = ns.indexOf('usd'), ib = ns.indexOf('r$');
    if (iu >= 0 && ib >= 0 && ns.some((h) => /despes/.test(h))) { dRow = r; cUSD = iu; cBRL = ib; cRot = ns.findIndex((h) => /despes/.test(h)); }
  }
  if (dRow >= 0) {
    for (let r = dRow + 1; r < Math.min(linhas.length, dRow + 40); r++) {
      const row = linhas[r] || [];
      const rot = normalizar(row[cRot]);
      if (!rot) continue;
      if (/^total/.test(rot)) break;
      const m = ROTULOS_DESP.find(([re]) => re.test(rot));
      if (!m || !m[1]) continue;
      if (m[1] === 'freteUSD') { const v = numeroLido(row[cUSD]); if (v != null) R.freteUSD = v; continue; }
      R.desp[m[1]] = numeroLido(row[cBRL]) ?? 0;
    }
  }
  return R;
}

/** Aplica a aba lida ao estado: itens trocados; câmbios, frete e despesas que não vierem continuam como estavam. */
export function aplicarAba(s: EstadoCalc, arquivo: string, aba: string, R: AbaLida): EstadoCalc {
  const p100 = (v: unknown, pad: number) => (v == null ? pad : Math.round(Number(v) * 100 * 1e6) / 1e6); // a planilha guarda 6,5% como 0,065
  const itens: ItemCalc[] = R.itens.map((i) => ({
    desc: String(i.desc ?? i.model ?? ''), ncm: String(i.ncm ?? ''), fob: Number(i.usd ?? 0), qtd: Number(i.qtd ?? 0), peso: Number(i.peso ?? 0),
    ii: p100(i.ii, 0), ipi: p100(i.ipi, 0), pis: p100(i.pis, 2.1), cofins: p100(i.cofins, 9.65), mercado: 0,
  }));
  const desp = { ...s.desp };
  DESPESAS.forEach(([k]) => { if (R.desp[k] != null) desp[k] = R.desp[k]; });
  const novo: EstadoCalc = { ...s, ...R.cambios, modelo: 'importado', origem: { arquivo, aba, em: new Date().toLocaleString('pt-BR') }, itens: itens.length ? itens : [itemNovo()], desp };
  if (R.desp.capatazia != null) novo.capatazia = R.desp.capatazia;
  if (R.desp.siscomex != null) { novo.siscomexAuto = false; novo.siscomex = R.desp.siscomex; }
  if (R.freteUSD != null) novo.freteUSD = R.freteUSD;
  return novo;
}

/* ---------- Busca de NCM (tabela oficial da Receita Federal / Siscomex, em /ncm.json) ---------- */

export interface FolhaNcm { c: string; d: string; pos: string; sub: string[]; nF: string; nS: string; nP: string; nC: string }
export interface TabelaNcm { meta: { atualizadoEm: string; ato?: string; total: number }; folhas: FolhaNcm[]; porCodigo: Map<string, FolhaNcm> }

const SINONIMOS: Record<string, string[]> = {
  drone: ['nao tripulados'], dji: ['nao tripulados'], agras: ['nao tripulados'], mavic: ['nao tripulados'], drones: ['nao tripulados'], vant: ['nao tripulados'], rpa: ['nao tripulados'],
  celular: ['telefones inteligentes', 'telefones celulares'], smartphone: ['telefones inteligentes'], notebook: ['processamento de dados, portateis'], laptop: ['processamento de dados, portateis'],
  computador: ['processamento de dados'], tablet: ['processamento de dados, portateis'], tv: ['receptores de televisao', 'monitores'], televisao: ['receptores de televisao'],
  pneu: ['pneumaticos'], pneus: ['pneumaticos'], bateria: ['acumuladores eletricos'], baterias: ['acumuladores eletricos'], pilha: ['pilhas'],
  carregador: ['conversores estaticos', 'carregadores'], fonte: ['conversores estaticos'], led: ['diodos emissores de luz'], lampada: ['lampadas'],
  'painel solar': ['celulas fotovoltaicas', 'fotovoltaic'], solar: ['fotovoltaic'], geladeira: ['refrigeradores'], freezer: ['congeladores'],
  'ar condicionado': ['ar-condicionado', 'condicionadores de ar'], furadeira: ['furadeiras', 'perfuradoras'], parafusadeira: ['ferramentas eletromecanicas'],
  esmerilhadeira: ['ferramentas eletromecanicas', 'esmerilhadoras'], trator: ['tratores'], rocadeira: ['cortadores de grama', 'motocultores'],
  pulverizador: ['pulverizadores'], bomba: ['bombas'], motor: ['motores'], cabo: ['fios, cabos', 'cabos'], fio: ['fios'], tomada: ['tomadas'], disjuntor: ['disjuntores'],
  nitrila: ['borracha'], latex: ['borracha'], luva: ['luvas'], luvas: ['luvas'], mascara: ['mascaras'], seringa: ['seringas'], camera: ['cameras'], impressora: ['impressoras'], monitor: ['monitores'],
  semente: ['sementes'], fertilizante: ['adubos', 'fertilizantes'], adubo: ['adubos'], herbicida: ['herbicidas'], inseticida: ['inseticidas'], fungicida: ['fungicidas'],
  irrigacao: ['irrigacao', 'aspersores'], gotejador: ['irrigacao'], 'pivo central': ['irrigacao'],
};
/** Atalhos para produtos frequentes da Export Fácil: aparecem primeiro, com a regra de classificação. */
export const DICAS_NCM = [
  { termos: ['drone', 'drones', 'vant', 'rpa', 'agras', 'dji', 'mavic', 'aereos nao tripulados'], prefixos: ['88069', '88062'],
    nota: 'Drones: 8806.9 quando fazem voo programado sem intervenção do piloto (caso dos drones agrícolas, SC Cosit 98.027/2025); 8806.2 quando só voam pilotados remotamente. O código final depende do peso máximo de decolagem.' },
  { termos: ['peca de drone', 'partes de drone', 'helice', 'braco do drone'], prefixos: ['880730'], nota: 'Partes de drones (posição 88.07).' },
];
const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'com', 'sem', 'e', 'em', 'a', 'o', 'as', 'os', 'por', 'um', 'uma', 'tipo', 'modelo', 'kit', 'pecas', 'peca']);

export const formatarNcm = (c: string) => (c && c.length === 8 ? `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6)}` : c);

/** Monta o índice a partir do arquivo publicado ({atualizadoEm, ato, total, n: [[código, descrição]]}). */
export function montarTabelaNcm(d: { atualizadoEm: string; ato?: string; total: number; n: Array<[string, string]> }): TabelaNcm {
  const desc = new Map(d.n);
  const limpa = (t: string | undefined) => String(t || '').replace(/^[-–\s]+/, '').replace(/:$/, '').trim();
  const folhas = d.n.filter(([c]) => c.length === 8).map(([c, t]): FolhaNcm => {
    const anc = [2, 4, 5, 6, 7].map((n) => c.slice(0, n)).filter((p) => desc.has(p)).map((p) => limpa(desc.get(p)));
    const pos = desc.get(c.slice(0, 4)) ? limpa(desc.get(c.slice(0, 4))) : '';
    const sub = [5, 6, 7].map((n) => c.slice(0, n)).filter((p) => desc.has(p)).map((p) => limpa(desc.get(p)));
    return { c, d: limpa(t), pos, sub, nF: normalizar(t), nS: normalizar(sub.join(' ')), nP: normalizar(pos), nC: normalizar(anc[0] || '') };
  });
  return { meta: { atualizadoEm: d.atualizadoEm, ato: d.ato, total: d.total }, folhas, porCodigo: new Map(folhas.map((f) => [f.c, f])) };
}

/** Busca por nome do produto (com sinônimos do dia a dia) ou pelo começo do código. */
export function buscarNcm(t: TabelaNcm, q: string, limite = 40): { itens: FolhaNcm[]; parcial: boolean; dica?: string } {
  const qn = normalizar(q);
  if (!qn) return { itens: [], parcial: false };
  const dica = DICAS_NCM.find((d) => d.termos.some((x) => qn.includes(x)));
  const fixos = dica ? dica.prefixos.flatMap((p) => t.folhas.filter((f) => f.c.startsWith(p))) : [];
  const dig = qn.replace(/[.\s-]/g, '');
  if (/^\d{2,8}$/.test(dig)) return { itens: t.folhas.filter((f) => f.c.startsWith(dig)).slice(0, limite), parcial: false };
  const palavras = qn.replace(/[^\w\s-]/g, ' ').split(' ').filter((w) => w.length >= 3 && !PARADAS.has(w));
  const grupos: string[][] = [];
  for (let i = 0; i < palavras.length; i++) {
    const dupla = `${palavras[i]} ${palavras[i + 1] || ''}`;
    if (SINONIMOS[dupla]) { grupos.push([dupla, ...SINONIMOS[dupla]]); i++; continue; }
    const w = palavras[i];
    const raiz = w.length > 5 ? w.replace(/(oes|aes|ais|eis|res|es|s)$/, '') : w;
    grupos.push([raiz, ...(SINONIMOS[w] || [])]);
  }
  let achados: Array<{ f: FolhaNcm; a: number; s: number }> = [];
  if (grupos.length) {
    const brutas = grupos.map((g) => g[0]);
    for (const f of t.folhas) {
      let s = 0, acertos = 0;
      grupos.forEach((g, gi) => {
        let melhor = 0;
        for (const alt of g) {
          if (f.nF.includes(alt)) melhor = Math.max(melhor, 4);
          else if (f.nS.includes(alt)) melhor = Math.max(melhor, 3);
          else if (f.nP.includes(alt)) melhor = Math.max(melhor, 2);
          else if (f.nC.includes(alt)) melhor = Math.max(melhor, 1);
        }
        if (melhor) { acertos++; s += melhor * (gi === 0 ? 1.5 : 1); } // a 1ª palavra costuma ser o produto
      });
      if (!acertos) continue;
      if (/\bpartes?\b|\bpecas?\b/.test(`${f.nF} ${f.nS} ${f.nP}`) && !/\bpartes?\b|\bpecas?\b/.test(qn)) s -= 3; // peças só quando pedidas
      brutas.forEach((w) => { if (f.nF.includes(w)) s += 0.6; else if (f.nS.includes(w) || f.nP.includes(w)) s += 0.3; });
      achados.push({ f, a: acertos, s: s - (/^outr/.test(f.nF) ? 0.5 : 0) });
    }
  }
  const max = achados.reduce((m, r) => Math.max(m, r.a), 0);
  achados = achados.filter((r) => r.a === max).sort((a, b) => b.s - a.s || a.f.c.localeCompare(b.f.c));
  const vistos = new Set(fixos.map((f) => f.c));
  const itens = [...fixos, ...achados.map((r) => r.f).filter((f) => !vistos.has(f.c))].slice(0, limite);
  return { itens, parcial: !dica && max > 0 && max < grupos.length, dica: dica?.nota };
}

/** Texto curto do NCM para mostrar abaixo do campo; "Outros" ganha o nome do grupo antes. */
export function descricaoNcm(f: FolhaNcm) {
  return /^outr/i.test(f.d) ? [[f.pos, ...f.sub].filter((t) => !/^outr/i.test(t)).pop() || f.pos, f.d].join(' › ') : f.d;
}
