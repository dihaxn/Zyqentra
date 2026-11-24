---
name: zyora-daily-report
description: Write the ZyoraERP daily team report: shipped work, open PRs and their checks, blocked cards, new issues.
user-invocable: true
---

# Zyora daily report

Use when asked for the daily or morning report, or when a scheduled job asks for it.

## Gather

1. `crewloom_github_list_pull_requests` with `state: "closed"`, `limit: 20`: keep the ones merged in the
   last 24 hours (check `crewloom_github_pull_request_status` only when the state is unclear).
2. `crewloom_github_list_pull_requests` with `state: "open"`: for each, `crewloom_github_pull_request_status`
   to get its checks summary.
3. `crewloom_github_list_issues` with `state: "open"`, `limit: 30`: note the ones created or updated in the
   last 24 hours and any labelled `bug`.
4. `workboard_stats` and `workboard_list`: cards in `blocked`, cards in `running` for more than a day,
   and cards moved to `done` since yesterday.

## Write

Keep it under 25 lines, in this order, and skip empty sections:

1. **Shipped** – merged PRs, one line each with the link.
2. **Needs attention** – failing checks on open PRs, blocked cards with their reason, bugs opened.
3. **In progress** – open PRs and running cards, one line each.
4. **Numbers** – open issues, open PRs, cards by status.

Times are Sri Lanka time (UTC+5:30). Do not guess at causes; link to the evidence instead.
