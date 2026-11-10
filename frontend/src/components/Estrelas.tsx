/** Nota de 1 a 5 em estrelas; com `aoEscolher`, vira um seletor acessível. */
export function Estrelas({ nota, aoEscolher, tamanho = 16 }: { nota: number; aoEscolher?: (n: number) => void; tamanho?: number }) {
  const estrela = (cheia: boolean) => (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill={cheia ? 'var(--ambar)' : 'none'} stroke="var(--ambar)" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
  if (!aoEscolher) {
    return <span className="estrelas" role="img" aria-label={`${nota.toLocaleString('pt-BR')} de 5`}>{[1, 2, 3, 4, 5].map((n) => <span key={n}>{estrela(n <= Math.round(nota))}</span>)}</span>;
  }
  return (
    <span className="estrelas" role="radiogroup" aria-label="Nota">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={n === nota} aria-label={`${n} estrela${n > 1 ? 's' : ''}`} onClick={() => aoEscolher(n)}
          style={{ background: 'none', border: 0, padding: 2, cursor: 'pointer' }}>{estrela(n <= nota)}</button>
      ))}
    </span>
  );
}
