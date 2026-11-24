# Notes for coding agents and contributors

- Node 24.22+ (`.nvmrc`). Run commands from the repo root; `npm run verify` must pass before you hand work back.
- OpenClaw is pinned (`2026.11.8`). Never vendor or patch its code here; extend it with plugins and skills.
  Plugin APIs are experimental: read the docs shipped with the pinned version in `node_modules/openclaw/docs/` (start with `plugins/building-plugins.md` and `plugins/tool-plugins.md`).
- Plugins are TypeScript (`plugins/*/src`), built with `tsc`. After changing tools or config schema, run
  `npm run plugin:build -w plugins/<name>` and commit the regenerated `openclaw.plugin.json`.
- Tools must stay narrow: allowlisted repositories, hosts and npm scripts; no shell strings; no merge/push/delete.
  Every new tool gets tests, including the refusal cases.
- The console (`apps/console`) is JavaScript, Next.js 16 (read `node_modules/next/dist/docs/` before using
  unfamiliar APIs). It may only call the Gateway methods listed in `lib/gateway-methods.mjs`.
- Styling: Tailwind palette classes only, no hex colours, no `px` font sizes; every page works in dark mode and at phone width.
- Secrets live in environment variables on the server, never in config files, skills or the repo.
