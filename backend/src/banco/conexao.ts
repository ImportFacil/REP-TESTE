import { readFileSync } from 'node:fs';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';
import type { Config } from '../config';
import type { Database } from './tipos';

// bigint (int8) e numeric viram number: os valores em centavos ficam muito abaixo de 2^53.
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => Number(v));
// date sem fuso: fica como texto AAAA-MM-DD (vencimentos não podem mudar de dia por causa do fuso).
types.setTypeParser(1082, (v) => v);

export function criarConexao(banco: Config['banco']): Kysely<Database> {
  const ssl = banco.ssl
    ? {
        rejectUnauthorized: true,
        // Pacote de certificados do RDS, baixado na imagem Docker.
        ca: banco.caminhoCa ? readFileSync(banco.caminhoCa, 'utf8') : undefined,
      }
    : undefined;
  const pool = new Pool({
    connectionString: banco.url,
    max: banco.maxConexoes,
    ssl,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
