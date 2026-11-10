import { cnpjValido, formatarCnpj, normalizarCnpj } from './cnpj';

describe('CNPJ', () => {
  it('valida CNPJ numérico com e sem pontuação', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('11222333000182')).toBe(false);
  });

  it('valida o CNPJ alfanumérico (exemplo oficial da Receita Federal)', () => {
    expect(cnpjValido('12.ABC.345/01DE-35')).toBe(true);
    expect(cnpjValido('12abc34501de35')).toBe(true);
    expect(cnpjValido('12ABC34501DE34')).toBe(false);
  });

  it('recusa formatos inválidos e sequências repetidas', () => {
    expect(cnpjValido('00000000000000')).toBe(false);
    expect(cnpjValido('1122233300018')).toBe(false);
    expect(cnpjValido('12ABC34501DEAB')).toBe(false);
    expect(cnpjValido('')).toBe(false);
  });

  it('normaliza e formata', () => {
    expect(normalizarCnpj(' 12.abc.345/01de-35 ')).toBe('12ABC34501DE35');
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
});
