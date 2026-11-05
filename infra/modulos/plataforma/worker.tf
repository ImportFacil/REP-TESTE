# Worker: mesma imagem da API, outro comando. Processa a fila de eventos (avisos de pagamento)
# e roda as rotinas (Pix vencido, parcelas vencidas, régua de cobrança, orçamentos vencidos).
# As rotinas são agendadas dentro do próprio worker, com trava no banco para não rodarem em dobro.

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.nome}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memoria
  execution_role_arn       = aws_iam_role.api_execucao.arn
  task_role_arn            = aws_iam_role.api_tarefa.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name        = "worker"
    image       = "${var.imagem_api}:${var.imagem_tag_inicial}"
    essential   = true
    command     = ["node", "dist/worker.js"]
    environment = [for k, v in local.ambiente_api : { name = k, value = v }]
    secrets     = local.segredos_api
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.api.name
        awslogs-region        = var.regiao
        awslogs-stream-prefix = "worker"
      }
    }
    readonlyRootFilesystem = true
    user                   = "node"
  }])

  depends_on = [aws_secretsmanager_secret_version.banco, aws_secretsmanager_secret_version.simulador]
}

resource "aws_ecs_service" "worker" {
  name                   = "${local.nome}-worker"
  cluster                = aws_ecs_cluster.principal.id
  task_definition        = aws_ecs_task_definition.worker.arn
  desired_count          = 1
  launch_type            = "FARGATE"
  propagate_tags         = "SERVICE"
  enable_execute_command = false

  network_configuration {
    subnets          = local.subredes_api
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = !var.usar_nat
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  # Um worker por vez: na troca de versão, o antigo para antes do novo começar.
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  lifecycle {
    ignore_changes = [task_definition]
  }
}
