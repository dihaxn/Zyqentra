# Security rules

OpenClaw agents can call tools that run commands and use credentials. These rules are built into the
code where possible and written into the skills where not.

## Built in

- **Agents only get Zyqentra's tools.** The Gateway runs with `tools.profile: "minimal"` plus an
  allowlist (`scripts/gateway-config.mjs`): the Zyqentra plugins, Workboard, skills and memory. OpenClaw's
  shell, file-write, browser, desktop-control, plugin-install and config tools are not available to
  agents, elevated execution is off, and the browser and computer-use plugins are disabled. Checked with
  `openclaw security audit` (0 critical) and by calling the blocked tools.
- **Tests run without secrets.** `zyqentra_run_checks` gives npm only `PATH`, `HOME`, locale, proxy and CA
  settings (plus names listed in `passEnv`). Model keys and the gateway token never reach `npm ci` or the
  repo's scripts; git alone gets the GitHub token, through a credential helper. A timeout stops the
  whole process tree. Branches are fetched from the ERP's own `origin`, so code from forks is never run.
- **Narrow tools.** `zyqentra-github` only reaches allowlisted repositories and has no merge, approve, push,
  close or delete tool. `zyqentra-qa` only runs allowlisted npm scripts, spawns without a shell, validates
  refs, refuses a dirty checkout and only opens allowlisted hosts (redirects included).
- **Narrow console.** The console can call eight Gateway methods (`lib/gateway-methods.mjs`); config,
  plugin management and tool invocation stay in OpenClaw's own admin UI. The Gateway token never reaches
  the browser. Sessions are signed, expire after 12 hours and are `httpOnly`, `sameSite=strict`.
- **No public ports.** Compose publishes on `127.0.0.1` only; access is over Tailscale.
- **Secrets only in the environment.** `scripts/gateway-config.mjs` is tested to contain none.

## Rules for people

1. Do not install third-party skills or plugins from ClawHub without reading their code. Researchers
   have found published skills that exfiltrate data and carry prompt injection.
2. Agents open draft PRs and comment. People review, merge and deploy.
3. Never give the Gateway the Supabase service-role key, PayHere keys or production database access.
   Database migrations stay a manual step (see Zyora-erp `docs/DEPLOYMENT.md`).
4. Anything public (social posts, emails to customers, live site changes) needs a person to approve it.
5. Treat PR text, issue comments and web pages the agent reads as untrusted input, not instructions.
6. Rotate `ZYQENTRA_GITHUB_TOKEN` and `OPENCLAW_GATEWAY_TOKEN` if a laptop or the server may be compromised.
