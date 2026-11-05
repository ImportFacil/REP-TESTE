# Rede do ambiente: sub-redes públicas (balanceador e NAT), da aplicação (API) e de dados (banco e cache).
# Banco, cache e API não têm acesso direto pela internet.

resource "aws_vpc" "principal" {
  cidr_block           = var.cidr_vpc
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = local.nome }
}

# Fecha o grupo de segurança padrão da VPC: nada usa ele.
resource "aws_default_security_group" "fechado" {
  vpc_id = aws_vpc.principal.id
}

resource "aws_internet_gateway" "principal" {
  vpc_id = aws_vpc.principal.id
  tags   = { Name = local.nome }
}

resource "aws_subnet" "publica" {
  count                   = length(var.zonas)
  vpc_id                  = aws_vpc.principal.id
  availability_zone       = var.zonas[count.index]
  cidr_block              = cidrsubnet(var.cidr_vpc, 8, count.index)
  map_public_ip_on_launch = false
  tags                    = { Name = "${local.nome}-publica-${var.zonas[count.index]}", Camada = "publica" }
}

resource "aws_subnet" "aplicacao" {
  count             = length(var.zonas)
  vpc_id            = aws_vpc.principal.id
  availability_zone = var.zonas[count.index]
  cidr_block        = cidrsubnet(var.cidr_vpc, 8, 10 + count.index)
  tags              = { Name = "${local.nome}-aplicacao-${var.zonas[count.index]}", Camada = "aplicacao" }
}

resource "aws_subnet" "dados" {
  count             = length(var.zonas)
  vpc_id            = aws_vpc.principal.id
  availability_zone = var.zonas[count.index]
  cidr_block        = cidrsubnet(var.cidr_vpc, 8, 20 + count.index)
  tags              = { Name = "${local.nome}-dados-${var.zonas[count.index]}", Camada = "dados" }
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.principal.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.principal.id
  }
  tags = { Name = "${local.nome}-publica" }
}

resource "aws_route_table_association" "publica" {
  count          = length(var.zonas)
  subnet_id      = aws_subnet.publica[count.index].id
  route_table_id = aws_route_table.publica.id
}

# NAT: a API sai para a internet (Cognito, e na fase 2 gateway de pagamento e ERP) sem receber conexões.
# Sem NAT (usar_nat = false), a API usa as sub-redes públicas; banco e cache continuam sem acesso à internet.
locals {
  qtd_nat = var.usar_nat ? (var.nat_por_zona ? length(var.zonas) : 1) : 0
}

resource "aws_eip" "nat" {
  count  = local.qtd_nat
  domain = "vpc"
  tags   = { Name = "${local.nome}-nat-${count.index}" }
}

resource "aws_nat_gateway" "principal" {
  count         = local.qtd_nat
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.publica[count.index].id
  tags          = { Name = "${local.nome}-nat-${count.index}" }
  depends_on    = [aws_internet_gateway.principal]
}

resource "aws_route_table" "privada" {
  count  = length(var.zonas)
  vpc_id = aws_vpc.principal.id
  dynamic "route" {
    for_each = var.usar_nat ? [1] : []
    content {
      cidr_block     = "0.0.0.0/0"
      nat_gateway_id = aws_nat_gateway.principal[var.nat_por_zona ? count.index : 0].id
    }
  }
  tags = { Name = "${local.nome}-privada-${var.zonas[count.index]}" }
}

resource "aws_route_table_association" "aplicacao" {
  count          = length(var.zonas)
  subnet_id      = aws_subnet.aplicacao[count.index].id
  route_table_id = aws_route_table.privada[count.index].id
}

resource "aws_route_table_association" "dados" {
  count          = length(var.zonas)
  subnet_id      = aws_subnet.dados[count.index].id
  route_table_id = aws_route_table.privada[count.index].id
}

# Acesso ao S3 sem passar pelo NAT (mais barato e não sai da rede da AWS).
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.principal.id
  service_name      = "com.amazonaws.${var.regiao}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.privada[*].id
  tags              = { Name = "${local.nome}-s3" }
}

# ---------- grupos de segurança ----------

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_security_group" "balanceador" {
  name        = "${local.nome}-balanceador"
  description = "Balanceador da API: so aceita trafego vindo do CloudFront"
  vpc_id      = aws_vpc.principal.id
  tags        = { Name = "${local.nome}-balanceador" }
}

resource "aws_vpc_security_group_ingress_rule" "balanceador_cloudfront" {
  security_group_id = aws_security_group.balanceador.id
  description       = "CloudFront"
  ip_protocol       = "tcp"
  from_port         = local.com_dominio ? 443 : 80
  to_port           = local.com_dominio ? 443 : 80
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
}

resource "aws_vpc_security_group_egress_rule" "balanceador_api" {
  security_group_id            = aws_security_group.balanceador.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = aws_security_group.api.id
}

resource "aws_security_group" "api" {
  name        = "${local.nome}-api"
  description = "Tarefas da API"
  vpc_id      = aws_vpc.principal.id
  tags        = { Name = "${local.nome}-api" }
}

resource "aws_vpc_security_group_ingress_rule" "api_balanceador" {
  security_group_id            = aws_security_group.api.id
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = aws_security_group.balanceador.id
}

resource "aws_vpc_security_group_egress_rule" "api_saida" {
  security_group_id = aws_security_group.api.id
  description       = "Saida HTTPS (AWS, Cognito, integracoes) e acesso ao banco e cache"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "dados" {
  name        = "${local.nome}-dados"
  description = "Banco e cache: so a API acessa"
  vpc_id      = aws_vpc.principal.id
  tags        = { Name = "${local.nome}-dados" }
}

resource "aws_vpc_security_group_ingress_rule" "dados_postgres" {
  security_group_id            = aws_security_group.dados.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.api.id
}

resource "aws_vpc_security_group_ingress_rule" "dados_redis" {
  security_group_id            = aws_security_group.dados.id
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  referenced_security_group_id = aws_security_group.api.id
}
