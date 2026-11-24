export const DEFAULT_ALLOWED_HOSTS = ["zyoraerp.com", "*.zyoraerp.com", "*.vercel.app"];

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostMatches(host: string, pattern: string): boolean {
  const wanted = pattern.toLowerCase();
  if (wanted.startsWith("*.")) {
    const suffix = wanted.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return host === wanted;
}

export function isAllowedHost(host: string, allowedHosts: readonly string[]): boolean {
  const lower = host.toLowerCase();
  return allowedHosts.some((pattern) => hostMatches(lower, pattern));
}

/**
 * Parse a URL the agent wants to open and refuse anything outside the allowlist,
 * so a test tool cannot be pointed at internal services or arbitrary sites.
 * Plain http is accepted only for loopback hosts that are themselves allowlisted.
 */
export function parseAllowedUrl(raw: string, allowedHosts: readonly string[] = DEFAULT_ALLOWED_HOSTS): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`"${raw}" is not a valid URL.`);
  }
  if (url.username || url.password) {
    throw new Error("URLs with credentials are not allowed.");
  }
  const host = url.hostname.toLowerCase();
  if (!isAllowedHost(host, allowedHosts)) {
    throw new Error(`${host} is not an allowed host (${allowedHosts.join(", ")}).`);
  }
  if (url.protocol === "https:") return url;
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(host)) return url;
  throw new Error(`Only https URLs are allowed for ${host}.`);
}
