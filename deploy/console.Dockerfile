# syntax=docker/dockerfile:1
# The Zyqentra console (Next.js). Build from the repo root.
FROM node:24-bookworm-slim AS build
WORKDIR /opt/zyqentra
COPY package.json package-lock.json ./
COPY plugins/github/package.json plugins/github/package.json
COPY plugins/qa/package.json plugins/qa/package.json
COPY apps/console ./apps/console
RUN npm ci --no-audit --no-fund -w apps/console && npm run build -w apps/console

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /opt/zyqentra
COPY --from=build /opt/zyqentra /opt/zyqentra
USER node
CMD ["npm", "run", "start", "-w", "apps/console"]
