import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from 'kysely';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UsuarioAutenticado } from '../auth/identidade';
import { BANCO, type Banco } from '../banco/banco.module';
import type { Database, Politica } from '../banco/tipos';

export type NovaPolitica = Omit<Politica, 'id' | 'criado_por' | 'criado_em'>;

/** Condições de pagamento vigentes. Cada alteração cria uma nova versão; pedidos guardam a versão usada. */
@Injectable()
export class PoliticaService {
  constructor(
    @Inject(BANCO) private readonly db: Banco,
    private readonly auditoria: AuditoriaService,
  ) {}

  atual(trx?: Transaction<Database>): Promise<Politica> {
    return (trx ?? this.db).selectFrom('politicas_pagamento').selectAll().orderBy('id', 'desc').limit(1).executeTakeFirstOrThrow();
  }

  async alterar(mudancas: Partial<NovaPolitica>, autor: UsuarioAutenticado, ip: string | null): Promise<Politica> {
    return this.db.transaction().execute(async (trx) => {
      const antes = await this.atual(trx);
      const { id: _id, criado_em: _c, criado_por: _p, ...base } = antes;
      const nova = await trx
        .insertInto('politicas_pagamento')
        .values({ ...base, ...Object.fromEntries(Object.entries(mudancas).filter(([, v]) => v !== undefined)), criado_por: autor.id })
        .returningAll()
        .executeTakeFirstOrThrow();
      await this.auditoria.registrar({ usuario: autor, acao: 'politica.alterar', entidade: 'politica_pagamento', entidadeId: nova.id, antes, depois: nova, ip }, trx);
      return nova;
    });
  }
}
