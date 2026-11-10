import { reais } from '@/lib/formato';

export interface Barra { rotulo: string; valor: number; dica?: string }

const curto = (c: number) => (c >= 100_000_000 ? `${(c / 100_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : c >= 100_000 ? `${Math.round(c / 100_000)} mil` : `${Math.round(c / 100)}`);

/** Barras em SVG (valores em centavos), sem biblioteca; a dica aparece ao passar o mouse ou tocar. */
export function GraficoBarras({ barras, titulo, altura = 190 }: { barras: Barra[]; titulo: string; altura?: number }) {
  const L = 360, A = altura, m = { e: 44, d: 6, t: 10, b: 34 };
  const max = Math.max(1, ...barras.map((b) => b.valor));
  const passo = (L - m.e - m.d) / Math.max(1, barras.length);
  const y = (v: number) => m.t + (A - m.t - m.b) * (1 - v / max);
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const cadaRotulo = Math.ceil(barras.length / 8);
  return (
    <svg className="pn-grafico" viewBox={`0 0 ${L} ${A}`} role="img" aria-label={titulo}>
      {marcas.map((v) => (
        <g key={v}>
          <line x1={m.e} x2={L - m.d} y1={y(v)} y2={y(v)} stroke="var(--borda)" strokeWidth={1} />
          <text x={m.e - 6} y={y(v) + 3} textAnchor="end">{curto(v)}</text>
        </g>
      ))}
      {barras.map((b, k) => (
        <g key={k}>
          <rect x={m.e + k * passo + passo * 0.15} y={y(b.valor)} width={Math.max(1, passo * 0.7)} height={Math.max(0, A - m.b - y(b.valor))} rx={2} fill="var(--azul)">
            <title>{b.dica ?? `${b.rotulo}: ${reais(b.valor)}`}</title>
          </rect>
          {k % cadaRotulo === 0 && <text x={m.e + k * passo + passo / 2} y={A - m.b + 14} textAnchor="middle">{b.rotulo}</text>}
        </g>
      ))}
    </svg>
  );
}
