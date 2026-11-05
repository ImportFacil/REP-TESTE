# Ambiente: dev
# Uso:
#   terraform init -backend-config=../backend.hcl
#   terraform plan  -var-file=dev.tfvars
#   terraform apply -var-file=dev.tfvars

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws    = { source = "hashicorp/aws", version = ">= 5.80, < 6.0" }
    random = { source = "hashicorp/random", version = ">= 3.6" }
  }
  backend "s3" {
    key          = "ambientes/dev.tfstate"
    region       = "sa-east-1"
    encrypt      = true
    use_lockfile = true
    # bucket e kms_key_id vêm de ../backend.hcl (saídas do bootstrap)
  }
}

locals {
  tags = { Projeto = "importfacil", Ambiente = "dev", GerenciadoPor = "terraform" }
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

  ambiente           = "dev"
  cidr_vpc           = "10.10.0.0/16"
  imagem_api         = var.imagem_api
  imagem_tag_inicial = var.imagem_tag_inicial
  email_alertas      = var.email_alertas
  dominio_site       = var.dominio_site
  dominio_origem_api = var.dominio_origem_api
  zona_route53_id    = var.zona_route53_id
  sentry_dsn         = var.sentry_dsn

  # Ambiente dos desenvolvedores: o menor e mais barato possível.
  # Opcional: no começo, os desenvolvedores podem usar o ambiente local (Docker) e não criar este.
  usar_nat                   = false
  banco_classe               = "db.t4g.micro"
  banco_multi_az             = false
  banco_retencao_backup_dias = 1
  banco_protecao_exclusao    = false
  cache_habilitado           = false
  api_cpu                    = 256
  api_memoria                = 512
  api_quantidade_min         = 1
  api_quantidade_max         = 1
  gateway_pagamento          = "simulador"
  retencao_logs_dias         = 14
}

output "plataforma" {
  value = module.plataforma
}
