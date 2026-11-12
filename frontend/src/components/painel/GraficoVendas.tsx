'use client';
import { useEffect, useRef } from 'react';
import { reais } from '@/lib/formato';

export interface Ponto {
  /** Data do ponto (AAAA-MM-DD) nas séries por dia, semana ou mês. Sem data, o gráfico é por categoria. */
  tempo?: string;
  rotulo: string;
  /** Valor em centavos. */
  valor: number;
  /** Texto da legenda quando o cursor (ou o dedo) está sobre o ponto. */
  dica?: string;
}

const curto = (r: number) => (Math.abs(r) >= 1_000_000 ? `${(r / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : Math.abs(r) >= 1_000 ? `${Math.round(r / 1_000)} mil` : `${Math.round(r)}`);
const diaFalso = (k: number) => new Date(Date.UTC(2000, 0, 1 + k)).toISOString().slice(0, 10); // eixo das categorias

/**
 * Gráfico de vendas do Painel com a Lightweight Charts (TradingView, código aberto, Apache 2.0):
 * área azul, sem linhas de grade, sem a linha horizontal do cursor, e a legenda no canto de cima
 * com o nome da série e o valor do ponto sob o cursor. Sem `tempo` nos pontos, vira colunas por categoria.
 */
export function GraficoVendas({ pontos, titulo, resumo, altura = 240 }: { pontos: Ponto[]; titulo: string; resumo?: string; altura?: number }) {
  const caixa = useRef<HTMLDivElement>(null);
  const legenda = useRef<HTMLSpanElement>(null);
  const porData = pontos.length > 0 && pontos.every((p) => /^\d{4}-\d{2}-\d{2}/.test(p.tempo ?? ''));
  const chave = JSON.stringify(pontos);

  useEffect(() => {
    const el = caixa.current;
    if (!el || !pontos.length) return;
    let desfazer = () => {};
    let cancelado = false;
    void import('lightweight-charts').then(({ createChart, AreaSeries, HistogramSeries }) => {
      if (cancelado) return;
      const css = getComputedStyle(el);
      const cor = (v: string, padrao: string) => css.getPropertyValue(v).trim() || padrao;
      // a biblioteca só entende cores simples: resolve a cor do tema para rgb e monta a versão translúcida
      const sonda = document.createElement('span');
      sonda.style.color = cor('--azul', '#2962FF');
      el.appendChild(sonda);
      const rgb = (getComputedStyle(sonda).color.match(/[\d.]+/g) ?? ['41', '98', '255']).slice(0, 3).join(', ');
      sonda.remove();
      const azul = `rgb(${rgb})`;
      sonda.style.color = cor('--texto-2', '#555');
      el.appendChild(sonda);
      const corTexto = getComputedStyle(sonda).color;
      sonda.remove();
      const rotulos = new Map<string, Ponto>();
      const dados = pontos.map((p, k) => {
        const time = porData ? (p.tempo as string).slice(0, 10) : diaFalso(k);
        rotulos.set(time, p);
        return { time, value: p.valor / 100 };
      });
      const chart = createChart(el, {
        autoSize: true,
        layout: { textColor: corTexto, background: { color: 'transparent' }, fontFamily: css.fontFamily, fontSize: 11 },
        rightPriceScale: { scaleMargins: { top: 0.3, bottom: porData ? 0.1 : 0 }, borderVisible: false }, // espaço para a legenda
        timeScale: {
          borderVisible: false, fixLeftEdge: true, fixRightEdge: true,
          tickMarkFormatter: (t: unknown) => rotulos.get(String(t))?.rotulo ?? '',
        },
        crosshair: { horzLine: { visible: false, labelVisible: false }, vertLine: { labelVisible: false } },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        handleScroll: false, handleScale: false, // a página rola normalmente por cima do gráfico
        localization: { locale: 'pt-BR', priceFormatter: (v: number) => curto(v) },
      });
      const serie = porData
        ? chart.addSeries(AreaSeries, { topColor: azul, bottomColor: `rgba(${rgb}, 0.28)`, lineColor: azul, lineWidth: 2, crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false })
        : chart.addSeries(HistogramSeries, { color: azul, priceLineVisible: false, lastValueVisible: false });
      serie.setData(dados);
      chart.timeScale().fitContent();
      chart.subscribeCrosshairMove((param) => {
        const p = param.time ? rotulos.get(String(param.time)) : undefined;
        if (legenda.current) legenda.current.textContent = p ? (p.dica ?? `${p.rotulo}: ${reais(p.valor)}`) : (resumo ?? '');
      });
      desfazer = () => chart.remove();
    });
    return () => { cancelado = true; desfazer(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, resumo, porData]);

  if (!pontos.length) return <p className="muted pequeno" style={{ padding: '12px 0' }}>Sem dados no período.</p>;
  return (
    <div className="pn-grafico-lw" style={{ height: altura }} data-pontos={pontos.length} data-tipo={porData ? 'area' : 'colunas'}>
      <div className="pn-grafico-legenda">{titulo} <strong><span ref={legenda}>{resumo ?? ''}</span></strong></div>
      <div ref={caixa} className="pn-grafico-tela" role="img" aria-label={`${titulo}${resumo ? `: ${resumo}` : ''}. ${pontos.length} ponto(s); os valores estão na tabela desta página.`} />
    </div>
  );
}
