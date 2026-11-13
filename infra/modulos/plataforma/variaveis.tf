variable "projeto" {
  type    = string
  default = "exportfacil"
}

variable "ambiente" {
  description = "dev, homolog ou prod."
  type        = string
  validation {
    condition     = contains(["dev", "homolog", "prod"], var.ambiente)
    error_message = "O ambiente deve ser dev, homolog ou prod."
  }
}

variable "regiao" {
  type    = string
  default = "sa-east-1"
}

# ---------- rede ----------

variable "cidr_vpc" {
  description = "Faixa de IPs da rede do ambiente (uma /16 diferente por ambiente)."
  type        = string
}

variable "zonas" {
  description = "Zonas de disponibilidade usadas (duas, para o banco e a API sobreviverem à queda de uma)."
  type        = list(string)
  default     = ["sa-east-1a", "sa-east-1c"]
}

variable "usar_nat" {
  description = <<-EOT
    Com NAT (produção), a API fica em sub-redes privadas e sai para a internet pelo NAT.
    Sem NAT (economia em dev e homologação), a API roda nas sub-redes públicas com IP próprio;
    o grupo de segurança continua recusando qualquer conexão que não venha do balanceador.
  EOT
  type        = bool
  default     = true
}

variable "nat_por_zona" {
  description = "Um NAT por zona (produção) ou um só (economia em dev e homologação)."
  type        = bool
  default     = false
}

# ---------- banco ----------

variable "banco_classe" {
  type    = string
  default = "db.t4g.micro"
}

variable "banco_versao" {
  type    = string
  default = "16"
}

variable "banco_armazenamento_gb" {
  type    = number
  default = 20
}

variable "banco_armazenamento_max_gb" {
  type    = number
  default = 100
}

variable "banco_multi_az" {
  description = "Banco em duas zonas: se uma cair, a outra assume sozinha."
  type        = bool
  default     = false
}

variable "banco_retencao_backup_dias" {
  description = "Backups diários com restauração a qualquer minuto do período (até 35)."
  type        = number
  default     = 7
}

variable "banco_performance_insights" {
  description = "Painel de desempenho do banco. Não existe nas classes micro e small."
  type        = bool
  default     = false
}

variable "banco_protecao_exclusao" {
  type    = bool
  default = false
}

# ---------- cache ----------

variable "cache_habilitado" {
  type    = bool
  default = true
}

variable "cache_tipo_no" {
  type    = string
  default = "cache.t4g.micro"
}

variable "cache_replicas" {
  description = "Réplicas além do nó principal (1 ou mais liga o failover automático)."
  type        = number
  default     = 0
}

# ---------- API ----------

variable "imagem_api" {
  description = "Endereço do repositório ECR da API (saída repositorio_imagens do bootstrap)."
  type        = string
}

variable "imagem_tag_inicial" {
  description = "Versão usada só na criação; depois o GitHub Actions troca a versão a cada deploy."
  type        = string
  default     = "inicial"
}

variable "api_cpu" {
  type    = number
  default = 512
}

variable "api_memoria" {
  type    = number
  default = 1024
}

variable "api_quantidade_min" {
  type    = number
  default = 1
}

variable "api_quantidade_max" {
  type    = number
  default = 2
}

variable "gateway_pagamento" {
  description = "simulador (dev e homologação) ou desligado (produção, até as chaves do Asaas)."
  type        = string
  default     = "desligado"
  validation {
    condition     = contains(["simulador", "desligado"], var.gateway_pagamento)
    error_message = "Use simulador ou desligado."
  }
}

variable "sentry_dsn" {
  description = "Opcional: DSN do projeto no Sentry para os erros da API e do worker."
  type        = string
  default     = ""
}

variable "worker_cpu" {
  type    = number
  default = 256
}

variable "worker_memoria" {
  type    = number
  default = 512
}

# ---------- domínio (opcional) ----------

variable "dominio_site" {
  description = "Endereço do site neste ambiente, ex.: app.exportfacil.com.br. Vazio = usa o endereço *.cloudfront.net."
  type        = string
  default     = ""
}

variable "dominio_origem_api" {
  description = "Nome interno do balanceador, ex.: origem-api.prod.exportfacil.com.br. Obrigatório quando dominio_site é informado."
  type        = string
  default     = ""
}

variable "zona_route53_id" {
  description = "Zona do Route 53 onde ficam os registros dos domínios acima."
  type        = string
  default     = ""
}

# ---------- operação ----------

variable "email_alertas" {
  description = "Quem recebe os alertas (confirme a inscrição no e-mail que a AWS envia)."
  type        = string
  default     = ""
}

variable "retencao_logs_dias" {
  type    = number
  default = 30
}

variable "waf_habilitado" {
  description = "Liga o WAF na frente do CloudFront (criado em us-east-1, cerca de US$ 10/mês). Em homologação pode ficar desligado."
  type        = bool
  default     = true
}

variable "worker_na_api" {
  description = "A API também faz o trabalho do worker (rotinas e fila) e o serviço do worker fica com 0 tarefas. Economia para homologação."
  type        = bool
  default     = false
}

variable "waf_limite_por_ip" {
  description = "Requisições por IP a cada 5 minutos antes de bloquear."
  type        = number
  default     = 2000
}

variable "cognito_protecao_exclusao" {
  type    = bool
  default = false
}
