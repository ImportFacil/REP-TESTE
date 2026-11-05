/**
 * Configuração da API, lida das variáveis de ambiente.
 *
 * Em produção os segredos (senha do banco etc.) chegam pelo ECS a partir do
 * AWS Secrets Manager; nada de segredo fica no código ou na imagem.
 */
export type Ambiente = 'local' | 'teste' | 'dev' | 'homolog' | 'prod';
export type ModoAuth = 'cognito' | 'dev';

export interface Config {
  ambiente: Ambiente;
  porta: number;
  banco: {
    url: string;
    ssl: boolean;
    caminhoCa?: string;
    maxConexoes: number;
  };
  auth: {
    modo: ModoAuth;
    regiao: string;
    clientes: { poolId: string; clientId: string };
    equipe: { poolId: string; clientId: string };
    /** Só no modo "dev": segredo para assinar tokens locais de teste. */
    segredoDev?: string;
  };
  corsOrigens: string[];
  /** Prefixo das rotas; na AWS é "api", porque o CloudFront manda /api/* para a API. */
  prefixoApi: string;
  /** Quantos proxies confiáveis há na frente da API (na AWS: CloudFront + balanceador = 2). */
  saltosProxy: number;
  limiteRequisicoesPorMinuto: number;
  documentacaoApi: boolean;
}

const AMBIENTES: Ambiente[] = ['local', 'teste', 'dev', 'homolog', 'prod'];

function obrigatoria(env: NodeJS.ProcessEnv, nome: string): string {
  const v = env[nome];
  if (!v || !v.trim()) throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
  return v.trim();
}

function montarUrlBanco(env: NodeJS.ProcessEnv): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  // No ECS, host/usuário/senha chegam separados (a senha vem do Secrets Manager).
  const host = obrigatoria(env, 'DB_HOST');
  const porta = env.DB_PORTA ?? '5432';
  const nome = obrigatoria(env, 'DB_NOME');
  const usuario = encodeURIComponent(obrigatoria(env, 'DB_USUARIO'));
  const senha = encodeURIComponent(obrigatoria(env, 'DB_SENHA'));
  return `postgres://${usuario}:${senha}@${host}:${porta}/${nome}`;
}

export function lerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const ambiente = (env.AMBIENTE ?? 'local') as Ambiente;
  if (!AMBIENTES.includes(ambiente)) throw new Error(`AMBIENTE inválido: ${ambiente}`);

  const modo = (env.AUTH_MODO ?? (ambiente === 'local' || ambiente === 'teste' ? 'dev' : 'cognito')) as ModoAuth;
  if (modo !== 'cognito' && modo !== 'dev') throw new Error(`AUTH_MODO inválido: ${modo}`);
  if (modo === 'dev' && !['local', 'teste', 'dev'].includes(ambiente)) {
    throw new Error('AUTH_MODO=dev só é permitido nos ambientes local, teste e dev.');
  }

  const auth: Config['auth'] =
    modo === 'cognito'
      ? {
          modo,
          regiao: env.AWS_REGION ?? 'sa-east-1',
          clientes: {
            poolId: obrigatoria(env, 'COGNITO_CLIENTES_POOL_ID'),
            clientId: obrigatoria(env, 'COGNITO_CLIENTES_CLIENT_ID'),
          },
          equipe: {
            poolId: obrigatoria(env, 'COGNITO_EQUIPE_POOL_ID'),
            clientId: obrigatoria(env, 'COGNITO_EQUIPE_CLIENT_ID'),
          },
        }
      : {
          modo,
          regiao: 'local',
          clientes: { poolId: 'dev-clientes', clientId: 'dev' },
          equipe: { poolId: 'dev-equipe', clientId: 'dev' },
          segredoDev: env.AUTH_SEGREDO_DEV ?? 'segredo-apenas-para-desenvolvimento-local',
        };

  return {
    ambiente,
    porta: Number(env.PORTA ?? env.PORT ?? 3000),
    banco: {
      url: montarUrlBanco(env),
      ssl: (env.DB_SSL ?? (ambiente === 'local' || ambiente === 'teste' ? 'false' : 'true')) === 'true',
      caminhoCa: env.DB_CA_PATH,
      maxConexoes: Number(env.DB_MAX_CONEXOES ?? 10),
    },
    auth,
    corsOrigens: (env.CORS_ORIGENS ?? 'http://localhost:3001')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    prefixoApi: (env.PREFIXO_API ?? '').replace(/^\/+|\/+$/g, ''),
    saltosProxy: Number(env.SALTOS_PROXY ?? 1),
    limiteRequisicoesPorMinuto: Number(env.LIMITE_REQ_MINUTO ?? 120),
    documentacaoApi: (env.DOCS_API ?? (ambiente === 'prod' ? 'false' : 'true')) === 'true',
  };
}

export const CONFIG = Symbol('CONFIG');
