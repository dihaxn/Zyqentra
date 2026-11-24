import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright-core";
import { parseAllowedUrl } from "./hosts.js";
import { smokeTest } from "./smoke.js";

describe("parseAllowedUrl", () => {
  it("accepts production, subdomains and Vercel previews over https", () => {
    expect(parseAllowedUrl("https://zyoraerp.com/login").hostname).toBe("zyoraerp.com");
    expect(parseAllowedUrl("https://admin.zyoraerp.com").hostname).toBe("admin.zyoraerp.com");
    expect(parseAllowedUrl("https://zyora-erp-git-x.vercel.app").hostname).toBe("zyora-erp-git-x.vercel.app");
  });

  it.each([
    ["http://zyoraerp.com", /https/],
    ["https://vercel.app", /not an allowed host/],
    ["https://evilzyoraerp.com", /not an allowed host/],
    ["https://zyoraerp.com.evil.io", /not an allowed host/],
    ["http://169.254.169.254/latest", /not an allowed host/],
    ["https://user:pw@zyoraerp.com", /credentials/],
    ["file:///etc/passwd", /not an allowed host/],
    ["not a url", /valid URL/],
  ])("rejects %s", (url, message) => {
    expect(() => parseAllowedUrl(url)).toThrow(message);
  });

  it("allows plain http only for an allowlisted loopback host", () => {
    expect(parseAllowedUrl("http://127.0.0.1:3000", ["127.0.0.1"]).port).toBe("3000");
    expect(() => parseAllowedUrl("http://127.0.0.1:3000")).toThrow(/not an allowed host/);
  });
});

const browserAvailable = await chromium
  .launch()
  .then(async (browser) => {
    await browser.close();
    return true;
  })
  .catch(() => false);

describe.skipIf(!browserAvailable)("smokeTest in Chromium", () => {
  let server: Server;
  let baseUrl: string;
  let shots: string;

  beforeAll(async () => {
    shots = mkdtempSync(path.join(os.tmpdir(), "zyqentra-smoke-"));
    server = createServer((request, response) => {
      response.setHeader("Content-Type", "text/html");
      if (request.url === "/broken") {
        response.statusCode = 500;
        response.end("<title>Error</title>Server error");
      } else if (request.url === "/crash") {
        response.end("<title>Crash</title><script>throw new Error('boom')</script>");
      } else if (request.url === "/noisy") {
        response.end("<title>Noisy</title><script>console.error('missing env')</script>ok");
      } else {
        response.end(`<title>Zyora ${request.url}</title><h1>Hello</h1>`);
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
    rmSync(shots, { recursive: true, force: true });
  });

  it("passes good pages and fails 5xx and crashing pages", async () => {
    const result = await smokeTest({
      baseUrl,
      paths: ["/", "/broken", "/crash", "/noisy"],
      allowedHosts: ["127.0.0.1"],
      screenshotDir: shots,
    });
    expect(result).toMatchObject({ ok: false, passed: 2, failed: 2 });
    const [home, broken, crash, noisy] = result.pages;
    expect(home).toMatchObject({ ok: true, status: 200, title: "Zyora /" });
    expect(home?.screenshot && existsSync(home.screenshot)).toBe(true);
    expect(broken).toMatchObject({ ok: false, status: 500 });
    expect(crash).toMatchObject({ ok: false, status: 200 });
    expect(crash?.pageErrors[0]).toContain("boom");
    expect(noisy).toMatchObject({ ok: true, consoleErrors: ["missing env"] });
  }, 60_000);

  it("refuses paths that leave the site", async () => {
    await expect(
      smokeTest({ baseUrl, paths: ["//evil.example/x"], allowedHosts: ["127.0.0.1"], screenshotDir: shots }),
    ).rejects.toThrow(/single "\/"/);
  });
});
