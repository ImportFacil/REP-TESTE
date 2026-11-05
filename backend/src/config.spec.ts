import { lerConfig } from './config';

describe('lerConfig', () => {
  const base = { DATABASE_URL: 'postgres://u:s@localhost:5432/b' };

  it('usa login de desenvolvimento no ambiente local', () => {
    expect(lerConfig({ ...base }).auth.modo).toBe('dev');
  });

  it('recusa login de desenvolvimento em produção e homologação', () => {
    expect(() => lerConfig({ ...base, AMBIENTE: 'prod', AUTH_MODO: 'dev' })).toThrow(/só é permitido/);
    expect(() => lerConfig({ ...base, AMBIENTE: 'homolog', AUTH_MODO: 'dev' })).toThrow(/só é permitido/);
  });

  it('exige os grupos de usuários do Cognito fora do ambiente local', () => {
    expect(() => lerConfig({ ...base, AMBIENTE: 'prod' })).toThrow(/COGNITO_CLIENTES_POOL_ID/);
  });

  it('monta a URL do banco a partir das partes (senha vinda do Secrets Manager)', () => {
    const c = lerConfig({
      AMBIENTE: 'dev', AUTH_MODO: 'dev', DB_HOST: 'banco.interno', DB_NOME: 'importfacil', DB_USUARIO: 'api', DB_SENHA: 'a@b:c/d',
    });
    expect(c.banco.url).toBe('postgres://api:a%40b%3Ac%2Fd@banco.interno:5432/importfacil');
    expect(c.banco.ssl).toBe(true);
  });

  it('desliga a documentação da API em produção', () => {
    const c = lerConfig({
      ...base, AMBIENTE: 'prod', COGNITO_CLIENTES_POOL_ID: 'p1', COGNITO_CLIENTES_CLIENT_ID: 'c1', COGNITO_EQUIPE_POOL_ID: 'p2', COGNITO_EQUIPE_CLIENT_ID: 'c2',
    });
    expect(c.documentacaoApi).toBe(false);
    expect(c.auth.modo).toBe('cognito');
  });

  it('nunca usa o gateway simulado em produção', () => {
    const cognito = { COGNITO_CLIENTES_POOL_ID: 'p1', COGNITO_CLIENTES_CLIENT_ID: 'c1', COGNITO_EQUIPE_POOL_ID: 'p2', COGNITO_EQUIPE_CLIENT_ID: 'c2' };
    expect(lerConfig({ ...base, ...cognito, AMBIENTE: 'prod' }).pagamentos.gateway).toBe('desligado');
    expect(() => lerConfig({ ...base, ...cognito, AMBIENTE: 'prod', GATEWAY: 'simulador' })).toThrow(/produção/);
    expect(lerConfig({ ...base }).pagamentos.gateway).toBe('simulador');
  });
});
