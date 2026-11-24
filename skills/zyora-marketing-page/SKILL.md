---
name: zyora-marketing-page
description: Plan, audit and review a zyoraerp.com marketing page change, from brief to a reviewed draft PR.
user-invocable: true
---

# Zyora marketing page

Use when someone asks for a new or improved marketing page (landing, pricing, feature, comparison, blog)
or for an SEO check of zyoraerp.com.

## Where the pages live

The public pages are part of the POS app in `dihaxn/Zyora-erp`: `apps/pos/app/page.jsx` (home) and
routes such as `privacy-policy`, `terms`, `return-policy`, `signup`. Styling must follow the repo's
`docs/guidelines/ui-guidelines.md`: Tailwind palette classes only, no hex colours, no `px` font sizes.

## Audit an existing page

1. Call `zyqentra_page_audit` on the production URL (for example `https://zyoraerp.com/`).
2. Report the score, then the issues grouped by severity, each with a concrete fix
   (for example the exact new meta description, 70–160 characters).

## A new page or a change

1. Create a card with `workboard_create` (label `marketing`, status `todo`) holding the brief:
   audience, the one action the page should drive (usually start the 7-day trial), key messages, proof
   points, and the primary search phrase.
2. Draft the copy in the card notes first: headline, sub-headline, sections, call to action, meta title
   (30–65 characters) and meta description (70–160 characters). Ask for approval of the copy.
3. After approval, the code change is made on a branch and opened as a **draft** pull request by a
   coding agent or a developer. Link the PR to the card.
4. When the PR has a Vercel preview (`zyqentra_github_pull_request_status`), run `zyqentra_page_audit` and
   `zyqentra_smoke_test` on the preview page and post both results on the PR with `zyqentra_github_comment`.
5. Move the card to `review`. A person approves and merges.

## Rules

- No claims you cannot back up (customer counts, uptime, awards, prices not in the app's plans).
- Prices and plan names must match what the app sells; check with the team if unsure.
- Never publish or post anything yourself.
