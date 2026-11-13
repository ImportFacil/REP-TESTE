# ImportFácil

Plataforma B2B da ImportFácil: loja para clientes empresariais, crédito, pedidos, pagamentos, importação,
Painel da equipe e app para celular.

**▶ Protótipo no ar (endereço fixo, leva ao link atual do Codespace): https://importfacil.github.io/REP-TESTE/app/abrir/**
**▶ App da loja no celular (QR code): https://importfacil.github.io/REP-TESTE/app/**

## O que tem neste repositório

| Pasta | Conteúdo |
| --- | --- |
| `backend/` | API em NestJS + PostgreSQL: contas e papéis, catálogo e preços por tipo de cliente, crédito (faixas A/B/C), pedidos, pagamentos, importação (orçamentos, ordens, numerário), auditoria e rotinas. Veja [`backend/README.md`](backend/README.md) |
| `frontend/` | Site em Next.js: a loja (`/loja`), o Painel da equipe (`/painel`) e a página do app (`/app`). Instalável no celular |
| `demo/` | Demonstração num endereço só: banco + API servindo o site, com login de demonstração sem senha |
| `.devcontainer/importfacil/` | Abre a demonstração no GitHub Codespaces |
| `infra/` | Terraform da AWS (homologação e produção) |
| `app/` | Páginas fixas no GitHub Pages: o QR code do app (`app/`) e o endereço fixo do protótipo (`app/abrir/`) |
| `.github/workflows/` | `entrega.yml` (testes e deploy na AWS), `demo.yml` (demonstração com capturas), `ncm.yml` (tabela NCM semanal) |

A loja feita no Bagisto ficou guardada no ramo [`bagisto`](https://github.com/ImportFacil/REP-TESTE/tree/bagisto).
Ela serve de referência para o que está sendo trazido para cá, como o formato do Painel.

## Abrir a demonstração

- **Codespaces:** [abrir a demonstração](https://codespaces.new/ImportFacil/REP-TESTE?devcontainer_path=.devcontainer%2Fimportfacil%2Fdevcontainer.json). Quando estiver no ar, leia o QR em https://importfacil.github.io/REP-TESTE/app/ com o celular. A cada início, o Codespace baixa a versão mais nova sozinho.
- **Docker no computador:** `cd demo && docker compose up --build`, depois http://localhost:8000.
- **Entrar:** em `/entrar`, escolha uma das 5 empresas de demonstração ou "Equipe ImportFácil (administrador)". Não precisa de senha.

## O que já está pronto

1. **Painel no formato do Bagisto** (4 entregas):
   - painel de controle com gráfico e pendências;
   - vendas: pedidos, notas fiscais com valor aproximado dos tributos, envios, reembolsos, transações e cotações de preço;
   - catálogo: produtos, categorias, atributos e famílias;
   - clientes: empresas, usuários, grupos, avaliações e crédito;
   - marketing: promoções e cupons, newsletter, modelos de e-mail e caixa de saída;
   - conteúdo: páginas da loja;
   - relatórios: vendas, produtos e clientes;
   - configurações: equipe, papéis e permissões (lidos das rotas), impostos, locais de estoque, câmbio, importação de produtos por planilha e auditoria;
   - todas as listas com filtros, exportação e ações em lote.
2. **Loja:** filtros por atributo, ordenação, favoritos, comparação, avaliações, endereços de entrega, pedido rápido por código, listas de compra, cupom no carrinho e páginas abertas com newsletter.
3. **B2B:** limite de compra por comprador com aprovação, cotações de preço negociado e número da ordem de compra no pedido.

## Próximas fases

Dependem de contas e credenciais que só a ImportFácil pode criar:

1. **Pagamentos reais pelo Asaas:** conta no Asaas (sandbox e produção) e a chave de API, guardada como segredo do GitHub/AWS. O sistema já fala com um gateway simulado pela mesma interface.
2. **NF-e:** certificado digital A1 da empresa e um emissor (o ERP ou um serviço de NF-e). As notas de hoje são numeradas aqui, com chave simulada.
3. **E-mails de verdade:** Amazon SES com o domínio verificado. Até lá os avisos ficam na Caixa de saída do Painel.
4. **Homologação na AWS:** conta AWS criada pela ImportFácil; os workflows de entrega já estão prontos e esperam as credenciais.
