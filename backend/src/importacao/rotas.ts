import { BadRequestException } from '@nestjs/common';
import { seaRoute } from 'searoute-ts';

/**
 * Rotas marítimas (Importação → Rotas marítimas): caminho pelo mar entre dois portos, distância e tempo de viagem.
 * Usa a searoute-ts (MIT), que percorre a malha marítima do Eurostat (2025); os portos vêm da lista UN/LOCODE que
 * acompanha a biblioteca. É uma estimativa da rota comercial, não a posição nem o trajeto real de um navio.
 */

interface PortoBruto { name: string; country: string; coordinates: [number, number] }
// O subcaminho "searoute-ts/ports" só tem tipos para resoluções de módulo mais novas que a deste projeto.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PORTS } = require('searoute-ts/ports') as { PORTS: Record<string, PortoBruto> };

export interface Porto { codigo: string; nome: string; pais: string; lon: number; lat: number }

/** Portos mais usados nas importações para o Brasil, com o nome em português; aparecem primeiro na busca. */
const PRINCIPAIS: Array<[string, string, string]> = [
  ['BRSSZ', 'Santos', 'Brasil'], ['BRPNG', 'Paranaguá', 'Brasil'], ['BRITJ', 'Itajaí', 'Brasil'], ['BRNVT', 'Navegantes', 'Brasil'], ['BRIOA', 'Itapoá', 'Brasil'],
  ['BRRIG', 'Rio Grande', 'Brasil'], ['BRRIO', 'Rio de Janeiro', 'Brasil'], ['BRVIX', 'Vitória', 'Brasil'], ['BRSSA', 'Salvador', 'Brasil'], ['BRSUA', 'Suape', 'Brasil'],
  ['BRPEC', 'Pecém', 'Brasil'], ['BRMAO', 'Manaus', 'Brasil'],
  ['CNSHA', 'Xangai', 'China'], ['CNNGB', 'Ningbo', 'China'], ['CNSZX', 'Shenzhen', 'China'], ['CNTAO', 'Qingdao', 'China'], ['CNTXG', 'Tianjin', 'China'],
  ['CNCAN', 'Guangzhou', 'China'], ['CNXMN', 'Xiamen', 'China'], ['HKHKG', 'Hong Kong', 'Hong Kong'], ['KRPUS', 'Busan', 'Coreia do Sul'], ['SGSIN', 'Singapura', 'Singapura'],
  ['JPYOK', 'Yokohama', 'Japão'], ['INNSA', 'Nhava Sheva (Mumbai)', 'Índia'], ['AEJEA', 'Jebel Ali (Dubai)', 'Emirados Árabes'],
  ['NLRTM', 'Roterdã', 'Países Baixos'], ['DEHAM', 'Hamburgo', 'Alemanha'], ['BEANR', 'Antuérpia', 'Bélgica'], ['ESVLC', 'Valência', 'Espanha'], ['ITGOA', 'Gênova', 'Itália'],
  ['USLAX', 'Los Angeles', 'Estados Unidos'], ['USHOU', 'Houston', 'Estados Unidos'], ['USNYC', 'Nova York', 'Estados Unidos'], ['USMIA', 'Miami', 'Estados Unidos'],
];
const NOME_PT = new Map(PRINCIPAIS.map(([c, n, p]) => [c, { nome: n, pais: p }]));

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function porto(codigo: string): Porto | null {
  const c = String(codigo ?? '').toUpperCase().replace(/\s/g, '');
  const p = PORTS[c];
  if (!p) return null;
  const pt = NOME_PT.get(c);
  return { codigo: c, nome: pt?.nome ?? p.name, pais: pt?.pais ?? p.country, lon: p.coordinates[0], lat: p.coordinates[1] };
}

/** Sem busca, os portos principais; com busca, por nome (em português ou inglês), país ou código UN/LOCODE. */
export function buscarPortos(busca?: string, limite = 30): Porto[] {
  const principais = PRINCIPAIS.map(([c]) => porto(c)).filter((p): p is Porto => !!p);
  const q = semAcento(busca ?? '');
  if (!q) return principais;
  const bate = (p: Porto, bruto?: PortoBruto) => semAcento(`${p.codigo} ${p.nome} ${p.pais} ${bruto?.name ?? ''} ${bruto?.country ?? ''}`).includes(q);
  const achados = principais.filter((p) => bate(p, PORTS[p.codigo]));
  const vistos = new Set(achados.map((p) => p.codigo));
  for (const c of Object.keys(PORTS)) {
    if (achados.length >= limite) break;
    if (vistos.has(c)) continue;
    const p = porto(c) as Porto;
    if (bate(p, PORTS[c])) achados.push(p);
  }
  return achados.slice(0, limite);
}

