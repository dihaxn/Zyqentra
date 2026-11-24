#!/usr/bin/env node
// Check each plugin's built entry against its committed manifest with the OpenClaw CLI.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGIN_DIRS } from './gateway-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = process.env.OPENCLAW_BIN ?? path.join(root, 'node_modules', '.bin', 'openclaw');
// A throwaway state dir, so validation never touches a real Gateway's state.
const state = mkdtempSync(path.join(os.tmpdir(), 'zyqentra-validate-'));
let failed = false;
try {
  for (const dir of PLUGIN_DIRS) {
    try {
      execFileSync(bin, ['plugins', 'validate', '--entry', './dist/index.js'], {
        cwd: path.join(root, dir),
        env: { ...process.env, OPENCLAW_HOME: state, OPENCLAW_STATE_DIR: path.join(state, '.openclaw') },
        stdio: 'inherit',
      });
    } catch {
      console.error(`${dir}: validation failed. Run npm run plugin:build in it and commit openclaw.plugin.json.`);
      failed = true;
    }
  }
} finally {
  rmSync(state, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
