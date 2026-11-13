# Demonstração da plataforma Export Fácil num endereço só: a API (NestJS, em /api) serve também o site (Next.js).
# O banco (PostgreSQL 16) roda em outro contêiner; veja demo/docker-compose.yml. Contexto do build: a raiz do repositório.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates python3 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/exportfacil
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --no-audit --no-fund
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci --no-audit --no-fund

COPY backend backend
COPY frontend frontend
RUN cd backend && npm run build \
 && cd ../frontend && NEXT_TELEMETRY_DISABLED=1 npm run build

COPY demo/iniciar.sh demo/iniciar.sh
EXPOSE 8000
CMD ["bash", "/opt/exportfacil/demo/iniciar.sh"]
