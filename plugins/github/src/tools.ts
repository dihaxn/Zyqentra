import type { GitHubClient } from "./github-api.js";
import { resolveRepository } from "./repos.js";

export const COMMENT_FOOTER = "\n\n---\n_Posted by the Crewloom agent._";

export type GithubToolsConfig = {
  repositories?: string[];
  commentFooter?: string;
};

type RawUser = { login?: string } | null;
type RawLabel = { name?: string } | string;
type RawIssue = {
  number: number;
  title: string;
  state: string;
  html_url: string;
  updated_at: string;
  user?: RawUser;
  labels?: RawLabel[];
  pull_request?: unknown;
};
type RawPull = {
  number: number;
  title: string;
  state: string;
  draft?: boolean;
  merged?: boolean;
  merged_at?: string | null;
  mergeable?: boolean | null;
  mergeable_state?: string;
  html_url: string;
  updated_at: string;
  user?: RawUser;
  head: { ref: string; sha: string };
  base: { ref: string };
};
type RawCheckRun = { name: string; status: string; conclusion: string | null; html_url?: string | null };
type RawStatus = { context: string; state: string; target_url?: string | null; description?: string | null };
type RawDeployment = { id: number; environment: string };
type RawDeploymentStatus = { state: string; environment_url?: string | null; target_url?: string | null };
type RawComment = { body?: string | null; user?: RawUser };

const VERCEL_PREVIEW_URL = /https:\/\/[a-z0-9-]+\.vercel\.app(?=[)\s"'<]|$)/g;

/** Preview links from the latest comment the Vercel bot posted (it edits one comment in place). */
export function vercelPreviewUrls(comments: RawComment[]): string[] {
  const latest = comments.filter((comment) => comment.user?.login === "vercel[bot]").at(-1);
  return [...new Set(latest?.body?.match(VERCEL_PREVIEW_URL) ?? [])];
}

export type CheckSummary = {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  failures: { name: string; result: string; url?: string }[];
};

const FAILED_CONCLUSIONS = new Set(["failure", "timed_out", "cancelled", "action_required", "startup_failure", "stale"]);
const PASSED_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);

function labelNames(labels: RawLabel[] | undefined): string[] {
  return (labels ?? []).map((label) => (typeof label === "string" ? label : label.name ?? "")).filter(Boolean);
}

/** One summary over check runs (GitHub Actions, apps) and commit statuses (Vercel and others). */
export function summarizeChecks(checkRuns: RawCheckRun[], statuses: RawStatus[]): CheckSummary {
  const summary: CheckSummary = { total: 0, passed: 0, failed: 0, pending: 0, failures: [] };
  for (const run of checkRuns) {
    summary.total += 1;
    if (run.status !== "completed" || run.conclusion === null) {
      summary.pending += 1;
    } else if (PASSED_CONCLUSIONS.has(run.conclusion)) {
      summary.passed += 1;
    } else if (FAILED_CONCLUSIONS.has(run.conclusion)) {
      summary.failed += 1;
      summary.failures.push({ name: run.name, result: run.conclusion, ...(run.html_url ? { url: run.html_url } : {}) });
    } else {
      summary.pending += 1;
    }
  }
  // The combined-status API lists the latest status per context.
  for (const status of statuses) {
    summary.total += 1;
    if (status.state === "success") {
      summary.passed += 1;
    } else if (status.state === "pending") {
      summary.pending += 1;
    } else {
      summary.failed += 1;
      summary.failures.push({
        name: status.context,
        result: status.description ? `${status.state}: ${status.description}` : status.state,
        ...(status.target_url ? { url: status.target_url } : {}),
      });
    }
  }
  return summary;
}

function clampLimit(limit: number | undefined, fallback: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.min(50, Math.max(1, Math.trunc(limit)));
}

function requireText(value: string, field: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed === "") throw new Error(`${field} must not be empty.`);
  if (trimmed.length > max) throw new Error(`${field} is longer than ${max} characters.`);
  return trimmed;
}

function requireNumber(value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new Error("number must be a positive whole number.");
  return value;
}

