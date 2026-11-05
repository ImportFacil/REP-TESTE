# Chave de criptografia do ambiente e segredos (nunca no código).

resource "aws_kms_key" "principal" {
  description             = "${local.nome} - banco, arquivos, segredos e filas"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

resource "aws_kms_alias" "principal" {
  name          = "alias/${local.nome}"
  target_key_id = aws_kms_key.principal.key_id
}

resource "random_password" "banco" {
  length  = 40
  special = false
}

resource "aws_secretsmanager_secret" "banco" {
  name                    = "${local.prefixo_ssm}/banco"
  description             = "Usuário e senha do PostgreSQL da API"
  kms_key_id              = aws_kms_key.principal.arn
  recovery_window_in_days = local.prod ? 30 : 7
}

resource "aws_secretsmanager_secret_version" "banco" {
  secret_id = aws_secretsmanager_secret.banco.id
  secret_string = jsonencode({
    usuario = "importfacil"
    senha   = random_password.banco.result
  })
}

# Segredo que assina os avisos do gateway simulado (só em dev e homologação).
resource "random_password" "webhook_simulador" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "simulador" {
  name                    = "${local.prefixo_ssm}/simulador"
  description             = "Segredo dos avisos do gateway de pagamento simulado"
  kms_key_id              = aws_kms_key.principal.arn
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "simulador" {
  secret_id     = aws_secretsmanager_secret.simulador.id
  secret_string = random_password.webhook_simulador.result
}

# Chaves das integrações (gateway de pagamento, ERP, bureau, WhatsApp) entram aqui na fase 2.
# O Terraform só cria o cofre; os valores são gravados pela equipe no console ou na CLI da AWS.
resource "aws_secretsmanager_secret" "integracoes" {
  name                    = "${local.prefixo_ssm}/integracoes"
  description             = "Chaves de API das integrações externas (preenchidas fora do Terraform)"
  kms_key_id              = aws_kms_key.principal.arn
  recovery_window_in_days = local.prod ? 30 : 7
}
