# Alertas: API fora do ar ou lenta, erros, banco no limite e itens na fila de erros.

# Sem criptografia própria: o CloudWatch não publica em tópicos com a chave gerenciada do SNS,
# e os alertas não carregam dados de clientes.
resource "aws_sns_topic" "alertas" {
  name = "${local.nome}-alertas"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.email_alertas == "" ? 0 : 1
  topic_arn = aws_sns_topic.alertas.arn
  protocol  = "email"
  endpoint  = var.email_alertas
}

locals {
  dim_alb   = { LoadBalancer = aws_lb.api.arn_suffix }
  dim_alvo  = { LoadBalancer = aws_lb.api.arn_suffix, TargetGroup = aws_lb_target_group.api.arn_suffix }
  dim_banco = { DBInstanceIdentifier = aws_db_instance.principal.identifier }

  alarmes = {
    api-sem-tarefas-saudaveis = {
      descricao = "Nenhuma tarefa da API saudável no balanceador (API fora do ar)."
      namespace = "AWS/ApplicationELB", metrica = "HealthyHostCount", estatistica = "Minimum"
      dimensoes = local.dim_alvo, comparacao = "LessThanThreshold", limite = 1, periodos = 2
    }
    api-erros-5xx = {
      descricao = "Mais de 10 respostas de erro (5xx) da API em 5 minutos."
      namespace = "AWS/ApplicationELB", metrica = "HTTPCode_Target_5XX_Count", estatistica = "Sum"
      dimensoes = local.dim_alb, comparacao = "GreaterThanThreshold", limite = 10, periodos = 1
    }
    api-lenta = {
      descricao = "Tempo de resposta médio da API acima de 2 segundos."
      namespace = "AWS/ApplicationELB", metrica = "TargetResponseTime", estatistica = "Average"
      dimensoes = local.dim_alb, comparacao = "GreaterThanThreshold", limite = 2, periodos = 3
    }
    banco-cpu-alta = {
      descricao = "CPU do banco acima de 80%."
      namespace = "AWS/RDS", metrica = "CPUUtilization", estatistica = "Average"
      dimensoes = local.dim_banco, comparacao = "GreaterThanThreshold", limite = 80, periodos = 3
    }
    banco-pouco-espaco = {
      descricao = "Menos de 2 GB livres no banco."
      namespace = "AWS/RDS", metrica = "FreeStorageSpace", estatistica = "Minimum"
      dimensoes = local.dim_banco, comparacao = "LessThanThreshold", limite = 2147483648, periodos = 1
    }
    fila-de-erros-com-itens = {
      descricao = "Há eventos na fila de erros: algo falhou depois de várias tentativas."
      namespace = "AWS/SQS", metrica = "ApproximateNumberOfMessagesVisible", estatistica = "Maximum"
      dimensoes = { QueueName = aws_sqs_queue.erros.name }, comparacao = "GreaterThanThreshold", limite = 0, periodos = 1
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "alarme" {
  for_each            = local.alarmes
  alarm_name          = "${local.nome}-${each.key}"
  alarm_description   = each.value.descricao
  namespace           = each.value.namespace
  metric_name         = each.value.metrica
  statistic           = each.value.estatistica
  dimensions          = each.value.dimensoes
  comparison_operator = each.value.comparacao
  threshold           = each.value.limite
  evaluation_periods  = each.value.periodos
  period              = 300
  treat_missing_data  = each.key == "api-sem-tarefas-saudaveis" ? "breaching" : "notBreaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]
  ok_actions          = [aws_sns_topic.alertas.arn]
}
