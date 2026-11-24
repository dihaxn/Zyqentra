import { describe, expect, it } from "vitest";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import entry from "./index.js";
import { createGitHubClient, type FetchLike } from "./github-api.js";
import { resolveRepository } from "./repos.js";
import { COMMENT_FOOTER, createGithubTools, summarizeChecks } from "./tools.js";

type Call = { url: string; method: string; body?: unknown; auth?: string };

function fakeGitHub(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.get("authorization") ?? undefined,
    });
    const path = url.replace("https://api.test", "");
    const key = `${method} ${path}`;
    const match = Object.keys(routes).find((route) => key.startsWith(route));
    if (!match) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    return new Response(JSON.stringify(routes[match]), { status: 200 });
  };
  const client = createGitHubClient({ token: "t0ken", apiBaseUrl: "https://api.test/", fetchImpl });
  return { client, calls };
}

describe("crewloom-github metadata", () => {
  it("declares exactly the read, issue and comment tools", () => {
    expect(getToolPluginMetadata(entry)?.tools.map((tool) => tool.name)).toEqual([
      "crewloom_github_list_issues",
      "crewloom_github_create_issue",
      "crewloom_github_list_pull_requests",
      "crewloom_github_pull_request_status",
      "crewloom_github_comment",
    ]);
  });
});

describe("resolveRepository", () => {
  it("defaults to the first allowed repository", () => {
    expect(resolveRepository(undefined, ["dihaxn/Zyora-erp", "dihaxn/crewloom"])).toBe("dihaxn/Zyora-erp");
    expect(resolveRepository("", [])).toBe("dihaxn/Zyora-erp");
  });

  it("matches case-insensitively and returns the configured spelling", () => {
    expect(resolveRepository("DIHAXN/zyora-erp", ["dihaxn/Zyora-erp"])).toBe("dihaxn/Zyora-erp");
  });

  it("refuses repositories outside the allowlist and malformed names", () => {
    expect(() => resolveRepository("someone/else", ["dihaxn/Zyora-erp"])).toThrow(/allowlist/);
    expect(() => resolveRepository("../../user", ["dihaxn/Zyora-erp"])).toThrow(/owner\/name/);
  });
});

