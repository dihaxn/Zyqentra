import path from 'node:path';

export const PLUGIN_DIRS = ['plugins/github', 'plugins/qa'];
export const DEFAULT_MODEL = 'anthropic/claude-sonnet-5-5';
export const MANAGED_REPOSITORIES = ['dihaxn/Zyora-erp', 'dihaxn/Zyqentra'];
// Everything an agent may call on top of the minimal profile. No shell, file writes,
// plugin installs, gateway config, browser or computer control.
export const AGENT_TOOL_ALLOWLIST = [
  'zyqentra-github',
  'zyqentra-qa',
  'workboard',
  'skills_read',
  'skills_search',
  'group:memory',
  'ask_user',
];

/**
 * The Gateway settings Zyqentra depends on, as `openclaw config set` entries.
 * Kept declarative so the same list configures a laptop, the server and the tests.
 * Secrets are never part of it: they come from the Gateway's environment.
 */
export function gatewayConfigEntries({ root, erpCheckout, model = DEFAULT_MODEL }) {
  if (!path.isAbsolute(root)) throw new Error('root must be an absolute path');
  if (erpCheckout !== undefined && !path.isAbsolute(erpCheckout)) {
    throw new Error('ZYQENTRA_QA_CHECKOUT must be an absolute path');
  }
  const qaConfig = {
    allowedHosts: ['zyoraerp.com', '*.zyoraerp.com', '*.vercel.app'],
    timeoutMinutes: 30,
    ...(erpCheckout ? { repoPath: erpCheckout } : {}),
  };
  return [
    ['gateway.mode', 'local'],
    ['agents.defaults.model.primary', model],
    ['tools.profile', 'minimal'],
    ['tools.alsoAllow', AGENT_TOOL_ALLOWLIST],
    ['tools.elevated.enabled', false],
    // Smoke tests drive their own Chromium; agents need neither browser nor desktop control.
    ['plugins.entries.browser.enabled', false],
    ['plugins.entries.cua-computer.enabled', false],
    ['plugins.load.paths', PLUGIN_DIRS.map((dir) => path.join(root, dir))],
    ['plugins.entries.workboard.enabled', true],
    ['plugins.entries.zyqentra-github.enabled', true],
    ['plugins.entries.zyqentra-github.config', { repositories: MANAGED_REPOSITORIES }],
    ['plugins.entries.zyqentra-qa.enabled', true],
    ['plugins.entries.zyqentra-qa.config', qaConfig],
    ['skills.load.extraDirs', [path.join(root, 'skills')]],
  ];
}
