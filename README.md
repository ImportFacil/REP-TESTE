# ImportFácil

Plataforma B2B da ImportFácil: loja para clientes empresariais, crédito, pedidos, pagamentos e app para celular.

**▶ Protótipo navegável: https://importfacil.github.io/REP-TESTE/**
**▶ Loja Bagisto (resultado dos testes e capturas): https://importfacil.github.io/REP-TESTE/bagisto/resultado/**

## O que tem neste repositório

| Pasta | Conteúdo |
| --- | --- |
| `bagisto/` | **A loja**: Bagisto 2.5 + B2B Suite, com as regras da ImportFácil em PHP (tipos de cliente, pedido mínimo, múltiplo de venda, crédito por faixa, Pix, boleto pelo crédito, cartão, parcelas, Financeiro) e o app instalável. Veja [`bagisto/README.md`](bagisto/README.md) |
| `.devcontainer/bagisto/` | Configuração para abrir a loja no GitHub Codespaces |
| `index.html` | Protótipo de todas as telas, incluindo as que ainda não foram para o Bagisto (importação, calculadora, NCM, Painel da equipe) |
| `.github/workflows/bagisto.yml` | Monta a loja, testa as regras, tira as capturas e publica a imagem |
| `.github/workflows/ncm.yml` | Atualiza a tabela NCM do protótipo toda semana |
| `docs/` | Guia da conta AWS e marca |

O servidor anterior (NestJS + PostgreSQL), a loja Next.js e o Terraform da AWS ficaram guardados no ramo
[`legado-node`](https://github.com/ImportFacil/REP-TESTE/tree/legado-node).

## Abrir a loja e o app

- **Codespaces:** [abrir a loja](https://codespaces.new/ImportFacil/REP-TESTE?devcontainer_path=.devcontainer%2Fbagisto%2Fdevcontainer.json). A primeira vez leva de 10 a 20 minutos.
- **App no celular:** com a loja aberta, acesse `/app` e leia o QR. O endereço vale enquanto o Codespace estiver ligado.
- **Docker no computador:** `cd bagisto && docker compose up --build`, depois http://localhost:8000.

## Próximas fases

1. **Importação no Bagisto:** sob encomenda, conta e ordem, ordens de importação, calculadora e NCM.
2. **Pagamentos reais** pelo Asaas (Pix, boleto e cartão), com baixa das parcelas.
3. **Painel da equipe:** decisão de crédito e faixa, e recebíveis.
4. **NF-e** pelo ERP.
5. **Homologação na AWS** com endereço fixo (depois que a conta for criada).
