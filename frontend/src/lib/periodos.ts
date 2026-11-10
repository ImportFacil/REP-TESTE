/** Períodos prontos do Painel (datas no fuso de Brasília). */
export const hojeIso = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
export const menos = (iso: string, d: number) => new Date(Date.parse(iso) - d * 86_400_000).toISOString().slice(0, 10);

export const PERIODOS: Record<string, () => { de: string; ate: string }> = {
  '7': () => ({ de: menos(hojeIso(), 6), ate: hojeIso() }),
  '30': () => ({ de: menos(hojeIso(), 29), ate: hojeIso() }),
  '90': () => ({ de: menos(hojeIso(), 89), ate: hojeIso() }),
  mes: () => ({ de: hojeIso().slice(0, 8) + '01', ate: hojeIso() }),
  'mes-passado': () => {
    const ini = new Date(hojeIso().slice(0, 8) + '01T12:00:00Z');
    const fim = new Date(ini.getTime() - 86_400_000);
    return { de: fim.toISOString().slice(0, 8) + '01', ate: fim.toISOString().slice(0, 10) };
  },
  ano: () => ({ de: hojeIso().slice(0, 4) + '-01-01', ate: hojeIso() }),
  '12m': () => ({ de: menos(hojeIso(), 364), ate: hojeIso() }),
};
export const ROTULO_PERIODO: Record<string, string> = {
  '7': 'Últimos 7 dias', '30': 'Últimos 30 dias', '90': 'Últimos 90 dias', mes: 'Este mês', 'mes-passado': 'Mês passado', ano: 'Este ano', '12m': 'Últimos 12 meses',
};
