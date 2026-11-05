import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from 'kysely';
import { BANCO, type Banco } from '../banco/banco.module';
import type { Database } from '../banco/tipos';
import type { UsuarioAutenticado } from '../auth/identidade';

export interface RegistroAuditoria {
  usuario: UsuarioAutenticado | null;
  acao: string;
  entidade: string;
  entidadeId: string | number;
  antes?: unknown;
  depois?: unknown;
  ip?: string | null;
}

/** Registro de quem fez o quê e quando, em ações sensíveis (crédito, preços, cadastros). */
@Injectable()
export class AuditoriaService {
  constructor(@Inject(BANCO) private readonly db: Banco) {}

  /** Grava o registro; passe a transação para que ele só exista se a alteração for confirmada. */
  async registrar(r: RegistroAuditoria, trx?: Transaction<Database>): Promise<void> {
    await (trx ?? this.db)
      .insertInto('auditoria')
      .values({
        usuario_id: r.usuario?.id ?? null,
        acao: r.acao,
        entidade: r.entidade,
        entidade_id: String(r.entidadeId),
        antes: r.antes === undefined ? null : JSON.stringify(r.antes),
        depois: r.depois === undefined ? null : JSON.stringify(r.depois),
        ip: r.ip ?? null,
      })
      .execute();
  }

  async listar(filtro: { entidade?: string; entidadeId?: string; limite: number; antesDe?: number }) {
    let q = this.db
      .selectFrom('auditoria as a')
      .leftJoin('usuarios as u', 'u.id', 'a.usuario_id')
      .select(['a.id', 'a.acao', 'a.entidade', 'a.entidade_id', 'a.antes', 'a.depois', 'a.ip', 'a.criado_em', 'u.nome as usuario_nome', 'u.email as usuario_email'])
      .orderBy('a.id', 'desc')
      .limit(filtro.limite);
    if (filtro.entidade) q = q.where('a.entidade', '=', filtro.entidade);
    if (filtro.entidadeId) q = q.where('a.entidade_id', '=', filtro.entidadeId);
    if (filtro.antesDe) q = q.where('a.id', '<', filtro.antesDe);
    return q.execute();
  }
}
