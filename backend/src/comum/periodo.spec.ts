import { lerJanela, lerPeriodo } from './periodo';

describe('janela de tempo dos relatórios', () => {
  const agora = new Date('2026-11-12T11:00:00Z'); // 08:00 em Brasília

  it('últimas N horas contam a partir de agora', () => {
    expect(lerJanela({ horas: 24 }, agora)).toMatchObject({ inicio: '2026-11-11T11:00:00.000Z', fim: '2026-11-12T11:00:00.000Z', rotulo: 'Últimas 24 horas' });
    expect(lerJanela({ horas: 72 }, agora)?.inicio).toBe('2026-11-09T11:00:00.000Z');
    expect(lerJanela({ horas: 168 }, agora)?.rotulo).toBe('Últimos 7 dias');
  });

  it('período de datas vai do começo ao fim do dia em Brasília', () => {
    expect(lerJanela({ de: '2026-11-01', ate: '2026-11-12' }, agora)).toMatchObject({
      inicio: '2026-11-01T03:00:00.000Z', fim: '2026-11-13T02:59:59.999Z', rotulo: '01/11/2026 a 12/11/2026',
    });
    expect(lerJanela({ de: '2026-11-05' }, agora)).toMatchObject({ inicio: '2026-11-05T03:00:00.000Z', rotulo: '05/11/2026' });
  });

  it('sem nada não há janela; valores fora do lugar são recusados', () => {
    expect(lerJanela({}, agora)).toBeNull();
    expect(() => lerJanela({ horas: 0.5 }, agora)).toThrow();
    expect(() => lerJanela({ de: '2026-11-12', ate: '2026-11-01' }, agora)).toThrow(/inicial/);
    expect(() => lerPeriodo('2026-02-30')).toThrow(/inválida/);
  });
});
