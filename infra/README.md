# Infraestrutura AWS (Terraform)

Tudo na região **São Paulo (sa-east-1)**, em uma conta AWS, com três ambientes separados (cada um com a sua rede, banco, chaves e login).

> **Começando pela conta gratuita?** Siga [`docs/conta-aws-gratuita.md`](../docs/conta-aws-gratuita.md): cria só a homologação com um comando no CloudShell, e a produção fica para perto do lançamento.

A configuração atual é a **de início**, enxuta até haver clientes reais:

| Ambiente | Para quê | Rede | Banco | API | Cache |
| --- | --- | --- | --- | --- | --- |
| `dev` (opcional) | Trabalho dos desenvolvedores | sem NAT | micro, backup de 1 dia | 1 tarefa pequena | desligado |
| `homolog` | Testes da equipe antes de cada entrega | sem NAT, sem WAF | micro, backup de 7 dias | 1 a 2 tarefas pequenas, que também fazem o papel do worker | desligado |
| `prod` | Clientes reais | 1 NAT | small, 1 zona, backup de 35 dias, proteção contra exclusão | 1 a 4 tarefas | desligado |

Custo estimado (preços de tabela em São Paulo, pouco tráfego, sem impostos): **cerca de US$ 85 por mês em homologação (US$ 60 com o horário automático) e US$ 245 em produção**, e uns US$ 80 a mais se o `dev` for criado. O Redis está desligado porque o código ainda não o usa.

**Sem NAT** (dev e homologação), a API roda nas sub-redes públicas com IP próprio, o que economiza cerca de US$ 70 por mês por ambiente. O grupo de segurança continua recusando qualquer conexão que não venha do balanceador, e o banco segue sem acesso à internet.

**Horário automático (dev e homologação):** o workflow *Homologação: ligar e desligar* usa `infra/scripts/pausar-retomar.sh` para zerar as tarefas, parar o banco e silenciar os alarmes à noite e nos fins de semana. Variável `HOMOLOG_HORARIO`: vazia (dias úteis, das 8h às 20h), `sempre` ou `pausado`. O deploy liga o ambiente se ele estiver pausado.

**Produção** só recebe deploy quando a variável do repositório `PRODUCAO_ATIVA` for `true`.

### Quando chegarem os clientes reais

Em `infra/ambientes/prod/main.tf`, mude e rode `terraform apply`:

| De | Para | Por quê |
| --- | --- | --- |
| `banco_classe = "db.t4g.small"` | `"db.t4g.medium"` (e `banco_performance_insights = true`) | mais fôlego e painel de desempenho |
| `banco_multi_az = false` | `true` | se uma zona cair, o banco continua no ar |
| `nat_por_zona = false` | `true` | a saída para a internet não depende de uma zona só |
| `api_quantidade_min = 1` | `2` | uma tarefa em cada zona |
| `cache_habilitado = false` | `true` e `cache_replicas = 1` | na fase 2, quando o código usar o Redis |

A troca para duas zonas e a mudança de classe do banco são feitas pela AWS com alguns minutos de instabilidade. Faça fora do horário comercial. O backup de 35 dias já vale desde o primeiro dia.

## O que é criado em cada ambiente

| Peça | Recurso AWS | Arquivo |
| --- | --- | --- |
| Borda (HTTPS, cache do site, bloqueio de ataques) | CloudFront + WAF (opcional, `waf_habilitado`) (+ Route 53 e certificados, se houver domínio) | `site.tf` |
| Site e painel | S3 privado, servido só pelo CloudFront | `site.tf` |
| API | ECS Fargate atrás de um balanceador que só aceita o CloudFront | `api.tf` |
| Worker (fila de eventos e rotinas) | ECS Fargate, mesma imagem da API (ou dentro da própria API, com `worker_na_api`) | `worker.tf` |
| Fila (fase 2: webhooks, NF-e, avisos) | SQS com fila de erros | `fila.tf` |
| Banco de dados | RDS PostgreSQL 16, criptografado, só TLS | `banco.tf` |
| Cache | ElastiCache Redis, criptografado | `cache.tf` |
| Arquivos (documentos, XML, fotos) | S3 criptografado, com versões | `arquivos.tf` |
| Login | Cognito: um grupo de usuários para clientes e outro para a equipe (2 etapas obrigatórias) | `login.tf` |
| Segredos | Secrets Manager + KMS | `seguranca.tf` |
| Monitoramento | CloudWatch (logs e alarmes) + e-mail de alerta | `monitoramento.tf` |
| Rede | VPC com sub-redes públicas, da aplicação e de dados; NAT | `rede.tf` |

O endereço do site é `https://<domínio>` e a API fica em `https://<domínio>/api`. Sem domínio próprio, o CloudFront dá um endereço `https://xxxx.cloudfront.net`.

O site (Next.js) fica na raiz e o protótipo antigo em `/prototipo/`. As rotinas (Pix vencido, régua de cobrança, orçamentos vencidos) rodam dentro do worker, com trava no banco, sem precisar de um agendador separado.

**Gateway de pagamento:** `simulador` em dev e homologação e `desligado` em produção (variável `gateway_pagamento`). Quando houver as chaves do Asaas, a integração entra e produção passa a usá-la.

