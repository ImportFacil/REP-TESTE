data "aws_caller_identity" "atual" {}
data "aws_partition" "atual" {}

locals {
  nome  = "${var.projeto}-${var.ambiente}"
  conta = data.aws_caller_identity.atual.account_id
  prod  = var.ambiente == "prod"

  com_dominio = var.dominio_site != ""
  url_site    = local.com_dominio ? "https://${var.dominio_site}" : "https://${aws_cloudfront_distribution.site.domain_name}"

  # Parâmetros lidos pelo GitHub Actions no deploy (caminho /importfacil/<ambiente>/...).
  prefixo_ssm = "/${var.projeto}/${var.ambiente}"
}
