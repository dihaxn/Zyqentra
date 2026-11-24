import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { DEFAULT_SCRIPTS, runChecks } from "./checks.js";
import { DEFAULT_ALLOWED_HOSTS } from "./hosts.js";
import { auditPage } from "./page-audit.js";
import { smokeTest } from "./smoke.js";

const DEFAULT_REPO_ENV = "ZYQENTRA_QA_CHECKOUT";
const DEFAULT_BYPASS_ENV = "VERCEL_AUTOMATION_BYPASS_SECRET";

type QaConfig = {
  repoPath?: string;
  allowedScripts?: string[];
  timeoutMinutes?: number;
  allowedHosts?: string[];
  screenshotDir?: string;
  bypassSecretEnv?: string;
  passEnv?: string[];
  gitTokenEnv?: string;
};

function repoPathFrom(config: QaConfig | undefined): string {
  const repoPath = config?.repoPath ?? process.env[DEFAULT_REPO_ENV];
  if (!repoPath) {
    throw new Error(
      `Set plugins.entries.zyqentra-qa.config.repoPath (or ${DEFAULT_REPO_ENV}) to a dedicated Zyora-erp checkout.`,
    );
  }
  return repoPath;
}

export default defineToolPlugin({
  id: "zyqentra-qa",
  name: "Zyqentra QA",
  description: "Test ZyoraERP: run the repository's check scripts on a branch, smoke-test deployed pages and audit marketing pages.",
  configSchema: Type.Object({
    repoPath: Type.Optional(
      Type.String({ description: "Absolute path of a dedicated Zyora-erp checkout the tool may switch between refs." }),
    ),
    allowedScripts: Type.Optional(
      Type.Array(Type.String(), { description: `npm scripts the agent may run. Default ${DEFAULT_SCRIPTS.join(", ")}.` }),
    ),
    timeoutMinutes: Type.Optional(Type.Integer({ minimum: 1, maximum: 120, description: "Per run. Default 30." })),
    allowedHosts: Type.Optional(
      Type.Array(Type.String(), {
        description: `Hosts smoke tests may open; "*.example.com" matches subdomains. Default ${DEFAULT_ALLOWED_HOSTS.join(", ")}.`,
      }),
    ),
    screenshotDir: Type.Optional(Type.String({ description: "Where screenshots are saved. Default the OS temp dir." })),
    passEnv: Type.Optional(
      Type.Array(Type.String(), {
        description: "Extra environment variable names npm scripts may see (public build settings only, never secrets).",
      }),
    ),
    gitTokenEnv: Type.Optional(
      Type.String({ description: "Env var git may use for GitHub credentials. Never passed to npm. Default ZYQENTRA_GITHUB_TOKEN." }),
    ),
    bypassSecretEnv: Type.Optional(
      Type.String({ description: `Env var with the Vercel protection bypass secret. Default ${DEFAULT_BYPASS_ENV}.` }),
    ),
  }),
  tools: (tool) => [
    tool({
      name: "zyqentra_run_checks",
      label: "Run Zyora checks",
      description:
        "Run one of the ZyoraERP repository's npm scripts (verify = lint + test + build) in the dedicated test checkout. " +
        "With a ref, fetches that branch/tag/commit, checks it out and runs npm ci first. Returns pass/fail per step " +
        "and the end of the output. Runs one at a time; can take many minutes.",
      workspaceAccess: false,
      parameters: Type.Object({
        script: Type.Optional(Type.String({ description: "npm script to run. Default verify." })),
        ref: Type.Optional(Type.String({ description: "Branch, tag or commit to test, e.g. the PR's head branch." })),
        install: Type.Optional(Type.Boolean({ description: "Run npm ci even without a ref." })),
      }),
      execute: ({ script, ref, install }, config, context) =>
        runChecks({
          repoPath: repoPathFrom(config),
          script: script ?? "verify",
          ref,
          install,
          allowedScripts: config?.allowedScripts,
          passEnv: config?.passEnv,
          gitTokenEnv: config?.gitTokenEnv,
          timeoutMs: (config?.timeoutMinutes ?? 30) * 60_000,
          signal: context?.signal,
        }),
    }),
    tool({
      name: "zyqentra_smoke_test",
      label: "Smoke-test Zyora pages",
      description:
        "Open pages of a ZyoraERP deployment (production or a Vercel preview) in headless Chromium. Reports HTTP status, " +
        "page errors, console errors, failed requests and a screenshot path for each page.",
      workspaceAccess: false,
      parameters: Type.Object({
        baseUrl: Type.String({ description: "Deployment origin, e.g. https://zyoraerp.com or a *.vercel.app preview URL." }),
        paths: Type.Optional(
          Type.Array(Type.String(), { description: "Paths to open, each starting with /. Default: public pages." }),
        ),
      }),
      execute: ({ baseUrl, paths }, config) =>
        smokeTest({
          baseUrl,
          paths,
          allowedHosts: config?.allowedHosts,
          screenshotDir: config?.screenshotDir,
          bypassSecret: process.env[config?.bypassSecretEnv ?? DEFAULT_BYPASS_ENV] || undefined,
        }),
    }),
    tool({
      name: "zyqentra_page_audit",
      label: "Audit a Zyora page",
      description:
        "Check one marketing or public page as search engines and link previews see it: title, meta description, " +
        "headings, Open Graph tags, image alt text, word count and internal links. Returns a 0–100 score and issues.",
      workspaceAccess: false,
      parameters: Type.Object({
        url: Type.String({ description: "Full https URL of the page, production or a Vercel preview." }),
      }),
      execute: ({ url }, config) =>
        auditPage({
          url,
          allowedHosts: config?.allowedHosts,
          bypassSecret: process.env[config?.bypassSecretEnv ?? DEFAULT_BYPASS_ENV] || undefined,
        }),
    }),
  ],
});
