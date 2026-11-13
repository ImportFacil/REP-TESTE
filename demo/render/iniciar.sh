#!/usr/bin/env bash
# Início no Render: prepara o banco (Neon) e liga a API, que também serve o site.
# O plano grátis dorme depois de 15 min sem acesso; ao acordar, este script roda de novo
# (migrar e semear não duplicam nada; o movimento de demonstração só entra num banco sem pedidos).
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
: "${DATABASE_URL:?Cole o endereço do banco do Neon em Environment → DATABASE_URL}"

export AMBIENTE=local AUTH_MODO=dev DB_SSL="${DB_SSL:-true}"
export PORTA="${PORT:-10000}" PREFIXO_API=api PASTA_SITE="$RAIZ/frontend/out" WORKER_NA_API=true
export CORS_ORIGENS="${RENDER_EXTERNAL_URL:-http://localhost:${PORT:-10000}}"
export SALTOS_PROXY=1 PASTA_ARQUIVOS=/tmp/importfacil-arquivos   # anexos somem quando o serviço reinicia
export DB_MAX_CONEXOES="${DB_MAX_CONEXOES:-5}"
mkdir -p "$PASTA_ARQUIVOS"

cd "$RAIZ/backend"
npm run migrar --silent
npm run semear --silent -- --demonstracao
node dist/scripts/demo-movimento.js || echo "aviso: movimento de demonstração não carregou"
echo "Loja e Painel: ${RENDER_EXTERNAL_URL:-?}"
exec node dist/main.js
