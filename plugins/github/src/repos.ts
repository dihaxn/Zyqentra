export const DEFAULT_REPOSITORIES = ["dihaxn/Zyora-erp"];

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * Pick the repository a tool call acts on. Only repositories in the allowlist are
 * reachable, whatever the model asks for; matching ignores case like GitHub does.
 */
export function resolveRepository(requested: string | undefined, allowed: readonly string[]): string {
  const allowlist = allowed.length > 0 ? allowed : DEFAULT_REPOSITORIES;
  if (requested === undefined || requested.trim() === "") {
    return allowlist[0]!;
  }
  const wanted = requested.trim();
  if (!REPOSITORY_PATTERN.test(wanted)) {
    throw new Error(`"${wanted}" is not an owner/name repository.`);
  }
  const match = allowlist.find((repo) => repo.toLowerCase() === wanted.toLowerCase());
  if (!match) {
    throw new Error(`Repository ${wanted} is not in this plugin's allowlist (${allowlist.join(", ")}).`);
  }
  return match;
}
