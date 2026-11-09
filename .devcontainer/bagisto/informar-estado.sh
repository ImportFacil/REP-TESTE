#!/usr/bin/env bash
# Publica no ramo "app-endereco" o endereço e o estado da loja deste Codespace:
#   endereco.json  {url, codespace, atualizado}
#   estado.json    {url, fase: instalando|no_ar|parou, porta: public|private|?, atualizado, log: [...]}
# A página do QR (importfacil.github.io/REP-TESTE/app/) lê esses arquivos; a equipe usa o log para diagnosticar.
# Também torna a porta 8000 pública assim que a loja sobe. Roda em segundo plano enquanto o Codespace estiver ligado.
set -u
[ -n "${CODESPACE_NAME:-}" ] || { echo "Fora do Codespaces."; exit 0; }

dominio="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
url="https://${CODESPACE_NAME}-8000.${dominio}"
repo="${GITHUB_REPOSITORY:-ImportFacil/REP-TESTE}"
LOG=/tmp/loja-bagisto.log

no_ar() { (exec 3<>/dev/tcp/127.0.0.1/8000) 2>/dev/null; }

porta() {
  local v
  v=$(gh codespace ports -c "$CODESPACE_NAME" --json sourcePort,visibility -q '.[] | select(.sourcePort==8000) | .visibility' 2>/dev/null)
  echo "${v:-?}"
}

rodando_instalacao() { # sem depender do pgrep (a imagem pode não ter o procps)
  local c
  for c in /proc/[0-9]*/cmdline; do
    tr '\0' ' ' < "$c" 2>/dev/null | grep -q "/opt/demo/[i]niciar.sh" && return 0
  done
  return 1
}

fase() {
  if no_ar; then echo no_ar
  elif rodando_instalacao; then echo instalando
  else echo parou; fi
}

publicar() { # fase porta
  local pasta destino
  pasta=$(mktemp -d)
  printf '{"url":"%s","codespace":"%s","atualizado":"%s"}\n' "$url" "$CODESPACE_NAME" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$pasta/endereco.json"
  # últimas linhas do log da instalação, sem nada que pareça senha ou chave
  tail -n 60 "$LOG" 2>/dev/null | grep -viE "password|senha|secret|token|app_key|key=" | cut -c1-300 \
    | python3 -c 'import sys,json; print(json.dumps([l.rstrip("\n") for l in sys.stdin]))' > "$pasta/log.json" 2>/dev/null || echo '[]' > "$pasta/log.json"
  python3 - "$pasta" "$url" "$1" "$2" <<'PY'
import json, sys, datetime
pasta, url, fase, porta = sys.argv[1:5]
log = json.load(open(pasta + '/log.json'))
json.dump({'url': url, 'fase': fase, 'porta': porta,
           'atualizado': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'log': log},
          open(pasta + '/estado.json', 'w'), ensure_ascii=False, indent=1)
PY
  rm -f "$pasta/log.json"
  (
    cd "$pasta" && git init -q -b app-endereco && git config user.name "Codespace ${CODESPACE_NAME}" \
      && git config user.email "codespace@users.noreply.github.com" && git add -A && git commit -qm "Loja ${CODESPACE_NAME}: $1, porta $2"
    if [ -n "${GITHUB_TOKEN:-}" ]; then destino="https://x-access-token:${GITHUB_TOKEN}@github.com/${repo}.git"; else destino="https://github.com/${repo}.git"; fi
    git push -qf "$destino" app-endereco
  ) >/tmp/informar-estado-push.log 2>&1 && echo "$(date -Is) publicado: $1, porta $2" || echo "$(date -Is) falha ao publicar (veja /tmp/informar-estado-push.log)"
  rm -rf "$pasta"
}

ultimo="" ; ultima_vez=0 ; tentou_porta=0
while true; do
  f=$(fase)
  if [ "$f" = no_ar ] && [ "$tentou_porta" -lt 6 ] && [ "$(porta)" != public ]; then
    gh codespace ports visibility 8000:public -c "$CODESPACE_NAME" >>/tmp/porta-publica.log 2>&1 && echo "$(date -Is) porta 8000 pública" >>/tmp/porta-publica.log
    tentou_porta=$((tentou_porta + 1))
  fi
  p=$(porta)
  agora=$(date +%s)
  # publica quando o estado muda, a cada 2 minutos durante a instalação e a cada 15 minutos depois
  intervalo=120; [ "$f" = no_ar ] && [ "$p" = public ] && intervalo=900
  if [ "$f/$p" != "$ultimo" ] || [ $((agora - ultima_vez)) -ge $intervalo ]; then
    publicar "$f" "$p"
    ultimo="$f/$p"; ultima_vez=$agora
  fi
  sleep 30
done
