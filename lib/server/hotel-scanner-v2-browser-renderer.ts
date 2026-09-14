import "server-only";

import chromium from "@sparticuz/chromium";
import { chromium as playwrightChromium, type Browser, type BrowserContext, type Page } from "playwright-core";

import { assertPublicHostnameV2 } from "@/lib/server/hotel-scanner-v2-network";

const RENDER_TIMEOUT_MS = 15_000;
const NETWORK_IDLE_TIMEOUT_MS = 2_500;
const MAX_BROWSER_REQUESTS = 260;
const MAX_RENDERED_HTML_BYTES = 2_500_000;
const USER_AGENT = "StayHub-Hotel-Scanner/2.0 (+https://stayhub.app)";
const BLOCKED_RESOURCE_TYPES = new Set(["image", "media", "font", "websocket", "eventsource"]);

export type HotelScannerV2RenderedBlock = {
  level: number;
  heading: string;
  text: string;
  links: string[];
  sectionPath: string[];
  sourceKind: "rendered_dom_card";
};

export type HotelScannerV2RenderedPage = {
  requestedUrl: string;
  finalUrl: string;
  html: string;
  text: string;
  blocks: HotelScannerV2RenderedBlock[];
};

function normalizeText(value: unknown, max = 4_000) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
}

function bytes(value: string) {
  return Buffer.byteLength(value, "utf8");
}

async function revealLazyContent(page: Page) {
  await page.evaluate(async () => {
    const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const maxSteps = 12;
    let previousHeight = 0;
    for (let step = 0; step < maxSteps; step += 1) {
      const height = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0);
      const nextY = Math.min(height, (step + 1) * Math.max(700, window.innerHeight * 0.8));
      window.scrollTo(0, nextY);
      await pause(70);
      if (height === previousHeight && nextY >= height - window.innerHeight) break;
      previousHeight = height;
    }
    window.scrollTo(0, 0);
  }).catch(() => undefined);
}