export function createGithubTools(client: GitHubClient, config: GithubToolsConfig = {}) {
  const allowed = config.repositories ?? [];
  const footer = config.commentFooter ?? COMMENT_FOOTER;

  return {
    async listIssues(params: { repository?: string; state?: "open" | "closed" | "all"; labels?: string[]; limit?: number }) {
      const repo = resolveRepository(params.repository, allowed);
      const query = new URLSearchParams({
        state: params.state ?? "open",
        per_page: String(clampLimit(params.limit, 20)),
        sort: "updated",
      });
      if (params.labels && params.labels.length > 0) query.set("labels", params.labels.join(","));
      const issues = await client.request<RawIssue[]>("GET", `/repos/${repo}/issues?${query}`);
      return {
        repository: repo,
        issues: issues
          .filter((issue) => issue.pull_request === undefined)
          .map((issue) => ({
            number: issue.number,
            title: issue.title,
            state: issue.state,
            labels: labelNames(issue.labels),
            author: issue.user?.login ?? null,
            updatedAt: issue.updated_at,
            url: issue.html_url,
          })),
      };
    },

    async createIssue(params: { repository?: string; title: string; body?: string; labels?: string[] }) {
      const repo = resolveRepository(params.repository, allowed);
      const labels = (params.labels ?? []).map((label) => label.trim()).filter(Boolean);
      if (labels.length > 10) throw new Error("Use at most 10 labels.");
      const issue = await client.request<RawIssue>("POST", `/repos/${repo}/issues`, {
        title: requireText(params.title, "title", 256),
        body: params.body ? requireText(params.body, "body", 60_000) : undefined,
        labels,
      });
      return { repository: repo, number: issue.number, url: issue.html_url };
    },

    async listPullRequests(params: { repository?: string; state?: "open" | "closed" | "all"; limit?: number }) {
      const repo = resolveRepository(params.repository, allowed);
      const query = new URLSearchParams({
        state: params.state ?? "open",
        per_page: String(clampLimit(params.limit, 20)),
        sort: "updated",
        direction: "desc",
      });
      const pulls = await client.request<RawPull[]>("GET", `/repos/${repo}/pulls?${query}`);
      return {
        repository: repo,
        pullRequests: pulls.map((pull) => ({
          number: pull.number,
          title: pull.title,
          state: pull.state,
          draft: pull.draft === true,
          author: pull.user?.login ?? null,
          branch: pull.head.ref,
          base: pull.base.ref,
          updatedAt: pull.updated_at,
          url: pull.html_url,
        })),
      };
    },

    async pullRequestStatus(params: { repository?: string; number: number }) {
      const repo = resolveRepository(params.repository, allowed);
      const number = requireNumber(params.number);
      const pull = await client.request<RawPull>("GET", `/repos/${repo}/pulls/${number}`);
      const sha = pull.head.sha;
      // A token may lack Checks or Deployments access: report what was readable instead of failing.
      const warnings: string[] = [];
      const optional = async <T>(work: Promise<T>, fallback: T): Promise<T> => {
        try {
          return await work;
        } catch (error) {
          warnings.push(error instanceof Error ? error.message : String(error));
          return fallback;
        }
      };
      const [checkRuns, combined, deployments] = await Promise.all([
        optional(
          client.request<{ check_runs: RawCheckRun[] }>("GET", `/repos/${repo}/commits/${sha}/check-runs?per_page=100`),
          { check_runs: [] },
        ),
        optional(
          client.request<{ statuses: RawStatus[] }>("GET", `/repos/${repo}/commits/${sha}/status?per_page=100`),
          { statuses: [] },
        ),
        optional(client.request<RawDeployment[]>("GET", `/repos/${repo}/deployments?sha=${sha}&per_page=20`), []),
      ]);
      const previews = await Promise.all(
        deployments.map(async (deployment) => {
          const [latest] = await optional(
            client.request<RawDeploymentStatus[]>("GET", `/repos/${repo}/deployments/${deployment.id}/statuses?per_page=1`),
            [],
          );
          return {
            environment: deployment.environment,
            state: latest?.state ?? "unknown",
            url: latest?.environment_url || latest?.target_url || null,
          };
        }),
      );
      // Without deployment records (or access to them), use the preview links in Vercel's bot comment.
      if (previews.length === 0) {
        const comments = await optional(
          client.request<RawComment[]>("GET", `/repos/${repo}/issues/${number}/comments?per_page=50`),
          [],
        );
        for (const url of vercelPreviewUrls(comments)) {
          previews.push({ environment: "Vercel preview (bot comment)", state: "unknown", url });
        }
      }
      return {
        repository: repo,
        number: pull.number,
        title: pull.title,
        state: pull.merged || pull.merged_at ? "merged" : pull.state,
        draft: pull.draft === true,
        mergeable: pull.mergeable ?? null,
        mergeableState: pull.mergeable_state ?? null,
        branch: pull.head.ref,
        base: pull.base.ref,
        headSha: sha,
        url: pull.html_url,
        checks: summarizeChecks(checkRuns.check_runs, combined.statuses),
        previews,
        warnings,
      };
    },

    async comment(params: { repository?: string; number: number; body: string }) {
      const repo = resolveRepository(params.repository, allowed);
      const number = requireNumber(params.number);
      const body = requireText(params.body, "body", 60_000);
      const comment = await client.request<{ html_url: string }>("POST", `/repos/${repo}/issues/${number}/comments`, {
        body: body.endsWith(footer.trim()) ? body : `${body}${footer}`,
      });
      return { repository: repo, number, url: comment.html_url };
    },
  };
}
