# zyqentra-qa

OpenClaw agent tools that test ZyoraERP.

| Tool | What it does |
| --- | --- |
| `zyqentra_run_checks` | In a dedicated Zyora-erp checkout: fetch a branch/tag/commit, `npm ci`, then run one allowed npm script (`verify`, `lint`, `test`, `build`). Refuses a dirty checkout. One run at a time. |
| `zyqentra_smoke_test` | Open pages of a deployment in headless Chromium; report status, page errors, console errors, failed same-site requests and screenshots. |
| `zyqentra_page_audit` | Audit one page's served HTML for search and link previews: title, description, headings, Open Graph, image alt text, canonical, word count. Score 0–100. |

Commands run without a shell and only the allowlisted npm scripts can run. URLs must be on the host
allowlist (`zyoraerp.com`, `*.zyoraerp.com`, `*.vercel.app` by default); redirects off it are refused.

## Config (`plugins.entries.zyqentra-qa.config`)

| Key | Default | |
| --- | --- | --- |
| `repoPath` | `$ZYQENTRA_QA_CHECKOUT` | Absolute path of a checkout used only by this tool |
| `allowedScripts` | `verify, lint, test, build` | |
| `timeoutMinutes` | `30` | Per `zyqentra_run_checks` run |
| `allowedHosts` | see above | `*.example.com` matches subdomains only |
| `screenshotDir` | OS temp dir | |
| `passEnv` | none | Extra env var names npm scripts may see (public build settings only). Everything else on the Gateway is withheld |
| `gitTokenEnv` | `ZYQENTRA_GITHUB_TOKEN` | Env var git may use for GitHub credentials; never given to npm |
| `bypassSecretEnv` | `VERCEL_AUTOMATION_BYPASS_SECRET` | For protected Vercel previews |
