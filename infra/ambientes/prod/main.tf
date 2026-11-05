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
  tags = { Projeto = "importfacil", Ambiente = "prod", GerenciadoPor = "terraform" }
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

  # Produção: duas zonas em tudo, 35 dias de backup e proteção contra exclusão.
  nat_por_zona               = true
  banco_classe               = "db.t4g.medium"
  banco_multi_az             = true
  banco_armazenamento_gb     = 50
  banco_armazenamento_max_gb = 500
  banco_retencao_backup_dias = 35
  banco_protecao_exclusao    = true
  cache_habilitado           = true
  cache_tipo_no              = "cache.t4g.small"
  cache_replicas             = 1
  api_cpu                    = 1024
  api_memoria                = 2048
  api_quantidade_min         = 2
  api_quantidade_max         = 6
  retencao_logs_dias         = 90
  cognito_protecao_exclusao  = true
}

output "plataforma" {
  value = module.plataforma
}
