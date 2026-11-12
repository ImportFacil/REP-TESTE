'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import '@/components/painel/rotas.css';
import { api } from '@/lib/api';

export interface Porto { codigo: string; nome: string; pais: string; lon: number; lat: number }
export interface Rota {
  origem: Porto; destino: Porto; velocidade_nos: number; evitar: string[];
  distancia_mn: number; distancia_km: number; linha_reta_km: number; horas: number; dias: number;
  passagens: Array<{ codigo: string; nome: string }>; linha: Array<[number, number]>;
  /** Só na rota de uma ordem de importação. */
  embarque_em?: string | null; chegada_prevista?: string | null;
}
export const n = (v: number, casas = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });
const rotuloPorto = (p: Porto) => `${p.nome} — ${p.pais} (${p.codigo})`;

/** Campo de porto: os principais já vêm na lista; digitando, busca entre os ~1.600 portos (nome, país ou código). */
export function CampoPorto({ id, rotulo, porto, principais, escolher }: { id: string; rotulo: string; porto: Porto | null; principais: Porto[]; escolher: (p: Porto) => void }) {
  const [texto, setTexto] = useState('');
  const [achados, setAchados] = useState<Porto[]>([]);
  useEffect(() => { if (porto) setTexto(rotuloPorto(porto)); }, [porto]);
  useEffect(() => {
    const q = texto.trim();
    if (q.length < 2 || (porto && q === rotuloPorto(porto))) return;
    const t = setTimeout(() => { api<Porto[]>(`/equipe/importacao/portos?busca=${encodeURIComponent(q.replace(/\s*\([A-Z0-9]{5}\)$/, '').split(' — ')[0])}`).then(setAchados, () => undefined); }, 250);
    return () => clearTimeout(t);
  }, [texto, porto]);
  const opcoes = useMemo(() => { const v = new Set<string>(); return [...achados, ...principais].filter((p) => !v.has(p.codigo) && v.add(p.codigo)); }, [achados, principais]);
  return (
    <label className="campo rota-campo" htmlFor={id}>
      <span>{rotulo}</span>
      <input id={id} list={`${id}-lista`} value={texto} autoComplete="off" placeholder="Nome do porto, país ou código"
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setTexto(e.target.value);
          const cod = /\(([A-Z0-9]{5})\)$/.exec(e.target.value)?.[1];
          const p = cod ? opcoes.find((o) => o.codigo === cod) : undefined;
          if (p) escolher(p);
        }}
        onBlur={() => { if (porto) setTexto(rotuloPorto(porto)); }} />
      <datalist id={`${id}-lista`}>{opcoes.map((p) => <option key={p.codigo} value={rotuloPorto(p)} />)}</datalist>
    </label>
  );
}

const ALTURA_NUVENS = 0.004;
const ALTURA_ROTA = 0.012; // acima das nuvens
interface Camada { cor: string; traco: number; pulso?: boolean }
/** Neon dourado: do halo mais largo e transparente ao miolo quase branco; por último, o pulso de luz. */
const CAMADAS_NEON: Camada[] = [
  { cor: 'rgba(255, 190, 40, 0.10)', traco: 22 },
  { cor: 'rgba(255, 200, 60, 0.22)', traco: 13 },
  { cor: 'rgba(255, 214, 90, 0.55)', traco: 7 },
  { cor: '#ffe9a6', traco: 2.6 },
  { cor: '#fffdf2', traco: 3.6, pulso: true },
];

/** Pino de localização dourado com o nome do porto (a ponta fica exatamente sobre o porto). */
function pino(p: Porto & { papel: string }): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = `<div class="rota-pino">
    <span class="rota-pino-rotulo"><small></small><b></b></span>
    <svg viewBox="0 0 24 32" width="30" height="40" aria-hidden="true">
      <path d="M12 31C12 31 2 19.5 2 11.5a10 10 0 1 1 20 0C22 19.5 12 31 12 31z" fill="#ffc83d" stroke="#fff6d6" stroke-width="1.6"/>
      <circle cx="12" cy="11.5" r="4" fill="#3a2600"/>
    </svg></div>`;
  (el.querySelector('small') as HTMLElement).textContent = p.papel;
  (el.querySelector('b') as HTMLElement).textContent = p.nome;
  return el;
}

