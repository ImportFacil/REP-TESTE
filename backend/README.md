# API ImportFácil

NestJS (TypeScript) + PostgreSQL, com consultas pelo [Kysely](https://kysely.dev) e migrações versionadas.

## Módulos da fase 1

| Módulo | O que faz | Rotas |
| --- | --- | --- |
| Contas e acesso | Empresas (CNPJ numérico ou alfanumérico), usuários e papéis | `GET /eu`, `/empresa/*`, `/equipe/empresas/*`, `/equipe/usuarios/*` |
| Catálogo e preços | Categorias por tipo de cliente, produtos, desconto e pedido mínimo por tipo, cotação | `/catalogo/*`, `/equipe/tabelas-preco/*`, `/equipe/produtos/*` |
| Auditoria | Quem fez o quê e quando, com antes e depois, em cadastros, usuários e preços | `GET /equipe/auditoria` |
| Saúde | Usado pelo balanceador e pelos alarmes | `GET /saude` |

A documentação interativa das rotas fica em `/docs` (desligada em produção).

## Regras de segurança

- **Login:** Cognito, com um grupo de usuários para clientes e outro para a equipe. A API confere de qual grupo veio o token, então uma conta de cliente nunca abre o Painel da equipe.
- **Papéis:** clientes são `comprador` ou `aprovador`; a equipe é `comercial`, `financeiro` ou `administrador`. Só o administrador gerencia a equipe e lê a auditoria; só comercial e administrador mudam preços e cadastros.
- **Isolamento:** as rotas de cliente usam sempre a empresa do usuário logado, nunca um id vindo da requisição.
- **Dinheiro em centavos**, como inteiro. Descontos em pontos-base (1800 = 18%).
- **Nada é apagado:** um gatilho no banco bloqueia `DELETE`. Produtos, usuários e empresas são inativados. A auditoria também não pode ser alterada.

## Rodar localmente

Requer Node 22 e Docker (ou um PostgreSQL 16 próprio).

```bash
cd backend
docker compose up -d
cp .env.exemplo .env && export $(grep -v '^#' .env | xargs)
npm ci
npm run build
npm run migrar
npm run semear -- --demonstracao      # tipos de cliente, catálogo do protótipo e 5 empresas de exemplo
npm start                              # http://localhost:3000/docs
```

Para chamar a API como um cliente ou como a equipe, gere um token de desenvolvimento:

```bash
npm run token-dev -- compras@coop-demo.com.br cliente
npm run token-dev -- admin@importfacil.dev equipe
```

## Testes

```bash
npm test            # regras de preço, CNPJ e configuração
npm run test:api    # 28 cenários de ponta a ponta contra um PostgreSQL de verdade (TESTE_DATABASE_URL)
npm run lint && npm run typecheck
```

## Nova migração

Crie `src/banco/migracoes/NNNN_descricao.ts` com `up` e `down` e registre em `src/banco/migracoes/index.ts`. Migrações já aplicadas nunca são editadas. No deploy, elas rodam sozinhas antes da nova versão entrar no ar.
