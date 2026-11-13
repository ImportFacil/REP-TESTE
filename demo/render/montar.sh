#!/usr/bin/env bash
# Build no Render: instala e monta a API e o site (Next.js estático).
set -euo pipefail
cd "$(dirname "$0")/../.."
(cd backend && npm ci --no-audit --no-fund --loglevel=error && npm run build --silent)
(cd frontend && npm ci --no-audit --no-fund --loglevel=error && NEXT_TELEMETRY_DISABLED=1 npm run build --silent)
printf '{"ambiente":"demonstracao","api":"/api","auth":"dev"}\n' > frontend/out/config.json
echo "Montagem concluída."
