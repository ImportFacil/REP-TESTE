import type { Migration } from 'kysely';
import * as m0001 from './0001_inicial';

/**
 * Lista de migrações, em ordem. Cada nova migração ganha um arquivo
 * `NNNN_descricao.ts` e uma linha aqui. Migrações já aplicadas nunca mudam.
 */
export const MIGRACOES: Record<string, Migration> = {
  '0001_inicial': m0001,
};
