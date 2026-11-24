import { spawn } from "node:child_process";

export const DEFAULT_SCRIPTS = ["verify", "lint", "test", "build"];
const OUTPUT_TAIL_CHARS = 12_000;
const REF_PATTERN = /^(?!-)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._\/-]{1,200}$/;

// Variables any step may see: enough to find tools, reach the registry (proxies, CAs) and cache.
// Everything else on the Gateway (model keys, gateway and GitHub tokens) is withheld.
const BASE_ENV_KEYS = [
  "PATH", "HOME", "USER", "LANG", "LC_ALL", "TZ", "TMPDIR", "TERM",
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy",
  "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "npm_config_cache", "PLAYWRIGHT_BROWSERS_PATH",
];
// Only git steps may also use SSH agents and the GitHub token (read by a credential helper).
const GIT_ENV_KEYS = ["SSH_AUTH_SOCK", "GIT_SSH_COMMAND"];
export const DEFAULT_GIT_TOKEN_ENV = "CREWLOOM_GITHUB_TOKEN";

export type CommandEnv = Record<string, string>;

/** Copy only the named variables that are set, plus CI markers. */
export function pickEnv(source: NodeJS.ProcessEnv, keys: readonly string[]): CommandEnv {
  const env: CommandEnv = { CI: "1", FORCE_COLOR: "0" };
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== "") env[key] = value;
  }
  return env;
}

export type CommandResult = { exitCode: number | null; output: string; durationMs: number; timedOut: boolean };
export type RunCommand = (
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; env: CommandEnv; signal?: AbortSignal },
) => Promise<CommandResult>;

export type StepResult = {
  step: string;
  command: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  outputTail: string;
};

export type ChecksResult = {
  ok: boolean;
  script: string;
  ref: string | null;
  commit: string | null;
  durationMs: number;
  failedStep: string | null;
  steps: StepResult[];
};

export type ChecksOptions = {
  repoPath: string;
  script: string;
  ref?: string;
  install?: boolean;
  allowedScripts?: readonly string[];
  timeoutMs: number;
  /** Extra variables the npm steps may see, e.g. public build settings. Never secrets. */
  passEnv?: readonly string[];
  gitTokenEnv?: string;
  sourceEnv?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  run?: RunCommand;
};

function tail(text: string): string {
  return text.length <= OUTPUT_TAIL_CHARS ? text : `…${text.slice(-OUTPUT_TAIL_CHARS)}`;
}

/**
 * Spawn without a shell (arguments never pass through shell parsing), in its own
 * process group so a timeout stops the whole tree npm starts, not just npm.
 */
export const runCommand: RunCommand = (command, args, options) =>
  new Promise((resolve) => {
    const started = Date.now();
    let output = "";
    let timedOut = false;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const append = (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.length > OUTPUT_TAIL_CHARS * 4) output = output.slice(-OUTPUT_TAIL_CHARS * 2);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const stop = () => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, options.timeoutMs);
    options.signal?.addEventListener("abort", stop, { once: true });
    child.on("error", (error) => {
      output += `\n${error.message}`;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", stop);
      resolve({ exitCode: code, output, durationMs: Date.now() - started, timedOut });
    });
  });

export function validateRef(ref: string): string {
  const trimmed = ref.trim();
  if (!REF_PATTERN.test(trimmed) || trimmed.endsWith(".lock") || trimmed.endsWith("/")) {
    throw new Error(`"${ref}" is not a branch, tag or commit name this tool accepts.`);
  }
  return trimmed;
}

let queue: Promise<unknown> = Promise.resolve();

/** One run at a time: every run shares the same checkout. */
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

/**
 * Check out a ref in the dedicated test checkout, install, and run one of the
 * repository's own npm scripts. Refuses a dirty checkout instead of discarding work.
 */
export function runChecks(options: ChecksOptions): Promise<ChecksResult> {
  const allowed = options.allowedScripts ?? DEFAULT_SCRIPTS;
  if (!allowed.includes(options.script)) {
    return Promise.reject(new Error(`Script "${options.script}" is not allowed. Use one of: ${allowed.join(", ")}.`));
  }
  const ref = options.ref === undefined || options.ref.trim() === "" ? null : validateRef(options.ref);
  const run = options.run ?? runCommand;
  const source = options.sourceEnv ?? process.env;
  const npmEnv = pickEnv(source, [...BASE_ENV_KEYS, ...(options.passEnv ?? [])]);
  const gitEnv = pickEnv(source, [...BASE_ENV_KEYS, ...GIT_ENV_KEYS, options.gitTokenEnv ?? DEFAULT_GIT_TOKEN_ENV]);

  return exclusive(async () => {
    const started = Date.now();
    const deadline = started + options.timeoutMs;
    const steps: StepResult[] = [];
    const step = async (name: string, command: string, args: string[]) => {
      const remaining = Math.max(1_000, deadline - Date.now());
      const env = command === "git" ? gitEnv : npmEnv;
      const result = await run(command, args, { cwd: options.repoPath, timeoutMs: remaining, env, signal: options.signal });
      const entry: StepResult = {
        step: name,
        command: [command, ...args].join(" "),
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
        outputTail: tail(result.output.trim()),
      };
      steps.push(entry);
      return { ...result, ok: result.exitCode === 0 && !result.timedOut };
    };
    const finish = (failedStep: string | null, commit: string | null): ChecksResult => ({
      ok: failedStep === null,
      script: options.script,
      ref,
      commit,
      durationMs: Date.now() - started,
      failedStep,
      steps,
    });

    const status = await step("clean-check", "git", ["status", "--porcelain"]);
    if (!status.ok) return finish("clean-check", null);
    if (status.output.trim() !== "") {
      steps[steps.length - 1]!.outputTail = `Checkout has local changes; refusing to switch refs.\n${steps.at(-1)!.outputTail}`;
      return finish("clean-check", null);
    }

    if (ref !== null) {
      if (!(await step("fetch", "git", ["fetch", "--depth=50", "origin", ref])).ok) return finish("fetch", null);
      if (!(await step("checkout", "git", ["checkout", "--detach", "FETCH_HEAD"])).ok) return finish("checkout", null);
    }
    const head = await step("commit", "git", ["rev-parse", "HEAD"]);
    const commit = head.ok ? head.output.trim() : null;

    if (ref !== null || options.install === true) {
      if (!(await step("install", "npm", ["ci", "--no-audit", "--no-fund"])).ok) return finish("install", commit);
    }
    if (!(await step(options.script, "npm", ["run", options.script])).ok) return finish(options.script, commit);
    return finish(null, commit);
  });
}
