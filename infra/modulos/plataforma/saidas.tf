output "url_site" {
  description = "Endereço do site neste ambiente (a API fica em <url>/api)."
  value       = local.url_site
}

output "url_api" {
  value = "${local.url_site}/api"
}

output "banco_endereco" {
  value = aws_db_instance.principal.address
}

output "segredo_banco" {
  value = aws_secretsmanager_secret.banco.name
}

output "segredo_integracoes" {
  value = aws_secretsmanager_secret.integracoes.name
}

output "cluster" {
  value = aws_ecs_cluster.principal.name
}

output "servico_api" {
  value = aws_ecs_service.api.name
}

output "login_clientes" {
  value = {
    pool    = aws_cognito_user_pool.grupo["clientes"].id
    client  = aws_cognito_user_pool_client.site["clientes"].id
    dominio = "https://${aws_cognito_user_pool_domain.grupo["clientes"].domain}.auth.${var.regiao}.amazoncognito.com"
  }
}

output "login_equipe" {
  value = {
    pool    = aws_cognito_user_pool.grupo["equipe"].id
    client  = aws_cognito_user_pool_client.site["equipe"].id
    dominio = "https://${aws_cognito_user_pool_domain.grupo["equipe"].domain}.auth.${var.regiao}.amazoncognito.com"
  }
}

output "bucket_arquivos" {
  value = aws_s3_bucket.arquivos.bucket
}

output "fila_eventos" {
  value = aws_sqs_queue.eventos.url
}

output "topico_alertas" {
  value = aws_sns_topic.alertas.arn
}
