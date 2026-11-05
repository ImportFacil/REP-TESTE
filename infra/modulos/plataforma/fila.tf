# Fila de eventos para processar sem perder nenhum (webhooks, NF-e, avisos), com fila de erros.
# Os workers que consomem a fila entram na fase 2.

resource "aws_sqs_queue" "erros" {
  name                      = "${local.nome}-eventos-erros"
  message_retention_seconds = 1209600 # 14 dias
  kms_master_key_id         = aws_kms_key.principal.arn
}

resource "aws_sqs_queue" "eventos" {
  name                       = "${local.nome}-eventos"
  visibility_timeout_seconds = 120
  message_retention_seconds  = 345600 # 4 dias
  kms_master_key_id          = aws_kms_key.principal.arn
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.erros.arn
    maxReceiveCount     = 5
  })
}
