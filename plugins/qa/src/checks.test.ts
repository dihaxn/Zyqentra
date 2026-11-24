import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import entry from "./index.js";
import { runChecks, runCommand, validateRef, type CommandEnv, type RunCommand } from "./checks.js";

describe("crewloom-qa metadata", () => {
  it("declares the checks, smoke and page audit tools", () => {
    expect(getToolPluginMetadata(entry)?.tools.map((tool) => tool.name)).toEqual(["crewloom_run_checks", "crewloom_smoke_test", "crewloom_page_audit"]);
  });
});

describe("validateRef", () => {
  it.each(["main", "claude/open-claw-fork-project-mgmt-3bad6v", "v1.2.3", "6d81563"])("accepts %s", (ref) => {
    expect(validateRef(ref)).toBe(ref);
  });

  it.each(["--upload-pack=touch /tmp/x", "a..b", "a b", "feature/", "x.lock", "a;rm -rf /", "a//b", ""])(
    "rejects %j",
    (ref) => {
      expect(() => validateRef(ref)).toThrow();
    },
  );
});

function fakeRun(outputs: Record<string, { exitCode?: number; output?: string }> = {}) {
  const calls: string[] = [];
  const envs: Record<string, CommandEnv> = {};
  const run: RunCommand = async (command, args, options) => {
    const line = [command, ...args].join(" ");
    calls.push(line);
    envs[line] = options.env;
    const match = outputs[line] ?? {};
    return { exitCode: match.exitCode ?? 0, output: match.output ?? "", durationMs: 1, timedOut: false };
  };
  return { run, calls, envs };
}

