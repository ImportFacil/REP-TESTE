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

/** Globo 3D (Globe.gl, MIT) com a rota desenhada sobre o mar e os dois portos marcados. */
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
    void import('globe.gl').then(({ default: Globe }) => {
      if (!vivo) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g: any = new (Globe as any)(el, { animateIn: false });
        g.globeImageUrl('/globo/terra.jpg').backgroundColor('rgba(0,0,0,0)').showAtmosphere(true).atmosphereColor('#7fb2f0').atmosphereAltitude(0.12)
          .width(el.clientWidth).height(el.clientHeight)
          .pathPoints('pontos').pathPointLat((p: number[]) => p[1]).pathPointLng((p: number[]) => p[0]).pathPointAlt(0.004)
          .pathColor(() => ['#ffd24a', '#ff8a3c']).pathStroke(2.2).pathDashLength(0.02).pathDashGap(0.006).pathDashAnimateTime(60000).pathTransitionDuration(0)
          .pointLat('lat').pointLng('lon').pointColor(() => '#ffffff').pointAltitude(0.012).pointRadius(0.45)
          .labelLat('lat').labelLng('lon').labelText('nome').labelSize(1.3).labelDotRadius(0.35).labelColor(() => '#ffffff').labelAltitude(0.014).labelResolution(2);
        g.controls().autoRotate = false;
        g.controls().enableZoom = true;
        const ro = new ResizeObserver(() => g.width(el.clientWidth).height(el.clientHeight));
        ro.observe(el);
        globo.current = { g };
        el.dataset.pronto = '1';
        setPronto(true);
        limpar = () => { ro.disconnect(); g._destructor?.(); el.replaceChildren(); };
      } catch (e) { setErro((e as Error).message || 'sem suporte a 3D'); }
    }, (e: Error) => setErro(e.message));
    return () => { vivo = false; limpar(); globo.current = null; };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globo.current?.g as any;
    if (!g || !rota) return;
    g.pathsData([{ pontos: rota.linha }]).pointsData([rota.origem, rota.destino]).labelsData([rota.origem, rota.destino]);
    const meio = rota.linha[Math.floor(rota.linha.length / 2)];
    g.pointOfView({ lat: meio[1], lng: meio[0], altitude: 2.4 }, 900);
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
