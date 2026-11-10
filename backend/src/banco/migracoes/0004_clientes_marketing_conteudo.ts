import { Kysely, sql } from 'kysely';

/**
 * Painel no formato do Bagisto, entrega 3: clientes (avaliações de produtos), marketing (promoções e cupons,
 * newsletter, modelos de e-mail) e conteúdo (páginas da loja).
 *
 * Regras de sempre: dinheiro em centavos, percentuais em pontos-base; nada é apagado (promoção, página e
 * inscrição se desativam).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // ---------- avaliações de produtos (cliente escreve, equipe modera) ----------
  await sql`
    CREATE TABLE avaliacoes (
      id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      produto_id        bigint NOT NULL REFERENCES produtos (id),
      empresa_id        uuid NOT NULL REFERENCES empresas (id),
      usuario_id        uuid NOT NULL REFERENCES usuarios (id),
      nota              smallint NOT NULL CHECK (nota BETWEEN 1 AND 5),
      titulo            text NOT NULL,
      comentario        text NOT NULL,
      compra_verificada boolean NOT NULL DEFAULT false,
      situacao          text NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente', 'aprovada', 'recusada')),
      motivo_recusa     text,
      moderada_por      uuid REFERENCES usuarios (id),
      moderada_em       timestamptz,
      criado_em         timestamptz NOT NULL DEFAULT now(),
      UNIQUE (produto_id, usuario_id)
    )`.execute(db);
  await sql`CREATE INDEX avaliacoes_produto ON avaliacoes (produto_id) WHERE situacao = 'aprovada'`.execute(db);

  // ---------- promoções (regras de carrinho do Bagisto), com ou sem cupom ----------
  await sql`
    CREATE TABLE promocoes (
      id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      nome                    text NOT NULL,
      descricao               text,
      cupom                   text UNIQUE CHECK (cupom IS NULL OR cupom ~ '^[A-Z0-9_-]{3,30}$'),
      tipo_desconto           text NOT NULL CHECK (tipo_desconto IN ('percentual', 'valor_fixo')),
      desconto_bp             integer CHECK (desconto_bp BETWEEN 1 AND 9000),
      desconto_centavos       bigint CHECK (desconto_centavos > 0),
      tipos_cliente           text[],
      categorias              text[],
      subtotal_minimo_centavos bigint NOT NULL DEFAULT 0 CHECK (subtotal_minimo_centavos >= 0),
      inicio                  date,
      fim                     date,
      limite_usos             integer CHECK (limite_usos > 0),
      limite_por_empresa      integer CHECK (limite_por_empresa > 0),
      ativo                   boolean NOT NULL DEFAULT true,
      criado_em               timestamptz NOT NULL DEFAULT now(),
      atualizado_em           timestamptz NOT NULL DEFAULT now(),
      CHECK ((tipo_desconto = 'percentual' AND desconto_bp IS NOT NULL) OR (tipo_desconto = 'valor_fixo' AND desconto_centavos IS NOT NULL)),
      CHECK (fim IS NULL OR inicio IS NULL OR fim >= inicio)
    )`.execute(db);
  await sql`
    ALTER TABLE pedidos
      ADD COLUMN promocao_id bigint REFERENCES promocoes (id),
      ADD COLUMN cupom text,
      ADD COLUMN promocao_centavos bigint NOT NULL DEFAULT 0 CHECK (promocao_centavos >= 0)`.execute(db);
  await sql`CREATE INDEX pedidos_promocao ON pedidos (promocao_id) WHERE promocao_id IS NOT NULL`.execute(db);

  // ---------- newsletter ----------
  await sql`
    CREATE TABLE newsletter_inscritos (
      id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      email         text NOT NULL UNIQUE CHECK (email = lower(email)),
      nome          text,
      empresa_id    uuid REFERENCES empresas (id),
      origem        text NOT NULL DEFAULT 'loja' CHECK (origem IN ('loja', 'painel', 'cadastro')),
      token         uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
      ativo         boolean NOT NULL DEFAULT true,
      inscrito_em   timestamptz NOT NULL DEFAULT now(),
      cancelado_em  timestamptz
    )`.execute(db);

  // ---------- modelos de e-mail (os avisos que o sistema manda) ----------
  await sql`
    CREATE TABLE modelos_email (
      codigo         text PRIMARY KEY,
      nome           text NOT NULL,
      descricao      text NOT NULL,
      assunto        text NOT NULL,
      corpo          text NOT NULL,
      variaveis      text[] NOT NULL DEFAULT '{}',
      ativo          boolean NOT NULL DEFAULT true,
      atualizado_em  timestamptz NOT NULL DEFAULT now(),
      atualizado_por uuid REFERENCES usuarios (id)
    )`.execute(db);
  for (const [codigo, nome, descricao, assunto, corpo, variaveis] of MODELOS) {
    await sql`INSERT INTO modelos_email (codigo, nome, descricao, assunto, corpo, variaveis)
      VALUES (${codigo}, ${nome}, ${descricao}, ${assunto}, ${corpo}, ${variaveis}::text[])`.execute(db);
  }

  // ---------- páginas de conteúdo (sobre, políticas, perguntas frequentes) ----------
  await sql`
    CREATE TABLE paginas (
      id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      slug            text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
      titulo          text NOT NULL,
      resumo          text,
      conteudo        text NOT NULL,
      publicada       boolean NOT NULL DEFAULT true,
      no_rodape       boolean NOT NULL DEFAULT true,
      ordem           integer NOT NULL DEFAULT 0,
      criado_em       timestamptz NOT NULL DEFAULT now(),
      atualizado_em   timestamptz NOT NULL DEFAULT now(),
      atualizado_por  uuid REFERENCES usuarios (id)
    )`.execute(db);
  let ordem = 0;
  for (const [slug, titulo, resumo, conteudo] of PAGINAS) {
    await sql`INSERT INTO paginas (slug, titulo, resumo, conteudo, ordem) VALUES (${slug}, ${titulo}, ${resumo}, ${conteudo}, ${(ordem += 10)})`.execute(db);
  }

  for (const tabela of ['avaliacoes', 'promocoes', 'newsletter_inscritos', 'modelos_email', 'paginas']) {
    await sql`CREATE TRIGGER ${sql.raw(`${tabela}_sem_exclusao`)} BEFORE DELETE ON ${sql.table(tabela)}
      FOR EACH ROW EXECUTE FUNCTION impedir_exclusao()`.execute(db);
  }
  for (const tabela of ['promocoes', 'modelos_email', 'paginas']) {
    await sql`CREATE TRIGGER ${sql.raw(`${tabela}_atualizado_em`)} BEFORE UPDATE ON ${sql.table(tabela)}
      FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em()`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE pedidos DROP COLUMN IF EXISTS promocao_centavos, DROP COLUMN IF EXISTS cupom, DROP COLUMN IF EXISTS promocao_id`.execute(db);
  for (const tabela of ['paginas', 'modelos_email', 'newsletter_inscritos', 'promocoes', 'avaliacoes']) {
    await sql`DROP TABLE IF EXISTS ${sql.table(tabela)} CASCADE`.execute(db);
  }
}

const COBRANCA = ['empresa', 'pedido', 'parcela', 'valor', 'vencimento', 'dias'];

/** [código, nome, descrição, assunto, corpo, variáveis]. O corpo usa {{variavel}}. */
const MODELOS: Array<[string, string, string, string, string, string[]]> = [
  ['lembrete_vencimento', 'Lembrete de vencimento', 'Régua de cobrança: até 3 dias antes do vencimento do boleto.',
    'Seu boleto do pedido {{pedido}} vence em {{vencimento}}',
    'Olá, {{empresa}}.\n\nA parcela {{parcela}} do pedido {{pedido}}, no valor de {{valor}}, vence em {{vencimento}}.\n\nSe já pagou, desconsidere esta mensagem.\n\nEquipe ImportFácil', COBRANCA],
  ['vence_hoje', 'Vence hoje', 'Régua de cobrança: no dia do vencimento.',
    'Hoje vence a parcela {{parcela}} do pedido {{pedido}}',
    'Olá, {{empresa}}.\n\nA parcela {{parcela}} do pedido {{pedido}}, de {{valor}}, vence hoje ({{vencimento}}).\n\nO boleto e a linha digitável estão em Financeiro, na sua área da loja.\n\nEquipe ImportFácil', COBRANCA],
  ['parcela_em_atraso', 'Parcela em atraso', 'Régua de cobrança: a partir de 1 dia de atraso. Novos pedidos no boleto ficam bloqueados.',
    'Parcela em atraso: pedido {{pedido}}',
    'Olá, {{empresa}}.\n\nNão identificamos o pagamento da parcela {{parcela}} do pedido {{pedido}}, de {{valor}}, vencida em {{vencimento}} ({{dias}} dia(s) de atraso).\n\nEnquanto houver parcela em atraso, novos pedidos no boleto ficam bloqueados. Pix e cartão continuam disponíveis.\n\nEquipe ImportFácil', COBRANCA],
  ['aviso_negativacao', 'Aviso de negativação', 'Régua de cobrança: a partir de 30 dias de atraso.',
    'Aviso de negativação: pedido {{pedido}}',
    'Olá, {{empresa}}.\n\nA parcela {{parcela}} do pedido {{pedido}}, de {{valor}}, está com {{dias}} dias de atraso.\n\nSem o pagamento, o débito poderá ser registrado nos órgãos de proteção ao crédito, conforme o contrato.\n\nEquipe ImportFácil', COBRANCA],
  ['aviso_protesto', 'Aviso de protesto', 'Régua de cobrança: a partir de 45 dias de atraso.',
    'Aviso de protesto: pedido {{pedido}}',
    'Olá, {{empresa}}.\n\nA parcela {{parcela}} do pedido {{pedido}}, de {{valor}}, está com {{dias}} dias de atraso e poderá ser levada a protesto em cartório.\n\nFale com o financeiro da ImportFácil para negociar.\n\nEquipe ImportFácil', COBRANCA],
  ['pedido_enviado', 'Pedido enviado', 'Quando a equipe registra o envio do pedido, para quem comprou.',
    'Pedido {{pedido}} enviado por {{transportadora}}',
    'Olá, {{nome}}.\n\nO pedido {{pedido}} da {{empresa}} saiu para entrega com a {{transportadora}}.\n\nCódigo de rastreio: {{rastreio}}\nVolumes: {{volumes}}\n\nEquipe ImportFácil', ['nome', 'empresa', 'pedido', 'transportadora', 'rastreio', 'volumes']],
  ['newsletter_boas_vindas', 'Boas-vindas da newsletter', 'Quando alguém se inscreve na newsletter.',
    'Você agora recebe as novidades da ImportFácil',
    'Olá!\n\nObrigado por se inscrever. Você vai receber lançamentos, promoções e chegadas de importação.\n\nPara sair da lista: {{link_sair}}\n\nEquipe ImportFácil', ['link_sair']],
];

