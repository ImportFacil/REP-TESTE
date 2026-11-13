# PostgreSQL gerenciado (RDS). Em produção: duas zonas, 35 dias de backup e proteção contra exclusão.

resource "aws_db_subnet_group" "principal" {
  name       = local.nome
  subnet_ids = aws_subnet.dados[*].id
}

resource "aws_db_parameter_group" "principal" {
  name   = "${local.nome}-pg${var.banco_versao}"
  family = "postgres${var.banco_versao}"

  # Só aceita conexões com TLS.
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  # Registra consultas lentas (mais de 1 s) nos logs.
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
}

resource "aws_db_instance" "principal" {
  identifier     = local.nome
  engine         = "postgres"
  engine_version = var.banco_versao
  instance_class = var.banco_classe

  db_name  = "exportfacil"
  username = "exportfacil"
  password = random_password.banco.result
  port     = 5432

  allocated_storage     = var.banco_armazenamento_gb
  max_allocated_storage = var.banco_armazenamento_max_gb
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.principal.arn

  multi_az               = var.banco_multi_az
  db_subnet_group_name   = aws_db_subnet_group.principal.name
  vpc_security_group_ids = [aws_security_group.dados.id]
  parameter_group_name   = aws_db_parameter_group.principal.name
  publicly_accessible    = false

  backup_retention_period   = var.banco_retencao_backup_dias
  backup_window             = "05:00-06:00" # 02:00-03:00 em Brasília
  maintenance_window        = "sun:06:30-sun:07:30"
  copy_tags_to_snapshot     = true
  deletion_protection       = var.banco_protecao_exclusao
  skip_final_snapshot       = !local.prod
  final_snapshot_identifier = local.prod ? "${local.nome}-final" : null

  auto_minor_version_upgrade = true
  # Performance Insights não existe nas classes micro e small.
  performance_insights_enabled          = var.banco_performance_insights
  performance_insights_kms_key_id       = var.banco_performance_insights ? aws_kms_key.principal.arn : null
  performance_insights_retention_period = var.banco_performance_insights ? 7 : null
  enabled_cloudwatch_logs_exports       = ["postgresql"]

  lifecycle {
    ignore_changes = [engine_version] # atualizações menores automáticas não geram diferença
  }
}
