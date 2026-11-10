# API em contêineres (ECS Fargate) atrás de um balanceador que só aceita tráfego do CloudFront.

resource "aws_ecs_cluster" "principal" {
  name = local.nome
  setting {
    name  = "containerInsights"
    value = local.prod ? "enabled" : "disabled"
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.nome}-api"
  retention_in_days = var.retencao_logs_dias
}

# ---------- papéis ----------

data "aws_iam_policy_document" "confianca_ecs" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Usado pelo ECS para baixar a imagem, ler os segredos e gravar logs.
resource "aws_iam_role" "api_execucao" {
  name               = "${local.nome}-api-execucao"
  assume_role_policy = data.aws_iam_policy_document.confianca_ecs.json
}

resource "aws_iam_role_policy_attachment" "api_execucao_padrao" {
  role       = aws_iam_role.api_execucao.name
  policy_arn = "arn:${data.aws_partition.atual.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "api_execucao_segredos" {
  role = aws_iam_role.api_execucao.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = [aws_secretsmanager_secret.banco.arn, aws_secretsmanager_secret.simulador.arn] },
      { Effect = "Allow", Action = ["kms:Decrypt"], Resource = [aws_kms_key.principal.arn] },
    ]
  })
}

# Usado pelo código da API: só o que ela precisa, neste ambiente.
resource "aws_iam_role" "api_tarefa" {
  name               = "${local.nome}-api-tarefa"
  assume_role_policy = data.aws_iam_policy_document.confianca_ecs.json
}

resource "aws_iam_role_policy" "api_tarefa" {
  role = aws_iam_role.api_tarefa.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ConvidarEDesativarUsuarios"
        Effect   = "Allow"
        Action   = ["cognito-idp:AdminCreateUser", "cognito-idp:AdminGetUser", "cognito-idp:AdminDisableUser", "cognito-idp:AdminEnableUser"]
        Resource = [for g in aws_cognito_user_pool.grupo : g.arn]
      },
      {
        Sid      = "Arquivos"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:GetObjectVersion"]
        Resource = ["${aws_s3_bucket.arquivos.arn}/*"]
      },
      { Sid = "ListarArquivos", Effect = "Allow", Action = ["s3:ListBucket"], Resource = [aws_s3_bucket.arquivos.arn] },
      {
        Sid      = "Fila"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"]
        Resource = [aws_sqs_queue.eventos.arn]
      },
      {
        Sid      = "Criptografia"
        Effect   = "Allow"
        Action   = ["kms:Decrypt", "kms:GenerateDataKey"]
        Resource = [aws_kms_key.principal.arn]
      },
      {
        Sid      = "SegredosDasIntegracoes"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [aws_secretsmanager_secret.integracoes.arn]
      },
    ]
  })
}

# ---------- definição da tarefa ----------
# O Terraform cria a primeira versão; a cada deploy o GitHub Actions registra uma nova
# com a imagem nova (por isso o serviço ignora mudanças em task_definition).

