import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Browser } from "playwright-core";
import { DEFAULT_ALLOWED_HOSTS, isAllowedHost, parseAllowedUrl } from "./hosts.js";

export const DEFAULT_SMOKE_PATHS = ["/", "/login", "/signup", "/privacy-policy", "/terms"];
const MAX_PATHS = 20;
const MAX_MESSAGES = 10;

export type PageResult = {
  url: string;
  ok: boolean;
  status: number | null;
  title: string;
  loadMs: number;
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
  screenshot: string | null;
  error?: string;
};

export type SmokeResult = {
  ok: boolean;
  baseUrl: string;
  passed: number;
  failed: number;
  pages: PageResult[];
};

export type SmokeOptions = {
  baseUrl: string;
  paths?: string[];
  allowedHosts?: readonly string[];
  bypassSecret?: string;
  screenshotDir?: string;
  timeoutMs?: number;
  launch?: () => Promise<Browser>;
};

function normalizePaths(paths: string[] | undefined): string[] {
  const list = paths && paths.length > 0 ? paths : DEFAULT_SMOKE_PATHS;
  if (list.length > MAX_PATHS) throw new Error(`Test at most ${MAX_PATHS} paths at once.`);
  return list.map((entry) => {
    const trimmed = entry.trim();
    if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
      throw new Error(`Path "${entry}" must start with a single "/".`);
    }
    return trimmed;
  });
}

function slug(text: string): string {
  return text.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "root";
}

async function defaultLaunch(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  return chromium.launch({ headless: true });
}

/**
 * Open each page of a deployment in headless Chromium and report what a visitor
 * would hit: HTTP status, uncaught errors, console errors and failed same-site requests.
 * A page fails on a 4xx/5xx status, a navigation error or an uncaught page error.
 */
export async function smokeTest(options: SmokeOptions): Promise<SmokeResult> {
  const allowedHosts = options.allowedHosts ?? DEFAULT_ALLOWED_HOSTS;
  const base = parseAllowedUrl(options.baseUrl, allowedHosts);
  const paths = normalizePaths(options.paths);
  const timeoutMs = options.timeoutMs ?? 30_000;
  const screenshotDir = options.screenshotDir ?? path.join(os.tmpdir(), "zyqentra-qa");
  const runDir = path.join(screenshotDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${slug(base.hostname)}`);
  await mkdir(runDir, { recursive: true });

  const browser = await (options.launch ?? defaultLaunch)();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: options.bypassSecret
        ? { "x-vercel-protection-bypass": options.bypassSecret, "x-vercel-set-bypass-cookie": "true" }
        : {},
    });
    const pages: PageResult[] = [];
    for (const pagePath of paths) {
      const target = new URL(pagePath, base);
      // Redirects must not leave the allowlist either.
      parseAllowedUrl(target.toString(), allowedHosts);
      const page = await context.newPage();
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      const failedRequests: string[] = [];
      page.on("pageerror", (error) => pageErrors.length < MAX_MESSAGES && pageErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error" && consoleErrors.length < MAX_MESSAGES) consoleErrors.push(message.text());
      });
      page.on("requestfailed", (request) => {
        if (failedRequests.length >= MAX_MESSAGES) return;
        if (new URL(request.url()).hostname === base.hostname) {
          failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}`);
        }
      });
      const started = Date.now();
      const result: PageResult = {
        url: target.toString(),
        ok: false,
        status: null,
        title: "",
        loadMs: 0,
        pageErrors,
        consoleErrors,
        failedRequests,
        screenshot: null,
      };
      try {
        const response = await page.goto(target.toString(), { waitUntil: "load", timeout: timeoutMs });
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
        result.status = response?.status() ?? null;
        result.title = await page.title();
        const finalHost = new URL(page.url()).hostname;
        if (!isAllowedHost(finalHost, allowedHosts)) {
          result.error = `Redirected off the allowlist to ${finalHost}.`;
        }
        const file = path.join(runDir, `${slug(pagePath)}.png`);
        await page.screenshot({ path: file, fullPage: false });
        result.screenshot = file;
      } catch (error) {
        result.error = error instanceof Error ? error.message.split("\n")[0] : String(error);
      } finally {
        result.loadMs = Date.now() - started;
        await page.close();
      }
      result.ok = result.error === undefined && result.status !== null && result.status < 400 && pageErrors.length === 0;
      pages.push(result);
    }
    const passed = pages.filter((page) => page.ok).length;
    return { ok: passed === pages.length, baseUrl: base.origin, passed, failed: pages.length - passed, pages };
  } finally {
    await browser.close();
  }
}
