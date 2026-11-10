/** Códigos de erro do PostgreSQL usados pela API. */
export const PG_VIOLACAO_UNICA = '23505';
export const PG_VIOLACAO_FK = '23503';

export function codigoPg(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : undefined;
}
