# Borda: CloudFront entrega o site (S3) e repassa /api/* para a API. O WAF bloqueia ataques comuns.

resource "aws_s3_bucket" "site" {
  bucket = "${local.nome}-site-${local.conta}"
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${local.nome}-site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "SomenteCloudFront"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.site.arn}/*"
        Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.site.arn } }
      },
      {
        Sid       = "SomenteTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.site.arn, "${aws_s3_bucket.site.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
  depends_on = [aws_s3_bucket_public_access_block.site]
}

# Rotas do site sem extensão (ex.: /pedidos/123) entregam o index.html; arquivos (.js, .css, .png) seguem normais.
resource "aws_cloudfront_function" "rotas_site" {
  name    = "${local.nome}-rotas-site"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-JS
    function handler(event) {
      var req = event.request;
      var ultimo = req.uri.split('/').pop();
      if (ultimo.indexOf('.') === -1) req.uri = '/index.html';
      return req;
    }
  JS
}

data "aws_cloudfront_cache_policy" "otimizado" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "sem_cache" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "tudo_menos_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

data "aws_cloudfront_response_headers_policy" "seguranca" {
  name = "Managed-SecurityHeadersPolicy"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  comment             = local.nome
  default_root_object = "index.html"
  price_class         = "PriceClass_All" # inclui os pontos de presença no Brasil
  http_version        = "http2and3"
  web_acl_id          = aws_wafv2_web_acl.borda.arn
  aliases             = local.com_dominio ? [var.dominio_site] : []

  origin {
    origin_id                = "site"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  origin {
    origin_id   = "api"
    domain_name = local.com_dominio ? var.dominio_origem_api : aws_lb.api.dns_name
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = local.com_dominio ? "https-only" : "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_read_timeout    = 60
    }
    custom_header {
      name  = "X-Origem-ImportFacil"
      value = random_password.origem.result
    }
  }

  default_cache_behavior {
    target_origin_id           = "site"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.otimizado.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.seguranca.id
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.rotas_site.arn
    }
  }

  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = "api"
    viewer_protocol_policy     = "https-only"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.sem_cache.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.tudo_menos_host.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.seguranca.id
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = !local.com_dominio
    acm_certificate_arn            = one(aws_acm_certificate_validation.site[*].certificate_arn)
    ssl_support_method             = local.com_dominio ? "sni-only" : null
    minimum_protocol_version       = local.com_dominio ? "TLSv1.2_2021" : "TLSv1"
  }
}

# ---------- WAF (precisa ficar em us-east-1 por ser do CloudFront) ----------

resource "aws_wafv2_web_acl" "borda" {
  provider = aws.us_east_1
  name     = "${local.nome}-borda"
  scope    = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "limite-por-ip"
    priority = 1
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = var.waf_limite_por_ip
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      sampled_requests_enabled   = true
      cloudwatch_metrics_enabled = true
      metric_name                = "limite-por-ip"
    }
  }

  dynamic "rule" {
    for_each = {
      AWSManagedRulesAmazonIpReputationList = 2
      AWSManagedRulesKnownBadInputsRuleSet  = 3
      AWSManagedRulesCommonRuleSet          = 4
    }
    content {
      name     = rule.key
      priority = rule.value
      override_action {
        none {}
      }
      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = rule.key
          # Envio de documentos do cadastro (fase 2) passa de 8 KB: só registra, não bloqueia.
          dynamic "rule_action_override" {
            for_each = rule.key == "AWSManagedRulesCommonRuleSet" ? ["SizeRestrictions_BODY"] : []
            content {
              name = rule_action_override.value
              action_to_use {
                count {}
              }
            }
          }
        }
      }
      visibility_config {
        sampled_requests_enabled   = true
        cloudwatch_metrics_enabled = true
        metric_name                = rule.key
      }
    }
  }

  visibility_config {
    sampled_requests_enabled   = true
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.nome}-borda"
  }
}

# ---------- domínio próprio (opcional) ----------

resource "aws_acm_certificate" "site" {
  count             = local.com_dominio ? 1 : 0
  provider          = aws.us_east_1
  domain_name       = var.dominio_site
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "aws_acm_certificate" "origem_api" {
  count             = local.com_dominio ? 1 : 0
  domain_name       = var.dominio_origem_api
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

locals {
  validacoes = merge(
    { for c in aws_acm_certificate.site : "site" => one(c.domain_validation_options) },
    { for c in aws_acm_certificate.origem_api : "origem_api" => one(c.domain_validation_options) },
  )
}

resource "aws_route53_record" "validacao" {
  for_each        = local.validacoes
  zone_id         = var.zona_route53_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "site" {
  count                   = local.com_dominio ? 1 : 0
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.site[0].arn
  validation_record_fqdns = [aws_route53_record.validacao["site"].fqdn]
}

resource "aws_acm_certificate_validation" "origem_api" {
  count                   = local.com_dominio ? 1 : 0
  certificate_arn         = aws_acm_certificate.origem_api[0].arn
  validation_record_fqdns = [aws_route53_record.validacao["origem_api"].fqdn]
}

resource "aws_route53_record" "site" {
  count   = local.com_dominio ? 1 : 0
  zone_id = var.zona_route53_id
  name    = var.dominio_site
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "origem_api" {
  count   = local.com_dominio ? 1 : 0
  zone_id = var.zona_route53_id
  name    = var.dominio_origem_api
  type    = "A"
  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }
}
