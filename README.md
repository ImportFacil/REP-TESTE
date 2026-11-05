# ImportFácil

Plataforma B2B da ImportFácil: loja para clientes empresariais, orçamentos, ordens de importação, financeiro e Painel da equipe.

**▶ Abrir o protótipo: https://importfacil.github.io/REP-TESTE/**

## O que tem neste repositório

| Pasta | Conteúdo | Situação |
| --- | --- | --- |
| `index.html` | Protótipo navegável de todas as telas (dados ficam no navegador) | Pronto; é publicado como site de cada ambiente |
| `backend/` | API em NestJS + PostgreSQL | **Fase 1 pronta:** login, empresas, usuários, catálogo e preços por tipo de cliente, auditoria |
| `infra/` | Infraestrutura AWS em Terraform (São Paulo) | **Fase 1 pronta:** dev, homologação e produção |
| `.github/workflows/` | Testes, publicação da imagem e deploy | Pronto; o deploy liga quando a AWS for configurada |
| `docs/` | Situação da fase 1 e próximos passos | — |

Comece por [`docs/fase-1.md`](docs/fase-1.md).

## Protótipo

Está publicado em **https://importfacil.github.io/REP-TESTE/** (GitHub Pages, atualizado a cada commit no `main`). Também abre direto do arquivo `index.html` no navegador.

O protótipo cobre loja, checkout (Pix, boleto 30/60/90/120, cartão até 12×), pedidos, orçamentos e ordens de importação (encomenda ou conta e ordem), cadastro para crédito, Financeiro e o Painel da equipe (crédito, pedidos, recebíveis e condições). Login, boletos, Pix, NF-e, consulta de crédito e CEP são simulados.

## Fases de entrega

1. **Base** (este repositório): infraestrutura nos três ambientes, login de clientes e equipe, empresas e usuários, catálogo e preços por tipo de cliente.
2. **Venda e pagamento:** carrinho, pedido, Pix, boleto e cartão pelo gateway, webhooks, Financeiro do cliente, cadastro e aprovação de crédito.
3. **Fiscal e operação:** NF-e pelo ERP, régua de cobrança, conciliação diária, orçamentos e ordens de importação.
4. **Importação a fundo:** custos com câmbio, conta e ordem com numerário, documentos do processo, Siscomex e relatórios.
