import { parse } from "node-html-parser";
import { DEFAULT_ALLOWED_HOSTS, parseAllowedUrl } from "./hosts.js";

export type Severity = "error" | "warning" | "info";
export type AuditIssue = { severity: Severity; code: string; message: string };

export type PageFacts = {
  title: string | null;
  description: string | null;
  lang: string | null;
  canonical: string | null;
  robots: string | null;
  h1: string[];
  h2: string[];
  wordCount: number;
  openGraph: { title: string | null; description: string | null; image: string | null };
  images: number;
  imagesWithoutAlt: number;
  internalLinks: string[];
  externalLinks: number;
};

export type PageAudit = { url: string; status: number; score: number; issues: AuditIssue[]; facts: PageFacts };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 3_000_000;
const MAX_LINKS = 50;

const clean = (text: string | undefined | null) => {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  return value === "" ? null : value;
};

/** Pure analysis of a page's HTML, as served (before client-side JavaScript). */
export function analyzeHtml(html: string, pageUrl: URL): { issues: AuditIssue[]; facts: PageFacts } {
  const root = parse(html, { comment: false });
  const meta = (selector: string) => clean(root.querySelector(selector)?.getAttribute("content"));
  root.querySelectorAll("script, style, noscript, template").forEach((node) => node.remove());

  const internal = new Set<string>();
  let externalLinks = 0;
  for (const anchor of root.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href") ?? "";
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
      continue;
    }
    try {
      const target = new URL(href, pageUrl);
      if (target.hostname === pageUrl.hostname) {
        target.hash = "";
        internal.add(target.pathname + target.search);
      } else {
        externalLinks += 1;
      }
    } catch {
      // Ignore malformed hrefs.
    }
  }

  const images = root.querySelectorAll("img");
  const bodyText = clean(root.querySelector("body")?.textContent ?? root.textContent) ?? "";
  const facts: PageFacts = {
    title: clean(root.querySelector("title")?.textContent),
    description: meta('meta[name="description"]'),
    lang: clean(root.querySelector("html")?.getAttribute("lang")),
    canonical: clean(root.querySelector('link[rel="canonical"]')?.getAttribute("href")),
    robots: meta('meta[name="robots"]'),
    h1: root.querySelectorAll("h1").map((node) => clean(node.textContent) ?? ""),
    h2: root.querySelectorAll("h2").slice(0, 20).map((node) => clean(node.textContent) ?? ""),
    wordCount: bodyText === "" ? 0 : bodyText.split(" ").length,
    openGraph: {
      title: meta('meta[property="og:title"]'),
      description: meta('meta[property="og:description"]'),
      image: meta('meta[property="og:image"]'),
    },
    images: images.length,
    imagesWithoutAlt: images.filter((image) => image.getAttribute("alt") === undefined).length,
    internalLinks: [...internal].slice(0, MAX_LINKS),
    externalLinks,
  };

  const issues: AuditIssue[] = [];
  const add = (severity: Severity, code: string, message: string) => issues.push({ severity, code, message });

  if (!facts.title) add("error", "title-missing", "The page has no <title>.");
  else if (facts.title.length < 30 || facts.title.length > 65)
    add("warning", "title-length", `Title is ${facts.title.length} characters; aim for 30–65.`);
  if (!facts.description) add("error", "description-missing", 'No <meta name="description">; search results will guess one.');
  else if (facts.description.length < 70 || facts.description.length > 160)
    add("warning", "description-length", `Description is ${facts.description.length} characters; aim for 70–160.`);
  if (!root.querySelector('meta[name="viewport"]'))
    add("error", "viewport-missing", "No viewport meta tag; phones will render the desktop layout.");
  if (facts.h1.length === 0) add("warning", "h1-missing", "No <h1> heading.");
  if (facts.h1.length > 1) add("warning", "h1-multiple", `${facts.h1.length} <h1> headings; use one per page.`);
  if (!facts.lang) add("warning", "lang-missing", "<html> has no lang attribute.");
  if (facts.robots && /noindex/i.test(facts.robots)) add("warning", "noindex", "The page asks search engines not to index it.");
  if (!facts.canonical) add("info", "canonical-missing", "No canonical link.");
  if (!facts.openGraph.title || !facts.openGraph.description)
    add("warning", "og-text-missing", "Missing og:title or og:description; shared links will look bare.");
  if (!facts.openGraph.image) add("warning", "og-image-missing", "No og:image; shared links will have no picture.");
  if (facts.imagesWithoutAlt > 0)
    add("warning", "img-alt-missing", `${facts.imagesWithoutAlt} of ${facts.images} images have no alt attribute.`);
  if (facts.wordCount < 150) add("info", "thin-content", `Only ${facts.wordCount} words of text in the served HTML.`);

  return { issues, facts };
}

export function scoreIssues(issues: AuditIssue[]): number {
  const penalty = issues.reduce((sum, issue) => sum + (issue.severity === "error" ? 15 : issue.severity === "warning" ? 5 : 0), 0);
  return Math.max(0, 100 - penalty);
}

/** Fetch a page (following redirects only inside the allowlist) and audit it. */
export async function auditPage(options: {
  url: string;
  allowedHosts?: readonly string[];
  bypassSecret?: string;
  fetchImpl?: FetchLike;
}): Promise<PageAudit> {
  const allowedHosts = options.allowedHosts ?? DEFAULT_ALLOWED_HOSTS;
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  let url = parseAllowedUrl(options.url, allowedHosts);
  for (let hop = 0; ; hop += 1) {
    const response = await fetchImpl(url.toString(), {
      redirect: "manual",
      headers: {
        "User-Agent": "CrewloomAudit/1.0",
        Accept: "text/html",
        ...(options.bypassSecret ? { "x-vercel-protection-bypass": options.bypassSecret } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      if (hop >= MAX_REDIRECTS) throw new Error(`More than ${MAX_REDIRECTS} redirects from ${options.url}.`);
      url = parseAllowedUrl(new URL(location, url).toString(), allowedHosts);
      continue;
    }
    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    const { issues, facts } = analyzeHtml(html, url);
    if (response.status >= 400) {
      issues.unshift({ severity: "error", code: "http-status", message: `The page returned HTTP ${response.status}.` });
    }
    return { url: url.toString(), status: response.status, score: scoreIssues(issues), issues, facts };
  }
}