## Antes de começar

- Uma conta AWS com cartão cadastrado e um usuário com permissão de administrador para rodar o Terraform.
- [Terraform 1.10 ou mais novo](https://developer.hashicorp.com/terraform/install) e a [AWS CLI](https://aws.amazon.com/cli/) no computador de quem vai rodar.
- Opcional: um domínio no Route 53 (ex.: `exportfacil.com.br`). Recomendado para produção.

## Passo a passo da primeira vez

### 1. Bootstrap (uma vez por conta)

Cria o bucket do estado do Terraform, o repositório de imagens (ECR) e os papéis que o GitHub Actions usa para fazer deploy, sem guardar chaves de acesso no GitHub.

```bash
cd infra/bootstrap
terraform init
terraform apply
```

Anote as saídas: `bucket_estado`, `kms_estado`, `repositorio_imagens`, `papel_build` e `papeis_deploy`.

### 2. Configurar o GitHub

Em **Settings → Secrets and variables → Actions → Variables** do repositório:

| Variável | Valor |
| --- | --- |
| `AWS_PAPEL_BUILD` | saída `papel_build` |
| `ECR_REPOSITORIO` | saída `repositorio_imagens` |

Em **Settings → Environments**, crie os environments que for usar: `homolog`, e depois `producao` (e `dev`, se quiser). Em cada um, crie a variável `AWS_PAPEL_DEPLOY` com o papel correspondente da saída `papeis_deploy` (e, se usar o Sentry, `SENTRY_DSN_SITE`). No `producao`, marque **Required reviewers** e escolha quem aprova as entregas.

### 3. Publicar a primeira imagem

Faça um commit no `main` (ou rode o workflow **Entrega** manualmente). O job **Publicar imagem** envia a imagem da API ao ECR com o nome do commit. Os jobs de deploy vão falhar nessa primeira vez porque os ambientes ainda não existem; isso é esperado.

### 4. Criar cada ambiente

```bash
cd infra/ambientes
cp backend.hcl.exemplo backend.hcl              # preencha com bucket_estado e kms_estado
cd homolog
cp homolog.tfvars.exemplo homolog.tfvars        # imagem_api, imagem_tag_inicial (o commit do passo 3), e-mail de alertas
terraform init -backend-config=../backend.hcl
terraform plan -var-file=homolog.tfvars
terraform apply -var-file=homolog.tfvars
```

Repita para `prod` (e `dev`, se quiser). Confirme a inscrição no e-mail de alertas que a AWS envia.

### 5. Primeiro deploy e primeiro administrador

Rode o workflow **Entrega** de novo (ou faça um commit). Ele migra o banco, cria os tipos de cliente, sobe a API e publica o site.

Depois crie o primeiro administrador da equipe pelo workflow **Criar administrador** (Actions › Run workflow, com e-mail, nome e ambiente). Ou, pela linha de comando, com uma tarefa avulsa no ECS (substitua os valores):

```bash
AMB=homolog
P=/exportfacil/$AMB
ler() { aws ssm get-parameter --name "$P/$1" --query Parameter.Value --output text; }
aws ecs run-task --cluster "$(ler ecs/cluster)" --task-definition "$(ler ecs/familia)" --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$(ler ecs/subredes)],securityGroups=[$(ler ecs/grupo-seguranca)],assignPublicIp=$(ler ecs/ip-publico)}" \
  --overrides '{"containerOverrides":[{"name":"api","command":["node","dist/scripts/criar-admin.js","--email","voce@exportfacil.com.br","--nome","Seu Nome"]}]}'
```

A pessoa recebe por e-mail a senha temporária. No primeiro login, troca a senha e configura a verificação em 2 etapas. A partir daí, novos usuários são convidados pelo Painel da equipe.

## Dia a dia

- **Código:** todo commit no `main` passa pelos testes, vai para homologação e espera aprovação para ir à produção, com a mesma imagem.
- **Infraestrutura:** mudanças nos arquivos `.tf` passam pelo CI (formato e validação). O `terraform apply` é feito por uma pessoa, primeiro em homologação.
- **Banco:** mudanças só por migrações versionadas (`backend/src/banco/migracoes`), aplicadas automaticamente no deploy.
- **Segredos:** a senha do banco é gerada pelo Terraform e fica no Secrets Manager. As chaves das integrações (fase 2) vão no segredo `/exportfacil/<ambiente>/integracoes`, gravadas pelo console da AWS, nunca no código.

## Pontos de atenção

- **E-mails do Cognito:** por padrão, o Cognito envia no máximo 50 e-mails por dia (convites e recuperação de senha). Antes de abrir para clientes, configure o Amazon SES com o domínio da Export Fácil.
- **Custos:** os maiores são o NAT, o balanceador e o banco. Dev e homologação não têm NAT e usam a menor configuração possível. O `dev` pode ser destruído quando não estiver em uso (`terraform destroy`), e criado de novo depois.
- **Contas separadas:** hoje os três ambientes ficam na mesma conta AWS, separados por rede, chaves e permissões. Quando a operação crescer, vale mover produção para uma conta própria (AWS Organizations).
