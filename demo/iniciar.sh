#!/usr/bin/env bash
# Sobe a demonstração ImportFácil: espera o banco, aplica as migrações, carrega os dados de demonstração
# (só o que falta) e liga a API servindo o site na porta 8000.
# No Codespaces, antes de tudo baixa o código mais novo do repositório e remonta o que mudou.
set -euo pipefail
trap 'echo "[iniciar.sh] falhou na linha $LINENO: $BASH_COMMAND" >&2' ERR
echo "[iniciar.sh] começando $(date -Is)"
APP=/opt/importfacil

if [ -z "${APP_URL:-}" ]; then
  if [ -n "${CODESPACE_NAME:-}" ]; then
    APP_URL="https://${CODESPACE_NAME}-8000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  else
    APP_URL="http://localhost:8000"
  fi
fi

# ---------- Codespaces: atualiza pelo repositório a cada início (sem reconstruir a imagem) ----------
atualizar_do_repositorio() {
  local repo
  repo=$(ls -d /workspaces/*/backend 2>/dev/null | head -1 | xargs -r dirname) || true
  [ -n "${CODESPACE_NAME:-}" ] && [ -n "$repo" ] || return 0
  echo "== Atualizando o código pelo repositório =="
  git -c safe.directory='*' -C "$repo" pull --ff-only -q 2>&1 | tail -2 || echo "aviso: não foi possível baixar a versão nova; seguindo com a atual"
  if [ -z "${IF_ATUALIZADO:-}" ] && ! cmp -s "$repo/demo/iniciar.sh" "$APP/demo/iniciar.sh"; then
    cp "$repo/demo/iniciar.sh" "$APP/demo/iniciar.sh"
    IF_ATUALIZADO=1 exec bash "$APP/demo/iniciar.sh"
  fi
  local versao; versao=$(git -c safe.directory='*' -C "$repo" rev-parse HEAD 2>/dev/null || echo "?")
  if [ "$versao" = "$(cat "$APP/.versao" 2>/dev/null)" ]; then echo "Código já está na versão ${versao:0:7}"; return 0; fi
  for parte in backend frontend; do
    if ! cmp -s "$repo/$parte/package-lock.json" "$APP/$parte/package-lock.json"; then
      cp "$repo/$parte/package.json" "$repo/$parte/package-lock.json" "$APP/$parte/"
      (cd "$APP/$parte" && npm ci --no-audit --no-fund --loglevel=error)
    fi
  done
  rm -rf "$APP/backend/src" "$APP/frontend/src" "$APP/frontend/public"
  cp -r "$repo/backend/src" "$APP/backend/src"
  cp "$repo"/backend/tsconfig*.json "$APP/backend/"
  cp -r "$repo/frontend/src" "$repo/frontend/public" "$APP/frontend/"
  cp "$repo"/frontend/{next.config.mjs,tsconfig.json} "$APP/frontend/" 2>/dev/null || true
  echo "== Montando a API e o site =="
  (cd "$APP/backend" && npm run build --silent)
  (cd "$APP/frontend" && NEXT_TELEMETRY_DISABLED=1 npm run build --silent >/dev/null)
  echo "$versao" > "$APP/.versao"
  echo "Código atualizado: $(git -c safe.directory='*' -C "$repo" log -1 --format='%h %s' 2>/dev/null)"
}
atualizar_do_repositorio

# ---------- Configuração da demonstração ----------
export AMBIENTE=local AUTH_MODO=dev AUTH_SEGREDO_DEV="${AUTH_SEGREDO_DEV:-segredo-da-demonstracao}"
export DATABASE_URL="${DATABASE_URL:-postgres://importfacil:importfacil@db:5432/importfacil}"
export PORTA=8000 PREFIXO_API=api PASTA_SITE="$APP/frontend/out" WORKER_NA_API=true
export CORS_ORIGENS="$APP_URL" SALTOS_PROXY="${SALTOS_PROXY:-1}" PASTA_ARQUIVOS=/opt/importfacil/arquivos
printf '{"ambiente":"demonstracao","api":"/api","auth":"dev"}\n' > "$APP/frontend/out/config.json"

cd "$APP/backend"
echo "Aguardando o banco"
for i in $(seq 1 60); do node -e "const {Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL});c.connect().then(()=>c.end()).then(()=>process.exit(0),()=>process.exit(1))" && break; sleep 2; done
npm run migrar --silent
npm run semear --silent -- --demonstracao

echo "Loja e Painel: ${APP_URL}   (login de demonstração em ${APP_URL}/entrar/)"
exec node dist/main.js
