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

API_PID=""
parar_api() {
  if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    for _ in $(seq 1 20); do kill -0 "$API_PID" 2>/dev/null || break; sleep 0.5; done
    kill -9 "$API_PID" 2>/dev/null || true
  fi
  API_PID=""
}

# ---------- Codespaces: atualiza pelo repositório a cada início (sem reconstruir a imagem) ----------
atualizar_do_repositorio() {
  local repo
  repo=$(ls -d /workspaces/*/backend 2>/dev/null | head -1 | xargs -r dirname) || true
  [ -n "${CODESPACE_NAME:-}" ] && [ -n "$repo" ] || return 0
  echo "== Atualizando o código pelo repositório =="
  git -c safe.directory='*' -C "$repo" pull --ff-only -q 2>&1 | tail -2 || echo "aviso: não foi possível baixar a versão nova; seguindo com a atual"
  if [ -z "${IF_ATUALIZADO:-}" ] && ! cmp -s "$repo/demo/iniciar.sh" "$APP/demo/iniciar.sh"; then
    cp "$repo/demo/iniciar.sh" "$APP/demo/iniciar.sh"
    parar_api
    IF_ATUALIZADO=1 exec bash "$APP/demo/iniciar.sh"
  fi
  local versao; versao=$(git -c safe.directory='*' -C "$repo" rev-parse HEAD 2>/dev/null || echo "?")
  if [ "$versao" = "$(cat "$APP/.versao" 2>/dev/null)" ]; then echo "Código já está na versão ${versao:0:7}"; return 0; fi
  for parte in backend frontend; do
    if ! cmp -s "$repo/$parte/package-lock.json" "$APP/$parte/package-lock.json"; then
      cp "$repo/$parte/package.json" "$repo/$parte/package-lock.json" "$APP/$parte/"
      (cd "$APP/$parte" && npm ci --no-audit --no-fund --loglevel=error) || return 1
    fi
  done
  rm -rf "$APP/backend/src" "$APP/frontend/src" "$APP/frontend/public"
  cp -r "$repo/backend/src" "$APP/backend/src"
  cp "$repo"/backend/tsconfig*.json "$APP/backend/"
  cp -r "$repo/frontend/src" "$repo/frontend/public" "$APP/frontend/"
  cp "$repo"/frontend/{next.config.mjs,tsconfig.json} "$APP/frontend/" 2>/dev/null || true
  echo "== Montando a API e o site =="
  (cd "$APP/backend" && npm run build --silent) || return 1
  (cd "$APP/frontend" && NEXT_TELEMETRY_DISABLED=1 npm run build --silent >/dev/null) || return 1
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
node dist/scripts/demo-movimento.js   # 90 dias de pedidos e pagamentos (só se o banco ainda não tiver pedidos)

echo "Loja e Painel: ${APP_URL}   (login de demonstração em ${APP_URL}/entrar/)"
if [ -z "${CODESPACE_NAME:-}" ]; then exec node dist/main.js; fi

# ---------- Codespaces: fica de olho no repositório enquanto estiver ligado ----------
# A cada 5 minutos procura versão nova no GitHub. Achando, monta a versão nova com a loja ainda no ar
# e só então troca (a loja fica fora por alguns segundos). Se a API cair, liga de novo.
ligar_api() { node dist/main.js & API_PID=$!; }
ligar_api
REPO=$(ls -d /workspaces/*/backend 2>/dev/null | head -1 | xargs -r dirname)
while true; do
  sleep "${INTERVALO_ATUALIZACAO:-300}"
  # compara o GitHub com a versão montada (se uma atualização falhar, tenta de novo na próxima volta)
  if [ -n "$REPO" ] && git -c safe.directory='*' -C "$REPO" fetch -q origin 2>/dev/null \
     && [ "$(git -c safe.directory='*' -C "$REPO" rev-parse '@{u}' 2>/dev/null || echo "?")" != "$(cat "$APP/.versao" 2>/dev/null)" ]; then
    echo "== $(date -Is) versão nova no GitHub =="
    if IF_ATUALIZADO= atualizar_do_repositorio && [ "$(git -c safe.directory='*' -C "$REPO" rev-parse HEAD)" = "$(cat "$APP/.versao" 2>/dev/null)" ]; then
      (cd "$APP/backend" && npm run migrar --silent && npm run semear --silent -- --demonstracao) || echo "aviso: migração ou dados de demonstração com problema"
      printf '{"ambiente":"demonstracao","api":"/api","auth":"dev"}\n' > "$APP/frontend/out/config.json"
      parar_api
      cd "$APP/backend" && ligar_api
      echo "== $(date -Is) loja atualizada: $(cat "$APP/.versao" 2>/dev/null | cut -c1-7) =="
    else
      echo "aviso: a atualização falhou; a versão anterior continua no ar"
    fi
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "== $(date -Is) a API tinha parado; ligando de novo =="
    cd "$APP/backend" && ligar_api
  fi
done
