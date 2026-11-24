import path from 'node:path';

export const PLUGIN_DIRS = ['plugins/github', 'plugins/qa'];
export const DEFAULT_MODEL = 'anthropic/claude-sonnet-5-5';
export const MANAGED_REPOSITORIES = ['dihaxn/Zyora-erp', 'dihaxn/crewloom'];

/**
 * The Gateway settings Crewloom depends on, as `openclaw config set` entries.
 * Kept declarative so the same list configures a laptop, the server and the tests.
 * Secrets are never part of it: they come from the Gateway's environment.
 */
export function gatewayConfigEntries({ root, erpCheckout, model = DEFAULT_MODEL }) {
  if (!path.isAbsolute(root)) throw new Error('root must be an absolute path');
  if (erpCheckout !== undefined && !path.isAbsolute(erpCheckout)) {
    throw new Error('CREWLOOM_QA_CHECKOUT must be an absolute path');
  }
  const qaConfig = {
    allowedHosts: ['zyoraerp.com', '*.zyoraerp.com', '*.vercel.app'],
    timeoutMinutes: 30,
    ...(erpCheckout ? { repoPath: erpCheckout } : {}),
  };
  return [
    ['gateway.mode', 'local'],
    ['agents.defaults.model.primary', model],
    ['plugins.load.paths', PLUGIN_DIRS.map((dir) => path.join(root, dir))],
    ['plugins.entries.workboard.enabled', true],
    ['plugins.entries.crewloom-github.enabled', true],
    ['plugins.entries.crewloom-github.config', { repositories: MANAGED_REPOSITORIES }],
    ['plugins.entries.crewloom-qa.enabled', true],
    ['plugins.entries.crewloom-qa.config', qaConfig],
    ['skills.load.extraDirs', [path.join(root, 'skills')]],
  ];
}
