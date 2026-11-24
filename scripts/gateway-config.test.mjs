import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_MODEL, gatewayConfigEntries } from './gateway-config.mjs';

test('points the Gateway at the repo plugins and skills', () => {
  const entries = Object.fromEntries(gatewayConfigEntries({ root: '/srv/crewloom', erpCheckout: '/srv/zyora-erp' }));
  assert.deepEqual(entries['plugins.load.paths'], ['/srv/crewloom/plugins/github', '/srv/crewloom/plugins/qa']);
  assert.deepEqual(entries['skills.load.extraDirs'], ['/srv/crewloom/skills']);
  assert.equal(entries['plugins.entries.workboard.enabled'], true);
  assert.equal(entries['plugins.entries.crewloom-qa.config'].repoPath, '/srv/zyora-erp');
  assert.equal(entries['agents.defaults.model.primary'], DEFAULT_MODEL);
});

test('leaves repoPath out when no checkout is given', () => {
  const entries = Object.fromEntries(gatewayConfigEntries({ root: '/srv/crewloom' }));
  assert.equal('repoPath' in entries['plugins.entries.crewloom-qa.config'], false);
});

test('never writes secrets into config', () => {
  const text = JSON.stringify(gatewayConfigEntries({ root: '/srv/crewloom', erpCheckout: '/srv/zyora-erp' }));
  assert.doesNotMatch(text, /token|secret|password|api[_-]?key/i);
});

test('rejects relative paths', () => {
  assert.throws(() => gatewayConfigEntries({ root: 'crewloom' }), /absolute/);
  assert.throws(() => gatewayConfigEntries({ root: '/srv/crewloom', erpCheckout: '../erp' }), /absolute/);
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
