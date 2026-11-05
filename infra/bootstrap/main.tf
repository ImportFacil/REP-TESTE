# Bootstrap: roda UMA vez por conta AWS, antes dos ambientes.
# Cria o bucket do estado do Terraform, o repositório de imagens (ECR) compartilhado
# e os papéis que o GitHub Actions assume via OIDC (sem chaves de acesso guardadas no GitHub).

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = ">= 5.80, < 6.0" }
  }
  # Estado local na primeira execução; depois, migre para o bucket criado aqui (ver infra/README.md).
}

provider "aws" {
  region = var.regiao
  default_tags {
    tags = { Projeto = var.projeto, Ambiente = "compartilhado", GerenciadoPor = "terraform" }
  }
}

variable "regiao" {
  type    = string
  default = "sa-east-1"
}

variable "projeto" {
  type    = string
  default = "importfacil"
}

variable "repositorio_github" {
  description = "Repositório que pode publicar imagens e fazer deploy, no formato dono/nome."
  type        = string
  default     = "ImportFacil/REP-TESTE"
}

variable "ambientes_github" {
  description = "Ambiente da AWS => nome do environment no GitHub (o de produção exige aprovação)."
  type        = map(string)
  default     = { dev = "dev", homolog = "homolog", prod = "producao" }
}

data "aws_caller_identity" "atual" {}
data "aws_partition" "atual" {}

locals {
  conta  = data.aws_caller_identity.atual.account_id
  prefix = var.projeto
}

# ---------------- Estado do Terraform ----------------

resource "aws_kms_key" "estado" {
  description             = "${local.prefix} - estado do Terraform"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

resource "aws_s3_bucket" "estado" {
  bucket = "${local.prefix}-terraform-estado-${local.conta}"
  lifecycle { prevent_destroy = true }
}

resource "aws_s3_bucket_versioning" "estado" {
  bucket = aws_s3_bucket.estado.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "estado" {
  bucket = aws_s3_bucket.estado.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.estado.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "estado" {
  bucket                  = aws_s3_bucket.estado.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "estado" {
  bucket = aws_s3_bucket.estado.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "SomenteTLS"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.estado.arn, "${aws_s3_bucket.estado.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# ---------------- Imagens da API (compartilhadas entre ambientes) ----------------
# A mesma imagem testada em homologação é a que vai para produção.

resource "aws_ecr_repository" "api" {
  name                 = "${local.prefix}/api"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "KMS" }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Mantém as 60 imagens mais recentes"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 60 }
      action       = { type = "expire" }
    }]
  })
}

# ---------------- GitHub Actions via OIDC ----------------

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

data "aws_iam_policy_document" "confianca_build" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.repositorio_github}:ref:refs/heads/main"]
    }
  }
}

# Papel do build: só publica imagens no ECR, a partir do branch main.
resource "aws_iam_role" "github_build" {
  name               = "${local.prefix}-github-build"
  assume_role_policy = data.aws_iam_policy_document.confianca_build.json
}

resource "aws_iam_role_policy" "github_build" {
  role = aws_iam_role.github_build.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:DescribeImages",
        ]
        Resource = aws_ecr_repository.api.arn
      },
    ]
  })
}

data "aws_iam_policy_document" "confianca_deploy" {
  for_each = var.ambientes_github
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Só jobs que rodam no environment do GitHub correspondente (produção exige aprovação lá).
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.repositorio_github}:environment:${each.value}"]
    }
  }
}

# Papel de deploy por ambiente: migra o banco, troca a versão da API e publica o site daquele ambiente.
resource "aws_iam_role" "github_deploy" {
  for_each           = var.ambientes_github
  name               = "${local.prefix}-github-deploy-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.confianca_deploy[each.key].json
}

resource "aws_iam_role_policy" "github_deploy" {
  for_each = var.ambientes_github
  role     = aws_iam_role.github_deploy[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "LerParametrosDoAmbiente"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
        Resource = "arn:${data.aws_partition.atual.partition}:ssm:${var.regiao}:${local.conta}:parameter/${local.prefix}/${each.key}/*"
      },
      {
        Sid      = "DefinicaoDeTarefa"
        Effect   = "Allow"
        Action   = ["ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition"]
        Resource = "*"
      },
      {
        Sid      = "RodarMigracao"
        Effect   = "Allow"
        Action   = ["ecs:RunTask"]
        Resource = "arn:${data.aws_partition.atual.partition}:ecs:${var.regiao}:${local.conta}:task-definition/${local.prefix}-${each.key}-api:*"
        Condition = {
          ArnEquals = { "ecs:cluster" = "arn:${data.aws_partition.atual.partition}:ecs:${var.regiao}:${local.conta}:cluster/${local.prefix}-${each.key}" }
        }
      },
      {
        Sid    = "AcompanharEAtualizarServico"
        Effect = "Allow"
        Action = ["ecs:DescribeTasks", "ecs:DescribeServices", "ecs:UpdateService"]
        Resource = [
          "arn:${data.aws_partition.atual.partition}:ecs:${var.regiao}:${local.conta}:task/${local.prefix}-${each.key}/*",
          "arn:${data.aws_partition.atual.partition}:ecs:${var.regiao}:${local.conta}:service/${local.prefix}-${each.key}/${local.prefix}-${each.key}-api",
        ]
      },
      {
        Sid      = "PassarPapeisDaTarefa"
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = "arn:${data.aws_partition.atual.partition}:iam::${local.conta}:role/${local.prefix}-${each.key}-api-*"
        Condition = {
          StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" }
        }
      },
      {
        Sid      = "LogsDaMigracao"
        Effect   = "Allow"
        Action   = ["logs:GetLogEvents", "logs:FilterLogEvents"]
        Resource = "arn:${data.aws_partition.atual.partition}:logs:${var.regiao}:${local.conta}:log-group:/ecs/${local.prefix}-${each.key}-api:*"
      },
      {
        Sid      = "VerImagem"
        Effect   = "Allow"
        Action   = ["ecr:DescribeImages"]
        Resource = aws_ecr_repository.api.arn
      },
      {
        Sid    = "PublicarSite"
        Effect = "Allow"
        Action = ["s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = [
          "arn:${data.aws_partition.atual.partition}:s3:::${local.prefix}-${each.key}-site-${local.conta}",
          "arn:${data.aws_partition.atual.partition}:s3:::${local.prefix}-${each.key}-site-${local.conta}/*",
        ]
      },
      {
        Sid      = "LimparCacheDoSite"
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
        Resource = "*"
      },
    ]
  })
}

output "bucket_estado" {
  value = aws_s3_bucket.estado.bucket
}

output "kms_estado" {
  value = aws_kms_key.estado.arn
}

output "repositorio_imagens" {
  value = aws_ecr_repository.api.repository_url
}

output "papel_build" {
  description = "Coloque em Settings > Secrets and variables > Actions > Variables como AWS_PAPEL_BUILD."
  value       = aws_iam_role.github_build.arn
}

output "papeis_deploy" {
  description = "Em cada environment do GitHub, crie a variável AWS_PAPEL_DEPLOY com o papel correspondente."
  value       = { for k, r in aws_iam_role.github_deploy : var.ambientes_github[k] => r.arn }
}
