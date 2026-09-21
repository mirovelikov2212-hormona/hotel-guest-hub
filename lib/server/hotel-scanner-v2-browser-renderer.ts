import "server-only";

import chromium from "@sparticuz/chromium";
import { chromium as playwrightChromium, type Browser, type BrowserContext, type Page } from "playwright-core";

import { assertPublicHostnameV2 } from "@/lib/server/hotel-scanner-v2-network";
import type { HotelBrandColorRoleSignal } from "@/lib/server/factory-hotel-scanner";

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

export type HotelScannerV2RenderedBrandSnapshot = {
  colorRoles: HotelBrandColorRoleSignal[];
  typography: {
    bodyFont: string;
    headingFont: string;
    buttonFont: string;
  };
  visualCues: {
    buttonRadius: string;
    cardRadius: string;
  };
};

export type HotelScannerV2RenderedPage = {
  requestedUrl: string;
  finalUrl: string;
  html: string;
  text: string;
  blocks: HotelScannerV2RenderedBlock[];
  brandSnapshot: HotelScannerV2RenderedBrandSnapshot;
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


function normalizeRenderedColor(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "transparent") return "";
  const rgb = raw.match(/^rgba?\(\s*(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})(?:[,\s/]+([\d.]+))?/iu);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
    if (!Number.isFinite(alpha) || alpha <= 0.04) return "";
    const channels = rgb.slice(1, 4).map((item) => Math.max(0, Math.min(255, Number(item))));
    return "#" + channels.map((item) => Math.round(item).toString(16).padStart(2, "0")).join("");
  }
  const hex = raw.match(/^#([0-9a-f]{3,8})$/iu);
  if (!hex) return "";
  const valueHex = hex[1];
  if (valueHex.length === 3 || valueHex.length === 4) {
    return "#" + valueHex.slice(0, 3).split("").map((part) => part + part).join("");
  }
  return "#" + valueHex.slice(0, 6);
}

function cleanRenderedFont(value: unknown) {
  const generic = /^(?:inherit|initial|unset|system-ui|-apple-system|blinkmacsystemfont|segoe ui|sans-serif|serif|monospace)$/iu;
  return String(value ?? "")
    .split(",")
    .map((font) => font.trim().replace(/^['"]|['"]$/gu, ""))
    .find((font) => font && !generic.test(font))
    || "";
}

async function renderedBrandSnapshot(page: Page): Promise<HotelScannerV2RenderedBrandSnapshot> {
  const raw = await page.evaluate(() => {
    const clean = (value: unknown, max = 180) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
    const visible = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity || "1") > 0.05
        && rect.width >= 18
        && rect.height >= 12
        && rect.bottom >= 0
        && rect.top <= Math.max(window.innerHeight * 1.8, 1300);
    };
    const blocked = (element: Element) => Boolean(element.closest(
      "[role='dialog'],[aria-modal='true'],[class*='cookie' i],[id*='cookie' i],[class*='consent' i],[id*='consent' i],[class*='popup' i],[class*='modal' i]"
    ));
    const probe = (element: Element | null) => {
      if (!element || !visible(element) || blocked(element)) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        color: style.color || "",
        backgroundColor: style.backgroundColor || "",
        fontFamily: style.fontFamily || "",
        borderRadius: style.borderRadius || "",
        backgroundImage: style.backgroundImage || "",
        area: Math.max(0, rect.width * rect.height),
        top: rect.top,
        text: clean((element as HTMLElement).innerText || element.textContent),
      };
    };

    const body = probe(document.body);
    const heading = Array.from(document.querySelectorAll("h1,h2,h3"))
      .filter((element) => visible(element) && !blocked(element))
      .map((element) => probe(element))
      .filter(Boolean)
      .sort((left, right) => Number(left?.top || 0) - Number(right?.top || 0))[0] || null;

    const header = Array.from(document.querySelectorAll("header,[role='banner'],nav"))
      .filter((element) => visible(element) && !blocked(element))
      .map((element) => probe(element))
      .filter(Boolean)
      .sort((left, right) => Number(right?.area || 0) - Number(left?.area || 0))[0] || null;

    const ctaPattern = /(?:book|booking|reserve|reservation|anfrag|buchen|jetzt|angebot|zimmer|room|table|restaurant|spa|massage|kontakt|contact|enquir|request|availability|verfüg|verfug)/iu;
    const actions = Array.from(document.querySelectorAll("button,a[href],[role='button'],input[type='submit'],input[type='button']"))
      .filter((element) => visible(element) && !blocked(element))
      .map((element) => {
        const value = probe(element);
        if (!value) return null;
        const className = clean((element as HTMLElement).className);
        const id = clean((element as HTMLElement).id);
        const style = getComputedStyle(element);
        const solid = style.backgroundColor && style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent";
        const score = (ctaPattern.test(value.text) ? 100 : 0)
          + (/(?:btn|button|cta|book|reserve|booking)/iu.test(className + " " + id) ? 55 : 0)
          + (solid ? 35 : 0)
          + (value.top >= 0 && value.top <= window.innerHeight * 1.4 ? 20 : 0)
          + Math.min(30, Math.round(value.area / 1000));
        return { ...value, score };
      })
      .filter(Boolean)
      .sort((left, right) => Number(right?.score || 0) - Number(left?.score || 0));
    const action = actions[0] || null;

    const main = document.querySelector("main") || document.body;
    const hero = Array.from(main.children)
      .filter((element) => visible(element) && !blocked(element))
      .map((element) => {
        const value = probe(element);
        if (!value) return null;
        const hasHeading = Boolean(element.querySelector("h1,h2"));
        const hasMedia = value.backgroundImage !== "none" || Boolean(element.querySelector("img,picture,video"));
        const score = (hasHeading ? 70 : 0) + (hasMedia ? 50 : 0) + Math.min(45, Math.round(value.area / 18000));
        return { ...value, score };
      })
      .filter(Boolean)
      .sort((left, right) => Number(right?.score || 0) - Number(left?.score || 0))[0] || null;

    const card = Array.from(document.querySelectorAll("article,[class*='card' i],[class*='tile' i],[class*='panel' i],[class*='box' i]"))
      .filter((element) => visible(element) && !blocked(element))
      .map((element) => probe(element))
      .filter((value) => Boolean(value && value.area >= 12000 && value.area <= 700000))
      .sort((left, right) => Number(left?.top || 0) - Number(right?.top || 0))[0] || null;

    return { body, heading, header, hero, action, card };
  });

  const colorRoles: HotelBrandColorRoleSignal[] = [];
  const add = (role: HotelBrandColorRoleSignal["role"], colorValue: unknown, confidence: number, evidence: string) => {
    const color = normalizeRenderedColor(colorValue);
    if (!color) return;
    const existing = colorRoles.findIndex((item) => item.role === role);
    const item = { role, color, confidence, evidence };
    if (existing >= 0) colorRoles[existing] = item;
    else colorRoles.push(item);
  };

  add("page_background", raw.body?.backgroundColor, 1, "rendered body");
  add("text", raw.body?.color, 0.98, "rendered body");
  add("header_background", raw.header?.backgroundColor, 0.95, "visible header");
  add("hero_background", raw.hero?.backgroundColor, 0.82, "visible hero");
  add("surface", raw.card?.backgroundColor, 0.92, "visible card");
  add("button_background", raw.action?.backgroundColor, 1, "visible CTA");
  add("button_text", raw.action?.color, 1, "visible CTA");
  add("primary", raw.action?.backgroundColor, 0.98, "visible CTA");

  return {
    colorRoles,
    typography: {
      bodyFont: cleanRenderedFont(raw.body?.fontFamily),
      headingFont: cleanRenderedFont(raw.heading?.fontFamily) || cleanRenderedFont(raw.body?.fontFamily),
      buttonFont: cleanRenderedFont(raw.action?.fontFamily) || cleanRenderedFont(raw.body?.fontFamily),
    },
    visualCues: {
      buttonRadius: normalizeText(raw.action?.borderRadius || "", 80),
      cardRadius: normalizeText(raw.card?.borderRadius || "", 80),
    },
  };
}