/** Globo 3D (Globe.gl, MIT): Terra com relevo e nuvens, a rota em neon dourado e um pino em cada porto. */
export function GloboRota({ rota, altura }: { rota: Rota | null; altura?: number }) {
  const caixa = useRef<HTMLDivElement>(null);
  const globo = useRef<{ g: unknown } | null>(null);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    let vivo = true;
    let limpar = () => {};
    void Promise.all([import('globe.gl'), import('three')]).then(([{ default: Globe }, THREE]) => {
      if (!vivo) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g: any = new (Globe as any)(el, { animateIn: false });
        // Terra com relevo e camada de nuvens (modelo do exemplo "clouds" da Globe.gl)
        g.globeImageUrl('/globo/terra-relevo.jpg').bumpImageUrl('/globo/topografia.png')
          .backgroundColor('rgba(0,0,0,0)').showAtmosphere(true).atmosphereColor('#8ec5ff').atmosphereAltitude(0.16)
          .width(el.clientWidth).height(el.clientHeight)
          // rota em neon dourado: três camadas (halo largo, brilho, miolo claro) e um pulso de luz percorrendo o trajeto
          .pathPoints('pontos').pathPointLat((p: number[]) => p[1]).pathPointLng((p: number[]) => p[0]).pathPointAlt((p: number[]) => p[2])
          .pathColor((d: Camada) => d.cor).pathStroke((d: Camada) => d.traco)
          .pathDashLength((d: Camada) => (d.pulso ? 0.08 : 1)).pathDashGap((d: Camada) => (d.pulso ? 0.92 : 0))
          .pathDashAnimateTime((d: Camada) => (d.pulso ? 9000 : 0)).pathTransitionDuration(0)
          // pinos de localização nos portos de saída e de chegada
          .htmlLat('lat').htmlLng('lon').htmlAltitude(ALTURA_ROTA).htmlElement((d: Porto & { papel: string }) => pino(d))
          .htmlElementVisibilityModifier((e: HTMLElement, visivel: boolean) => { e.style.opacity = visivel ? '1' : '0'; });
        g.controls().autoRotate = false;
        g.controls().enableZoom = true;
        let nuvens: { rotation: { y: number } } | null = null;
        let quadro = 0;
        new THREE.TextureLoader().load('/globo/nuvens.webp', (textura: unknown) => {
          if (!vivo) return;
          const malha = new THREE.Mesh(
            new THREE.SphereGeometry(g.getGlobeRadius() * (1 + ALTURA_NUVENS), 75, 75),
            new THREE.MeshPhongMaterial({ map: textura, transparent: true, opacity: 0.85 }),
          );
          g.scene().add(malha);
          nuvens = malha;
          el.dataset.nuvens = '1';
        });
        const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const girar = () => { if (nuvens && !parado) nuvens.rotation.y += (-0.006 * Math.PI) / 180; quadro = requestAnimationFrame(girar); };
        quadro = requestAnimationFrame(girar);
        const ro = new ResizeObserver(() => g.width(el.clientWidth).height(el.clientHeight));
        ro.observe(el);
        globo.current = { g };
        el.dataset.pronto = '1';
        setPronto(true);
        limpar = () => { cancelAnimationFrame(quadro); ro.disconnect(); g._destructor?.(); el.replaceChildren(); };
      } catch (e) { setErro((e as Error).message || 'sem suporte a 3D'); }
    }, (e: Error) => setErro(e.message));
    return () => { vivo = false; limpar(); globo.current = null; };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globo.current?.g as any;
    if (!g || !rota) return;
    // cada camada um pouco acima da anterior, para o miolo claro ficar por cima do halo
    g.pathsData(CAMADAS_NEON.map((c, k) => ({ ...c, pontos: rota.linha.map(([lon, lat]) => [lon, lat, ALTURA_ROTA + k * 0.0015]) })))
      .htmlElementsData([{ ...rota.origem, papel: 'Saída' }, { ...rota.destino, papel: 'Chegada' }]);
    const meio = rota.linha[Math.floor(rota.linha.length / 2)];
    g.pointOfView({ lat: meio[1], lng: meio[0], altitude: 1.9 }, 900);
  }, [rota, pronto]);

  return (
    <div className="rota-globo" style={altura ? { height: altura } : undefined}>
      <div ref={caixa} className="rota-globo-tela" role="img"
        aria-label={rota ? `Globo com a rota marítima de ${rota.origem.nome} a ${rota.destino.nome}: ${n(rota.distancia_mn)} milhas náuticas` : 'Globo terrestre'} />
      {erro && <p className="rota-globo-erro">Este navegador não conseguiu desenhar o globo 3D ({erro}). Os números da rota continuam valendo.</p>}
      <span className="rota-globo-dica">Arraste para girar · role para aproximar</span>
    </div>
  );
}
