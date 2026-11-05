terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.80, < 6.0"
      # O WAF e o certificado do CloudFront precisam ficar em us-east-1.
      configuration_aliases = [aws.us_east_1]
    }
    random = { source = "hashicorp/random", version = ">= 3.6" }
  }
}
