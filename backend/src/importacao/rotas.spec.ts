import { buscarPortos, calcularRota, porto } from './rotas';

describe('rotas marítimas (searoute)', () => {
  it('Xangai → Santos: pelo mar, mais longa que a linha reta, com tempo de viagem', () => {
    const r = calcularRota('CNSHA', 'brssz', 16);
    expect(r.origem).toMatchObject({ codigo: 'CNSHA', nome: 'Xangai', pais: 'China' });
    expect(r.destino).toMatchObject({ codigo: 'BRSSZ', nome: 'Santos', pais: 'Brasil' });
    expect(r.distancia_mn).toBeGreaterThan(10_000);
    expect(r.distancia_mn).toBeLessThan(13_000);
    expect(Math.abs(r.distancia_km - r.distancia_mn * 1.852)).toBeLessThan(2);
    expect(r.distancia_km).toBeGreaterThan(r.linha_reta_km);
    expect(r.dias).toBeCloseTo(r.distancia_mn / 16 / 24, 0);
    expect(r.linha.length).toBeGreaterThan(20);
    expect(r.linha[0][0]).toBeGreaterThan(100); // sai da Ásia
    expect(r.linha[r.linha.length - 1][0]).toBeLessThan(-40); // chega ao Brasil
  });

  it('Xangai → Roterdã passa por Suez; evitando Suez, a rota muda e fica mais longa', () => {
    const suez = calcularRota('CNSHA', 'NLRTM');
    expect(suez.passagens.map((p) => p.codigo)).toContain('suez');
    expect(suez.passagens.find((p) => p.codigo === 'suez')?.nome).toBe('Canal de Suez');
    const sem = calcularRota('CNSHA', 'NLRTM', 16, ['suez']);
    expect(sem.passagens.map((p) => p.codigo)).not.toContain('suez');
    expect(sem.distancia_mn).toBeGreaterThan(suez.distancia_mn);
  });

  it('portos: principais em português; busca por nome, país ou código', () => {
    expect(buscarPortos().slice(0, 2).map((p) => p.nome)).toEqual(['Santos', 'Paranaguá']);
    expect(buscarPortos('paranagua')[0].codigo).toBe('BRPNG');
    expect(buscarPortos('xangai')[0].codigo).toBe('CNSHA');
    expect(buscarPortos('shanghai')[0].codigo).toBe('CNSHA');
    expect(buscarPortos('nlrtm')[0].nome).toBe('Roterdã');
    expect(buscarPortos('zzzzzz')).toEqual([]);
    expect(porto('XXXXX')).toBeNull();
  });

  it('entradas inválidas são recusadas', () => {
    expect(() => calcularRota('XXXXX', 'BRSSZ')).toThrow(/origem desconhecido/);
    expect(() => calcularRota('BRSSZ', 'BRSSZ')).toThrow(/diferentes/);
    expect(() => calcularRota('CNSHA', 'BRSSZ', 80)).toThrow(/velocidade/);
    expect(() => calcularRota('CNSHA', 'BRSSZ', 16, ['gibraltar'])).toThrow(/evitar/);
  });
});
