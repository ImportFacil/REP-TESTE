#!/usr/bin/env bash
# Publica o endereço da loja deste Codespace no ramo "app-endereco" (arquivo endereco.json).
# A página fixa https://importfacil.github.io/REP-TESTE/app/ (a do QR code) lê esse arquivo
# e leva o celular para a loja que estiver ligada.
set -u
[ -n "${CODESPACE_NAME:-}" ] || { echo "Fora do Codespaces: nada a publicar."; exit 0; }

dominio="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
url="https://${CODESPACE_NAME}-8000.${dominio}"
repo="${GITHUB_REPOSITORY:-ImportFacil/REP-TESTE}"
pasta=$(mktemp -d)
trap 'rm -rf "$pasta"' EXIT

printf '{"url":"%s","codespace":"%s","atualizado":"%s"}\n' "$url" "$CODESPACE_NAME" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$pasta/endereco.json"

cd "$pasta"
git init -q -b app-endereco
git config user.name "Codespace ${CODESPACE_NAME}"
git config user.email "codespace@users.noreply.github.com"
git add endereco.json
git commit -qm "Endereço da loja: ${url}"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  destino="https://x-access-token:${GITHUB_TOKEN}@github.com/${repo}.git"
else
  destino="https://github.com/${repo}.git"   # usa o acesso do próprio Codespace
fi

if git push -qf "$destino" app-endereco 2>/tmp/publicar-endereco.err; then
  echo "Endereço publicado: ${url}"
else
  echo "Não foi possível publicar o endereço (veja /tmp/publicar-endereco.err)."
fi
