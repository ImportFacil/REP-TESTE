import { Kysely, sql } from 'kysely';

/**
 * Painel no formato do Bagisto, entrega 2: vendas (notas fiscais, envios, reembolsos) e catálogo
 * (atributos, famílias de atributos e os valores de cada produto).
 *
 * Mantém as regras de sempre: dinheiro em centavos; nada de vendas é apagado (nota se cancela, não se apaga).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ---------- notas fiscais (por enquanto numeradas aqui; a NF-e de verdade vem do ERP) ----------
  await sql`CREATE SEQUENCE notas_fiscais_numero START 1001`.execute(db);
  await sql`
    CREATE TABLE notas_fiscais (
      id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      pedido_id        bigint NOT NULL REFERENCES pedidos (id),
      numero           integer NOT NULL UNIQUE DEFAULT nextval('notas_fiscais_numero'),
      serie            text NOT NULL DEFAULT '1',
      chave            text NOT NULL UNIQUE,
      valor_centavos   bigint NOT NULL CHECK (valor_centavos > 0),
      situacao         text NOT NULL DEFAULT 'emitida' CHECK (situacao IN ('emitida', 'cancelada')),
      emitida_em       timestamptz NOT NULL DEFAULT now(),
      emitida_por      uuid REFERENCES usuarios (id),
      cancelada_em     timestamptz,
      motivo_cancelamento text
    )`.execute(db);
  // uma nota válida por pedido
  await sql`CREATE UNIQUE INDEX notas_fiscais_pedido_emitida ON notas_fiscais (pedido_id) WHERE situacao = 'emitida'`.execute(db);

  // ---------- envios (transportadora e rastreio de cada remessa) ----------
  await sql`
    CREATE TABLE envios (
      id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      pedido_id        bigint NOT NULL REFERENCES pedidos (id),
      transportadora   text NOT NULL,
      codigo_rastreio  text,
      volumes          integer NOT NULL DEFAULT 1 CHECK (volumes > 0),
      peso_kg          numeric(10, 2),
      observacao       text,
      enviado_em       timestamptz NOT NULL DEFAULT now(),
      entregue_em      timestamptz,
      criado_por       uuid REFERENCES usuarios (id)
    )`.execute(db);
  await sql`CREATE INDEX envios_pedido ON envios (pedido_id)`.execute(db);

  // ---------- reembolsos (devolução de dinheiro, total ou parcial) ----------
  await sql`
    CREATE TABLE reembolsos (
      id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      pedido_id        bigint NOT NULL REFERENCES pedidos (id),
      valor_centavos   bigint NOT NULL CHECK (valor_centavos > 0),
      meio             text NOT NULL CHECK (meio IN ('pix', 'estorno_cartao', 'abatimento_boleto')),
      motivo           text NOT NULL,
      devolver_estoque boolean NOT NULL DEFAULT false,
      itens            jsonb NOT NULL DEFAULT '[]',
      criado_em        timestamptz NOT NULL DEFAULT now(),
      criado_por       uuid REFERENCES usuarios (id)
    )`.execute(db);
  await sql`CREATE INDEX reembolsos_pedido ON reembolsos (pedido_id)`.execute(db);

  // ---------- atributos e famílias de atributos ----------
  await sql`
    CREATE TABLE atributos (
      id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      codigo      text NOT NULL UNIQUE CHECK (codigo ~ '^[a-z][a-z0-9_]{1,39}$'),
      nome        text NOT NULL,
      tipo        text NOT NULL CHECK (tipo IN ('texto', 'numero', 'lista', 'sim_nao')),
      opcoes      text[] NOT NULL DEFAULT '{}',
      unidade     text,
      obrigatorio boolean NOT NULL DEFAULT false,
      filtravel   boolean NOT NULL DEFAULT false,
      visivel_na_loja boolean NOT NULL DEFAULT true,
      ordem       integer NOT NULL DEFAULT 0,
      ativo       boolean NOT NULL DEFAULT true,
      criado_em   timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`
    CREATE TABLE familias_atributos (
      id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      codigo    text NOT NULL UNIQUE CHECK (codigo ~ '^[a-z][a-z0-9_]{1,39}$'),
      nome      text NOT NULL,
      ativo     boolean NOT NULL DEFAULT true,
      criado_em timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`
    CREATE TABLE familia_atributos (
      familia_id  integer NOT NULL REFERENCES familias_atributos (id),
      atributo_id integer NOT NULL REFERENCES atributos (id),
      ordem       integer NOT NULL DEFAULT 0,
      PRIMARY KEY (familia_id, atributo_id)
    )`.execute(db);
  await sql`ALTER TABLE produtos ADD COLUMN familia_id integer REFERENCES familias_atributos (id)`.execute(db);
  await sql`ALTER TABLE produtos ADD COLUMN atributos jsonb NOT NULL DEFAULT '{}'`.execute(db);

  // atributos iniciais, a partir das especificações que o catálogo já usa
  const ATRIBUTOS: Array<[string, string, string, string | null, boolean, string[]]> = [
    // codigo, nome, tipo, unidade, filtravel, nomes nas especificações
    ['linha', 'Linha', 'texto', null, true, ['Linha']],
    ['material', 'Material', 'texto', null, true, ['Material']],
    ['potencia', 'Potência', 'texto', null, true, ['Potência']],
    ['tensao', 'Tensão', 'texto', null, true, ['Tensão', 'Alimentação']],
    ['capacidade', 'Capacidade', 'texto', null, false, ['Capacidade', 'Volume', 'Carga']],
    ['medidas', 'Medidas', 'texto', null, false, ['Medida', 'Comprimento', 'Largura', 'Tamanho', 'Diâmetro']],
    ['garantia', 'Garantia', 'texto', null, false, ['Garantia']],
    ['norma', 'Norma ou certificação', 'texto', null, false, ['Norma', 'CA', 'Segurança', 'Proteção']],
    ['registro_anvisa', 'Registro ANVISA', 'texto', null, false, ['Registro ANVISA']],
    ['esterilidade', 'Esterilidade', 'texto', null, true, ['Esterilidade']],
    ['embalagem', 'Embalagem', 'texto', null, false, ['Caixa', 'Pacote', 'Embalagem', 'Unidade']],
    ['uso', 'Uso e aplicação', 'texto', null, false, ['Uso', 'Aplicação', 'Compatibilidade']],
  ];
  for (const [k, [codigo, nome, tipo, unidade, filtravel]] of ATRIBUTOS.entries()) {
    await sql`INSERT INTO atributos (codigo, nome, tipo, unidade, filtravel, ordem) VALUES (${codigo}, ${nome}, ${tipo}, ${unidade}, ${filtravel}, ${k})`.execute(db);
  }
  const FAMILIAS: Array<[string, string, string[], string]> = [
    // codigo, nome, atributos, categorias (expressão SQL sobre categoria_id)
    ['ferramentas_eletrica', 'Ferramentas e elétrica', ['linha', 'potencia', 'tensao', 'material', 'medidas', 'garantia', 'uso'], `categoria_id IN ('d-ferr','d-eletr','r-ferr','r-luz','r-auto','c-ene')`],
    ['construcao_casa', 'Construção, casa e hidráulica', ['linha', 'material', 'medidas', 'capacidade', 'norma', 'embalagem', 'uso'], `categoria_id IN ('d-hidr','d-fix','d-util','r-casa','r-tint','c-eq','c-and','c-hid')`],
    ['epi', 'EPIs', ['linha', 'material', 'medidas', 'norma', 'embalagem'], `categoria_id IN ('epis','c-epi','roupas')`],
    ['hospitalar', 'Hospitalar', ['linha', 'registro_anvisa', 'esterilidade', 'material', 'medidas', 'embalagem', 'uso'], `categoria_id LIKE 'h-%'`],
    ['agro', 'Agro e campo', ['linha', 'potencia', 'tensao', 'capacidade', 'medidas', 'garantia', 'material'], `categoria_id NOT LIKE '_-%'`], // o restante (agro e campo)
  ];
  for (const [codigo, nome, atributos, onde] of FAMILIAS) {
    const f = await sql<{ id: number }>`INSERT INTO familias_atributos (codigo, nome) VALUES (${codigo}, ${nome}) RETURNING id`.execute(db);
    const id = f.rows[0].id;
    for (const [k, a] of atributos.entries()) {
      await sql`INSERT INTO familia_atributos (familia_id, atributo_id, ordem) SELECT ${id}, a.id, ${k} FROM atributos a WHERE a.codigo = ${a}`.execute(db);
    }
    await sql`UPDATE produtos SET familia_id = ${id} WHERE familia_id IS NULL AND ${sql.raw(onde)}`.execute(db);
  }
  // valores dos atributos a partir das especificações (a primeira que bater, para cada atributo)
  for (const [codigo, , , , , nomes] of ATRIBUTOS) {
    await sql`
      UPDATE produtos p SET atributos = p.atributos || jsonb_build_object(${codigo}::text, e.valor)
      FROM (
        SELECT DISTINCT ON (pr.id) pr.id, x->>'valor' AS valor
        FROM produtos pr, jsonb_array_elements(pr.especificacoes) WITH ORDINALITY AS t(x, n)
        WHERE x->>'nome' = ANY(${nomes}::text[])
        ORDER BY pr.id, t.n
      ) e
      WHERE e.id = p.id AND NOT (p.atributos ? ${codigo}::text)`.execute(db);
  }

  for (const tabela of ['notas_fiscais', 'envios', 'reembolsos']) {
    await sql`CREATE TRIGGER ${sql.raw(`${tabela}_sem_exclusao`)} BEFORE DELETE ON ${sql.table(tabela)}
      FOR EACH ROW EXECUTE FUNCTION impedir_exclusao()`.execute(db);
  }
  await sql`CREATE TRIGGER reembolsos_sem_alteracao BEFORE UPDATE ON reembolsos FOR EACH ROW EXECUTE FUNCTION impedir_exclusao()`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE produtos DROP COLUMN IF EXISTS atributos`.execute(db);
  await sql`ALTER TABLE produtos DROP COLUMN IF EXISTS familia_id`.execute(db);
  for (const tabela of ['familia_atributos', 'familias_atributos', 'atributos', 'reembolsos', 'envios', 'notas_fiscais']) {
    await sql`DROP TABLE IF EXISTS ${sql.table(tabela)} CASCADE`.execute(db);
  }
  await sql`DROP SEQUENCE IF EXISTS notas_fiscais_numero`.execute(db);
}
