// The only Gateway methods the console may call. Anything else (config, exec,
// plugin management) stays in OpenClaw's own Control UI for administrators.
export const ALLOWED_METHODS = new Set([
  'health',
  'status',
  'workboard.boards.list',
  'workboard.cards.list',
  'workboard.cards.stats',
  'workboard.cards.create',
  'workboard.cards.move',
  'workboard.cards.dispatch',
]);

export function assertAllowedMethod(method) {
  if (!ALLOWED_METHODS.has(method)) {
    throw new Error(`The console may not call ${method}.`);
  }
}
