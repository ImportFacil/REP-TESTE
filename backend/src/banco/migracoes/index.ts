import type { Migration } from 'kysely';
import * as m0001 from './0001_inicial';
import * as m0002 from './0002_venda_credito_importacao';

/**
 * Lista de migrações, em ordem. Cada nova migração ganha um arquivo
 * `NNNN_descricao.ts` e uma linha aqui. Migrações já aplicadas nunca mudam.
 */
export const MIGRACOES: Record<string, Migration> = {
  '0001_inicial': m0001,
  '0002_venda_credito_importacao': m0002,
};
