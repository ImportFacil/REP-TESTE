# Parâmetros que o GitHub Actions lê no deploy (o papel de deploy só lê /exportfacil/<ambiente>/*).

locals {
  parametros = {
    "nome"                   = local.nome
    "banco/id"               = aws_db_instance.principal.identifier
    "ecs/cluster"            = aws_ecs_cluster.principal.name
    "ecs/api-min"            = tostring(var.api_quantidade_min)
    "ecs/api-max"            = tostring(var.api_quantidade_max)
    "ecs/worker-quantidade"  = tostring(local.worker_quantidade)
    "ecs/servico"            = aws_ecs_service.api.name
    "ecs/familia"            = aws_ecs_task_definition.api.family
    "ecs/conteiner"          = "api"
    "ecs/servico-worker"     = aws_ecs_service.worker.name
    "ecs/familia-worker"     = aws_ecs_task_definition.worker.family
    "ecs/subredes"           = join(",", local.subredes_api)
    "ecs/ip-publico"         = var.usar_nat ? "DISABLED" : "ENABLED"
    "ecs/grupo-seguranca"    = aws_security_group.api.id
    "ecs/log-group"          = aws_cloudwatch_log_group.api.name
    "site/bucket"            = aws_s3_bucket.site.bucket
    "site/distribuicao"      = aws_cloudfront_distribution.site.id
    "site/url"               = local.url_site
    "login/clientes/pool"    = aws_cognito_user_pool.grupo["clientes"].id
    "login/clientes/client"  = aws_cognito_user_pool_client.site["clientes"].id
    "login/clientes/dominio" = "${aws_cognito_user_pool_domain.grupo["clientes"].domain}.auth.${var.regiao}.amazoncognito.com"
    "login/equipe/pool"      = aws_cognito_user_pool.grupo["equipe"].id
    "login/equipe/client"    = aws_cognito_user_pool_client.site["equipe"].id
    "login/equipe/dominio"   = "${aws_cognito_user_pool_domain.grupo["equipe"].domain}.auth.${var.regiao}.amazoncognito.com"
  }
}

resource "aws_ssm_parameter" "deploy" {
  for_each = local.parametros
  name     = "${local.prefixo_ssm}/${each.key}"
  type     = "String"
  value    = each.value
}
