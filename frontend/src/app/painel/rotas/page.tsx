'use client';
import { useEffect, useState } from 'react';
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

  const alternar = (c: string) => setEvitar((e) => (e.includes(c) ? e.filter((x) => x !== c) : [...e, c]));

  return (
    <>
      {/* O globo é o fundo de toda a área da página (o cabeçalho e o menu do Painel ficam como estão) */}
      <div className="rota-fundo"><GloboRota rota={rota} fundo /></div>
      <div className="rota rota-cena">
        <div className="rota-topo">
          <div className="rota-titulo">
            <h1>Rotas marítimas</h1>
            <p>Caminho pelo mar entre o porto de embarque e o de chegada, com a distância e o tempo de viagem estimados.</p>
          </div>
          <section className="rota-vidro">
            <div className="rota-form">
              <CampoPorto id="rotaOrigem" rotulo="Porto de embarque" porto={origem} principais={principais.dados ?? []} escolher={setOrigem} />
              <button className="rota-trocar" title="Inverter origem e destino" aria-label="Inverter origem e destino" onClick={() => { setOrigem(destino); setDestino(origem); }}><span aria-hidden="true">⇄</span></button>
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
          {erro && <div className="rota-vidro rota-erro" role="alert">{erro}</div>}
        </div>

        <div className="rota-meio">
          <aside className="rota-vidro rota-resultado" aria-live="polite" aria-busy={calculando}>
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

        <p className="rota-rodape">Arraste o globo para girar e role para aproximar. Estimativa calculada pela searoute sobre a malha marítima do Eurostat (2025): é o caminho comercial mais curto pelo mar, não a posição nem o trajeto real de um navio. O tempo considera navegação contínua na velocidade informada, sem escalas, espera em porto ou fila de canal. Confirme o prazo com o armador ou o agente de carga.</p>
      </div>
    </>
  );
}
