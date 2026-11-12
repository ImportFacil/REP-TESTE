import { Kysely, sql } from 'kysely';

/**
 * Rota marítima na ordem de importação: porto de embarque e de chegada (código UN/LOCODE) e a data de embarque.
 * Com os dois portos, a ordem mostra a rota pelo mar e o prazo estimado; com a data, a chegada prevista.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE ordens_importacao
      ADD COLUMN porto_embarque text CHECK (porto_embarque IS NULL OR porto_embarque ~ '^[A-Z]{2}[A-Z0-9]{3}$'),
      ADD COLUMN porto_chegada  text CHECK (porto_chegada IS NULL OR porto_chegada ~ '^[A-Z]{2}[A-Z0-9]{3}$'),
      ADD COLUMN embarque_em    date`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ordens_importacao DROP COLUMN porto_embarque, DROP COLUMN porto_chegada, DROP COLUMN embarque_em`.execute(db);
}
