import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_MODEL, gatewayConfigEntries } from './gateway-config.mjs';

test('points the Gateway at the repo plugins and skills', () => {
  const entries = Object.fromEntries(gatewayConfigEntries({ root: '/srv/zyqentra', erpCheckout: '/srv/zyora-erp' }));
  assert.deepEqual(entries['plugins.load.paths'], ['/srv/zyqentra/plugins/github', '/srv/zyqentra/plugins/qa']);
  assert.deepEqual(entries['skills.load.extraDirs'], ['/srv/zyqentra/skills']);
  assert.equal(entries['plugins.entries.workboard.enabled'], true);
  assert.equal(entries['plugins.entries.zyqentra-qa.config'].repoPath, '/srv/zyora-erp');
  assert.equal(entries['agents.defaults.model.primary'], DEFAULT_MODEL);
});

test('leaves repoPath out when no checkout is given', () => {
  const entries = Object.fromEntries(gatewayConfigEntries({ root: '/srv/zyqentra' }));
  assert.equal('repoPath' in entries['plugins.entries.zyqentra-qa.config'], false);
});

test('never writes secrets into config', () => {
  const text = JSON.stringify(gatewayConfigEntries({ root: '/srv/zyqentra', erpCheckout: '/srv/zyora-erp' }));
  assert.doesNotMatch(text, /token|secret|password|api[_-]?key/i);
});

test('rejects relative paths', () => {
  assert.throws(() => gatewayConfigEntries({ root: 'zyqentra' }), /absolute/);
  assert.throws(() => gatewayConfigEntries({ root: '/srv/zyqentra', erpCheckout: '../erp' }), /absolute/);
});

test('.env parsing for the dev gateway', async () => {
  const { parseEnv } = await import('./dev-gateway.mjs');
  assert.deepEqual(parseEnv('# comment\nA=1\nB="two words"\n  C = \'x\' \nbad line\nD=\n'), { A: '1', B: 'two words', C: 'x', D: '' });
});

test('plugin runtime dependencies merge, and conflicts are refused', async () => {
  const { mergeDependencies } = await import('./pack-plugins.mjs');
  assert.deepEqual(
    mergeDependencies([
      { name: 'a', dependencies: { typebox: '^1.1.38', zeta: '1.0.0' } },
      { name: 'b', dependencies: { typebox: '^1.1.38', 'playwright-core': '1.63.0' } },
    ]),
    { 'playwright-core': '1.63.0', typebox: '^1.1.38', zeta: '1.0.0' },
  );
  assert.throws(
    () => mergeDependencies([{ name: 'a', dependencies: { x: '1' } }, { name: 'b', dependencies: { x: '2' } }]),
    /wants x@2/,
  );
});

test('agents get a minimal tool profile with only Zyqentra, Workboard, skills and memory on top', async () => {
  const { AGENT_TOOL_ALLOWLIST } = await import('./gateway-config.mjs');
  const entries = Object.fromEntries(gatewayConfigEntries({ root: '/srv/zyqentra' }));
  assert.equal(entries['tools.profile'], 'minimal');
  assert.deepEqual(entries['tools.alsoAllow'], AGENT_TOOL_ALLOWLIST);
  assert.equal(entries['tools.elevated.enabled'], false);
  assert.equal(entries['plugins.entries.browser.enabled'], false);
  assert.equal(entries['plugins.entries.cua-computer.enabled'], false);
  for (const risky of ['exec', 'group:runtime', 'group:fs', 'write', 'plugins', 'gateway', 'group:automation', 'browser', 'computer', 'group:plugins']) {
    assert.equal(AGENT_TOOL_ALLOWLIST.includes(risky), false, risky);
  }
});
