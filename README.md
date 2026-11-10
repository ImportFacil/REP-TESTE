# ImportFácil

Plataforma B2B da ImportFácil: loja para clientes empresariais, crédito, pedidos, pagamentos, importação,
Painel da equipe e app para celular.

**▶ Protótipo navegável (24 telas, simulação): https://importfacil.github.io/REP-TESTE/**
**▶ App da loja no celular (QR code): https://importfacil.github.io/REP-TESTE/app/**

## O que tem neste repositório

| Pasta | Conteúdo |
| --- | --- |
| `backend/` | API em NestJS + PostgreSQL: contas e papéis, catálogo e preços por tipo de cliente, crédito (faixas A/B/C), pedidos, pagamentos, importação (orçamentos, ordens, numerário), auditoria e rotinas. Veja [`backend/README.md`](backend/README.md) |
| `frontend/` | Site em Next.js: a loja (`/loja`), o Painel da equipe (`/painel`) e a página do app (`/app`). Instalável no celular |
| `demo/` | Demonstração num endereço só: banco + API servindo o site, com login de demonstração sem senha |
| `.devcontainer/importfacil/` | Abre a demonstração no GitHub Codespaces |
| `infra/` | Terraform da AWS (homologação e produção) |
| `index.html` | Protótipo de todas as telas |
| `.github/workflows/` | `entrega.yml` (testes e deploy na AWS), `demo.yml` (demonstração com capturas), `ncm.yml` (tabela NCM semanal) |

A loja feita no Bagisto ficou guardada no ramo [`bagisto`](https://github.com/ImportFacil/REP-TESTE/tree/bagisto).
Ela serve de referência para o que está sendo trazido para cá, como o formato do Painel.

## Abrir a demonstração

- **Codespaces:** [abrir a demonstração](https://codespaces.new/ImportFacil/REP-TESTE?devcontainer_path=.devcontainer%2Fimportfacil%2Fdevcontainer.json). Quando estiver no ar, leia o QR em https://importfacil.github.io/REP-TESTE/app/ com o celular. A cada início, o Codespace baixa a versão mais nova sozinho.
- **Docker no computador:** `cd demo && docker compose up --build`, depois http://localhost:8000.
- **Entrar:** em `/entrar`, escolha uma das 5 empresas de demonstração ou "Equipe ImportFácil (administrador)". Não precisa de senha.

## Próximas fases

1. **Painel no formato do Bagisto:**
   - vendas (notas, envios, reembolsos);
   - catálogo (atributos e famílias);
   - clientes e grupos;
   - marketing (promoções e cupons);
   - conteúdo e relatórios;
   - configurações (usuários, permissões, impostos, estoque);
   - tabelas com filtros, exportação e ações em lote.
2. **Loja:** comparar, favoritos, avaliações, filtros por atributo, endereços, pedido rápido e listas de compra.
3. **B2B:** usuários e permissões dentro da empresa, cotações negociadas e ordens de compra.
4. **Pagamentos reais** pelo Asaas, **NF-e** e **homologação na AWS**.
