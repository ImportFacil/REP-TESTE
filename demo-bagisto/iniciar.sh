#!/usr/bin/env bash
# Configura o .env, instala o Bagisto + B2B Suite e o catálogo da ImportFácil na primeira vez
# (o banco guarda a marca "importfacil.demo.instalado") e sobe a loja na porta 8000.
set -euo pipefail
cd /var/www/bagisto

: "${DB_HOST:=db}" "${DB_PORT:=3306}" "${DB_DATABASE:=bagisto}" "${DB_USERNAME:=bagisto}" "${DB_PASSWORD:=bagisto}"
if [ -z "${APP_URL:-}" ]; then
  if [ -n "${CODESPACE_NAME:-}" ]; then
    APP_URL="https://${CODESPACE_NAME}-8000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  else
    APP_URL="http://localhost:8000"
  fi
fi

[ -f .env ] || cp .env.example .env
env_set() { # chave valor
  local k="$1" v="$2"
  if grep -q "^${k}=" .env; then sed -i "s|^${k}=.*|${k}=${v}|" .env; else echo "${k}=${v}" >> .env; fi
}
env_set APP_NAME '"ImportFácil"'
env_set APP_ENV local
env_set APP_DEBUG "${APP_DEBUG:-false}"
env_set APP_URL "$APP_URL"
env_set PUBLIC_STORAGE_URL /storage
env_set APP_TIMEZONE America/Sao_Paulo
env_set APP_LOCALE pt_BR
env_set APP_FAKER_LOCALE pt_BR
env_set APP_CURRENCY BRL
env_set DB_CONNECTION mysql
env_set DB_HOST "$DB_HOST"
env_set DB_PORT "$DB_PORT"
env_set DB_DATABASE "$DB_DATABASE"
env_set DB_USERNAME "$DB_USERNAME"
env_set DB_PASSWORD "$DB_PASSWORD"
env_set MAIL_MAILER log
env_set QUEUE_CONNECTION sync
env_set CACHE_STORE file
grep -q '^APP_KEY=base64' .env || php artisan key:generate --force >/dev/null

consulta() { # imprime o resultado de uma consulta de uma coluna, ou ERRO
  php -r '
    try { $p = new PDO("mysql:host=".getenv("H").";port=".getenv("P").";dbname=".getenv("D"), getenv("U"), getenv("S"));
          echo $p->query($argv[1])->fetchColumn(); }
    catch (Throwable $e) { echo "ERRO"; }' "$1"
}
export H="$DB_HOST" P="$DB_PORT" D="$DB_DATABASE" U="$DB_USERNAME" S="$DB_PASSWORD"

echo "Aguardando o MySQL em ${DB_HOST}:${DB_PORT}..."
for i in $(seq 1 120); do [ "$(consulta 'select 1')" = "1" ] && break; sleep 2; done
[ "$(consulta 'select 1')" = "1" ] || { echo "MySQL não respondeu"; exit 1; }

if [ "$(consulta "select count(*) from core_config where code='importfacil.demo.instalado'")" != "1" ]; then
  echo "== Instalando Bagisto (pt_BR, BRL) =="
  php artisan bagisto:install -n --force
  echo "== Instalando B2B Suite =="
  php artisan b2b-suite:install
  echo "== Carregando a ImportFácil =="
  php artisan importfacil:demo /opt/demo/catalogo-importfacil.json /opt/demo/imagens /opt/demo/marca
  php artisan indexer:index --mode=full
fi

php artisan storage:link >/dev/null 2>&1 || true
php artisan optimize:clear >/dev/null

if [ "${SO_INSTALAR:-0}" = "1" ]; then echo "Instalação concluída."; exit 0; fi

echo "Loja: ${APP_URL}   Painel: ${APP_URL}/admin"
export PHP_CLI_SERVER_WORKERS="${PHP_CLI_SERVER_WORKERS:-8}"
exec php artisan serve --host=0.0.0.0 --port=8000
