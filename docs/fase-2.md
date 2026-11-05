# Fase 2: situação

O que foi construído sem depender de contratos, e o que falta para vender com dinheiro real.

## Feito

| Item | Onde está | Como foi conferido |
| --- | --- | --- |
| **Site em Next.js ligado à API**: loja, carrinho, checkout, pedidos, financeiro, crédito, orçamentos, ordens, usuários e Painel da equipe | `frontend/` | Build, tipos e dois fluxos completos no Chrome (computador e celular) |
| **App instalável (PWA)**: ícone na tela inicial, abre em tela cheia | `frontend/public/manifest.webmanifest`, `sw.js` | — |
| **Login**: Cognito com código + PKCE (clientes e equipe separados); no ambiente local, usuários de demonstração | `frontend/src/lib/auth.ts` | Fluxo no navegador (modo local) |
| **Crédito**: documentos por tipo de cliente, faixas A/B/C, teto de 10% do faturamento, alçada de R$ 100 mil para o financeiro, revisão periódica | `backend/src/credito` | Testes de API e fluxo no navegador |
| **Pedido**: preço congelado, pedido mínimo, múltiplo de venda, estoque reservado | `backend/src/pedidos` | Testes de API e fluxo no navegador |
| **Pagamentos**: Pix 3% e 24 h, boleto 30/60/90/120 emitido no faturamento, cartão até 12× (juros a partir de 11×), webhook assinado e sem duplicidade, baixa só pelo banco, bloqueio após 3 dias de atraso | `backend/src/pagamentos` | Testes de API e fluxo no navegador |
| **Régua de cobrança**: lembrete, vencimento, atraso, aviso de negativação (30 dias) e de protesto (45) | `backend/src/rotinas` | Testes de API |
| **Orçamentos e ordens de importação**: encomenda e conta e ordem, numerário por etapa com bloqueio de câmbio e DUIMP, prestação de contas | `backend/src/importacao` | Testes de API e fluxo no navegador |
| **Conta e ordem só para cliente grande**: pedidos mensais a partir de R$ 400.000,00 e crédito na faixa A (o administrador pode liberar fora da regra, com motivo) | `backend/src/credito` + Painel › Condições | Testes de API |
| **Condições de pagamento versionadas**, editáveis só pelo administrador | Painel › Condições | Testes de API |
| **Worker** (fila de eventos e rotinas) e a infraestrutura dele | `backend/src/worker.ts`, `infra/modulos/plataforma/worker.tf` | Rodado localmente |
| **Sentry** na API, no worker e no site (liga quando houver o DSN) | `backend/src/observabilidade.ts` | — |

Total de testes da API: 82 (56 de ponta a ponta contra PostgreSQL).

## Simulado até haver contrato

| Item | Hoje | Para ficar real |
| --- | --- | --- |
| **Gateway de pagamento** | Simulador em dev e homologação; **desligado em produção** (Pix e cartão indisponíveis lá; o boleto espera o faturamento) | Chaves do Asaas (a conta de sandbox é gratuita); então troco o simulador pela integração |
| **Cartão** | Token de teste | Formulário seguro do Asaas no checkout |
| **NF-e no faturamento** | O faturamento emite os boletos; a nota fica para o ERP | Contrato com o Omie e certificado A1 (fase 3) |
| **Envio dos avisos da régua** | Registrados e listados no Painel › Recebíveis | Amazon SES (e-mail) e API do WhatsApp |
| **Consulta de crédito** | Análise manual com os documentos | Contrato com Serasa ou Boa Vista |

## Escolhas que diferem do documento de arquitetura

- **Agendador:** as rotinas rodam dentro do worker, com trava no banco para não rodarem em dobro, em vez de um EventBridge Scheduler separado. Isso dá menos peças para manter, com o mesmo efeito.
- **Cobrança da taxa de serviço** da conta e ordem e **faturamento da encomenda**: aparecem na proposta, mas a cobrança entra com o faturamento no ERP (fase 3).
- **Limite de 20% do total a receber num só cliente**: não é verificado automaticamente; o financeiro avalia na análise.

## Como testar agora

Localmente, siga `backend/README.md` (banco, API e dados de demonstração) e rode o site com `cd frontend && npm ci && npm run dev`. Ele abre em http://localhost:3001 com usuários de demonstração, sem senha.

Na AWS, depois de criar os ambientes (`infra/README.md`), cada commit no `main` publica o site e a API em homologação. O protótipo antigo continua em `/prototipo/`.
