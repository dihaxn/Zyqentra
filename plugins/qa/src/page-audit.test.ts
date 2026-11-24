import { describe, expect, it } from "vitest";
import { analyzeHtml, auditPage, scoreIssues, type FetchLike } from "./page-audit.js";

const GOOD_PAGE = `<!doctype html><html lang="en"><head>
<title>ZyoraERP – POS and inventory for retail shops</title>
<meta name="description" content="Run every outlet from one place: POS, stock, purchasing, customers and reports, built for growing retail brands.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="https://zyoraerp.com/">
<meta property="og:title" content="ZyoraERP"><meta property="og:description" content="Retail ERP">
<meta property="og:image" content="https://zyoraerp.com/og.png">
<script>window.x = "ignored words ignored words"</script>
</head><body><h1>Sell more, count less</h1><h2>POS</h2><h2>Inventory</h2>
<p>${"word ".repeat(200)}</p><img src="a.png" alt="Till"><img src="b.png" alt="">
<a href="/pricing">Pricing</a><a href="/pricing#faq">FAQ</a><a href="https://zyoraerp.com/signup">Sign up</a>
<a href="https://twitter.com/zyora">X</a><a href="mailto:hi@zyoraerp.com">Mail</a></body></html>`;

describe("analyzeHtml", () => {
  it("finds no problems on a complete page and collects its facts", () => {
    const { issues, facts } = analyzeHtml(GOOD_PAGE, new URL("https://zyoraerp.com/"));
    expect(issues).toEqual([]);
    expect(facts).toMatchObject({
      title: "ZyoraERP – POS and inventory for retail shops",
      lang: "en",
      h1: ["Sell more, count less"],
      h2: ["POS", "Inventory"],
      images: 2,
      imagesWithoutAlt: 0,
      internalLinks: ["/pricing", "/signup"],
      externalLinks: 1,
    });
    expect(facts.wordCount).toBeGreaterThan(200);
    expect(facts.wordCount).toBeLessThan(220);
  });

  it("flags a bare page", () => {
    const { issues } = analyzeHtml(
      '<html><head><meta name="robots" content="noindex"></head><body><h1>A</h1><h1>B</h1><img src="x.png"></body></html>',
      new URL("https://zyoraerp.com/x"),
    );
    expect(issues.map((issue) => issue.code)).toEqual([
      "title-missing",
      "description-missing",
      "viewport-missing",
      "h1-multiple",
      "lang-missing",
      "noindex",
      "canonical-missing",
      "og-text-missing",
      "og-image-missing",
      "img-alt-missing",
      "thin-content",
    ]);
    expect(scoreIssues(issues)).toBe(100 - 3 * 15 - 6 * 5);
  });
});

describe("auditPage", () => {
  it("follows redirects inside the allowlist", async () => {
    const seen: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      seen.push(url);
      if (url === "https://zyoraerp.com/old") {
        return new Response(null, { status: 308, headers: { location: "/" } });
      }
      return new Response(GOOD_PAGE, { status: 200 });
    };
    const audit = await auditPage({ url: "https://zyoraerp.com/old", fetchImpl });
    expect(seen).toEqual(["https://zyoraerp.com/old", "https://zyoraerp.com/"]);
    expect(audit).toMatchObject({ url: "https://zyoraerp.com/", status: 200, score: 100 });
  });

  it("refuses a redirect off the allowlist", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } });
    await expect(auditPage({ url: "https://zyoraerp.com/", fetchImpl })).rejects.toThrow(/not an allowed host/);
  });

  it("reports an error status as an issue", async () => {
    const fetchImpl: FetchLike = async () => new Response("<title>Not found</title>", { status: 404 });
    const audit = await auditPage({ url: "https://zyoraerp.com/missing", fetchImpl });
    expect(audit.issues[0]).toEqual({ severity: "error", code: "http-status", message: "The page returned HTTP 404." });
  });
});
