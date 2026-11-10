import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UsuarioAutenticado } from '../auth/identidade';
import { BANCO, type Banco } from '../banco/banco.module';
import type { Empresa } from '../banco/tipos';
import { normalizarCnpj } from '../comum/cnpj';
import { PG_VIOLACAO_UNICA, codigoPg } from '../comum/erros';
import { limites } from '../comum/paginacao';
import type { AlterarEmpresaDto, CriarEmpresaDto, FiltroEmpresas } from './dto';

@Injectable()
export class EmpresasService {
  constructor(
    @Inject(BANCO) private readonly db: Banco,
    private readonly auditoria: AuditoriaService,
  ) {}

  private async conferirTipo(tipo: string): Promise<void> {
    const t = await this.db.selectFrom('tabelas_preco').select('ativo').where('tipo_cliente', '=', tipo).executeTakeFirst();
    if (!t || !t.ativo) throw new BadRequestException(`Tipo de cliente desconhecido ou inativo: ${tipo}`);
  }

  async criar(dto: CriarEmpresaDto, autor: UsuarioAutenticado, ip: string | null): Promise<Empresa> {
    await this.conferirTipo(dto.tipo_cliente);
    try {
      return await this.db.transaction().execute(async (trx) => {
        const empresa = await trx
          .insertInto('empresas')
          .values({
            cnpj: normalizarCnpj(dto.cnpj),
            razao_social: dto.razao_social,
            nome_fantasia: dto.nome_fantasia ?? null,
            tipo_cliente: dto.tipo_cliente,
            endereco: dto.endereco ? JSON.stringify(dto.endereco) : null,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await this.auditoria.registrar({ usuario: autor, acao: 'empresa.criar', entidade: 'empresa', entidadeId: empresa.id, depois: empresa, ip }, trx);
        return empresa;
      });
    } catch (e) {
      if (codigoPg(e) === PG_VIOLACAO_UNICA) throw new ConflictException('Já existe uma empresa com este CNPJ.');
      throw e;
    }
  }

  async listar(f: FiltroEmpresas) {
    const { limite, deslocamento, pagina } = limites(f);
    let q = this.db.selectFrom('empresas');
    if (f.situacao) q = q.where('situacao', '=', f.situacao);
    if (f.tipo_cliente) q = q.where('tipo_cliente', '=', f.tipo_cliente);
    if (f.busca?.trim()) {
      const termo = `%${f.busca.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      const cnpj = normalizarCnpj(f.busca);
      q = q.where((eb) =>
        eb.or([
          eb('razao_social', 'ilike', termo),
          eb('nome_fantasia', 'ilike', termo),
          ...(cnpj.length >= 4 ? [eb('cnpj', 'like', `%${cnpj}%`)] : []),
        ]),
      );
    }
    const [itens, total] = await Promise.all([
      q.selectAll().orderBy('razao_social').limit(limite).offset(deslocamento).execute(),
      q.select(sql<number>`count(*)::int`.as('n')).executeTakeFirstOrThrow(),
    ]);
    return { itens, total: total.n, pagina, por_pagina: limite };
  }

  async obter(id: string): Promise<Empresa> {
    const empresa = await this.db.selectFrom('empresas').selectAll().where('id', '=', id).executeTakeFirst();
    if (!empresa) throw new NotFoundException('Empresa não encontrada.');
    return empresa;
  }

  async alterar(id: string, dto: AlterarEmpresaDto, autor: UsuarioAutenticado, ip: string | null): Promise<Empresa> {
    if (dto.tipo_cliente) await this.conferirTipo(dto.tipo_cliente);
    return this.db.transaction().execute(async (trx) => {
      const antes = await trx.selectFrom('empresas').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!antes) throw new NotFoundException('Empresa não encontrada.');
      const mudancas = {
        ...(dto.razao_social !== undefined && { razao_social: dto.razao_social }),
        ...(dto.nome_fantasia !== undefined && { nome_fantasia: dto.nome_fantasia || null }),
        ...(dto.tipo_cliente !== undefined && { tipo_cliente: dto.tipo_cliente }),
        ...(dto.situacao !== undefined && { situacao: dto.situacao }),
        ...(dto.endereco !== undefined && { endereco: JSON.stringify(dto.endereco) }),
      };
      if (!Object.keys(mudancas).length) return antes;
      const depois = await trx.updateTable('empresas').set(mudancas).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      await this.auditoria.registrar({ usuario: autor, acao: 'empresa.alterar', entidade: 'empresa', entidadeId: id, antes, depois, ip }, trx);
      return depois;
    });
  }
}
