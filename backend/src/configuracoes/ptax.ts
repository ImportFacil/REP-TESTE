/** Lê a resposta do serviço PTAX do Banco Central: a cotação de venda mais recente. */
export function lerPtax(corpo: unknown): { data: string; taxa: number } | null {
  const linhas = (corpo as { value?: Array<{ cotacaoVenda?: number; dataHoraCotacao?: string }> } | null)?.value;
  if (!Array.isArray(linhas)) return null;
  const validas = linhas.filter((l) => typeof l.cotacaoVenda === 'number' && l.cotacaoVenda > 0 && /^\d{4}-\d{2}-\d{2}/.test(l.dataHoraCotacao ?? ''))
    .sort((a, b) => String(b.dataHoraCotacao).localeCompare(String(a.dataHoraCotacao)));
  if (!validas.length) return null;
  return { data: String(validas[0].dataHoraCotacao).slice(0, 10), taxa: Math.round((validas[0].cotacaoVenda as number) * 10000) / 10000 };
}

/** PTAX de venda do dólar nos últimos 7 dias (cobre fim de semana e feriado). Nos testes não sai para a rede. */
export async function buscarPtaxDolar(): Promise<{ data: string; taxa: number } | null> {
  if (process.env.NODE_ENV === 'test') return null;
  const dia = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}-${d.getUTCFullYear()}`;
  const hoje = new Date(Date.now() - 3 * 3_600_000); // Brasília
  const url = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@i,dataFinalCotacao=@f)"
    + `?@i='${dia(new Date(hoje.getTime() - 7 * 86_400_000))}'&@f='${dia(hoje)}'&$format=json&$select=cotacaoVenda,dataHoraCotacao`;
  const r = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { accept: 'application/json' } });
  if (!r.ok) return null;
  return lerPtax(await r.json());
}
