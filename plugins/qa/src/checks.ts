import { spawn } from "node:child_process";

export const DEFAULT_SCRIPTS = ["verify", "lint", "test", "build"];
const OUTPUT_TAIL_CHARS = 12_000;
const REF_PATTERN = /^(?!-)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._\/-]{1,200}$/;

export type CommandResult = { exitCode: number | null; output: string; durationMs: number; timedOut: boolean };
export type RunCommand = (
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number; signal?: AbortSignal },
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
  signal?: AbortSignal;
  run?: RunCommand;
};

function tail(text: string): string {
  return text.length <= OUTPUT_TAIL_CHARS ? text : `…${text.slice(-OUTPUT_TAIL_CHARS)}`;
}

/** Spawn without a shell: arguments never pass through shell parsing. */
export const runCommand: RunCommand = (command, args, options) =>
  new Promise((resolve) => {
    const started = Date.now();
    let output = "";
    let timedOut = false;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, CI: "1", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const append = (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.length > OUTPUT_TAIL_CHARS * 4) output = output.slice(-OUTPUT_TAIL_CHARS * 2);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const stop = () => child.kill("SIGTERM");
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

  return exclusive(async () => {
    const started = Date.now();
    const deadline = started + options.timeoutMs;
    const steps: StepResult[] = [];
    const step = async (name: string, command: string, args: string[]) => {
      const remaining = Math.max(1_000, deadline - Date.now());
      const result = await run(command, args, { cwd: options.repoPath, timeoutMs: remaining, signal: options.signal });
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
