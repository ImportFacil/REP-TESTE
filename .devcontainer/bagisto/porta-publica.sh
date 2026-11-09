#!/usr/bin/env bash
# Espera a loja responder na porta 8000 e então torna a porta pública,
# para o celular abrir a loja e instalar o app sem login no GitHub.
# (Antes de a loja subir, a porta ainda não existe e o comando falha.)
set -u
[ -n "${CODESPACE_NAME:-}" ] || { echo "Fora do Codespaces."; exit 0; }

no_ar() { (exec 3<>/dev/tcp/127.0.0.1/8000) 2>/dev/null; }

for i in $(seq 1 180); do   # até 30 minutos
  no_ar && break
  sleep 10
done
no_ar || { echo "A loja não subiu em 30 minutos."; exit 1; }
echo "Loja no ar; tornando a porta 8000 pública."

for tentativa in 1 2 3 4 5 6; do
  if gh codespace ports visibility 8000:public -c "$CODESPACE_NAME"; then
    echo "Porta 8000 pública."
    exit 0
  fi
  sleep 10
done
echo "Não foi possível tornar a porta pública. Faça à mão: aba PORTAS → 8000 → botão direito → Visibilidade da porta → Pública."
exit 1
