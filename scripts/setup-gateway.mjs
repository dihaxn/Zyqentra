#!/usr/bin/env node
// Apply Zyqentra settings to an OpenClaw Gateway's config with the official CLI.
// Usage: OPENCLAW_STATE_DIR=... ZYQENTRA_QA_CHECKOUT=/abs/path node scripts/setup-gateway.mjs
// Restart the Gateway afterwards.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gatewayConfigEntries } from './gateway-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = process.env.OPENCLAW_BIN ?? path.join(root, 'node_modules', '.bin', 'openclaw');

if (!existsSync(bin)) {
  console.error(`OpenClaw CLI not found at ${bin}. Run npm install first, or set OPENCLAW_BIN.`);
  process.exit(1);
}

for (const dir of ['plugins/github', 'plugins/qa']) {
  if (!existsSync(path.join(root, dir, 'dist', 'index.js'))) {
    console.error(`${dir} is not built. Run npm run build first.`);
    process.exit(1);
  }
}

const entries = gatewayConfigEntries({
  root: process.env.ZYQENTRA_ROOT ?? root,
  erpCheckout: process.env.ZYQENTRA_QA_CHECKOUT || undefined,
  model: process.env.ZYQENTRA_AGENT_MODEL || undefined,
});

// A running Gateway owns its config: the CLI routes writes through it, using OPENCLAW_GATEWAY_TOKEN.
for (const [key, value] of entries) {
  try {
    execFileSync(bin, ['config', 'set', key, JSON.stringify(value), '--strict-json'], { stdio: ['ignore', 'ignore', 'inherit'] });
  } catch {
    console.error(`Could not set ${key}. If a Gateway is running, export OPENCLAW_GATEWAY_TOKEN and retry.`);
    process.exit(1);
  }
  console.log(`set ${key}`);
}
if (!process.env.ZYQENTRA_QA_CHECKOUT) {
  console.warn('ZYQENTRA_QA_CHECKOUT is not set: zyqentra_run_checks stays unavailable until it is.');
}
console.log('Done. Restart the Gateway to apply.');
