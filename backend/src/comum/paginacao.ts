import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class Paginacao {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) por_pagina?: number;
}

export function limites(p: Paginacao, padrao = 30): { limite: number; deslocamento: number; pagina: number } {
  const pagina = p.pagina ?? 1;
  const limite = p.por_pagina ?? padrao;
  return { limite, deslocamento: (pagina - 1) * limite, pagina };
}
