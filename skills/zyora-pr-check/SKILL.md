---
name: zyora-pr-check
description: Test a ZyoraERP pull request end to end (checks, verify, preview smoke test) and report on its card and the PR.
user-invocable: true
---

# Zyora PR check

Use when someone asks to test, check or QA a ZyoraERP pull request, or a Workboard card
links to one (`sourceUrl` or a link of type `pr`).

## Steps

1. **Read the PR.** Call `crewloom_github_pull_request_status` with the PR number.
   Note the head branch, `headSha`, the check summary and the preview URLs.
   If the PR is merged or closed, say so and stop.
2. **Find or create the card.** Use `workboard_list` to find a card whose `sourceUrl` is the PR URL.
   If none exists, create one with `workboard_create`: title `Test PR #<n>: <PR title>`, status `running`,
   label `qa`, `sourceUrl` the PR URL.
3. **Run the repository checks.** Call `crewloom_run_checks` with `ref` set to the head branch and
   `script` `verify`. This runs lint, tests and builds for every project and can take 10+ minutes.
4. **Smoke-test the preview.** For each preview URL from step 1 (POS and admin), call `crewloom_smoke_test`.
   For the POS preview use the default paths. For the admin console use `["/login"]`.
5. **Record proof on the card** with `workboard_proof`, one entry per result:
   - `verify` → `passed`/`failed`, label `npm run verify`, command `npm run verify`, note with the commit.
   - each smoke test → `passed`/`failed`, label `smoke <host>`, url the preview.
6. **Comment on the PR** with `crewloom_github_comment`. Keep it short:
   - first line: `QA: passed` or `QA: failed at <step>`;
   - a table of checks, verify and smoke results;
   - for a failure, the last relevant lines of output in a fenced block and your best guess at the cause,
     labelled as a guess.
7. **Move the card**: `review` when everything passed, `blocked` with a one-line reason when anything failed.

## Rules

- Never merge, approve, push or close anything. You test and report; people decide.
- If `crewloom_run_checks` refuses because the checkout has local changes, stop and tell the team. Do not
  try to clean the checkout another way.
- A failing GitHub check that also fails on `main` is not this PR's fault: say so in the comment.
- Do not paste secrets, tokens or environment values from output into comments.
