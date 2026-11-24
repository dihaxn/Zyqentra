#!/usr/bin/env node
// Run a local OpenClaw Gateway with Zyqentra plugins and skills.
// State lives in ./.openclaw-dev (git-ignored). Secrets come from ./.env.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal .env reader: KEY=value lines, # comments, optional quotes. */
export function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || line.trim().startsWith('#')) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

function main() {
  const envFile = path.join(root, '.env');
  const fileEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
  const home = path.join(root, '.openclaw-dev');
  mkdirSync(home, { recursive: true });
  const env = {
    ...process.env,
    ...Object.fromEntries(Object.entries(fileEnv).filter(([, value]) => value !== '')),
    OPENCLAW_HOME: home,
    OPENCLAW_STATE_DIR: path.join(home, '.openclaw'),
  };
  if (!env.OPENCLAW_GATEWAY_TOKEN) {
    console.error('Set OPENCLAW_GATEWAY_TOKEN in .env (openssl rand -hex 32).');
    process.exit(1);
  }
  const bin = path.join(root, 'node_modules', '.bin', 'openclaw');
  execFileSync(process.execPath, [path.join(root, 'scripts', 'setup-gateway.mjs')], { env, stdio: 'inherit' });
  const gateway = spawn(bin, ['gateway', '--bind', 'loopback', '--port', env.OPENCLAW_GATEWAY_PORT ?? '18789'], {
    env,
    stdio: 'inherit',
  });
  const stop = () => gateway.kill('SIGTERM');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  gateway.on('exit', (code) => process.exit(code ?? 0));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