/** Canais e estreitos que a rota pode atravessar (os que dá para evitar ficam em EVITAVEIS). */
const PASSAGENS: Record<string, string> = {
  suez: 'Canal de Suez', panama: 'Canal do Panamá', gibraltar: 'Estreito de Gibraltar', babelmandeb: 'Estreito de Bab-el-Mandeb (Mar Vermelho)',
  malacca: 'Estreito de Malaca', sunda: 'Estreito de Sunda', dover: 'Estreito de Dover (Canal da Mancha)', kiel: 'Canal de Kiel', corinth: 'Canal de Corinto',
  bering: 'Estreito de Bering', magellan: 'Estreito de Magalhães', bosphorus: 'Bósforo', hormuz: 'Estreito de Ormuz', capehorn: 'Cabo Horn',
  northwest: 'Passagem do Noroeste', northeast: 'Passagem do Nordeste',
};
export const EVITAVEIS = ['suez', 'panama'] as const;
const KM_POR_MILHA = 1.852;

export interface Rota {
  origem: Porto; destino: Porto; velocidade_nos: number; evitar: string[];
  distancia_mn: number; distancia_km: number; linha_reta_km: number; horas: number; dias: number;
  passagens: Array<{ codigo: string; nome: string }>;
  /** Pontos da rota, [longitude, latitude], da origem ao destino. */
  linha: Array<[number, number]>;
}

export function calcularRota(origem: string, destino: string, velocidadeNos = 16, evitar: string[] = []): Rota {
  const o = porto(origem);
  const d = porto(destino);
  if (!o) throw new BadRequestException(`Porto de origem desconhecido: ${origem}`);
  if (!d) throw new BadRequestException(`Porto de destino desconhecido: ${destino}`);
  if (o.codigo === d.codigo) throw new BadRequestException('Escolha portos diferentes para a origem e o destino.');
  if (!(velocidadeNos >= 5 && velocidadeNos <= 30)) throw new BadRequestException('A velocidade deve ficar entre 5 e 30 nós.');
  const restricoes = [...new Set(evitar.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const invalida = restricoes.find((e) => !(EVITAVEIS as readonly string[]).includes(e));
  if (invalida) throw new BadRequestException(`Só é possível evitar: ${EVITAVEIS.join(', ')}.`);
  let r;
  try {
    r = seaRoute([o.lon, o.lat], [d.lon, d.lat], {
      units: 'nauticalmiles', speedKnots: velocidadeNos, returnPassages: true,
      ...(restricoes.length && { restrictions: restricoes.flatMap((e) => (e === 'suez' ? ['suez', 'babelmandeb'] : [e])) }),
    } as Parameters<typeof seaRoute>[2]);
  } catch {
    throw new BadRequestException('Não encontrei uma rota marítima entre esses portos com as restrições escolhidas.');
  }
  const p = r.properties as { length: number; greatCircleLength?: number; durationHours?: number; passages?: string[] };
  const horas = p.durationHours ?? p.length / velocidadeNos;
  const arred = (v: number, casas = 0) => Math.round(v * 10 ** casas) / 10 ** casas;
  return {
    origem: o, destino: d, velocidade_nos: velocidadeNos, evitar: restricoes,
    distancia_mn: arred(p.length), distancia_km: arred(p.length * KM_POR_MILHA), linha_reta_km: arred((p.greatCircleLength ?? 0) * KM_POR_MILHA),
    horas: arred(horas), dias: arred(horas / 24, 1),
    passagens: (p.passages ?? []).map((c) => ({ codigo: c, nome: PASSAGENS[c] ?? c })),
    linha: (r.geometry.coordinates as number[][]).map(([lon, lat]) => [arred(lon, 4), arred(lat, 4)] as [number, number]),
  };
}
