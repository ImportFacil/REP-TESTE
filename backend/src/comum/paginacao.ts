import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Teto de itens por página: as listas do Painel pedem de 10 a 100 por vez e buscam as próximas no servidor. */
export const MAX_POR_PAGINA = 200;

export class Paginacao {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_POR_PAGINA) por_pagina?: number;
}

/** Ordenação pedida pela grade do Painel (`ordenar` = coluna; cada lista diz quais colunas aceita). */
export class Ordenacao extends Paginacao {
  @IsOptional() @IsIn(['asc', 'desc']) dir?: 'asc' | 'desc';
}

/** "a,b,c" → ['a','b','c'] (filtros de várias opções vêm separados por vírgula). */
export function lista(v: string | undefined): string[] {
  return (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
}

/** Texto para ILIKE, com %, _ e \ escapados. */
export function termoBusca(v: string): string {
  return `%${v.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
}

export function limites(p: Paginacao, padrao = 30): { limite: number; deslocamento: number; pagina: number } {
  const pagina = p.pagina ?? 1;
  const limite = p.por_pagina ?? padrao;
  return { limite, deslocamento: (pagina - 1) * limite, pagina };
}