describe("runChecks with a fake runner", () => {
  it("refuses scripts outside the allowlist", async () => {
    const { run, calls } = fakeRun();
    await expect(runChecks({ repoPath: "/r", script: "deploy", timeoutMs: 1000, run })).rejects.toThrow(/not allowed/);
    expect(calls).toEqual([]);
  });

  it("fetches, checks out, installs and runs in order for a ref", async () => {
    const { run, calls } = fakeRun({ "git rev-parse HEAD": { output: "abc123\n" } });
    const result = await runChecks({ repoPath: "/r", script: "verify", ref: "feature/x", timeoutMs: 1000, run });
    expect(calls).toEqual([
      "git status --porcelain",
      "git fetch --depth=50 origin feature/x",
      "git checkout --detach FETCH_HEAD",
      "git rev-parse HEAD",
      "npm ci --no-audit --no-fund",
      "npm run verify",
    ]);
    expect(result).toMatchObject({ ok: true, ref: "feature/x", commit: "abc123", failedStep: null });
  });

  it("keeps Gateway secrets away from npm scripts and gives git only the GitHub token", async () => {
    const { run, envs } = fakeRun();
    await runChecks({
      repoPath: "/r",
      script: "verify",
      ref: "main",
      timeoutMs: 1000,
      run,
      passEnv: ["NEXT_PUBLIC_SUPABASE_URL"],
      sourceEnv: {
        PATH: "/usr/bin",
        HOME: "/home/node",
        ANTHROPIC_API_KEY: "sk-secret",
        OPENCLAW_GATEWAY_TOKEN: "gw-secret",
        CREWLOOM_GITHUB_TOKEN: "gh-secret",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      },
    });
    const npm = envs["npm run verify"]!;
    expect(npm).toEqual({ CI: "1", FORCE_COLOR: "0", PATH: "/usr/bin", HOME: "/home/node", NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" });
    expect(envs["npm ci --no-audit --no-fund"]).toEqual(npm);
    const git = envs["git fetch --depth=50 origin main"]!;
    expect(git.CREWLOOM_GITHUB_TOKEN).toBe("gh-secret");
    expect(git.ANTHROPIC_API_KEY).toBeUndefined();
    expect(git.OPENCLAW_GATEWAY_TOKEN).toBeUndefined();
  });

  it("stops at a dirty checkout without touching it", async () => {
    const { run, calls } = fakeRun({ "git status --porcelain": { output: " M src/a.ts\n" } });
    const result = await runChecks({ repoPath: "/r", script: "test", ref: "main", timeoutMs: 1000, run });
    expect(calls).toEqual(["git status --porcelain"]);
    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("clean-check");
    expect(result.steps[0]?.outputTail).toMatch(/local changes/);
  });

  it("reports the failing step and keeps its output", async () => {
    const { run } = fakeRun({ "npm run lint": { exitCode: 1, output: "error  no-unused-vars" } });
    const result = await runChecks({ repoPath: "/r", script: "lint", timeoutMs: 1000, run });
    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("lint");
    expect(result.steps.at(-1)?.outputTail).toContain("no-unused-vars");
  });
});

describe("runChecks against real git and npm", () => {
  let root: string;
  let checkout: string;

  beforeAll(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "crewloom-qa-"));
    const origin = path.join(root, "origin");
    checkout = path.join(root, "checkout");
    const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" });
    execFileSync("git", ["init", "-q", "-b", "main", origin]);
    git(origin, "config", "user.email", "qa@example.com");
    git(origin, "config", "user.name", "QA");
    const writePackage = (verify: string) => {
      writeFileSync(
        path.join(origin, "package.json"),
        JSON.stringify({ name: "fixture", version: "1.0.0", private: true, scripts: { verify } }, null, 2),
      );
      execFileSync("npm", ["install", "--package-lock-only", "--no-audit", "--no-fund"], { cwd: origin, stdio: "pipe" });
    };
    writePackage('node -e "console.log(\'all green\', process.env.ANTHROPIC_API_KEY || \'no-key\')"');
    git(origin, "add", ".");
    git(origin, "commit", "-q", "-m", "green");
    git(origin, "checkout", "-q", "-b", "broken");
    writePackage("node -e \"console.error('lint failed'); process.exit(3)\"");
    git(origin, "commit", "-q", "-am", "red");
    git(origin, "checkout", "-q", "main");
    execFileSync("git", ["clone", "-q", origin, checkout]);
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("passes on a green branch and fails on a red one", async () => {
    const green = await runChecks({
      repoPath: checkout,
      script: "verify",
      ref: "main",
      timeoutMs: 120_000,
      sourceEnv: { ...process.env, ANTHROPIC_API_KEY: "sk-should-not-leak" },
    });
    expect(green.ok).toBe(true);
    expect(green.steps.at(-1)?.outputTail).toContain("all green no-key");
    expect(JSON.stringify(green)).not.toContain("sk-should-not-leak");

    const red = await runChecks({ repoPath: checkout, script: "verify", ref: "broken", timeoutMs: 120_000 });
    expect(red.ok).toBe(false);
    expect(red.failedStep).toBe("verify");
    expect(red.steps.at(-1)).toMatchObject({ exitCode: 3 });
    expect(red.steps.at(-1)?.outputTail).toContain("lint failed");
    expect(red.commit).not.toBe(green.commit);
  }, 180_000);
});

describe.skipIf(process.platform !== "linux")("runCommand", () => {
  it("stops the whole process tree on timeout", async () => {
    const result = await runCommand("sh", ["-c", "sleep 300 & echo $!; wait"], {
      cwd: os.tmpdir(),
      timeoutMs: 1500,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
    });
    expect(result.timedOut).toBe(true);
    const grandchild = Number(result.output.trim().split("\n")[0]);
    expect(grandchild).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 300));
    // Dead means gone, or a zombie waiting for an init process to reap it.
    let state = "gone";
    try {
      state = readFileSync(`/proc/${grandchild}/stat`, "utf8").split(" ")[2] ?? "gone";
    } catch {
      // No such process.
    }
    expect(["gone", "Z", "X"]).toContain(state);
  }, 10_000);
});
