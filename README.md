# Zyqentra

Zyqentra brings a team and its AI agents onto one board: projects, testing, marketing pages and
reports. It is built on [OpenClaw](https://github.com/openclaw/openclaw) (MIT, self-hosted AI agent
gateway) and set up first for the ZyoraERP project. OpenClaw is **not forked**: this repo runs the official
release at a pinned version and adds our own plugins, skills and UI on top.

| Part | Path | What it is |
| --- | --- | --- |
| Console | `apps/console` | Next.js board for the team: cards by stage, linked GitHub issues/PRs, test proof, start agents |
| `zyqentra-github` plugin | `plugins/github` | Agent tools: issues, PR status (checks + Vercel previews), comments. No merge or push |
| `zyqentra-qa` plugin | `plugins/qa` | Agent tools: run `npm run verify` on a branch, browser smoke tests, marketing page audits |
| Skills | `skills/` | Playbooks for the ZyoraERP project: `zyora-pr-check`, `zyora-new-work`, `zyora-marketing-page`, `zyora-daily-report` |
| Deploy | `deploy/` | Docker Compose: Gateway (pinned OpenClaw image + our plugins) and console, loopback-only |

OpenClaw's bundled **Workboard** plugin stores the cards; the console and the agents both work on it.

## Quick start (local)

Needs Node 24.22+ and git.

```bash
npm install
npm run build
cp .env.example .env          # fill in OPENCLAW_GATEWAY_TOKEN, ANTHROPIC_API_KEY, ZYQENTRA_GITHUB_TOKEN
git clone https://github.com/dihaxn/Zyora-erp.git ../zyora-erp-qa   # a checkout only the QA tool uses
# set ZYQENTRA_QA_CHECKOUT=/absolute/path/to/zyora-erp-qa in .env
npm run gateway:dev           # OpenClaw Gateway on 127.0.0.1:18789, state in .openclaw-dev/

cp apps/console/.env.example apps/console/.env.local   # same gateway token, a team password, a session secret
npm run dev:console           # http://localhost:3200
```

OpenClaw's own Control UI (admin: plugins, logs, chat with the agent) is at `http://127.0.0.1:18789`.

## Checks

```bash
npm run verify   # typecheck + lint, unit and integration tests (real git, real Chromium), builds, plugin manifest validation
```

## Docs

- [Architecture](docs/ARCHITECTURE.md): how the pieces fit, what talks to what
- [Deployment](docs/DEPLOYMENT.md): server, Tailscale, tokens, upgrades, backups
- [Security](docs/SECURITY.md): the rules agents work under
- Upgrading OpenClaw: bump `openclaw` in `package.json`, `@openclaw/*` in `apps/console/package.json`
  and `OPENCLAW_VERSION` in `deploy/gateway.Dockerfile` together, read the changelog, run `npm run verify`.
