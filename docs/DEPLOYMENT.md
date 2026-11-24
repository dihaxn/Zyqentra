# Deployment

One small Linux server (2 vCPU, 4 GB RAM is enough; `npm run verify` on the ERP is the heaviest job)
running Docker and Tailscale. Both services listen on the server's loopback only.

> Status: the Compose files have not yet been built on a real server. Everything they run was tested
> on its own: the plugins loaded from the same folder layout the image uses, the console against a live
> Gateway, `zyqentra_run_checks` against Zyora-erp. Expect small fixes on the first `docker compose build`.

## 1. Tokens

| Secret | Where to get it | Scope |
| --- | --- | --- |
| `OPENCLAW_GATEWAY_TOKEN` | `openssl rand -hex 32` | Full operator access to the Gateway: treat like a root password |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Set a monthly spend limit on the key |
| `ZYQENTRA_GITHUB_TOKEN` | GitHub → Settings → Developer settings → Fine-grained token | Only `dihaxn/Zyora-erp` (+ `dihaxn/zyqentra`): Issues RW, Pull requests RW, Contents R, Checks R, Commit statuses R, Deployments R |
| `CONSOLE_PASSWORD` | `openssl rand -hex 16`, share in your password manager | Console sign-in |
| `CONSOLE_SESSION_SECRET` | `openssl rand -hex 32` | Signs console sessions |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Vercel → project → Settings → Deployment Protection | Optional, only if previews are protected |

## 2. First start

```bash
git clone https://github.com/dihaxn/zyqentra.git && cd zyqentra
cp .env.example deploy/.env && chmod 600 deploy/.env   # fill it in
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f gateway   # wait for "ready"
```

On first start the Gateway container clones Zyora-erp into the `erp-checkout` volume (git reads the
token from the environment; it is not stored), applies `scripts/gateway-config.mjs` and starts OpenClaw.

## 3. Reach it over Tailscale

```bash
sudo tailscale serve --bg --https=443 http://127.0.0.1:3200      # Zyqentra console for the team
```

Admins reach OpenClaw's own Control UI through an SSH tunnel rather than a proxy (a proxy in front of it
needs `gateway.trustedProxies` set, or local-client checks can be spoofed):

```bash
ssh -L 18789:127.0.0.1:18789 <server>    # then open http://127.0.0.1:18789
```

Do not open ports 3200 or 18789 in the firewall. Run `openclaw-cli security audit` in the gateway
container after any config change; it should report 0 critical findings.

## 4. Team chat (optional)

In the Control UI, enable one channel plugin (Telegram is the quickest), pair it, and restrict it to the
team's accounts. Then schedule the daily report, for example:

```bash
docker compose -f deploy/docker-compose.yml exec gateway openclaw-cli cron add --help
```

## Upgrades

1. Bump the version in `package.json` (`openclaw`), `apps/console/package.json` (`@openclaw/*`) and
   `deploy/gateway.Dockerfile` (`OPENCLAW_VERSION`) together, and update `package-lock.json` with `npm install`.
2. Read the OpenClaw changelog for plugin API and Workboard changes. Run `npm run verify`.
3. On the server: `git pull && docker compose -f deploy/docker-compose.yml up -d --build`.

## Backups

The `openclaw-state` volume holds cards, sessions and agent memory. Back it up daily, for example with
`openclaw backup` inside the container or a volume snapshot, and copy it off the server.
The `erp-checkout` volume can always be re-cloned.