describe("GitHub tools", () => {
  it("lists issues without pull requests and sends the token", async () => {
    const { client, calls } = fakeGitHub({
      "GET /repos/dihaxn/Zyora-erp/issues": [
        { number: 1, title: "Bug", state: "open", html_url: "u1", updated_at: "t", labels: [{ name: "bug" }], user: { login: "a" } },
        { number: 2, title: "PR", state: "open", html_url: "u2", updated_at: "t", pull_request: {} },
      ],
    });
    const result = await createGithubTools(client).listIssues({ labels: ["bug"], limit: 500 });
    expect(result.issues).toEqual([
      { number: 1, title: "Bug", state: "open", labels: ["bug"], author: "a", updatedAt: "t", url: "u1" },
    ]);
    expect(calls[0]?.url).toContain("per_page=50");
    expect(calls[0]?.url).toContain("labels=bug");
    expect(calls[0]?.auth).toBe("Bearer t0ken");
  });

  it("creates an issue with trimmed title and labels", async () => {
    const { client, calls } = fakeGitHub({ "POST /repos/dihaxn/Zyora-erp/issues": { number: 7, html_url: "https://gh/7" } });
    const result = await createGithubTools(client).createIssue({ title: "  Fix receipts ", labels: [" bug ", ""] });
    expect(result).toEqual({ repository: "dihaxn/Zyora-erp", number: 7, url: "https://gh/7" });
    expect(calls[0]?.body).toEqual({ title: "Fix receipts", labels: ["bug"] });
  });

  it("rejects an empty title before calling GitHub", async () => {
    const { client, calls } = fakeGitHub({});
    await expect(createGithubTools(client).createIssue({ title: "   " })).rejects.toThrow(/title/);
    expect(calls).toHaveLength(0);
  });

  it("adds the agent footer to comments once", async () => {
    const { client, calls } = fakeGitHub({ "POST /repos/dihaxn/Zyora-erp/issues/8/comments": { html_url: "c" } });
    const tools = createGithubTools(client);
    await tools.comment({ number: 8, body: "Tests pass." });
    await tools.comment({ number: 8, body: `Tests pass.${COMMENT_FOOTER}` });
    expect(calls.map((call) => (call.body as { body: string }).body)).toEqual([
      `Tests pass.${COMMENT_FOOTER}`,
      `Tests pass.${COMMENT_FOOTER}`,
    ]);
  });

  it("summarises a pull request with checks and preview URLs", async () => {
    const { client } = fakeGitHub({
      "GET /repos/dihaxn/Zyora-erp/pulls/8": {
        number: 8,
        title: "Plan",
        state: "open",
        draft: true,
        merged: false,
        mergeable: true,
        mergeable_state: "clean",
        html_url: "pr8",
        updated_at: "t",
        head: { ref: "feature", sha: "abc" },
        base: { ref: "main" },
      },
      "GET /repos/dihaxn/Zyora-erp/commits/abc/check-runs": {
        check_runs: [{ name: "verify", status: "completed", conclusion: "success" }],
      },
      "GET /repos/dihaxn/Zyora-erp/commits/abc/status": {
        statuses: [{ context: "Vercel – zyora-erp", state: "success", target_url: "https://vercel.com/x" }],
      },
      "GET /repos/dihaxn/Zyora-erp/deployments?": [{ id: 11, environment: "Preview – zyora-erp" }],
      "GET /repos/dihaxn/Zyora-erp/deployments/11/statuses": [
        { state: "success", environment_url: "https://zyora-erp-git-feature.vercel.app" },
      ],
    });
    const status = await createGithubTools(client).pullRequestStatus({ number: 8 });
    expect(status).toMatchObject({
      number: 8,
      state: "open",
      draft: true,
      branch: "feature",
      headSha: "abc",
      checks: { total: 2, passed: 2, failed: 0, pending: 0, failures: [] },
      previews: [{ environment: "Preview – zyora-erp", state: "success", url: "https://zyora-erp-git-feature.vercel.app" }],
    });
  });

  it("falls back to Vercel's bot comment when deployments are not readable", async () => {
    const pull = {
      number: 8,
      title: "Plan",
      state: "open",
      html_url: "pr8",
      updated_at: "t",
      head: { ref: "feature", sha: "abc" },
      base: { ref: "main" },
    };
    const { client } = fakeGitHub({
      "GET /repos/dihaxn/Zyora-erp/pulls/8": pull,
      "GET /repos/dihaxn/Zyora-erp/commits/abc/check-runs": { check_runs: [] },
      "GET /repos/dihaxn/Zyora-erp/commits/abc/status": { statuses: [] },
      "GET /repos/dihaxn/Zyora-erp/issues/8/comments": [
        { user: { login: "someone" }, body: "see https://other.vercel.app" },
        {
          user: { login: "vercel[bot]" },
          body:
            "| zyora-erp | [Preview](https://zyora-erp-git-feature.vercel.app) |\n" +
            "| admin | [Preview](https://zyora-erp-admin-git-feature.vercel.app) | [Inspect](https://vercel.com/team/x) |",
        },
      ],
    });
    const status = await createGithubTools(client).pullRequestStatus({ number: 8 });
    expect(status.previews.map((preview) => preview.url)).toEqual([
      "https://zyora-erp-git-feature.vercel.app",
      "https://zyora-erp-admin-git-feature.vercel.app",
    ]);
    expect(status.warnings).toEqual([
      "GitHub GET /repos/dihaxn/Zyora-erp/deployments failed (404): Not Found",
    ]);
  });

  it("reports GitHub errors without the token", async () => {
    const { client } = fakeGitHub({});
    const error = await createGithubTools(client).listPullRequests({}).catch((caught: Error) => caught);
    expect(String(error)).toMatch(/failed \(404\): Not Found/);
    expect(String(error)).not.toContain("t0ken");
  });
});

describe("summarizeChecks", () => {
  it("counts failures, pending runs and failed statuses", () => {
    const summary = summarizeChecks(
      [
        { name: "lint", status: "completed", conclusion: "failure", html_url: "l" },
        { name: "build", status: "in_progress", conclusion: null },
        { name: "skip", status: "completed", conclusion: "skipped" },
      ],
      [{ context: "Vercel", state: "error", description: "Build failed" }],
    );
    expect(summary).toEqual({
      total: 4,
      passed: 1,
      failed: 2,
      pending: 1,
      failures: [
        { name: "lint", result: "failure", url: "l" },
        { name: "Vercel", result: "error: Build failed" },
      ],
    });
  });
});
