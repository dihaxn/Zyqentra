---
name: zyora-new-work
description: Turn a request (feature, bug, chore) into a Workboard card and a linked ZyoraERP GitHub issue.
user-invocable: true
---

# New Zyora work item

Use when someone describes work for ZyoraERP in chat ("customers can't print receipts on Android",
"add a stock-take export") or asks to file an issue.

## Steps

1. Ask at most two short questions if the request is missing something essential (which app: POS, admin
   console, mobile; how to reproduce a bug). Otherwise proceed.
2. Write the issue:
   - **Title**: specific, under 80 characters, no trailing period.
   - **Body** with these headings: `What`, `Why`, `Acceptance checks` (a bullet list someone can test),
     and for bugs `Steps to reproduce` and `Expected / actual`.
   - Labels: `bug`, `feature` or `chore`, plus the app (`pos`, `admin`, `mobile`) when known.
3. Call `zyqentra_github_create_issue`. Keep the returned number and URL.
4. Create the card with `workboard_create`: same title, status `triage` (or `todo` if the requester
   says it is planned), priority from the request (`urgent` only for outages or money at risk),
   labels as on the issue, `sourceUrl` the issue URL, notes with the acceptance checks.
5. Reply with the card title, the issue link and the priority you chose.

## Rules

- Search first: `zyqentra_github_list_issues` and `workboard_list`. If a matching issue or card exists,
  link to it instead of creating a duplicate.
- Never include customer personal data (names, phone numbers, emails) in issues; describe the shop
  and situation instead.
