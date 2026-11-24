# syntax=docker/dockerfile:1
# OpenClaw Gateway with the Zyqentra plugins and skills. Build from the repo root:
#   docker compose -f deploy/docker-compose.yml build
ARG OPENCLAW_VERSION=2026.11.8

FROM node:24-bookworm-slim AS plugins
WORKDIR /src
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/console/package.json ./apps/console/package.json
COPY plugins ./plugins
COPY scripts/gateway-config.mjs scripts/pack-plugins.mjs ./scripts/
RUN npm ci --no-audit --no-fund --include-workspace-root -w plugins/github -w plugins/qa \
 && npm run build -w plugins/github -w plugins/qa \
 && node scripts/pack-plugins.mjs /opt/zyqentra \
 && cd /opt/zyqentra && npm install --omit=dev --omit=peer --no-audit --no-fund

# The -browser image already carries Chromium's system libraries.
FROM ghcr.io/openclaw/openclaw:${OPENCLAW_VERSION}-browser
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && printf '#!/bin/sh\nexec node /app/dist/index.js "$@"\n' > /usr/local/bin/openclaw-cli \
 && chmod +x /usr/local/bin/openclaw-cli \
 && mkdir -p /srv/zyora-erp && chown node:node /srv/zyora-erp
COPY --from=plugins --chown=node:node /opt/zyqentra /opt/zyqentra
COPY --chown=node:node skills /opt/zyqentra/skills
COPY --chown=node:node scripts/gateway-config.mjs scripts/setup-gateway.mjs /opt/zyqentra/scripts/
COPY --chown=node:node deploy/gateway-entrypoint.sh /opt/zyqentra/deploy/gateway-entrypoint.sh
# Plugins import openclaw/plugin-sdk: resolve it to the Gateway's own copy, never a second one.
RUN ln -s /app /opt/zyqentra/node_modules/openclaw
USER node
# Chromium for zyqentra_smoke_test, matching the plugin's pinned playwright-core.
RUN node /opt/zyqentra/node_modules/playwright-core/cli.js install chromium
ENTRYPOINT ["/bin/sh", "/opt/zyqentra/deploy/gateway-entrypoint.sh"]
