'use client';
import { useEffect, useRef, useState } from 'react';
import { CampoPorto, GloboRota, n, type Porto, type Rota } from '@/components/RotaMaritima';
import { api } from '@/lib/api';
import { useDados } from '@/lib/hooks';

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

  // O globo fica centralizado no espaço entre os dois quadros, sem ficar coberto por nenhum deles.
  const fundo = useRef<HTMLDivElement>(null);
  const consulta = useRef<HTMLElement>(null);
  const resultado = useRef<HTMLElement>(null);
  useEffect(() => {
    const medir = () => {
      const f = fundo.current;
      if (!f) return;
      const largo = window.matchMedia('(min-width: 1000px)').matches;
      const vao = (e: HTMLElement | null) => (largo && e ? `${e.offsetWidth + 32}px` : '0px');
      f.style.setProperty('--livre-esquerda', vao(consulta.current));
      f.style.setProperty('--livre-direita', vao(resultado.current));
      f.style.setProperty('--livre-base', largo ? '0px' : '48vh');
    };
    medir();
    const ro = new ResizeObserver(medir);
    [consulta.current, resultado.current].forEach((e) => e && ro.observe(e));
    window.addEventListener('resize', medir);
    return () => { ro.disconnect(); window.removeEventListener('resize', medir); };
  }, []);

  const alternar = (c: string) => setEvitar((e) => (e.includes(c) ? e.filter((x) => x !== c) : [...e, c]));

  return (
    <>
      {/* O globo ocupa a área da página; os dois quadros ficam por cima, um de cada lado */}
      <div className="rota-fundo" ref={fundo}><div className="rota-livre"><GloboRota rota={rota} fundo /></div></div>
      <div className="rota rota-cena">
        <section className="rota-vidro rota-quadro rota-consulta" ref={consulta}>
          <h1>Rotas marítimas</h1>
          <p className="rota-sub">Caminho pelo mar entre o porto de embarque e o de chegada.</p>
          <div className="rota-form">
            <CampoPorto id="rotaOrigem" rotulo="Porto de embarque" porto={origem} principais={principais.dados ?? []} escolher={setOrigem} />
            <button className="rota-trocar" title="Inverter origem e destino" aria-label="Inverter origem e destino" onClick={() => { setOrigem(destino); setDestino(origem); }}><span aria-hidden="true">⇅</span></button>
            <CampoPorto id="rotaDestino" rotulo="Porto de chegada" porto={destino} principais={principais.dados ?? []} escolher={setDestino} />
            <label className="campo rota-campo" htmlFor="rotaVel">
              <span>Velocidade média (nós)</span>
              <input id="rotaVel" type="number" min={5} max={30} step={1} value={velocidade} onChange={(e) => { const v = Number(e.target.value); if (v >= 5 && v <= 30) setVelocidade(v); }} />
            </label>
          </div>
          <div className="rota-evitar">
            <label><input type="checkbox" checked={evitar.includes('suez')} onChange={() => alternar('suez')} /> Evitar o Canal de Suez e o Mar Vermelho</label>
            <label><input type="checkbox" checked={evitar.includes('panama')} onChange={() => alternar('panama')} /> Evitar o Canal do Panamá</label>
          </div>
          {erro && <p className="rota-erro" role="alert">{erro}</p>}
          <p className="rota-nota">Arraste o globo para girar e role para aproximar. Estimativa da searoute sobre a malha marítima do Eurostat (2025): é o caminho comercial mais curto pelo mar, não o trajeto real de um navio, e o tempo supõe navegação contínua, sem escalas nem espera em porto. Confirme o prazo com o armador.</p>
        </section>

        <aside className="rota-vidro rota-quadro rota-resultado" ref={resultado} aria-live="polite" aria-busy={calculando}>
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
              : <p className="rota-fraco">Nenhum canal ou estreito marcado nesta rota.</p>}
            <h3>Portos</h3>
            <p className="rota-portos">Embarque: <b>{rota.origem.nome}</b>, {rota.origem.pais} ({rota.origem.codigo})<br />Chegada: <b>{rota.destino.nome}</b>, {rota.destino.pais} ({rota.destino.codigo})</p>
          </>}
        </aside>
      </div>
    </>
  );
}
