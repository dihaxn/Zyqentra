import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { createGitHubClient } from "./github-api.js";
import { createGithubTools, type GithubToolsConfig } from "./tools.js";

const DEFAULT_TOKEN_ENV = "ZYQENTRA_GITHUB_TOKEN";

type PluginConfig = GithubToolsConfig & { tokenEnv?: string; apiBaseUrl?: string };

function toolsFor(config: PluginConfig | undefined) {
  const settings = config ?? {};
  const tokenEnv = settings.tokenEnv ?? DEFAULT_TOKEN_ENV;
  const token = process.env[tokenEnv];
  if (!token) {
    throw new Error(`Set ${tokenEnv} on the Gateway to a fine-grained GitHub token for the Zyora repositories.`);
  }
  return createGithubTools(createGitHubClient({ token, apiBaseUrl: settings.apiBaseUrl }), settings);
}

const repository = Type.Optional(
  Type.String({ description: "owner/name. Leave empty for the default repository (dihaxn/Zyora-erp)." }),
);
const state = Type.Optional(
  Type.Union([Type.Literal("open"), Type.Literal("closed"), Type.Literal("all")], { description: "Default open." }),
);
const limit = Type.Optional(Type.Integer({ minimum: 1, maximum: 50, description: "Default 20." }));

export default defineToolPlugin({
  id: "zyqentra-github",
  name: "Zyqentra GitHub",
  description: "Issues, pull request status (checks and Vercel previews) and comments for the ZyoraERP repository.",
  configSchema: Type.Object({
    repositories: Type.Optional(
      Type.Array(Type.String(), { description: "Allowlist of owner/name repositories. The first is the default." }),
    ),
    tokenEnv: Type.Optional(Type.String({ description: "Environment variable holding the GitHub token." })),
    apiBaseUrl: Type.Optional(Type.String({ description: "GitHub API base URL (tests and GitHub Enterprise)." })),
    commentFooter: Type.Optional(Type.String({ description: "Text appended to every comment the agent posts." })),
  }),
  tools: (tool) => [
    tool({
      name: "zyqentra_github_list_issues",
      label: "List Zyora issues",
      description: "List GitHub issues (not pull requests) in a Zyora repository, newest activity first.",
      workspaceAccess: false,
      parameters: Type.Object({
        repository,
        state,
        labels: Type.Optional(Type.Array(Type.String(), { description: "Only issues with all of these labels." })),
        limit,
      }),
      execute: (params, config) => toolsFor(config).listIssues(params),
    }),
    tool({
      name: "zyqentra_github_create_issue",
      label: "Create Zyora issue",
      description: "Open a GitHub issue in a Zyora repository. Returns its number and URL; link it to the Workboard card.",
      workspaceAccess: false,
      parameters: Type.Object({
        repository,
        title: Type.String({ description: "Short, specific title." }),
        body: Type.Optional(Type.String({ description: "Markdown body: what, why, acceptance checks." })),
        labels: Type.Optional(Type.Array(Type.String(), { description: "Existing label names, at most 10." })),
      }),
      execute: (params, config) => toolsFor(config).createIssue(params),
    }),
    tool({
      name: "zyqentra_github_list_pull_requests",
      label: "List Zyora pull requests",
      description: "List pull requests in a Zyora repository with branch, author and draft state.",
      workspaceAccess: false,
      parameters: Type.Object({ repository, state, limit }),
      execute: (params, config) => toolsFor(config).listPullRequests(params),
    }),
    tool({
      name: "zyqentra_github_pull_request_status",
      label: "Zyora pull request status",
      description:
        "Read one pull request: state, mergeability, a summary of its checks and commit statuses, and its Vercel preview URLs.",
      workspaceAccess: false,
      parameters: Type.Object({ repository, number: Type.Integer({ minimum: 1, description: "Pull request number." }) }),
      execute: (params, config) => toolsFor(config).pullRequestStatus(params),
    }),
    tool({
      name: "zyqentra_github_comment",
      label: "Comment on Zyora issue or PR",
      description:
        "Post a comment on an issue or pull request. A footer marks it as posted by the agent. Cannot merge, approve or push.",
      workspaceAccess: false,
      parameters: Type.Object({
        repository,
        number: Type.Integer({ minimum: 1, description: "Issue or pull request number." }),
        body: Type.String({ description: "Markdown comment." }),
      }),
      execute: (params, config) => toolsFor(config).comment(params),
    }),
  ],
});