export class HotelScannerV2BrowserRenderer {
  private browser: Browser | null = null;
  private browserPromise: Promise<Browser> | null = null;
  private context: BrowserContext | null = null;
  private contextPromise: Promise<BrowserContext> | null = null;
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

  private async ensureContext() {
    if (this.context) return this.context;
    if (!this.contextPromise) {
      this.contextPromise = this.ensureBrowser()
        .then((browser) => browser.newContext({
          userAgent: USER_AGENT,
          viewport: { width: 1280, height: 900 },
          serviceWorkers: "block",
          ignoreHTTPSErrors: false,
        }))
        .then((context) => {
          this.context = context;
          return context;
        })
        .finally(() => {
          this.contextPromise = null;
        });
    }
    return this.contextPromise;
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
    const context = await this.ensureContext();
    const page = await context.newPage();
    try {
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

      // Treat the first committed document response as navigation success. Some
      // hotel sites keep DOMContentLoaded blocked behind slow third-party scripts;
      // that must not discard otherwise usable rendered DOM evidence.
      await page.goto(requested.toString(), { waitUntil: "commit", timeout: RENDER_TIMEOUT_MS });
      await page.waitForLoadState("domcontentloaded", { timeout: RENDER_TIMEOUT_MS }).catch(() => undefined);
      await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => undefined);
      await revealLazyContent(page);
      await page.waitForTimeout(250);
      const finalUrl = page.url();
      const final = new URL(finalUrl);
      if (final.origin !== requested.origin) throw new Error("scanner_v2_browser_cross_origin_navigation");
      await this.publicHost(final);
      const [blocks, brandSnapshot] = await Promise.all([
        renderedDomBlocks(page),
        renderedBrandSnapshot(page),
      ]);
      const text = normalizeText(await page.locator("main").innerText().catch(() => page.locator("body").innerText().catch(() => "")), 40_000);
      const html = await page.content();
      return {
        requestedUrl: requested.toString(),
        finalUrl,
        html: bytes(html) <= MAX_RENDERED_HTML_BYTES ? html : "",
        text,
        blocks,
        brandSnapshot,
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async close() {
    const pendingContext = this.contextPromise;
    if (pendingContext) await pendingContext.catch(() => undefined);
    const context = this.context;
    this.context = null;
    this.contextPromise = null;
    await context?.close().catch(() => undefined);

    const pendingBrowser = this.browserPromise;
    if (pendingBrowser) await pendingBrowser.catch(() => undefined);
    const browser = this.browser;
    this.browser = null;
    this.browserPromise = null;
    this.hostChecks.clear();
    await browser?.close().catch(() => undefined);
  }
}

export const HOTEL_SCANNER_V2_MAX_BROWSER_REQUESTS = MAX_BROWSER_REQUESTS;
export const HOTEL_SCANNER_V2_RENDER_TIMEOUT_MS = RENDER_TIMEOUT_MS;
