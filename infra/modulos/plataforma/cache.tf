# Redis gerenciado: sessões, limite de requisições e cotação do dia (usado a partir da fase 2).

resource "aws_elasticache_subnet_group" "principal" {
  count      = var.cache_habilitado ? 1 : 0
  name       = local.nome
  subnet_ids = aws_subnet.dados[*].id
}

resource "aws_elasticache_replication_group" "principal" {
  count                = var.cache_habilitado ? 1 : 0
  replication_group_id = local.nome
  description          = "Cache da ${local.nome}"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.cache_tipo_no
  num_cache_clusters   = 1 + var.cache_replicas
  port                 = 6379

  automatic_failover_enabled = var.cache_replicas > 0
  multi_az_enabled           = var.cache_replicas > 0
  subnet_group_name          = aws_elasticache_subnet_group.principal[0].name
  security_group_ids         = [aws_security_group.dados.id]

  at_rest_encryption_enabled = true
  kms_key_id                 = aws_kms_key.principal.arn
  transit_encryption_enabled = true
  snapshot_retention_limit   = local.prod ? 7 : 0
  maintenance_window         = "sun:07:30-sun:08:30"
}
