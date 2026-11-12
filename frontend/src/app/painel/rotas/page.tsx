'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import '@/components/painel/rotas.css';
import { api } from '@/lib/api';
import { useDados } from '@/lib/hooks';

interface Porto { codigo: string; nome: string; pais: string; lon: number; lat: number }
interface Rota {
  origem: Porto; destino: Porto; velocidade_nos: number; evitar: string[];
  distancia_mn: number; distancia_km: number; linha_reta_km: number; horas: number; dias: number;
  passagens: Array<{ codigo: string; nome: string }>; linha: Array<[number, number]>;
}
const n = (v: number, casas = 0) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });
const rotuloPorto = (p: Porto) => `${p.nome} — ${p.pais} (${p.codigo})`;

/** Campo de porto: os principais já vêm na lista; digitando, busca entre os ~1.600 portos (nome, país ou código). */
function CampoPorto({ id, rotulo, porto, principais, escolher }: { id: string; rotulo: string; porto: Porto | null; principais: Porto[]; escolher: (p: Porto) => void }) {
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
function Globo({ rota }: { rota: Rota | null }) {
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
    <div className="rota-globo">
      <div ref={caixa} className="rota-globo-tela" role="img"
        aria-label={rota ? `Globo com a rota marítima de ${rota.origem.nome} a ${rota.destino.nome}: ${n(rota.distancia_mn)} milhas náuticas` : 'Globo terrestre'} />
      {erro && <p className="rota-globo-erro">Este navegador não conseguiu desenhar o globo 3D ({erro}). Os números da rota continuam valendo.</p>}
      <span className="rota-globo-dica">Arraste para girar · role para aproximar</span>
    </div>
  );
}

/** Importação → Rotas marítimas: caminho pelo mar entre dois portos, distância e tempo de viagem (searoute). */
export default function Rotas() {
  const principais = useDados<Porto[]>('/equipe/importacao/portos');
  const [origem, setOrigem] = useState<Porto | null>(null);
  const [destino, setDestino] = useState<Porto | null>(null);
  const [velocidade, setVelocidade] = useState(16);
  const [evitar, setEvitar] = useState<string[]>([]);
  const [rota, setRota] = useState<Rota | null>(null);
  const [erro, setErro] = useState('');
  const [calculando, setCalculando] = useState(false);

  useEffect(() => {
    if (!principais.dados || origem || destino) return;
    setOrigem(principais.dados.find((p) => p.codigo === 'CNSHA') ?? null);
    setDestino(principais.dados.find((p) => p.codigo === 'BRSSZ') ?? null);
  }, [principais.dados, origem, destino]);

  useEffect(() => {
    if (!origem || !destino) return;
    if (origem.codigo === destino.codigo) { setErro('Escolha portos diferentes para a origem e o destino.'); return; }
    let atual = true;
    setCalculando(true);
    api<Rota>(`/equipe/importacao/rota?origem=${origem.codigo}&destino=${destino.codigo}&velocidade=${velocidade}${evitar.length ? `&evitar=${evitar.join(',')}` : ''}`)
      .then((r) => { if (atual) { setRota(r); setErro(''); } }, (e: Error) => { if (atual) setErro(e.message); })
      .finally(() => { if (atual) setCalculando(false); });
    return () => { atual = false; };
  }, [origem, destino, velocidade, evitar]);

  const alternar = (c: string) => setEvitar((e) => (e.includes(c) ? e.filter((x) => x !== c) : [...e, c]));

  return (
    <div className="rota">
      <div className="pn-cabecalho">
        <div>
          <h1>Rotas marítimas</h1>
          <p className="sub muted">Caminho pelo mar entre o porto de embarque e o de chegada, com a distância e o tempo de viagem estimados.</p>
        </div>
      </div>

      <section className="pn-caixa rota-caixa">
        <div className="rota-form">
          <CampoPorto id="rotaOrigem" rotulo="Porto de embarque" porto={origem} principais={principais.dados ?? []} escolher={setOrigem} />
          <button className="botao leve rota-trocar" title="Inverter origem e destino" aria-label="Inverter origem e destino" onClick={() => { setOrigem(destino); setDestino(origem); }}><span aria-hidden="true" style={{ fontSize: '1.2rem' }}>⇄</span></button>
          <CampoPorto id="rotaDestino" rotulo="Porto de chegada" porto={destino} principais={principais.dados ?? []} escolher={setDestino} />
          <label className="campo rota-campo rota-vel" htmlFor="rotaVel">
            <span>Velocidade média (nós)</span>
            <input id="rotaVel" type="number" min={5} max={30} step={1} value={velocidade} onChange={(e) => { const v = Number(e.target.value); if (v >= 5 && v <= 30) setVelocidade(v); }} />
          </label>
        </div>
        <div className="rota-evitar">
          <label><input type="checkbox" checked={evitar.includes('suez')} onChange={() => alternar('suez')} /> Evitar o Canal de Suez e o Mar Vermelho</label>
          <label><input type="checkbox" checked={evitar.includes('panama')} onChange={() => alternar('panama')} /> Evitar o Canal do Panamá</label>
        </div>
      </section>

      {erro && <div className="aviso erro" role="alert">{erro}</div>}

      <div className="rota-colunas">
        <section className="pn-caixa rota-caixa rota-mapa"><Globo rota={rota} /></section>
        <aside>
          <section className="pn-caixa rota-caixa" aria-live="polite" aria-busy={calculando}>
            <h2>{rota ? `${rota.origem.nome} → ${rota.destino.nome}` : 'Calculando a rota…'}</h2>
            {rota && <>
              <div className="rota-numeros">
                <div><b id="rotaDias">{n(rota.dias, 1)} dias</b><span>de viagem a {n(rota.velocidade_nos)} nós</span></div>
                <div><b id="rotaMilhas">{n(rota.distancia_mn)} mn</b><span>milhas náuticas</span></div>
                <div><b>{n(rota.distancia_km)} km</b><span>pelo mar</span></div>
                <div><b>{n(rota.linha_reta_km)} km</b><span>em linha reta</span></div>
              </div>
              <h3>Canais e estreitos no caminho</h3>
              {rota.passagens.length
                ? <ul className="rota-passagens">{rota.passagens.map((p) => <li key={p.codigo}>{p.nome}</li>)}</ul>
                : <p className="muted pequeno">Nenhum canal ou estreito marcado nesta rota.</p>}
              <h3>Portos</h3>
              <p className="pequeno">Embarque: <b>{rota.origem.nome}</b>, {rota.origem.pais} ({rota.origem.codigo})<br />Chegada: <b>{rota.destino.nome}</b>, {rota.destino.pais} ({rota.destino.codigo})</p>
            </>}
          </section>
          <p className="rota-nota">Estimativa calculada pela searoute sobre a malha marítima do Eurostat (2025): é o caminho comercial mais curto pelo mar, não a posição nem o trajeto real de um navio. O tempo considera navegação contínua na velocidade informada, sem escalas, espera em porto ou fila de canal. Confirme o prazo com o armador ou o agente de carga.</p>
        </aside>
      </div>
    </div>
  );
}
