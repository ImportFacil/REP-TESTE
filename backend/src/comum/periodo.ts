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

export interface Janela { inicio: string; fim: string; rotulo: string; horas: number | null; de: string | null; ate: string | null }

/** Data de Brasília (UTC−3, sem horário de verão) → instante em UTC. */
const instanteBrasil = (data: string, hora: string) => new Date(`${data}T${hora}-03:00`).toISOString();

/**
 * Janela de tempo dos relatórios e filtros de pedidos: as últimas N horas (24, 48, 72, 168…)
 * ou um período de datas (do início do dia "de" ao fim do dia "ate", no fuso de Brasília).
 * Sem nada, não há janela (null).
 */
export function lerJanela(f: { horas?: number; de?: string; ate?: string }, agora = new Date()): Janela | null {
  if (f.horas) {
    if (!Number.isInteger(f.horas) || f.horas < 1 || f.horas > 24 * 400) throw new BadRequestException('Horas: de 1 a 9.600.');
    const fim = agora.toISOString();
    const inicio = new Date(agora.getTime() - f.horas * 3_600_000).toISOString();
    const rotulo = f.horas % 24 === 0 ? (f.horas === 168 ? 'Últimos 7 dias' : `Últimas ${f.horas} horas`) : `Últimas ${f.horas} horas`;
    return { inicio, fim, rotulo, horas: f.horas, de: null, ate: null };
  }
  if (!f.de && !f.ate) return null;
  const p = lerPeriodo(f.de ?? f.ate, f.ate ?? f.de);
  const br = (d: string) => d.split('-').reverse().join('/');
  return { inicio: instanteBrasil(p.de, '00:00:00'), fim: instanteBrasil(p.ate, '23:59:59.999'), rotulo: p.de === p.ate ? br(p.de) : `${br(p.de)} a ${br(p.ate)}`, horas: null, de: p.de, ate: p.ate };
}
