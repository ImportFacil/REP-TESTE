import { Kysely, sql } from 'kysely';

/**
 * Fase 2, a loja no formato do Bagisto: favoritos, endereços de entrega da empresa e listas de compra.
 * Favoritos e itens de lista podem ser tirados (não são registros de dinheiro); endereços e listas se desativam.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE favoritos (
      usuario_id  uuid NOT NULL REFERENCES usuarios (id),
      produto_id  bigint NOT NULL REFERENCES produtos (id),
      criado_em   timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (usuario_id, produto_id)
    )`.execute(db);

  await sql`
    CREATE TABLE enderecos_entrega (
      id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      empresa_id  uuid NOT NULL REFERENCES empresas (id),
      apelido     text NOT NULL,
      endereco    jsonb NOT NULL,
      padrao      boolean NOT NULL DEFAULT false,
      ativo       boolean NOT NULL DEFAULT true,
      criado_por  uuid REFERENCES usuarios (id),
      criado_em   timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE UNIQUE INDEX enderecos_um_padrao ON enderecos_entrega (empresa_id) WHERE padrao AND ativo`.execute(db);

  await sql`
    CREATE TABLE listas_compra (
      id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      empresa_id     uuid NOT NULL REFERENCES empresas (id),
      nome           text NOT NULL,
      ativo          boolean NOT NULL DEFAULT true,
      criado_por     uuid REFERENCES usuarios (id),
      criado_em      timestamptz NOT NULL DEFAULT now(),
      atualizado_em  timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`
    CREATE TABLE lista_itens (
      lista_id    bigint NOT NULL REFERENCES listas_compra (id),
      produto_id  bigint NOT NULL REFERENCES produtos (id),
      quantidade  integer NOT NULL CHECK (quantidade > 0),
      PRIMARY KEY (lista_id, produto_id)
    )`.execute(db);

  for (const tabela of ['enderecos_entrega', 'listas_compra']) {
    await sql`CREATE TRIGGER ${sql.raw(`${tabela}_sem_exclusao`)} BEFORE DELETE ON ${sql.table(tabela)} FOR EACH ROW EXECUTE FUNCTION impedir_exclusao()`.execute(db);
  }
  await sql`CREATE TRIGGER listas_compra_atualizado_em BEFORE UPDATE ON listas_compra FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em()`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const tabela of ['lista_itens', 'listas_compra', 'enderecos_entrega', 'favoritos']) {
    await sql`DROP TABLE IF EXISTS ${sql.table(tabela)} CASCADE`.execute(db);
  }
}
