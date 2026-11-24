# Architecture

```
 Team (browser, over Tailscale)              Team chat (optional: Telegram, WhatsApp, Slack…)
            │                                            │
            ▼                                            ▼
 ┌──────────────────────┐  WebSocket (token,   ┌───────────────────────────────────────────────────┐
 │ Crewloom console     │  loopback only)      │ OpenClaw Gateway 2026.11.8 (pinned, unmodified)    │
 │ apps/console         │ ───────────────────▶ │  • Workboard plugin: boards, cards, proof          │
 │ Next.js 16: board,   │  allowlisted methods │  • Agent runtime (Claude via the Anthropic API)    │
 │ new card, move,      │                      │  • crewloom-github ──▶ GitHub API                  │
 │ start agents         │                      │  • crewloom-qa ──▶ Zyora-erp checkout, npm scripts │
 └──────────────────────┘                      │                └─▶ Chromium ──▶ zyoraerp.com       │
                                               │  • skills/: playbooks for the ZyoraERP project     │
                                               └───────────────────────────────────────────────────┘
```

## Data

- **Cards** live in the Workboard plugin's SQLite database in the Gateway state directory
  (`plugins/workboard/workboard.sqlite`). Status, priority, labels, `sourceUrl` (the GitHub issue or PR),
  notes, proof entries (test results) and run history are all on the card.
- **GitHub** stays the source of truth for code, issues and PRs. Cards link to them; agents comment on them.
- Nothing is copied into the ERP's Supabase database.

## Flows

**New work.** Someone adds a card in the console, or asks an agent in chat; the `zyora-new-work` skill
creates the GitHub issue and the card together.

**PR testing.** An agent following `zyora-pr-check` reads the PR (`crewloom_github_pull_request_status`),
runs `crewloom_run_checks` on its branch (fetch, `npm ci`, `npm run verify` in a dedicated checkout),
smoke-tests the Vercel previews (`crewloom_smoke_test`), records proof on the card (`workboard_proof`),
comments on the PR and moves the card to *In review* or *Blocked*. People merge.

**Marketing.** `zyora-marketing-page` turns a brief into approved copy on a card, then a draft PR,
then audits the preview (`crewloom_page_audit`, `crewloom_smoke_test`).

**Reports.** `zyora-daily-report` summarises merged PRs, failing checks, blocked cards and new bugs.
Schedule it with OpenClaw's cron (`openclaw cron add`) to post to the team chat each morning.

## Why not fork OpenClaw

OpenClaw ships several releases a week and is a large monorepo (native apps, Rust crates, ~200 extensions).
Plugins, skills and the Gateway protocol are its supported extension points, so pinning a release and
building on top keeps upstream security fixes one version bump away. If a core change is ever needed,
send it upstream as a pull request.
