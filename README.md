# ImportFácil — Protótipo da Loja B2B

Protótipo navegável da plataforma ImportFácil: loja B2B para clientes empresariais, orçamentos, ordens de importação, financeiro e Painel da equipe.

É uma página única (`index.html`), sem dependências nem instalação. Todos os dados ficam no navegador (`localStorage`). O objetivo é validar telas e regras de negócio e servir de especificação para o desenvolvimento do sistema real.

## Como abrir

- **No computador:** baixe o repositório e abra `index.html` no navegador.
- **Online (GitHub Pages):** em *Settings → Pages*, escolha a branch `main` e a pasta `/ (root)`. A página fica em `https://importfacil.github.io/Prot-tipo-IF/`.

## O que o protótipo cobre

**Loja do cliente**
- Início, categorias, produto, busca e favoritos
- Preços e pedido mínimo por tipo de cliente (cooperativa, distribuidora, revendedor, construtora, hospital privado)
- Carrinho e fechamento de pedido
- Pagamento: Pix à vista com desconto, boleto parcelado 30/60/90/120 dias, cartão de crédito em até 12×
- Bloqueio do boleto quando o cadastro não foi aprovado, há parcela em atraso ou o pedido passa do limite de crédito
- Pedidos, recompra e nota fiscal
- Orçamentos e ordens de importação, com modalidade encomenda ou conta e ordem
- Cadastro da empresa e documentos para análise de crédito
- Financeiro: parcelas em aberto, linha digitável e Pix (a baixa vem do "banco")

**Painel da equipe**
- Crédito: analisar cadastro, definir limite, aprovar, pedir documentos ou reprovar
- Pedidos: avançar status de pedidos e ordens de importação
- Recebíveis: boletos a receber, atrasos, vendas no cartão e régua de cobrança
- Condições: desconto do Pix, parcelas do boleto e do cartão, multa e juros

## O que é simulado

Depende do backend: login real, emissão de boletos e Pix pelo gateway, confirmação de pagamento por webhook, consulta de crédito em bureau, emissão de NF-e e busca de CEP. No protótipo, botões "Simular" fazem esse papel.

## Arquitetura do sistema real

A arquitetura proposta (AWS São Paulo, API em NestJS, PostgreSQL, gateway de pagamento, ERP para NF-e, política de crédito e fases de entrega) está no documento **Arquitetura ImportFácil**.

## Próximos passos

1. Fase 1 — Base: infraestrutura, login, empresas, catálogo e preços por tipo de cliente
2. Fase 2 — Venda e pagamento: pedido, Pix, boleto, cartão, webhooks e crédito
3. Fase 3 — Fiscal e operação: NF-e, régua de cobrança, conciliação, orçamentos e ordens
4. Fase 4 — Importação a fundo: custos com câmbio, conta e ordem com numerário, Siscomex
