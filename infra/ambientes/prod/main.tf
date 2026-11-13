# Ambiente: prod
# Uso:
#   terraform init -backend-config=../backend.hcl
#   terraform plan  -var-file=prod.tfvars
#   terraform apply -var-file=prod.tfvars

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws    = { source = "hashicorp/aws", version = ">= 5.80, < 6.0" }
    random = { source = "hashicorp/random", version = ">= 3.6" }
  }
  backend "s3" {
    key          = "ambientes/prod.tfstate"
    region       = "sa-east-1"
    encrypt      = true
    use_lockfile = true
    # bucket e kms_key_id vêm de ../backend.hcl (saídas do bootstrap)
  }
}

locals {
  tags = { Projeto = "exportfacil", Ambiente = "prod", GerenciadoPor = "terraform" }
}

provider "aws" {
  region = "sa-east-1"
  default_tags { tags = local.tags }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags { tags = local.tags }
}

variable "imagem_api" {
  description = "Saída repositorio_imagens do bootstrap."
  type        = string
}

variable "imagem_tag_inicial" {
  description = "Versão da API usada na criação (o commit publicado pelo primeiro build)."
  type        = string
}

variable "email_alertas" {
  type    = string
  default = ""
}

variable "dominio_site" {
  type    = string
  default = ""
}

variable "dominio_origem_api" {
  type    = string
  default = ""
}

variable "sentry_dsn" {
  type    = string
  default = ""
}

variable "zona_route53_id" {
  type    = string
  default = ""
}

module "plataforma" {
  source    = "../../modulos/plataforma"
  providers = { aws = aws, aws.us_east_1 = aws.us_east_1 }

  ambiente           = "prod"
  cidr_vpc           = "10.30.0.0/16"
  imagem_api         = var.imagem_api
  imagem_tag_inicial = var.imagem_tag_inicial
  email_alertas      = var.email_alertas
  dominio_site       = var.dominio_site
  dominio_origem_api = var.dominio_origem_api
  zona_route53_id    = var.zona_route53_id
  sentry_dsn         = var.sentry_dsn

  # Produção, configuração de INÍCIO (antes de clientes reais). Quando houver clientes, ajuste:
  #   banco_classe = "db.t4g.medium", banco_multi_az = true, banco_performance_insights = true,
  #   nat_por_zona = true, api_quantidade_min = 2, cache_habilitado = true (fase 2), cache_replicas = 1.
  usar_nat                   = true
  nat_por_zona               = false
  banco_classe               = "db.t4g.small"
  banco_multi_az             = false
  banco_armazenamento_gb     = 20
  banco_armazenamento_max_gb = 200
  banco_retencao_backup_dias = 35
  banco_protecao_exclusao    = true
  cache_habilitado           = false
  api_cpu                    = 512
  api_memoria                = 1024
  api_quantidade_min         = 1
  api_quantidade_max         = 4
  gateway_pagamento          = "desligado"
  retencao_logs_dias         = 90
  cognito_protecao_exclusao  = true
}

output "plataforma" {
  value = module.plataforma
}
