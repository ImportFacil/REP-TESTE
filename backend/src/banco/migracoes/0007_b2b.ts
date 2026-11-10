import { Kysely, sql } from 'kysely';

/**
 * Fase 3, B2B no formato do Bagisto B2B:
 * - limite de compra por comprador: acima dele, o pedido vira requisição e espera o aprovador da empresa;
 * - cotação de preço negociado (pedido de cotação): a empresa pede, a equipe responde com preço e validade,
 *   o aprovador aceita e o pedido sai com o preço combinado;
 * - número da ordem de compra do cliente em cada pedido.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE usuarios ADD COLUMN limite_pedido_centavos bigint CHECK (limite_pedido_centavos IS NULL OR limite_pedido_centavos > 0)`.execute(db);

  await sql`
    CREATE TABLE requisicoes (
      id                      bigint GENERATED ALWAYS AS IDENTITY (START WITH 501) PRIMARY KEY,
      empresa_id              uuid NOT NULL REFERENCES empresas (id),
      solicitante_id          uuid NOT NULL REFERENCES usuarios (id),
      itens                   jsonb NOT NULL,
      forma_pagamento         text NOT NULL CHECK (forma_pagamento IN ('pix', 'boleto', 'cartao')),
      parcelas                integer NOT NULL DEFAULT 1 CHECK (parcelas BETWEEN 1 AND 12),
      cupom                   text,
      endereco_id             bigint REFERENCES enderecos_entrega (id),
      ordem_compra            text,
      observacao              text,
      total_estimado_centavos bigint NOT NULL CHECK (total_estimado_centavos > 0),
      situacao                text NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente', 'aprovada', 'recusada', 'cancelada')),
      decidida_por            uuid REFERENCES usuarios (id),
      decidida_em             timestamptz,
      motivo                  text,
      pedido_id               bigint REFERENCES pedidos (id),
      criado_em               timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX requisicoes_empresa ON requisicoes (empresa_id, situacao)`.execute(db);

  await sql`
    CREATE TABLE cotacoes (
      id              bigint GENERATED ALWAYS AS IDENTITY (START WITH 7001) PRIMARY KEY,
      empresa_id      uuid NOT NULL REFERENCES empresas (id),
      solicitante_id  uuid NOT NULL REFERENCES usuarios (id),
      situacao        text NOT NULL DEFAULT 'solicitada'
                      CHECK (situacao IN ('solicitada', 'respondida', 'aceita', 'recusada', 'expirada', 'cancelada')),
      mensagem        text,
      resposta        text,
      validade        date,
      respondida_por  uuid REFERENCES usuarios (id),
      respondida_em   timestamptz,
      decidida_por    uuid REFERENCES usuarios (id),
      decidida_em     timestamptz,
      pedido_id       bigint REFERENCES pedidos (id),
      criado_em       timestamptz NOT NULL DEFAULT now(),
      atualizado_em   timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`
    CREATE TABLE cotacao_itens (
      id                         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      cotacao_id                 bigint NOT NULL REFERENCES cotacoes (id),
      produto_id                 bigint NOT NULL REFERENCES produtos (id),
      quantidade                 integer NOT NULL CHECK (quantidade > 0),
      preco_cliente_centavos     bigint NOT NULL CHECK (preco_cliente_centavos >= 0),
      preco_proposto_centavos    bigint CHECK (preco_proposto_centavos > 0),
      UNIQUE (cotacao_id, produto_id)
    )`.execute(db);

  await sql`
    ALTER TABLE pedidos
      ADD COLUMN ordem_compra text,
      ADD COLUMN requisicao_id bigint REFERENCES requisicoes (id),
      ADD COLUMN cotacao_id bigint REFERENCES cotacoes (id),
      ADD COLUMN aprovado_por uuid REFERENCES usuarios (id)`.execute(db);

  for (const [codigo, nome, descricao, assunto, corpo, variaveis] of [
    ['requisicao_pendente', 'Compra esperando aprovação', 'Para os aprovadores da empresa, quando um comprador passa do limite.',
      'Compra de {{valor}} esperando a sua aprovação',
      'Olá.\n\n{{solicitante}} montou uma compra de {{valor}} na {{empresa}}, acima do limite dele. A requisição nº {{requisicao}} espera a sua aprovação na loja, em Aprovações.\n\nEquipe ImportFácil',
      ['solicitante', 'empresa', 'valor', 'requisicao']],
    ['requisicao_decidida', 'Resposta da aprovação', 'Para quem pediu, quando o aprovador decide.',
      'Sua requisição nº {{requisicao}} foi {{decisao}}',
      'Olá, {{nome}}.\n\nA requisição nº {{requisicao}} foi {{decisao}} por {{aprovador}}. {{detalhe}}\n\nEquipe ImportFácil',
      ['nome', 'requisicao', 'decisao', 'aprovador', 'detalhe']],
    ['cotacao_respondida', 'Cotação respondida', 'Para quem pediu a cotação, quando a equipe responde com os preços.',
      'Cotação nº {{cotacao}} respondida: {{valor}}',
      'Olá, {{nome}}.\n\nA ImportFácil respondeu a cotação nº {{cotacao}}: {{valor}} para os itens pedidos, válida até {{validade}}.\n\n{{resposta}}\n\nO aprovador da empresa aceita a cotação na loja e o pedido sai com estes preços.\n\nEquipe ImportFácil',
      ['nome', 'cotacao', 'valor', 'validade', 'resposta']],
  ] as const) {
    await sql`INSERT INTO modelos_email (codigo, nome, descricao, assunto, corpo, variaveis)
      VALUES (${codigo}, ${nome}, ${descricao}, ${assunto}, ${corpo}, ${variaveis as unknown as string[]}::text[])`.execute(db);
  }

  for (const tabela of ['requisicoes', 'cotacoes', 'cotacao_itens']) {
    await sql`CREATE TRIGGER ${sql.raw(`${tabela}_sem_exclusao`)} BEFORE DELETE ON ${sql.table(tabela)} FOR EACH ROW EXECUTE FUNCTION impedir_exclusao()`.execute(db);
  }
  await sql`CREATE TRIGGER cotacoes_atualizado_em BEFORE UPDATE ON cotacoes FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em()`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DELETE FROM modelos_email WHERE codigo IN ('requisicao_pendente', 'requisicao_decidida', 'cotacao_respondida')`.execute(db);
  await sql`ALTER TABLE pedidos DROP COLUMN IF EXISTS aprovado_por, DROP COLUMN IF EXISTS cotacao_id, DROP COLUMN IF EXISTS requisicao_id, DROP COLUMN IF EXISTS ordem_compra`.execute(db);
  for (const tabela of ['cotacao_itens', 'cotacoes', 'requisicoes']) await sql`DROP TABLE IF EXISTS ${sql.table(tabela)} CASCADE`.execute(db);
  await sql`ALTER TABLE usuarios DROP COLUMN IF EXISTS limite_pedido_centavos`.execute(db);
}
