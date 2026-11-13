import { Kysely, sql } from 'kysely';

/**
 * Fase 2: política de pagamento, crédito, documentos, pedidos, cobranças e parcelas,
 * webhooks, orçamentos, ordens de importação, numerário, notificações e rotinas.
 *
 * Mantém as regras da fase 1: dinheiro em centavos, nada é apagado.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ---------- política de pagamento (versionada: cada mudança é uma nova linha) ----------
  await sql`
    CREATE TABLE politicas_pagamento (
      id                          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      pix_desconto_bp             integer NOT NULL CHECK (pix_desconto_bp BETWEEN 0 AND 2000),
      pix_validade_horas          integer NOT NULL CHECK (pix_validade_horas BETWEEN 1 AND 168),
      boleto_max_parcelas         integer NOT NULL CHECK (boleto_max_parcelas BETWEEN 1 AND 4),
      cartao_max_parcelas         integer NOT NULL CHECK (cartao_max_parcelas BETWEEN 1 AND 12),
      cartao_sem_juros_ate        integer NOT NULL CHECK (cartao_sem_juros_ate BETWEEN 1 AND 12),
      cartao_juros_am_bp          integer NOT NULL CHECK (cartao_juros_am_bp BETWEEN 0 AND 1000),
      multa_atraso_bp             integer NOT NULL CHECK (multa_atraso_bp BETWEEN 0 AND 200),
      juros_atraso_am_bp          integer NOT NULL CHECK (juros_atraso_am_bp BETWEEN 0 AND 100),
      atraso_bloqueio_dias        integer NOT NULL CHECK (atraso_bloqueio_dias BETWEEN 0 AND 60),
      cliente_grande_mensal_centavos bigint NOT NULL CHECK (cliente_grande_mensal_centavos >= 0),
      criado_por                  uuid REFERENCES usuarios (id),
      criado_em                   timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  // Valores das decisões de 5/11/2026: Pix 3% e 24 h; boleto até 4×; cartão até 12×, sem juros até 10×;
  // multa 2% e juros 1% a.m.; bloqueio após 3 dias; cliente grande a partir de R$ 400.000,00 por mês.
  await sql`
    INSERT INTO politicas_pagamento (pix_desconto_bp, pix_validade_horas, boleto_max_parcelas, cartao_max_parcelas,
      cartao_sem_juros_ate, cartao_juros_am_bp, multa_atraso_bp, juros_atraso_am_bp, atraso_bloqueio_dias, cliente_grande_mensal_centavos)
    VALUES (300, 24, 4, 12, 10, 199, 200, 100, 3, 40000000)`.execute(db);

  await sql`ALTER TABLE empresas ADD COLUMN conta_e_ordem_liberada boolean NOT NULL DEFAULT false`.execute(db);

  // ---------- crédito ----------
  await sql`
    CREATE TABLE cadastros_credito (
      empresa_id                   uuid PRIMARY KEY REFERENCES empresas (id),
      situacao                     text NOT NULL DEFAULT 'rascunho'
                                   CHECK (situacao IN ('rascunho', 'em_analise', 'pendente_documentos', 'aprovado', 'reprovado')),
      faturamento_mensal_centavos  bigint CHECK (faturamento_mensal_centavos >= 0),
      compras_mensais_previstas_centavos bigint CHECK (compras_mensais_previstas_centavos >= 0),
      limite_solicitado_centavos   bigint CHECK (limite_solicitado_centavos >= 0),
      anos_cnpj                    integer CHECK (anos_cnpj >= 0),
      dados                        jsonb NOT NULL DEFAULT '{}'::jsonb,
      faixa                        char(1) CHECK (faixa IN ('A', 'B', 'C')),
      limite_aprovado_centavos     bigint NOT NULL DEFAULT 0 CHECK (limite_aprovado_centavos >= 0),
      parecer                      text,
      analista_id                  uuid REFERENCES usuarios (id),
      enviado_em                   timestamptz,
      decidido_em                  timestamptz,
      proxima_revisao_em           date,
      atualizado_em                timestamptz NOT NULL DEFAULT now()
    )`.execute(db);

  await sql`
    CREATE TABLE limites_credito (
      id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      empresa_id         uuid NOT NULL REFERENCES empresas (id),
      faixa              char(1) NOT NULL CHECK (faixa IN ('A', 'B', 'C')),
      valor_centavos     bigint NOT NULL CHECK (valor_centavos >= 0),
      aprovado_por       uuid NOT NULL REFERENCES usuarios (id),
      motivo             text,
      criado_em          timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX limites_credito_empresa ON limites_credito (empresa_id, criado_em DESC)`.execute(db);

  await sql`
    CREATE TABLE documentos (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id     uuid NOT NULL REFERENCES empresas (id),
      dono           text NOT NULL CHECK (dono IN ('cadastro', 'ordem')),
      dono_id        text NOT NULL,
      tipo           text NOT NULL,
      nome_arquivo   text NOT NULL,
      tipo_conteudo  text NOT NULL,
      tamanho_bytes  integer NOT NULL CHECK (tamanho_bytes > 0),
      chave          text NOT NULL UNIQUE,
      sha256         char(64) NOT NULL,
      enviado_por    uuid NOT NULL REFERENCES usuarios (id),
      substituido    boolean NOT NULL DEFAULT false,
      criado_em      timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX documentos_dono ON documentos (dono, dono_id) WHERE NOT substituido`.execute(db);

  // ---------- pedidos ----------
  await sql`
    CREATE TABLE pedidos (
      id                     bigint GENERATED ALWAYS AS IDENTITY (START WITH 10001) PRIMARY KEY,
      empresa_id             uuid NOT NULL REFERENCES empresas (id),
      comprador_id           uuid NOT NULL REFERENCES usuarios (id),
      tipo_cliente           text NOT NULL,
      forma_pagamento        text NOT NULL CHECK (forma_pagamento IN ('pix', 'boleto', 'cartao')),
      parcelas               integer NOT NULL CHECK (parcelas BETWEEN 1 AND 12),
      subtotal_centavos      bigint NOT NULL CHECK (subtotal_centavos > 0),
      desconto_centavos      bigint NOT NULL DEFAULT 0 CHECK (desconto_centavos >= 0),
      juros_centavos         bigint NOT NULL DEFAULT 0 CHECK (juros_centavos >= 0),
      total_centavos         bigint NOT NULL CHECK (total_centavos > 0),
      situacao               text NOT NULL DEFAULT 'novo'
                             CHECK (situacao IN ('novo', 'em_separacao', 'enviado', 'entregue', 'cancelado')),
      situacao_pagamento     text NOT NULL
                             CHECK (situacao_pagamento IN ('aguardando_pagamento', 'pix_expirado', 'aguardando_faturamento',
                                                           'em_aberto', 'pago', 'estornado', 'cancelado')),
      politica_id            bigint NOT NULL REFERENCES politicas_pagamento (id),
      endereco_entrega       jsonb,
      observacao             text,
      faturado_em            timestamptz,
      criado_em              timestamptz NOT NULL DEFAULT now(),
      atualizado_em          timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX pedidos_empresa ON pedidos (empresa_id, criado_em DESC)`.execute(db);
  await sql`CREATE INDEX pedidos_situacao ON pedidos (situacao, situacao_pagamento)`.execute(db);

  // O preço fica congelado no item: mudar a tabela depois não altera pedidos antigos.
  await sql`
    CREATE TABLE pedido_itens (
      id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      pedido_id                bigint NOT NULL REFERENCES pedidos (id),
      produto_id               bigint NOT NULL REFERENCES produtos (id),
      codigo                   text NOT NULL,
      nome                     text NOT NULL,
      unidade                  text NOT NULL,
      quantidade               integer NOT NULL CHECK (quantidade > 0),
      preco_tabela_centavos    bigint NOT NULL,
      preco_unitario_centavos  bigint NOT NULL,
      total_centavos           bigint NOT NULL
    )`.execute(db);
  await sql`CREATE INDEX pedido_itens_pedido ON pedido_itens (pedido_id)`.execute(db);

  await sql`
    CREATE TABLE pedido_eventos (
      id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      pedido_id   bigint NOT NULL REFERENCES pedidos (id),
      tipo        text NOT NULL,
      descricao   text NOT NULL,
      usuario_id  uuid REFERENCES usuarios (id),
      criado_em   timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX pedido_eventos_pedido ON pedido_eventos (pedido_id, id)`.execute(db);

  // ---------- orçamentos e ordens de importação ----------
  await sql`
    CREATE TABLE orcamentos (
      id                     bigint GENERATED ALWAYS AS IDENTITY (START WITH 5001) PRIMARY KEY,
      empresa_id             uuid NOT NULL REFERENCES empresas (id),
      solicitante_id         uuid NOT NULL REFERENCES usuarios (id),
      modalidade             text NOT NULL CHECK (modalidade IN ('encomenda', 'conta_e_ordem')),
      situacao               text NOT NULL DEFAULT 'solicitado'
                             CHECK (situacao IN ('solicitado', 'enviado', 'aceito', 'recusado', 'expirado', 'cancelado')),
      observacao             text,
      frete_centavos         bigint CHECK (frete_centavos >= 0),
      taxa_servico_bp        integer CHECK (taxa_servico_bp BETWEEN 0 AND 5000),
      total_centavos         bigint CHECK (total_centavos >= 0),
      condicao               text,
      prazo_entrega_dias     integer CHECK (prazo_entrega_dias > 0),
      valido_ate             date,
      respondido_por         uuid REFERENCES usuarios (id),
      respondido_em          timestamptz,
      decidido_em            timestamptz,
      criado_em              timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX orcamentos_empresa ON orcamentos (empresa_id, criado_em DESC)`.execute(db);

  await sql`
    CREATE TABLE orcamento_itens (
      id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      orcamento_id             bigint NOT NULL REFERENCES orcamentos (id),
      produto_id               bigint REFERENCES produtos (id),
      descricao                text NOT NULL,
      unidade                  text NOT NULL DEFAULT 'un',
      quantidade               integer NOT NULL CHECK (quantidade > 0),
      preco_unitario_centavos  bigint CHECK (preco_unitario_centavos >= 0)
    )`.execute(db);
  await sql`CREATE INDEX orcamento_itens_orcamento ON orcamento_itens (orcamento_id)`.execute(db);

  await sql`
    CREATE TABLE ordens_importacao (
      id               bigint GENERATED ALWAYS AS IDENTITY (START WITH 7001) PRIMARY KEY,
      empresa_id       uuid NOT NULL REFERENCES empresas (id),
      orcamento_id     bigint NOT NULL UNIQUE REFERENCES orcamentos (id),
      modalidade       text NOT NULL CHECK (modalidade IN ('encomenda', 'conta_e_ordem')),
      etapa            text NOT NULL,
      concluida        boolean NOT NULL DEFAULT false,
      cancelada        boolean NOT NULL DEFAULT false,
      criado_em        timestamptz NOT NULL DEFAULT now(),
      atualizado_em    timestamptz NOT NULL DEFAULT now()
    )`.execute(db);
  await sql`CREATE INDEX ordens_empresa ON ordens_importacao (empresa_id, criado_em DESC)`.execute(db);

  await sql`
    CREATE TABLE ordem_eventos (
      id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ordem_id    bigint NOT NULL REFERENCES ordens_importacao (id),
      etapa       text NOT NULL,
      descricao   text NOT NULL,
      usuario_id  uuid REFERENCES usuarios (id),
      criado_em   timestamptz NOT NULL DEFAULT now()
    )`.execute(db);

  // Numerário (conta e ordem): o cliente adianta o dinheiro de cada etapa antes de a Export Fácil avançar.
  await sql`
    CREATE TABLE numerarios (
      id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ordem_id                bigint NOT NULL REFERENCES ordens_importacao (id),
      etapa                   text NOT NULL CHECK (etapa IN ('cambio', 'tributos', 'despesas_finais')),
      valor_previsto_centavos bigint NOT NULL CHECK (valor_previsto_centavos > 0),
      valor_pago_centavos     bigint NOT NULL DEFAULT 0,
      situacao                text NOT NULL DEFAULT 'aguardando' CHECK (situacao IN ('aguardando', 'pago', 'cancelado')),
      criado_por              uuid NOT NULL REFERENCES usuarios (id),
      criado_em               timestamptz NOT NULL DEFAULT now(),
      pago_em                 timestamptz
    )`.execute(db);
  await sql`CREATE INDEX numerarios_ordem ON numerarios (ordem_id)`.execute(db);

  await sql`
    CREATE TABLE ordem_gastos (
      id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ordem_id        bigint NOT NULL REFERENCES ordens_importacao (id),
      etapa           text NOT NULL CHECK (etapa IN ('cambio', 'tributos', 'despesas_finais')),
      descricao       text NOT NULL,
      valor_centavos  bigint NOT NULL CHECK (valor_centavos > 0),
      registrado_por  uuid NOT NULL REFERENCES usuarios (id),
      criado_em       timestamptz NOT NULL DEFAULT now()
    )`.execute(db);

  // ---------- cobranças, parcelas e pagamentos ----------
  // Cada cobrança pertence a um pedido OU a um numerário de ordem de importação.
  await sql`
    CREATE TABLE cobrancas (
      id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      pedido_id       bigint REFERENCES pedidos (id),
      numerario_id    bigint REFERENCES numerarios (id),
      meio            text NOT NULL CHECK (meio IN ('pix', 'boleto', 'cartao')),
      valor_centavos  bigint NOT NULL CHECK (valor_centavos > 0),
      gateway         text NOT NULL,
      id_gateway      text,
      situacao        text NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente', 'paga', 'expirada', 'cancelada', 'estornada')),
      expira_em       timestamptz,
      criado_em       timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT cobrancas_um_dono CHECK ((pedido_id IS NULL) <> (numerario_id IS NULL))
    )`.execute(db);
  await sql`CREATE INDEX cobrancas_pedido ON cobrancas (pedido_id)`.execute(db);
  await sql`CREATE INDEX cobrancas_pix_pendente ON cobrancas (expira_em) WHERE situacao = 'pendente' AND meio = 'pix'`.execute(db);

  await sql`
    CREATE TABLE parcelas (
      id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      cobranca_id           bigint NOT NULL REFERENCES cobrancas (id),
      numero                integer NOT NULL CHECK (numero > 0),
      valor_centavos        bigint NOT NULL CHECK (valor_centavos > 0),
      vencimento            date NOT NULL,
      situacao              text NOT NULL DEFAULT 'aberta' CHECK (situacao IN ('aberta', 'vencida', 'paga', 'cancelada')),
      id_gateway            text UNIQUE,
      linha_digitavel       text,
      pix_copia_cola        text,
      valor_pago_centavos   bigint,
      pago_em               timestamptz,
      UNIQUE (cobranca_id, numero)
    )`.execute(db);
  await sql`CREATE INDEX parcelas_abertas ON parcelas (vencimento) WHERE situacao IN ('aberta', 'vencida')`.execute(db);

  await sql`
    CREATE TABLE pagamentos (
      id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      parcela_id           bigint NOT NULL REFERENCES parcelas (id),
      valor_centavos       bigint NOT NULL,
      pago_em              timestamptz NOT NULL,
      meio                 text NOT NULL,
      id_evento_gateway    text NOT NULL,
      criado_em            timestamptz NOT NULL DEFAULT now()
    )`.execute(db);

  // Todo aviso do gateway é guardado como chegou; o id do evento é único (aviso repetido é ignorado).
  await sql`
    CREATE TABLE eventos_webhook (
      id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      origem             text NOT NULL,
      id_evento          text NOT NULL,
      tipo               text NOT NULL,
      conteudo           jsonb NOT NULL,
      assinatura_valida  boolean NOT NULL,
      recebido_em        timestamptz NOT NULL DEFAULT now(),
      processado_em      timestamptz,
      erro               text,
      UNIQUE (origem, id_evento)
    )`.execute(db);

  // ---------- notificações e rotinas ----------
  await sql`
    CREATE TABLE notificacoes (
      id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      empresa_id     uuid REFERENCES empresas (id),
      destinatario   text NOT NULL,
      canal          text NOT NULL CHECK (canal IN ('email', 'whatsapp')),
      modelo         text NOT NULL,
      chave          text NOT NULL UNIQUE,
      dados          jsonb NOT NULL DEFAULT '{}'::jsonb,
      situacao       text NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente', 'enviada', 'falhou')),
      criado_em      timestamptz NOT NULL DEFAULT now(),
      enviado_em     timestamptz
    )`.execute(db);

  await sql`
    CREATE TABLE rotinas_execucoes (
      nome         text NOT NULL,
      referencia   text NOT NULL,
      iniciado_em  timestamptz NOT NULL DEFAULT now(),
      concluido_em timestamptz,
      resultado    jsonb,
      PRIMARY KEY (nome, referencia)
    )`.execute(db);

  for (const tabela of [
    'politicas_pagamento', 'cadastros_credito', 'limites_credito', 'documentos', 'pedidos', 'pedido_itens', 'pedido_eventos',
    'orcamentos', 'orcamento_itens', 'ordens_importacao', 'ordem_eventos', 'numerarios', 'ordem_gastos',
    'cobrancas', 'parcelas', 'pagamentos', 'eventos_webhook', 'notificacoes',
  ]) {
    await sql`CREATE TRIGGER ${sql.raw(`${tabela}_sem_exclusao`)} BEFORE DELETE ON ${sql.table(tabela)}
      FOR EACH ROW EXECUTE FUNCTION impedir_exclusao()`.execute(db);
  }
  for (const tabela of ['cadastros_credito', 'pedidos', 'ordens_importacao']) {
    await sql`CREATE TRIGGER ${sql.raw(`${tabela}_atualizado_em`)} BEFORE UPDATE ON ${sql.table(tabela)}
      FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em()`.execute(db);
  }
  // Políticas e limites são histórico: não se alteram, só se acrescentam.
  for (const tabela of ['politicas_pagamento', 'limites_credito', 'pagamentos']) {
    await sql`CREATE TRIGGER ${sql.raw(`${tabela}_sem_alteracao`)} BEFORE UPDATE ON ${sql.table(tabela)}
      FOR EACH ROW EXECUTE FUNCTION impedir_exclusao()`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const tabela of [
    'rotinas_execucoes', 'notificacoes', 'eventos_webhook', 'pagamentos', 'parcelas', 'cobrancas', 'ordem_gastos', 'numerarios',
    'ordem_eventos', 'ordens_importacao', 'orcamento_itens', 'orcamentos', 'pedido_eventos', 'pedido_itens', 'pedidos',
    'documentos', 'limites_credito', 'cadastros_credito', 'politicas_pagamento',
  ]) {
    await sql`DROP TABLE IF EXISTS ${sql.table(tabela)} CASCADE`.execute(db);
  }
  await sql`ALTER TABLE empresas DROP COLUMN IF EXISTS conta_e_ordem_liberada`.execute(db);
}
