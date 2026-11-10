# ImportFácil

Plataforma B2B da ImportFácil: loja para clientes empresariais, crédito, pedidos, pagamentos e app para celular.

**▶ Protótipo navegável: https://importfacil.github.io/REP-TESTE/**
**▶ Loja Bagisto (resultado dos testes e capturas): https://importfacil.github.io/REP-TESTE/bagisto/resultado/**

## O que tem neste repositório

| Pasta | Conteúdo |
| --- | --- |
| `bagisto/` | **A loja**: Bagisto 2.5 + B2B Suite, com as regras da ImportFácil em PHP (tipos de cliente, pedido mínimo, múltiplo de venda, crédito por faixa, Pix, boleto pelo crédito, cartão, parcelas, Financeiro, importação sob encomenda e por conta e ordem, calculadora e NCM) e o app instalável. Veja [`bagisto/README.md`](bagisto/README.md) |
| `.devcontainer/bagisto/` | Configuração para abrir a loja no GitHub Codespaces |
| `index.html` | Protótipo de todas as telas, incluindo as que ainda não foram para o Bagisto (decisão de crédito e recebíveis do Painel da equipe). Também abre dentro do app da loja, em `/prototipo` (cópia em `bagisto/prototipo/`, mantida pelo workflow "Protótipo na loja") |
| `.github/workflows/bagisto.yml` | Monta a loja, testa as regras, tira as capturas e publica a imagem |
| `.github/workflows/ncm.yml` | Atualiza a tabela NCM do protótipo e da loja toda semana |
| `docs/` | Guia da conta AWS e marca |

O servidor anterior (NestJS + PostgreSQL), a loja Next.js e o Terraform da AWS ficaram guardados no ramo
[`legado-node`](https://github.com/ImportFacil/REP-TESTE/tree/legado-node).

## Abrir a loja e o app

- **Codespaces:** [abrir a loja](https://codespaces.new/ImportFacil/REP-TESTE?devcontainer_path=.devcontainer%2Fbagisto%2Fdevcontainer.json). A primeira vez leva de 10 a 20 minutos.
- **Todas as páginas:** no app, o botão **☰ Todas as páginas** (ou `/paginas`) lista a loja, a área da empresa, o Painel da equipe e as telas do protótipo.
- **App no celular:** leia o QR code em **https://importfacil.github.io/REP-TESTE/app/**. Esse endereço é fixo: quando o Codespace da loja está ligado, ele leva o celular até a loja para instalar o app; quando está desligado, avisa e oferece o app do protótipo.
- **Docker no computador:** `cd bagisto && docker compose up --build`, depois http://localhost:8000.

## Próximas fases

1. **Pagamentos reais** pelo Asaas (Pix, boleto, cartão e numerário), com baixa automática.
2. **Painel da equipe:** decisão de crédito e faixa, e recebíveis.
3. **NF-e** pelo ERP.
4. **Homologação na AWS** com endereço fixo (depois que a conta for criada).
