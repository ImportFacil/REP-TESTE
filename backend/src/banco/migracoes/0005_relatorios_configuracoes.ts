import { Kysely, sql } from 'kysely';

/**
 * Painel no formato do Bagisto, entrega 4: configurações.
 * - Regras de impostos: o valor aproximado dos tributos de cada nota (Lei 12.741/2012).
 * - Locais de estoque: o estoque do produto passa a ser a soma dos locais, sincronizado nos dois sentidos.
 * - Câmbio: as cotações usadas nas propostas de importação.
 * - Histórico das importações de produtos por planilha.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ---------- regras de impostos (valor aproximado dos tributos, como na tabela do IBPT) ----------
  await sql`
    CREATE TABLE regras_impostos (
      id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      nome                 text NOT NULL,
      ncm_prefixo          text CHECK (ncm_prefixo IS NULL OR ncm_prefixo ~ '^[0-9]{2,8}$'),
      uf                   text CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
      origem               text CHECK (origem IS NULL OR origem IN ('nacional', 'importado')),
      aliquota_federal_bp  integer NOT NULL CHECK (aliquota_federal_bp BETWEEN 0 AND 10000),
      aliquota_estadual_bp integer NOT NULL CHECK (aliquota_estadual_bp BETWEEN 0 AND 10000),
      ativo                boolean NOT NULL DEFAULT true,
      criado_em            timestamptz NOT NULL DEFAULT now(),
      atualizado_em        timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  for (const [nome, ncm, uf, origem, fed, est] of [
    ['Padrão: mercadoria nacional', null, null, 'nacional', 1345, 1800],
    ['Padrão: mercadoria importada', null, null, 'importado', 1545, 1800],
    ['Saída para Mato Grosso', null, 'MT', null, 1345, 1700],
    ['Máquinas e equipamentos (NCM 84)', '84', null, null, 1015, 1200],
    ['Material médico-hospitalar (NCM 9018)', '9018', null, null, 945, 1200],
  ] as const) {
    await sql`INSERT INTO regras_impostos (nome, ncm_prefixo, uf, origem, aliquota_federal_bp, aliquota_estadual_bp)
      VALUES (${nome}, ${ncm}, ${uf}, ${origem}, ${fed}, ${est})`.execute(db);
  }
  await sql`
    ALTER TABLE notas_fiscais
      ADD COLUMN tributos_centavos bigint NOT NULL DEFAULT 0 CHECK (tributos_centavos >= 0),
      ADD COLUMN tributos jsonb NOT NULL DEFAULT '{}'`.execute(db);

  // ---------- locais de estoque ----------
  await sql`
    CREATE TABLE locais_estoque (
      id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      codigo      text NOT NULL UNIQUE CHECK (codigo ~ '^[a-z0-9-]{2,30}$'),
      nome        text NOT NULL,
      cidade      text NOT NULL,
      uf          text NOT NULL CHECK (uf ~ '^[A-Z]{2}$'),
      prioridade  integer NOT NULL DEFAULT 10,
      ativo       boolean NOT NULL DEFAULT true,
      criado_em   timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`
    CREATE TABLE estoque_locais (
      produto_id  bigint NOT NULL REFERENCES produtos (id),
      local_id    bigint NOT NULL REFERENCES locais_estoque (id),
      quantidade  integer NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
      PRIMARY KEY (produto_id, local_id)
    )`.execute(db);
  await sql`INSERT INTO locais_estoque (codigo, nome, cidade, uf, prioridade) VALUES ('cd-itajai', 'Centro de distribuição', 'Itajaí', 'SC', 1)`.execute(db);
  await sql`INSERT INTO estoque_locais (produto_id, local_id, quantidade) SELECT id, 1, estoque FROM produtos WHERE estoque > 0`.execute(db);

  // Mudou o estoque de um local → o produto passa a ter a soma dos locais.
  await sql`
    CREATE FUNCTION estoque_local_para_produto() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
      UPDATE produtos SET estoque = (SELECT coalesce(sum(quantidade), 0) FROM estoque_locais WHERE produto_id = NEW.produto_id)
        WHERE id = NEW.produto_id;
      RETURN NULL;
    END $$`.execute(db);
  await sql`CREATE TRIGGER estoque_locais_sincroniza AFTER INSERT OR UPDATE ON estoque_locais FOR EACH ROW EXECUTE FUNCTION estoque_local_para_produto()`.execute(db);

  // Mudou o estoque do produto (venda, cancelamento, devolução, edição) → a diferença vai para os locais:
  // entrada no local de maior prioridade; saída dos locais em ordem de prioridade.
  await sql`
    CREATE FUNCTION produto_para_estoque_local() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      delta integer := NEW.estoque - (CASE WHEN TG_OP = 'INSERT' THEN 0 ELSE OLD.estoque END);
      tirar integer;
      r record;
    BEGIN
      IF pg_trigger_depth() > 1 OR delta = 0 THEN RETURN NULL; END IF;
      IF delta > 0 THEN
        INSERT INTO estoque_locais (produto_id, local_id, quantidade)
          SELECT NEW.id, l.id, delta FROM locais_estoque l WHERE l.ativo ORDER BY l.prioridade, l.id LIMIT 1
          ON CONFLICT (produto_id, local_id) DO UPDATE SET quantidade = estoque_locais.quantidade + EXCLUDED.quantidade;
      ELSE
        tirar := -delta;
        FOR r IN SELECT el.local_id, el.quantidade FROM estoque_locais el JOIN locais_estoque l ON l.id = el.local_id
                 WHERE el.produto_id = NEW.id AND el.quantidade > 0 ORDER BY l.ativo DESC, l.prioridade, l.id FOR UPDATE OF el LOOP
          EXIT WHEN tirar = 0;
          UPDATE estoque_locais SET quantidade = quantidade - least(r.quantidade, tirar) WHERE produto_id = NEW.id AND local_id = r.local_id;
          tirar := tirar - least(r.quantidade, tirar);
        END LOOP;
      END IF;
      RETURN NULL;
    END $$`.execute(db);
  await sql`CREATE TRIGGER produtos_estoque_para_locais AFTER INSERT OR UPDATE OF estoque ON produtos FOR EACH ROW EXECUTE FUNCTION produto_para_estoque_local()`.execute(db);

  // ---------- câmbio ----------
  await sql`
    CREATE TABLE cotacoes_cambio (
      id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      moeda       text NOT NULL CHECK (moeda IN ('USD', 'EUR', 'CNY')),
      data        date NOT NULL,
      taxa        numeric(12, 4) NOT NULL CHECK (taxa > 0),
      fonte       text NOT NULL DEFAULT 'manual',
      criado_por  uuid REFERENCES usuarios (id),
      criado_em   timestamptz NOT NULL DEFAULT now(),
      UNIQUE (moeda, data)
    )`.execute(db);

  // ---------- importações de produtos por planilha ----------
  await sql`
    CREATE TABLE importacoes_produtos (
      id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      arquivo     text NOT NULL,
      linhas      integer NOT NULL,
      criados     integer NOT NULL,
      alterados   integer NOT NULL,
      com_erro    integer NOT NULL,
      erros       jsonb NOT NULL DEFAULT '[]',
      criado_por  uuid REFERENCES usuarios (id),
      criado_em   timestamptz NOT NULL DEFAULT now()
    )`.execute(db);

  for (const tabela of ['regras_impostos', 'locais_estoque', 'estoque_locais', 'cotacoes_cambio', 'importacoes_produtos']) {
    await sql`CREATE TRIGGER ${sql.raw(`${tabela}_sem_exclusao`)} BEFORE DELETE ON ${sql.table(tabela)}
      FOR EACH ROW EXECUTE FUNCTION impedir_exclusao()`.execute(db);
  }
  await sql`CREATE TRIGGER regras_impostos_atualizado_em BEFORE UPDATE ON regras_impostos FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em()`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS produtos_estoque_para_locais ON produtos`.execute(db);
  await sql`DROP FUNCTION IF EXISTS produto_para_estoque_local()`.execute(db);
  for (const tabela of ['importacoes_produtos', 'cotacoes_cambio', 'estoque_locais', 'locais_estoque', 'regras_impostos']) {
    await sql`DROP TABLE IF EXISTS ${sql.table(tabela)} CASCADE`.execute(db);
  }
  await sql`DROP FUNCTION IF EXISTS estoque_local_para_produto()`.execute(db);
  await sql`ALTER TABLE notas_fiscais DROP COLUMN IF EXISTS tributos, DROP COLUMN IF EXISTS tributos_centavos`.execute(db);
}
