export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type GitHubClient = {
  request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T>;
};

export type GitHubClientOptions = {
  token: string;
  apiBaseUrl?: string;
  fetchImpl?: FetchLike;
};

export const DEFAULT_API_BASE_URL = "https://api.github.com";

export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const base = (options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  return {
    async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
      const response = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${options.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "zyqentra",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const text = await response.text();
      if (!response.ok) {
        let message = text.slice(0, 300);
        try {
          message = (JSON.parse(text) as { message?: string }).message ?? message;
        } catch {
          // Not JSON: keep the trimmed body.
        }
        throw new Error(`GitHub ${method} ${path.split("?")[0]} failed (${response.status}): ${message}`);
      }
      return (text ? JSON.parse(text) : null) as T;
    },
  };
}
