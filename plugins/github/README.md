# crewloom-github

OpenClaw agent tools for the ZyoraERP GitHub repositories.

| Tool | What it does |
| --- | --- |
| `crewloom_github_list_issues` | Open/closed issues, newest activity first, optionally by label |
| `crewloom_github_create_issue` | Open an issue (title, body, labels) |
| `crewloom_github_list_pull_requests` | Pull requests with branch, author, draft state |
| `crewloom_github_pull_request_status` | One PR: mergeability, check and status summary, Vercel preview URLs |
| `crewloom_github_comment` | Comment on an issue or PR, with an "agent" footer |

There is deliberately no merge, approve, push, close or label-management tool.

## Config (`plugins.entries.crewloom-github.config`)

| Key | Default | |
| --- | --- | --- |
| `repositories` | `["dihaxn/Zyora-erp"]` | Allowlist; the first is the default. Requests for anything else are refused. |
| `tokenEnv` | `CREWLOOM_GITHUB_TOKEN` | Environment variable on the Gateway holding a fine-grained token |
| `apiBaseUrl` | `https://api.github.com` | |
| `commentFooter` | `_Posted by the Crewloom agent._` | |

The token needs, on the allowed repositories only: Issues read/write, Pull requests read/write,
Contents read, Checks read, Commit statuses read and (optionally) Deployments read. Without
Deployments read, preview URLs are taken from the Vercel bot's PR comment instead, and the
result carries a warning.
