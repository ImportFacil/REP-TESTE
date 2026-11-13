#!/usr/bin/env bash
# Cria a homologação da Export Fácil numa conta AWS nova, direto do AWS CloudShell (região São Paulo).
#
# No console da AWS: escolha a região "América do Sul (São Paulo)", abra o CloudShell (ícone >_ no topo) e cole:
#
#   curl -fsSL https://raw.githubusercontent.com/ImportFacil/Export-F-cil-PROTOTIPE/main/infra/cloudshell/criar-homologacao.sh | bash
#
# O que faz (de 15 a 25 minutos):
#   1. instala o Terraform no CloudShell;
#   2. baixa este repositório;
#   3. cria a base da conta (bucket do estado, repositório de imagens, papéis do GitHub);
#   4. cria a homologação (rede, banco, API, site, login);
#   5. mostra os valores para colar no GitHub.
#
# Pode rodar de novo quantas vezes quiser: o que já existe não é recriado.
# Produção NÃO é criada aqui (fica para perto do lançamento; ver docs/conta-aws-gratuita.md).
set -euo pipefail

VERSAO_TERRAFORM="1.10.5"
REPO="https://github.com/ImportFacil/Export-F-cil-PROTOTIPE.git"
PASTA="$HOME/Export-F-cil-PROTOTIPE"
REGIAO="sa-east-1"
export AWS_REGION="$REGIAO" AWS_DEFAULT_REGION="$REGIAO"

titulo() { printf '\n\033[1;34m== %s ==\033[0m\n' "$1"; }
aviso() { printf '\033[1;33m%s\033[0m\n' "$1"; }

# A entrada do teclado vem do terminal mesmo quando o script chega por "curl | bash".
perguntar() { local r; read -r -p "$1" r </dev/tty; echo "$r"; }

titulo "Conferindo a conta"
CONTA=$(aws sts get-caller-identity --query Account --output text)
echo "Conta AWS: $CONTA   Região: $REGIAO"

echo
aviso "A homologação consome os créditos da AWS: cerca de US\$ 3 por dia ligada o tempo todo,"
aviso "ou cerca de US\$ 2 por dia com o horário automático (ligada só em dias úteis, das 8h às 20h)."
aviso "Durante a criação, clique dentro deste terminal a cada 10 minutos: o CloudShell fecha após 20 minutos sem uso."
if [ "${CONFIRMAR:-}" != "sim" ]; then
  [ "$(perguntar 'Continuar? (s/n) ')" = "s" ] || { echo "Nada foi criado."; exit 0; }
fi

EMAIL="${EMAIL_ALERTAS:-}"
while [ -z "$EMAIL" ]; do EMAIL=$(perguntar 'E-mail para os alertas (ex.: ti@exportfacil.com.br): '); done

titulo "1/5 Terraform $VERSAO_TERRAFORM"
mkdir -p "$HOME/bin"
export PATH="$HOME/bin:$PATH"
if ! terraform version 2>/dev/null | grep -q "v$VERSAO_TERRAFORM"; then
  case "$(uname -m)" in aarch64 | arm64) ARQ=arm64 ;; *) ARQ=amd64 ;; esac
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/tf.zip" "https://releases.hashicorp.com/terraform/${VERSAO_TERRAFORM}/terraform_${VERSAO_TERRAFORM}_linux_${ARQ}.zip"
  unzip -oq "$tmp/tf.zip" -d "$tmp" && mv "$tmp/terraform" "$HOME/bin/terraform" && rm -rf "$tmp"
fi
terraform version | head -1
# Plugins da AWS guardados fora da pasta do projeto (o CloudShell tem só 1 GB no $HOME).
export TF_PLUGIN_CACHE_DIR="/tmp/terraform-plugins"
mkdir -p "$TF_PLUGIN_CACHE_DIR"
export TF_IN_AUTOMATION=1

titulo "2/5 Código"
if [ -d "$PASTA/.git" ]; then
  git -C "$PASTA" pull -q --ff-only
else
  git clone -q --depth 1 "$REPO" "$PASTA"
fi
git -C "$PASTA" log -1 --format='Versão: %h %s'

titulo "3/5 Base da conta (bootstrap)"
cd "$PASTA/infra/bootstrap"
BUCKET="exportfacil-terraform-estado-$CONTA"
COPIA="s3://$BUCKET/bootstrap/terraform.tfstate"
# O estado do bootstrap fica no CloudShell e uma cópia no bucket; se o CloudShell perdeu o arquivo, recupera a cópia.
if [ ! -f terraform.tfstate ] && aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  aws s3 cp "$COPIA" terraform.tfstate --only-show-errors 2>/dev/null && echo "Estado recuperado do bucket."
fi
terraform init -input=false -upgrade >/dev/null
terraform apply -input=false -auto-approve
aws s3 cp terraform.tfstate "$COPIA" --only-show-errors
KMS=$(terraform output -raw kms_estado)
ECR=$(terraform output -raw repositorio_imagens)
PAPEL_BUILD=$(terraform output -raw papel_build)
PAPEL_HOMOLOG=$(terraform output -json papeis_deploy | python3 -c 'import json,sys; print(json.load(sys.stdin)["homolog"])')

titulo "4/5 Homologação"
cd "$PASTA/infra/ambientes"
printf 'bucket     = "%s"\nkms_key_id = "%s"\n' "$BUCKET" "$KMS" >backend.hcl
cd homolog
if [ ! -f homolog.tfvars ]; then
  # A primeira versão da API ainda não existe no ECR: o primeiro deploy pelo GitHub a coloca no ar.
  printf 'imagem_api         = "%s"\nimagem_tag_inicial = "inicial"\nemail_alertas      = "%s"\n' "$ECR" "$EMAIL" >homolog.tfvars
fi
aws s3 cp homolog.tfvars "s3://$BUCKET/ambientes/homolog.tfvars" --only-show-errors
# Trava esquecida por uma sessão do CloudShell que fechou no meio: remove se tiver mais de 20 minutos.
TRAVA="ambientes/homolog.tfstate.tflock"
if quando=$(aws s3api head-object --bucket "$BUCKET" --key "$TRAVA" --query LastModified --output text 2>/dev/null); then
  if [ $(($(date +%s) - $(date -d "$quando" +%s))) -gt 1200 ]; then
    aws s3 rm "s3://$BUCKET/$TRAVA" --only-show-errors && echo "Trava antiga removida."
  fi
fi
terraform init -input=false -reconfigure -backend-config=../backend.hcl >/dev/null
terraform apply -input=false -auto-approve -lock-timeout=2m -var-file=homolog.tfvars
URL_SITE=$(aws ssm get-parameter --name /exportfacil/homolog/site/url --query Parameter.Value --output text)

titulo "5/5 Pronto. Agora, no GitHub"
cat <<FIM

Repositório ImportFacil/Export-F-cil-PROTOTIPE > Settings > Secrets and variables > Actions > aba Variables:

  Variáveis do repositório (New repository variable):
    AWS_PAPEL_BUILD = $PAPEL_BUILD
    ECR_REPOSITORIO = $ECR

Settings > Environments > New environment "homolog" > Add environment variable:
    AWS_PAPEL_DEPLOY = $PAPEL_HOMOLOG

Depois: Actions > Entrega > Run workflow (ambiente: homolog). Leva uns 10 minutos.
Por último: Actions > Criar administrador > Run workflow (seu e-mail e nome).

Endereço da homologação: $URL_SITE
(Até o primeiro deploy, a API aparece fora do ar e a AWS pode mandar alertas: é esperado.)

Confirme também a inscrição no e-mail de alertas que a AWS enviou para $EMAIL.
FIM
