# Login (Cognito): dois grupos de usuários separados, um para clientes e outro para a equipe.
# Uma conta de cliente nunca abre o Painel da equipe, porque a API confere de qual grupo veio o login.

locals {
  grupos = {
    clientes = { mfa = "OPTIONAL", rotulo = "Clientes" }
    equipe   = { mfa = "ON", rotulo = "Equipe ImportFácil" } # verificação em 2 etapas obrigatória
  }
  # O site volta do login em /auth/retorno/ e, ao sair, vai para a página inicial.
  urls_retorno = distinct(compact([
    "${local.url_site}/auth/retorno/",
    var.ambiente == "dev" ? "http://localhost:3001/auth/retorno/" : "",
  ]))
  urls_saida = distinct(compact([
    "${local.url_site}/",
    var.ambiente == "dev" ? "http://localhost:3001/" : "",
  ]))
}

resource "aws_cognito_user_pool" "grupo" {
  for_each = local.grupos
  name     = "${local.nome}-${each.key}"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  username_configuration { case_sensitive = false }

  mfa_configuration = each.value.mfa
  software_token_mfa_configuration { enabled = true }

  password_policy {
    minimum_length                   = 10
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  # Ninguém cria conta sozinho: a equipe cadastra a empresa e convida as pessoas.
  admin_create_user_config {
    allow_admin_create_user_only = true
    invite_message_template {
      email_subject = "Seu acesso à ImportFácil"
      email_message = "Olá! Seu acesso à ImportFácil foi criado. Usuário: {username} · Senha temporária: {####} · Entre em ${local.url_site} e troque a senha no primeiro acesso."
      sms_message   = "ImportFácil: usuário {username}, senha temporária {####}"
    }
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  schema {
    name                = "name"
    attribute_data_type = "String"
    mutable             = true
    required            = false
    string_attribute_constraints {
      min_length = 1
      max_length = 120
    }
  }

  deletion_protection = var.cognito_protecao_exclusao ? "ACTIVE" : "INACTIVE"

  lifecycle {
    ignore_changes = [schema] # o Cognito não permite alterar atributos depois de criados
  }
}

resource "aws_cognito_user_pool_domain" "grupo" {
  for_each     = local.grupos
  domain       = "${local.nome}-${each.key}-${substr(local.conta, -6, 6)}"
  user_pool_id = aws_cognito_user_pool.grupo[each.key].id
}

# Cliente do site (aplicação no navegador, sem segredo, login com código + PKCE).
resource "aws_cognito_user_pool_client" "site" {
  for_each     = local.grupos
  name         = "${local.nome}-${each.key}-site"
  user_pool_id = aws_cognito_user_pool.grupo[each.key].id

  generate_secret                      = false
  explicit_auth_flows                  = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = local.urls_retorno
  logout_urls                          = local.urls_saida
  prevent_user_existence_errors        = "ENABLED"
  enable_token_revocation              = true

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = each.key == "equipe" ? 1 : 30
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}