/** [slug, título, resumo, conteúdo]. O conteúdo usa um Markdown simples: ## título, parágrafos, listas com "-", **negrito** e [link](endereço). */
const PAGINAS: Array<[string, string, string, string]> = [
  ['sobre', 'Sobre a ImportFácil', 'Quem somos e como trabalhamos com empresas.',
    `A ImportFácil vende para empresas: cooperativas, distribuidoras, revendas, construtoras e hospitais. Cada tipo de cliente tem o seu catálogo, a sua tabela de preços e o seu pedido mínimo.

## O que fazemos
- Venda em atacado de produtos a pronta entrega, com preço da tabela do seu tipo de cliente.
- Importação sob encomenda: você pede um orçamento, aprova a proposta e acompanha a ordem até a entrega.
- Venda a prazo no boleto para empresas com crédito aprovado, além de Pix com desconto e cartão.

## Como comprar
Peça o acesso da sua empresa, faça o cadastro de crédito se quiser comprar no boleto e monte o pedido pela loja. As notas fiscais, os boletos e o rastreio ficam na sua área.`],
  ['entrega-e-frete', 'Entrega e frete', 'Prazos, transportadoras e rastreio.',
    `## Prazos
Pedidos pagos no Pix ou no cartão entram em separação no mesmo dia útil. Pedidos no boleto são separados depois do faturamento.

## Transportadoras
Trabalhamos com Jadlog, TNT, Braspress, Patrus e Correios. A transportadora é escolhida pelo peso, pelo volume e pelo destino.

## Rastreio
Quando o pedido sai, você recebe um e-mail com o código de rastreio. O código também aparece no pedido, na sua área da loja.`],
  ['trocas-e-devolucoes', 'Trocas e devoluções', 'Avarias, divergências e devolução de valores.',
    `## Avaria ou divergência
Confira a carga no recebimento. Se houver avaria ou item faltando, anote no comprovante da transportadora e avise a ImportFácil em até 7 dias.

## Como devolvemos o valor
- Pix: devolução por Pix para a conta da empresa.
- Cartão: estorno na fatura.
- Boleto: abatimento nas parcelas em aberto.

Itens devolvidos voltam ao estoque depois da conferência.`],
  ['pagamentos-e-credito', 'Pagamentos e crédito', 'Pix, boleto a prazo e cartão.',
    `## Formas de pagamento
- **Pix à vista**, com desconto. O código vale por algumas horas e o pedido é liberado quando o banco confirma.
- **Boleto a prazo**, para empresas com crédito aprovado, em até 4 parcelas (30, 60, 90 e 120 dias a partir do faturamento).
- **Cartão de crédito**, com parcelas sem juros até o limite da política vigente.

## Crédito
O limite é analisado a partir do cadastro da empresa e dos documentos enviados. Com parcela em atraso, novos pedidos no boleto ficam bloqueados até a regularização.`],
  ['politica-de-privacidade', 'Política de privacidade', 'Como tratamos os dados pessoais (LGPD).',
    `Esta política explica como a ImportFácil trata dados pessoais, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).

## Quais dados tratamos
Nome, e-mail e telefone dos usuários das empresas clientes, dados da empresa (CNPJ, endereço) e os documentos enviados para a análise de crédito.

## Para quê
Para identificar quem compra, entregar os pedidos, emitir notas e cobranças, analisar crédito e mandar avisos sobre os pedidos. A newsletter é opcional e pode ser cancelada a qualquer momento.

## Seus direitos
Você pode pedir acesso, correção ou exclusão dos seus dados pessoais, respeitados os prazos legais de guarda de documentos fiscais e financeiros.`],
  ['perguntas-frequentes', 'Perguntas frequentes', 'Dúvidas mais comuns sobre pedidos e importação.',
    `## Por que vejo preços diferentes de outra empresa?
Cada tipo de cliente tem a sua tabela, com desconto sobre o preço de tabela.

## O que é o múltiplo de venda?
Alguns produtos são vendidos em caixas ou fardos. A quantidade precisa ser múltipla desse número.

## Como funciona a importação sob encomenda?
Você pede um orçamento, a equipe responde com a proposta (prazo, câmbio e condição). Aprovada a proposta, a ordem de importação acompanha cada etapa até a entrega.

## Posso usar um cupom?
Sim. Informe o cupom no carrinho; o desconto aparece antes de fechar o pedido.`],
];
