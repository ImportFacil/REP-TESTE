# syntax=docker/dockerfile:1.7
# Imagem da API Export Fácil. A mesma imagem vai para homologação e, depois da aprovação, para produção.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    DB_CA_PATH=/app/certs/rds-global-bundle.pem
WORKDIR /app
# Certificados do RDS, para conectar ao banco com TLS verificado.
ADD --chmod=444 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/certs/rds-global-bundle.pem
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
ARG VERSAO_APP=desconhecida
ENV VERSAO_APP=${VERSAO_APP}
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
