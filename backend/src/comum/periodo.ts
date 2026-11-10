import { BadRequestException } from '@nestjs/common';
import { hojeBrasil, somarDias } from '../pagamentos/regras';

export interface Periodo { de: string; ate: string }

/** Período de consulta (datas no fuso de Brasília): padrão, os últimos 30 dias; no máximo um ano. */
export function lerPeriodo(de?: string, ate?: string): Periodo {
  const valida = (d: string) => { const t = new Date(`${d}T00:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d; };
  for (const d of [de, ate]) if (d && !valida(d)) throw new BadRequestException(`Data inválida: ${d}`);
  const fim = ate ?? hojeBrasil();
  const inicio = de ?? somarDias(fim, -29);
  if (inicio > fim) throw new BadRequestException('A data inicial vem depois da final.');
  if (Date.parse(fim) - Date.parse(inicio) > 366 * 86_400_000) throw new BadRequestException('O período vai até um ano.');
  return { de: inicio, ate: fim };
}