locals {
  subredes_api = var.usar_nat ? aws_subnet.aplicacao[*].id : aws_subnet.publica[*].id

  ambiente_api = {
    AMBIENTE                   = var.ambiente
    PORTA                      = "3000"
    PREFIXO_API                = "api"
    SALTOS_PROXY               = "2"
    AUTH_MODO                  = "cognito"
    AWS_REGION                 = var.regiao
    COGNITO_CLIENTES_POOL_ID   = aws_cognito_user_pool.grupo["clientes"].id
    COGNITO_CLIENTES_CLIENT_ID = aws_cognito_user_pool_client.site["clientes"].id
    COGNITO_EQUIPE_POOL_ID     = aws_cognito_user_pool.grupo["equipe"].id
    COGNITO_EQUIPE_CLIENT_ID   = aws_cognito_user_pool_client.site["equipe"].id
    DB_HOST                    = aws_db_instance.principal.address
    DB_PORTA                   = tostring(aws_db_instance.principal.port)
    DB_NOME                    = aws_db_instance.principal.db_name
    DB_SSL                     = "true"
    CORS_ORIGENS               = local.url_site
    DOCS_API                   = local.prod ? "false" : "true"
    FILA_EVENTOS_URL           = aws_sqs_queue.eventos.url
    BUCKET_ARQUIVOS            = aws_s3_bucket.arquivos.bucket
    REDIS_HOST                 = try(aws_elasticache_replication_group.principal[0].primary_endpoint_address, "")
    GATEWAY                    = var.gateway_pagamento
    SENTRY_DSN                 = var.sentry_dsn
    WORKER_NA_API              = tostring(var.worker_na_api)
  }

  segredos_api = [
    { name = "DB_USUARIO", valueFrom = "${aws_secretsmanager_secret.banco.arn}:usuario::" },
    { name = "DB_SENHA", valueFrom = "${aws_secretsmanager_secret.banco.arn}:senha::" },
    { name = "WEBHOOK_SEGREDO_SIMULADOR", valueFrom = aws_secretsmanager_secret.simulador.arn },
  ]
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.nome}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memoria
  execution_role_arn       = aws_iam_role.api_execucao.arn
  task_role_arn            = aws_iam_role.api_tarefa.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name         = "api"
    image        = "${var.imagem_api}:${var.imagem_tag_inicial}"
    essential    = true
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    environment  = [for k, v in local.ambiente_api : { name = k, value = v }]
    secrets      = local.segredos_api
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.api.name
        awslogs-region        = var.regiao
        awslogs-stream-prefix = "api"
      }
    }
    readonlyRootFilesystem = true
    user                   = "node"
  }])

  depends_on = [aws_secretsmanager_secret_version.banco, aws_secretsmanager_secret_version.simulador]
}

# ---------- balanceador ----------

resource "random_password" "origem" {
  length  = 48
  special = false
}

resource "aws_lb" "api" {
  name                       = "${local.nome}-api"
  load_balancer_type         = "application"
  internal                   = false
  subnets                    = aws_subnet.publica[*].id
  security_groups            = [aws_security_group.balanceador.id]
  drop_invalid_header_fields = true
  enable_deletion_protection = local.prod
  idle_timeout               = 60
}

resource "aws_lb_target_group" "api" {
  name                 = "${local.nome}-api"
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.principal.id
  deregistration_delay = 30
  health_check {
    path                = "/api/saude"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

# Com domínio: HTTPS entre o CloudFront e o balanceador. Sem domínio: HTTP, restrito ao CloudFront.
resource "aws_lb_listener" "api" {
  load_balancer_arn = aws_lb.api.arn
  port              = local.com_dominio ? 443 : 80
  protocol          = local.com_dominio ? "HTTPS" : "HTTP"
  ssl_policy        = local.com_dominio ? "ELBSecurityPolicy-TLS13-1-2-2021-06" : null
  certificate_arn   = one(aws_acm_certificate_validation.origem_api[*].certificate_arn)

  # Quem chega sem o cabeçalho secreto do CloudFront recebe 403.
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Acesso negado"
      status_code  = "403"
    }
  }
}

resource "aws_lb_listener_rule" "cloudfront" {
  listener_arn = aws_lb_listener.api.arn
  priority     = 10
  condition {
    http_header {
      http_header_name = "X-Origem-ImportFacil"
      values           = [random_password.origem.result]
    }
  }
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# ---------- serviço ----------

resource "aws_ecs_service" "api" {
  name                              = "${local.nome}-api"
  cluster                           = aws_ecs_cluster.principal.id
  task_definition                   = aws_ecs_task_definition.api.arn
  desired_count                     = var.api_quantidade_min
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 60
  propagate_tags                    = "SERVICE"
  enable_execute_command            = false

  network_configuration {
    subnets          = local.subredes_api
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = !var.usar_nat
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3000
  }

  # Se a versão nova não ficar saudável, o ECS volta sozinho para a anterior.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_lb_listener_rule.cloudfront]
}

resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.principal.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.api_quantidade_min
  max_capacity       = var.api_quantidade_max
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.nome}-api-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
