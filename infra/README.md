# Infraestrutura AWS (Terraform)

Tudo na região **São Paulo (sa-east-1)**, em uma conta AWS, com três ambientes separados (cada um com a sua rede, banco, chaves e login):

| Ambiente | Para quê | Banco | API | Cache |
| --- | --- | --- | --- | --- |
| `dev` | Trabalho dos desenvolvedores | 1 zona, backup de 1 dia | 1 tarefa pequena | desligado |
| `homolog` | Testes da equipe antes de cada entrega | 1 zona, backup de 7 dias | 1 a 2 tarefas | 1 nó |
| `prod` | Clientes reais | 2 zonas, backup de 35 dias, proteção contra exclusão | 2 a 6 tarefas | 2 nós com failover |

## O que é criado em cada ambiente

| Peça | Recurso AWS | Arquivo |
| --- | --- | --- |
| Borda (HTTPS, cache do site, bloqueio de ataques) | CloudFront + WAF (+ Route 53 e certificados, se houver domínio) | `site.tf` |
| Site e painel | S3 privado, servido só pelo CloudFront | `site.tf` |
| API | ECS Fargate atrás de um balanceador que só aceita o CloudFront | `api.tf` |
| Fila (fase 2: webhooks, NF-e, avisos) | SQS com fila de erros | `fila.tf` |
| Banco de dados | RDS PostgreSQL 16, criptografado, só TLS | `banco.tf` |
| Cache | ElastiCache Redis, criptografado | `cache.tf` |
| Arquivos (documentos, XML, fotos) | S3 criptografado, com versões | `arquivos.tf` |
| Login | Cognito: um grupo de usuários para clientes e outro para a equipe (2 etapas obrigatórias) | `login.tf` |
| Segredos | Secrets Manager + KMS | `seguranca.tf` |
| Monitoramento | CloudWatch (logs e alarmes) + e-mail de alerta | `monitoramento.tf` |
| Rede | VPC com sub-redes públicas, da aplicação e de dados; NAT | `rede.tf` |

O endereço do site é `https://<domínio>` e a API fica em `https://<domínio>/api`. Sem domínio próprio, o CloudFront dá um endereço `https://xxxx.cloudfront.net`.

> **Ainda não criados (fase 2):** os workers que consomem a fila e o agendador (EventBridge Scheduler) da régua de cobrança e da conciliação. Eles entram junto com o código que vão rodar.

## Antes de começar

- Uma conta AWS com cartão cadastrado e um usuário com permissão de administrador para rodar o Terraform.
- [Terraform 1.10 ou mais novo](https://developer.hashicorp.com/terraform/install) e a [AWS CLI](https://aws.amazon.com/cli/) no computador de quem vai rodar.
- Opcional: um domínio no Route 53 (ex.: `importfacil.com.br`). Recomendado para produção.

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

Em **Settings → Environments**, crie três environments: `dev`, `homolog` e `producao`. Em cada um, crie a variável `AWS_PAPEL_DEPLOY` com o papel correspondente da saída `papeis_deploy`. No `producao`, marque **Required reviewers** e escolha quem aprova as entregas.

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

Depois crie o primeiro administrador da equipe, com uma tarefa avulsa no ECS (substitua os valores):

```bash
AMB=homolog
P=/importfacil/$AMB
ler() { aws ssm get-parameter --name "$P/$1" --query Parameter.Value --output text; }
aws ecs run-task --cluster "$(ler ecs/cluster)" --task-definition "$(ler ecs/familia)" --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$(ler ecs/subredes)],securityGroups=[$(ler ecs/grupo-seguranca)],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"api","command":["node","dist/scripts/criar-admin.js","--email","voce@importfacil.com.br","--nome","Seu Nome"]}]}'
```

A pessoa recebe por e-mail a senha temporária. No primeiro login, troca a senha e configura a verificação em 2 etapas. A partir daí, novos usuários são convidados pelo Painel da equipe.

## Dia a dia

- **Código:** todo commit no `main` passa pelos testes, vai para homologação e espera aprovação para ir à produção, com a mesma imagem.
- **Infraestrutura:** mudanças nos arquivos `.tf` passam pelo CI (formato e validação). O `terraform apply` é feito por uma pessoa, primeiro em homologação.
- **Banco:** mudanças só por migrações versionadas (`backend/src/banco/migracoes`), aplicadas automaticamente no deploy.
- **Segredos:** a senha do banco é gerada pelo Terraform e fica no Secrets Manager. As chaves das integrações (fase 2) vão no segredo `/importfacil/<ambiente>/integracoes`, gravadas pelo console da AWS, nunca no código.

## Pontos de atenção

- **E-mails do Cognito:** por padrão, o Cognito envia no máximo 50 e-mails por dia (convites e recuperação de senha). Antes de abrir para clientes, configure o Amazon SES com o domínio da ImportFácil.
- **Custos:** os maiores são o NAT (um por zona em produção), o banco em duas zonas e o balanceador. Dev e homologação usam a menor configuração possível. Destrua o `dev` quando não estiver em uso.
- **Contas separadas:** hoje os três ambientes ficam na mesma conta AWS, separados por rede, chaves e permissões. Quando a operação crescer, vale mover produção para uma conta própria (AWS Organizations).
