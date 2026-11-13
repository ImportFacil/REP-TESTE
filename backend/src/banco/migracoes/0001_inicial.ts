import { Kysely, sql } from 'kysely';

/**
 * Fase 1: contas e acesso, catálogo e preços, auditoria.
 *
 * As tabelas de pedidos, crédito e pagamentos entram nas migrações da fase 2.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.execute(db);
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);
  await sql`CREATE EXTENSION IF NOT EXISTS unaccent`.execute(db);
  // unaccent() não é IMMUTABLE; esta versão com dicionário fixo pode ser usada em índice.
  await sql`
    CREATE OR REPLACE FUNCTION busca_normalizada(texto text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, texto)) $$`.execute(db);

  // Bloqueia DELETE: o histórico de empresas, usuários, produtos e auditoria nunca é apagado.
  await sql`
    CREATE OR REPLACE FUNCTION impedir_exclusao() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'Registros de % não são apagados; inative o registro.', TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
    END;
    $$ LANGUAGE plpgsql`.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION tocar_atualizado_em() RETURNS trigger AS $$
    BEGIN
      NEW.atualizado_em = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql`.execute(db);

  await sql`
    CREATE TABLE tabelas_preco (
      tipo_cliente            text PRIMARY KEY CHECK (tipo_cliente ~ '^[a-z][a-z0-9_]{1,39}$'),
      nome                    text NOT NULL,
      desconto_bp             integer NOT NULL CHECK (desconto_bp BETWEEN 0 AND 9000),
      pedido_minimo_centavos  bigint NOT NULL CHECK (pedido_minimo_centavos >= 0),
      ativo                   boolean NOT NULL DEFAULT true,
      atualizado_em           timestamptz NOT NULL DEFAULT now()
    )`.execute(db);

  await sql`
    CREATE TABLE empresas (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cnpj           char(14) NOT NULL UNIQUE CHECK (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'),
      razao_social   text NOT NULL CHECK (length(trim(razao_social)) > 0),
      nome_fantasia  text,
      tipo_cliente   text NOT NULL REFERENCES tabelas_preco (tipo_cliente),
      endereco       jsonb,
      situacao       text NOT NULL DEFAULT 'ativa' CHECK (situacao IN ('ativa', 'bloqueada', 'inativa')),
      criado_em      timestamptz NOT NULL DEFAULT now(),
      atualizado_em  timestamptz NOT NULL DEFAULT now()
    )`.execute(db);

  await sql`
    CREATE TABLE usuarios (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      origem            text NOT NULL CHECK (origem IN ('cliente', 'equipe')),
      empresa_id        uuid REFERENCES empresas (id),
      nome              text NOT NULL CHECK (length(trim(nome)) > 0),
      email             text NOT NULL CHECK (email = lower(email) AND email LIKE '%_@_%'),
      papel             text NOT NULL,
      cognito_sub       text UNIQUE,
      ativo             boolean NOT NULL DEFAULT true,
      criado_em         timestamptz NOT NULL DEFAULT now(),
      ultimo_acesso_em  timestamptz,
      -- Clientes pertencem a uma empresa; a equipe Export Fácil não.
      CONSTRAINT usuarios_papel_por_origem CHECK (
        (origem = 'cliente' AND empresa_id IS NOT NULL AND papel IN ('comprador', 'aprovador'))
        OR (origem = 'equipe' AND empresa_id IS NULL AND papel IN ('comercial', 'financeiro', 'administrador'))
      )
    )`.execute(db);
  await sql`CREATE UNIQUE INDEX usuarios_email_origem ON usuarios (origem, email)`.execute(db);
  await sql`CREATE INDEX usuarios_empresa ON usuarios (empresa_id)`.execute(db);

  await sql`
    CREATE TABLE categorias (
      id             text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{1,40}$'),
      nome           text NOT NULL,
      icone          text,
      tipos_cliente  text[],
      ordem          integer NOT NULL DEFAULT 0,
      ativo          boolean NOT NULL DEFAULT true
    )`.execute(db);

  await sql`
    CREATE TABLE produtos (
      id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      codigo                 text NOT NULL UNIQUE,
      nome                   text NOT NULL CHECK (length(trim(nome)) > 0),
      marca                  text,
      categoria_id           text NOT NULL REFERENCES categorias (id),
      subcategoria           text,
      descricao              text,
      ncm                    char(8) CHECK (ncm ~ '^[0-9]{8}$'),
      unidade                text NOT NULL,
      multiplo_venda         integer NOT NULL DEFAULT 1 CHECK (multiplo_venda > 0),
      estoque                integer NOT NULL DEFAULT 0 CHECK (estoque >= 0),
      preco_tabela_centavos  bigint NOT NULL CHECK (preco_tabela_centavos > 0),
      sob_orcamento          boolean NOT NULL DEFAULT false,
      destaque               boolean NOT NULL DEFAULT false,
      importado              boolean NOT NULL DEFAULT false,
      especificacoes         jsonb NOT NULL DEFAULT '[]'::jsonb,
      ativo                  boolean NOT NULL DEFAULT true,
      criado_em              timestamptz NOT NULL DEFAULT now(),
      atualizado_em          timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX produtos_categoria ON produtos (categoria_id) WHERE ativo`.execute(db);
  // Busca por trecho de nome, marca ou código, sem diferenciar maiúsculas nem acentos ("pivo" acha "Pivô").
  await sql`CREATE INDEX produtos_busca ON produtos USING gin (busca_normalizada(nome || ' ' || coalesce(marca, '') || ' ' || codigo) gin_trgm_ops)`.execute(db);

  await sql`
    CREATE TABLE auditoria (
      id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      usuario_id   uuid REFERENCES usuarios (id),
      acao         text NOT NULL,
      entidade     text NOT NULL,
      entidade_id  text NOT NULL,
      antes        jsonb,
      depois       jsonb,
      ip           text,
      criado_em    timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX auditoria_entidade ON auditoria (entidade, entidade_id, criado_em DESC)`.execute(db);

  for (const tabela of ['tabelas_preco', 'empresas', 'usuarios', 'categorias', 'produtos', 'auditoria']) {
    await sql`CREATE TRIGGER ${sql.raw(`${tabela}_sem_exclusao`)} BEFORE DELETE ON ${sql.table(tabela)}
      FOR EACH ROW EXECUTE FUNCTION impedir_exclusao()`.execute(db);
  }
  for (const tabela of ['tabelas_preco', 'empresas', 'produtos']) {
    await sql`CREATE TRIGGER ${sql.raw(`${tabela}_atualizado_em`)} BEFORE UPDATE ON ${sql.table(tabela)}
      FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em()`.execute(db);
  }
  // A auditoria também não pode ser alterada depois de gravada.
  await sql`CREATE TRIGGER auditoria_sem_alteracao BEFORE UPDATE ON auditoria
    FOR EACH ROW EXECUTE FUNCTION impedir_exclusao()`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const tabela of ['auditoria', 'produtos', 'categorias', 'usuarios', 'empresas', 'tabelas_preco']) {
    await sql`DROP TABLE IF EXISTS ${sql.table(tabela)} CASCADE`.execute(db);
  }
  await sql`DROP FUNCTION IF EXISTS impedir_exclusao()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS tocar_atualizado_em()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS busca_normalizada(text)`.execute(db);
}
