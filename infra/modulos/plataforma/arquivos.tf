# Documentos do cadastro, XML e PDF de NF-e e fotos do catálogo.
# Criptografados, nunca públicos, com histórico de versões (um arquivo apagado por engano pode ser recuperado).

resource "aws_s3_bucket" "arquivos" {
  bucket = "${local.nome}-arquivos-${local.conta}"
}

resource "aws_s3_bucket_versioning" "arquivos" {
  bucket = aws_s3_bucket.arquivos.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "arquivos" {
  bucket = aws_s3_bucket.arquivos.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.principal.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "arquivos" {
  bucket                  = aws_s3_bucket.arquivos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "arquivos" {
  bucket = aws_s3_bucket.arquivos.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_lifecycle_configuration" "arquivos" {
  bucket = aws_s3_bucket.arquivos.id
  rule {
    id     = "versoes-antigas"
    status = "Enabled"
    filter {}
    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }
    # Documentos fiscais: guarda de 5 anos (LGPD e obrigação fiscal), com folga.
    noncurrent_version_expiration {
      noncurrent_days = 2190
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_policy" "arquivos" {
  bucket = aws_s3_bucket.arquivos.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "SomenteTLS"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.arquivos.arn, "${aws_s3_bucket.arquivos.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.arquivos]
}
