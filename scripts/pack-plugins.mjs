#!/usr/bin/env node
// Copy the built plugins into a deploy folder with one package.json holding only
// their runtime dependencies. OpenClaw itself is not installed there: the Gateway
// image links its own copy, so plugins use the exact host SDK.
// Usage: node scripts/pack-plugins.mjs <out-dir>
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGIN_DIRS } from './gateway-config.mjs';

/** Merge runtime dependencies; two plugins asking for different versions is an error. */
export function mergeDependencies(manifests) {
  const merged = {};
  for (const manifest of manifests) {
    for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
      if (merged[name] !== undefined && merged[name] !== version) {
        throw new Error(`${manifest.name} wants ${name}@${version} but another plugin wants ${merged[name]}.`);
      }
      merged[name] = version;
    }
  }
  return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const out = path.resolve(process.argv[2] ?? '');
  if (!process.argv[2]) throw new Error('Usage: node scripts/pack-plugins.mjs <out-dir>');
  const manifests = [];
  for (const dir of PLUGIN_DIRS) {
    const source = path.join(root, dir);
    if (!existsSync(path.join(source, 'dist', 'index.js'))) throw new Error(`${dir} is not built.`);
    const target = path.join(out, dir);
    mkdirSync(target, { recursive: true });
    for (const entry of ['dist', 'package.json', 'openclaw.plugin.json', 'README.md']) {
      if (existsSync(path.join(source, entry))) cpSync(path.join(source, entry), path.join(target, entry), { recursive: true });
    }
    manifests.push(JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8')));
  }
  writeFileSync(
    path.join(out, 'package.json'),
    `${JSON.stringify({ name: 'zyqentra-plugins-runtime', private: true, type: 'module', dependencies: mergeDependencies(manifests) }, null, 2)}\n`,
  );
  console.log(`Packed ${manifests.length} plugins into ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