async function renderedDomBlocks(page: Page): Promise<HotelScannerV2RenderedBlock[]> {
  const values = await page.evaluate(() => {
    const root = document.querySelector("main") || document.body;
    if (!root) return [];
    const excluded = "header,nav,footer,aside,[role='navigation'],[role='dialog'],[aria-hidden='true']";
    const headingSelector = "h1,h2,h3,h4,h5,h6,[role='heading']";
    const selectors = ["article", "[role='article']", "[role='listitem']", "li", "[class*='card' i]", "[class*='tile' i]", "[class*='item' i]"].join(",");
    const candidateSet = new Set<Element>(Array.from(root.querySelectorAll(selectors)).slice(0, 900));
    const result: Array<{ level: number; heading: string; text: string; links: string[]; sectionPath: string[] }> = [];
    const seen = new Set<string>();

    const clean = (value: unknown, max = 4_000) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
    const visible = (element: Element) => {
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && element.getClientRects().length > 0;
    };
    const headingOf = (element: Element) => {
      const heading = element.querySelector(headingSelector);
      if (!heading) return null;
      const text = clean(heading.textContent, 280);
      if (!text) return null;
      const tag = heading.tagName.toLowerCase();
      const ariaLevel = Number(heading.getAttribute("aria-level") || 0);
      const tagLevel = /^h[1-6]$/.test(tag) ? Number(tag.slice(1)) : 0;
      return { text, level: ariaLevel || tagLevel || 4 };
    };
    const compactCandidate = (element: Element) => {
      const text = clean((element as HTMLElement).innerText || element.textContent, 4_100);
      const headingCount = element.querySelectorAll(headingSelector).length;
      return Boolean(text && text.length <= 4_000 && headingCount >= 1 && headingCount <= 4);
    };

    for (const heading of Array.from(root.querySelectorAll(headingSelector)).slice(0, 700)) {
      let current = heading.parentElement;
      for (let depth = 0; current && current !== root && depth < 4; depth += 1, current = current.parentElement) {
        if (current.closest(excluded) || !compactCandidate(current)) continue;
        const parent = current.parentElement;
        if (!parent || parent === root) continue;
        const siblings = Array.from(parent.children).filter((child) => compactCandidate(child));
        if (siblings.length >= 2 && siblings.length <= 24) {
          candidateSet.add(current);
          break;
        }
      }
    }

    const sectionPathOf = (element: Element, ownHeading: string) => {
      const path: string[] = [];
      let current: Element | null = element.parentElement;
      while (current && current !== root && path.length < 5) {
        if (/^(section|main|article)$/i.test(current.tagName) || current.getAttribute("role") === "region") {
          const heading = headingOf(current)?.text || "";
          if (heading && heading !== ownHeading && !path.includes(heading)) path.unshift(heading);
        }
        current = current.parentElement;
      }
      return path;
    };

    const candidates = [...candidateSet].sort((left, right) => {
      if (left === right) return 0;
      const position = left.compareDocumentPosition(right);
      return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    for (const element of candidates) {
      if (!(element instanceof HTMLElement) || element.closest(excluded) || !visible(element)) continue;
      const heading = headingOf(element);
      if (!heading) continue;
      const text = clean(element.innerText || element.textContent, 4_000);
      if (!text || text.length < heading.text.length || text.length > 4_000) continue;
      const nestedHeadings = element.querySelectorAll(headingSelector).length;
      if (nestedHeadings > 4) continue;
      const links = Array.from(element.querySelectorAll("a[href]"))
        .map((anchor) => (anchor as HTMLAnchorElement).href)
        .filter(Boolean)
        .filter((url, index, all) => all.indexOf(url) === index)
        .slice(0, 10);
      const sectionPath = sectionPathOf(element, heading.text);
      const key = `${heading.text.toLocaleLowerCase()}|${text.slice(0, 180).toLocaleLowerCase()}|${sectionPath.join("/").toLocaleLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ level: heading.level, heading: heading.text, text, links, sectionPath });
      if (result.length >= 300) break;
    }
    return result;
  });

  return values.map((value) => ({
    level: Math.max(1, Math.min(6, Number(value.level || 4))),
    heading: normalizeText(value.heading, 280),
    text: normalizeText(value.text, 4_000),
    links: (Array.isArray(value.links) ? value.links : []).map((item) => normalizeText(item, 2_048)).filter(Boolean).slice(0, 10),
    sectionPath: (Array.isArray(value.sectionPath) ? value.sectionPath : []).map((item) => normalizeText(item, 280)).filter(Boolean).slice(-5),
    sourceKind: "rendered_dom_card" as const,
  })).filter((value) => value.heading);
}

export class HotelScannerV2BrowserRenderer {
  private browser: Browser | null = null;
  private browserPromise: Promise<Browser> | null = null;
  private hostChecks = new Map<string, Promise<void>>();

  private async ensureBrowser() {
    if (this.browser) return this.browser;
    if (!this.browserPromise) {
      chromium.setGraphicsMode = false;
      this.browserPromise = playwrightChromium.launch({
        args: [...chromium.args, "--disable-dev-shm-usage"],
        executablePath: await chromium.executablePath(),
        headless: true,
      }).then((browser) => {
        this.browser = browser;
        return browser;
      }).finally(() => {
        this.browserPromise = null;
      });
    }
    return this.browserPromise;
  }

  private publicHost(url: URL) {
    const key = `${url.protocol}//${url.host}`;
    let check = this.hostChecks.get(key);
    if (!check) {
      check = assertPublicHostnameV2(url);
      this.hostChecks.set(key, check);
    }
    return check;
  }

  async render(rawUrl: string): Promise<HotelScannerV2RenderedPage> {
    const requested = new URL(rawUrl);
    await this.publicHost(requested);
    const browser = await this.ensureBrowser();
    let context: BrowserContext | null = null;
    try {
      context = await browser.newContext({
        userAgent: USER_AGENT,
        viewport: { width: 1280, height: 900 },
        serviceWorkers: "block",
        ignoreHTTPSErrors: false,
      });
      const page = await context.newPage();
      let requestCount = 0;
      await page.route("**/*", async (route) => {
        const request = route.request();
        const resourceType = request.resourceType();
        if (BLOCKED_RESOURCE_TYPES.has(resourceType) || requestCount >= MAX_BROWSER_REQUESTS) {
          await route.abort();
          return;
        }
        requestCount += 1;
        const value = request.url();
        if (value.startsWith("data:") || value.startsWith("blob:") || value === "about:blank") {
          await route.continue();
          return;
        }
        let url: URL;
        try { url = new URL(value); }
        catch { await route.abort(); return; }
        if (!["http:", "https:"].includes(url.protocol)) { await route.abort(); return; }
        if (resourceType === "document" && url.origin !== requested.origin) { await route.abort(); return; }
        try {
          await this.publicHost(url);
          await route.continue();
        } catch {
          await route.abort();
        }
      });

      await page.goto(requested.toString(), { waitUntil: "domcontentloaded", timeout: RENDER_TIMEOUT_MS });
      await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => undefined);
      await revealLazyContent(page);
      await page.waitForTimeout(250);
      const finalUrl = page.url();
      const final = new URL(finalUrl);
      if (final.origin !== requested.origin) throw new Error("scanner_v2_browser_cross_origin_navigation");
      await this.publicHost(final);
      const blocks = await renderedDomBlocks(page);
      const text = normalizeText(await page.locator("main").innerText().catch(() => page.locator("body").innerText().catch(() => "")), 40_000);
      const html = await page.content();
      return {
        requestedUrl: requested.toString(),
        finalUrl,
        html: bytes(html) <= MAX_RENDERED_HTML_BYTES ? html : "",
        text,
        blocks,
      };
    } finally {
      await context?.close().catch(() => undefined);
    }
  }

  async close() {
    const pending = this.browserPromise;
    if (pending) await pending.catch(() => undefined);
    const browser = this.browser;
    this.browser = null;
    this.browserPromise = null;
    this.hostChecks.clear();
    await browser?.close().catch(() => undefined);
  }
}

export const HOTEL_SCANNER_V2_MAX_BROWSER_REQUESTS = MAX_BROWSER_REQUESTS;
export const HOTEL_SCANNER_V2_RENDER_TIMEOUT_MS = RENDER_TIMEOUT_MS;
