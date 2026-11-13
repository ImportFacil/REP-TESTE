# Fase 1: situação

Comparação entre o documento **Arquitetura Export Fácil** e o que está neste repositório.

## Feito

| Demanda da arquitetura | Onde está | Como foi conferido |
| --- | --- | --- |
| AWS São Paulo, três ambientes separados | `infra/ambientes/{dev,homolog,prod}` | Sintaxe e formato conferidos; o CI roda `terraform validate` |
| Borda: HTTPS, cache e firewall (CloudFront + WAF), domínio opcional | `infra/modulos/plataforma/site.tf` | idem |
| API em contêineres atrás de balanceador, com volta automática se a versão nova falhar | `api.tf` | idem |
| Banco PostgreSQL com backup de 35 dias, só TLS, criptografado (duas zonas: pronto para ligar quando houver clientes) | `banco.tf` | idem |
| Cache Redis (desligado até a fase 2), fila com fila de erros, arquivos com versões | `cache.tf`, `fila.tf`, `arquivos.tf` | idem |
| Login com 2 grupos (clientes e equipe), 2 etapas obrigatórias para a equipe | `login.tf` + `backend/src/auth` | 28 testes de API |
| Segredos no Secrets Manager, chaves no KMS, nada no código | `seguranca.tf` | — |
| Alertas: API fora do ar ou lenta, erros, banco no limite, fila de erros | `monitoramento.tf` | — |
| Deploy por GitHub Actions: homologação primeiro, produção com aprovação, mesma imagem | `.github/workflows` | Sintaxe conferida |
| Migrações versionadas, aplicadas no deploy | `backend/src/banco/migracoes` | Aplicadas em PostgreSQL 16 |
| Módulo Contas e acesso: empresas, usuários, papéis | `backend/src/contas` | Testes de API |
| Módulo Catálogo e preços: preço e pedido mínimo por tipo de cliente | `backend/src/catalogo` | Testes de unidade e de API |
| Módulo Auditoria: quem fez o quê, com antes e depois | `backend/src/auditoria` | Testes de API |
| Dinheiro em centavos, nada apagado, cada cliente só vê a própria empresa | Banco e API | Testes de API |
| Catálogo do protótipo (446 produtos, 31 categorias, 5 tipos de cliente) | `backend/src/banco/dados/catalogo.json` | Carregado no banco de teste |

Também entrou o **CNPJ alfanumérico**, que a Receita Federal emite desde julho de 2026.

## Depende de vocês

| Item | Para quê | Quem |
| --- | --- | --- |
| Conta AWS com cartão (início estimado em US$ 340 por mês, sem impostos) | Criar os ambientes (`infra/README.md`, passo 1) | Diretoria / TI |
| Variáveis e environments no GitHub | Ligar o deploy automático (passo 2) | Quem administra o repositório |
| Domínio no Route 53 | Endereço próprio e HTTPS até a API em produção | TI |
| Amazon SES com o domínio | Convites e recuperação de senha sem o limite de 50 e-mails por dia | TI |
| Quem aprova as entregas em produção | Environment `producao` no GitHub | Diretoria |
| E-mail que recebe os alertas | Arquivos `.tfvars` | TI |

## O que ficou de fora de propósito

- **Workers e agendador:** a fila já existe, mas os workers e o EventBridge Scheduler só fazem sentido com o código da fase 2 (webhooks, NF-e, régua de cobrança).
- **Front-end em Next.js:** o site de cada ambiente ainda é o protótipo. A conversão para Next.js, ligada à API, é o próximo passo natural.
- **Sentry:** os alarmes do CloudWatch cobrem a fase 1; o Sentry entra junto com o front-end.

## Próximos passos (fase 2)

1. Front-end em Next.js com login pelo Cognito, catálogo e cotação usando a API.
2. Carrinho e pedido com preço congelado e conferência do pedido mínimo (as regras de preço já estão prontas em `backend/src/catalogo/precos.ts`).
3. Gateway de pagamento (Asaas, com proposta do Pagar.me para comparar): Pix, boleto, cartão e webhooks.
4. Cadastro da empresa, documentos e aprovação de crédito no Painel da equipe.
