import "server-only";

import { buildHotelScannerRobotsPolicy, isHotelScannerRobotsAllowed } from "@/lib/server/hotel-scanner-robots.mjs";
import { HotelScannerV2BrowserRenderer, type HotelScannerV2RenderedBlock } from "@/lib/server/hotel-scanner-v2-browser-renderer";
import { buildPageEvidence, crawlPublicHotelWebsiteV2, type HotelScannerV2EvidenceBundle, type HotelScannerV2PageEvidence } from "@/lib/server/hotel-scanner-v2-crawler";
import { deriveHotelPageInventoryHintsV2 } from "@/lib/server/hotel-scanner-v2-landing-inventory.mjs";
import { fetchPublicHtmlV2, fetchPublicTextV2 } from "@/lib/server/hotel-scanner-v2-network";
import { classifyHotelScannerPageV2, hotelScannerPageTypeDomain } from "@/lib/server/hotel-scanner-v2-page-classifier.mjs";
import { extractHotelPageStructureV2 } from "@/lib/server/hotel-scanner-v2-page-structure.mjs";
import { deriveHotelPropertyScopeV2, isHotelPropertyPageUrlInScopeV2 } from "@/lib/server/hotel-scanner-v2-property-scope.mjs";
import { browserRenderDecisionV2, HOTEL_SCANNER_V2_BROWSER_RENDER_CONCURRENCY, HOTEL_SCANNER_V2_BROWSER_RENDER_WALL_MS, HOTEL_SCANNER_V2_MAX_BROWSER_RENDERS } from "@/lib/server/hotel-scanner-v2-render-policy.mjs";
import { canonicalizeHotelIntakeUrl } from "@/lib/server/hotel-scanner-v2-site-map.mjs";

type BrowserEnrichedPageEvidence = HotelScannerV2PageEvidence & {
  renderMode?: "http" | "browser";
  renderReason?: string;
  renderedContentBlocks?: HotelScannerV2RenderedBlock[];
};

type BrowserEnrichedEvidenceBundle = HotelScannerV2EvidenceBundle & {
  pages: BrowserEnrichedPageEvidence[];
  discovery: HotelScannerV2EvidenceBundle["discovery"] & {
    browserRenderedUrls?: string[];
    browserRenderFailedUrls?: string[];
    browserRenderFailures?: Array<{ url: string; error: string }>;
    browserRenderSkippedBudgetUrls?: string[];
    browserRenderLatencyMs?: number;
  };
};

type RenderCandidate = { index: number; landingDomain: string; languageRank: number; reason: string };
const LANDING_RENDER_PRIORITY = ["offers", "accommodation", "gastronomy", "spa", "services", "experiences", "events"] as const;
const LANDING_DOMAINS = new Set<string>(LANDING_RENDER_PRIORITY);
const LANGUAGE_SEGMENT = /^(?:bg|en|de|ro|mk|ru|cs|cz|fr|it|es|tr|pl|nl|el|hu|sr|hr|sk|sl)$/iu;
const MAX_RENDER_DISCOVERED_OFFER_DETAILS = 24;
const RENDER_DISCOVERED_FETCH_TIMEOUT_MS = 8_000;
const RENDER_DISCOVERED_MAX_PAGE_BYTES = 1_500_000;
const RENDER_USER_AGENT_TOKEN = "stayhub-hotel-scanner";
const RENDER_USER_AGENT = "StayHub-Hotel-Scanner/2.0 (+https://stayhub.app)";
const QUICK_PREVIEW_MAX_BROWSER_RENDERS = 4;
const QUICK_PREVIEW_MAX_AUTHORITY_FETCHES = 4;
const QUICK_PREVIEW_BROWSER_CONCURRENCY = 4;
const QUICK_PREVIEW_BROWSER_WALL_MS = 35_000;
const QUICK_PREVIEW_DOMAIN_PRIORITY = ["accommodation", "gastronomy", "services", "experiences", "spa", "offers"] as const;

function browserRenderFailureReason(error: unknown) {
  const name = String((error as { name?: unknown })?.name || "Error").replace(/\s+/g, " ").trim().slice(0, 80);
  const message = String((error as { message?: unknown })?.message || error || "unknown").replace(/\s+/g, " ").trim().slice(0, 320);
  return `${name}:${message}`;
}

function jsonLdKey(value: { name?: string; types?: string[] }) {
  return `${String(value?.name || "").toLocaleLowerCase("en-US")}|${(value?.types || []).join(",").toLocaleLowerCase("en-US")}`;
}

function mergeJsonLd(left: HotelScannerV2PageEvidence["jsonLdEntities"], right: HotelScannerV2PageEvidence["jsonLdEntities"]) {
  const result = [] as HotelScannerV2PageEvidence["jsonLdEntities"];
  const seen = new Set<string>();
  for (const value of [...left, ...right]) {
    const key = jsonLdKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result.slice(0, 300);
}

function preferredLanguageRank(rawUrl: string) {
  try {
    const parts = new URL(rawUrl).pathname.split("/").filter(Boolean);
    const language = parts.find((part) => LANGUAGE_SEGMENT.test(part)) || "";
    if (!language) return 2;
    return language.toLocaleLowerCase("en-US") === "en" ? 0 : 1;
  } catch { return 3; }
}

function buildRenderSchedule(pages: BrowserEnrichedPageEvidence[]) {
  const candidates: RenderCandidate[] = pages.map((page, index) => {
    const primaryType = classifyHotelScannerPageV2(page).primaryType;
    const decision = browserRenderDecisionV2({ primaryType, page, renderedCount: 0 });
    return {
      index,
      landingDomain: decision.render && LANDING_DOMAINS.has(primaryType) ? primaryType : "",
      languageRank: preferredLanguageRank(page.url),
      reason: decision.reason,
    };
  }).filter((value) => !["http_evidence_sufficient", "browser_render_budget_exhausted"].includes(value.reason));

  const scheduled = new Set<number>();
  const groups = new Map<string, RenderCandidate[]>();
  for (const candidate of candidates.filter((value) => value.landingDomain)) {
    const values = groups.get(candidate.landingDomain) || [];
    values.push(candidate);
    groups.set(candidate.landingDomain, values);
  }
  for (const values of groups.values()) values.sort((a, b) => a.languageRank - b.languageRank || a.index - b.index);
  for (const domain of LANDING_RENDER_PRIORITY) {
    const candidate = groups.get(domain)?.[0];
    if (candidate && scheduled.size < HOTEL_SCANNER_V2_MAX_BROWSER_RENDERS) scheduled.add(candidate.index);
  }
  for (const candidate of candidates.filter((value) => !value.landingDomain).sort((a, b) => a.index - b.index)) {
    if (scheduled.size >= HOTEL_SCANNER_V2_MAX_BROWSER_RENDERS) break;
    scheduled.add(candidate.index);
  }
  return scheduled;
}

function renderedOfferDelegationTargets(page: BrowserEnrichedPageEvidence, propertyScope: ReturnType<typeof deriveHotelPropertyScopeV2>) {
  const classification = classifyHotelScannerPageV2(page);
  if (classification.primaryType !== "offers") return [] as string[];

  const result: string[] = [];
  const seen = new Set<string>();
  for (const hint of deriveHotelPageInventoryHintsV2(page, classification).filter((value) => value?.domain === "offers")) {
    for (const candidate of Array.isArray(hint?.candidates) ? hint.candidates : []) {
      for (const href of Array.isArray(candidate?.links) ? candidate.links : []) {
        const target = canonicalizeHotelIntakeUrl(href, page.url);
        if (!target || seen.has(target)) continue;
        let parsed: URL;
        try { parsed = new URL(target); } catch { continue; }
        if (/\.pdf$/iu.test(parsed.pathname)) continue;
        if (isHotelPropertyPageUrlInScopeV2(target, propertyScope)) continue;
        if (parsed.origin !== new URL(page.url).origin) continue;
        seen.add(target);
        result.push(target);
        if (result.length >= MAX_RENDER_DISCOVERED_OFFER_DETAILS) return result;
      }
    }
  }
  return result;
}

async function renderedRobotsPolicy(baseUrl: string) {
  const origin = new URL(baseUrl);
  const robotsUrl = new URL("/robots.txt", origin);
  const robots = await fetchPublicTextV2(robotsUrl, {
    timeoutMs: 3_000,
    maxBytes: 200_000,
    userAgent: RENDER_USER_AGENT,
  }).catch(() => null);
  return buildHotelScannerRobotsPolicy(robots?.text || "", RENDER_USER_AGENT_TOKEN);
}

async function fetchRenderedDiscoveredOfferDetails(base: BrowserEnrichedEvidenceBundle) {
  const propertyScope = deriveHotelPropertyScopeV2(base.requestedUrl, base.canonicalUrl);
  const existingPages = new Set(base.pages.map((page) => canonicalizeHotelIntakeUrl(page.url)).filter(Boolean));
  const targets = new Map<string, string>();

  for (const page of base.pages) {
    if (page.renderMode !== "browser") continue;
    const revealed = renderedOfferDelegationTargets(page, propertyScope);
    if (!revealed.length) continue;
    page.delegatedOfferDetailUrls = [...new Set([...(page.delegatedOfferDetailUrls || []), ...revealed])];
    for (const target of revealed) {
      if (targets.size >= MAX_RENDER_DISCOVERED_OFFER_DETAILS) break;
      if (!existingPages.has(target) && !targets.has(target)) targets.set(target, page.url);
    }
  }
  if (!targets.size) return { discovered: 0, fetched: 0, failed: 0 };

  const policy = await renderedRobotsPolicy(base.canonicalUrl);
  let fetched = 0;
  let failed = 0;
  for (const [target, sourceUrl] of targets) {
    try {
      if (!isHotelScannerRobotsAllowed(target, policy)) { failed += 1; continue; }
      const response = await fetchPublicHtmlV2(new URL(target), {
        timeoutMs: RENDER_DISCOVERED_FETCH_TIMEOUT_MS,
        maxBytes: RENDER_DISCOVERED_MAX_PAGE_BYTES,
        userAgent: RENDER_USER_AGENT,
      });
      if (response.url.origin !== new URL(base.canonicalUrl).origin) { failed += 1; continue; }
      const page = buildPageEvidence(response.url, response.html, propertyScope, {
        domain: "offers",
        sourceUrl,
        kind: "direct_content_link",
      });
      if (!existingPages.has(page.url)) {
        base.pages.push(page);
        existingPages.add(page.url);
        fetched += 1;
      }
    } catch {
      failed += 1;
    }
  }
  return { discovered: targets.size, fetched, failed };
}

function pathLanguage(rawUrl: string) {
  try {
    const parts = new URL(rawUrl).pathname.split("/").filter(Boolean);
    return String(parts.find((part) => LANGUAGE_SEGMENT.test(part)) || "").toLocaleLowerCase("en-US");
  } catch {
    return "";
  }
}

function pathDepth(rawUrl: string) {
  try { return new URL(rawUrl).pathname.split("/").filter(Boolean).length; }
  catch { return 99; }
}

function quickAuthorityCandidateScore(rawUrl: string, domain: string, requestedLanguage: string) {
  const primaryType = classifyHotelScannerPageV2({ url: rawUrl }).primaryType;
  if (hotelScannerPageTypeDomain(primaryType) !== domain) return -1;
  const language = pathLanguage(rawUrl);
  const languageScore = requestedLanguage && language === requestedLanguage ? 40 : language === "en" ? 25 : language ? 15 : 20;
  const landingScore = primaryType === domain ? 80 : 35;
  const depthScore = Math.max(0, 30 - pathDepth(rawUrl) * 3);
  const inventoryAuthorityScore = domain === "accommodation"
    && /(?:compare|comparison|zimmer[-_]?vergleich|room[-_]?types?|all[-_]?rooms|uebersicht|übersicht)/iu.test(rawUrl)
    ? 90
    : 0;
  return languageScore + landingScore + depthScore + inventoryAuthorityScore;
}

async function ensureQuickPreviewDomainPages(
  base: BrowserEnrichedEvidenceBundle,
  domains: string[],
) {
  const requestedLanguage = pathLanguage(base.requestedUrl);
  const existingUrls = new Set(base.pages.map((page) => canonicalizeHotelIntakeUrl(page.url)).filter(Boolean));
  const existingDomains = new Set(base.pages.map((page) =>
    hotelScannerPageTypeDomain(classifyHotelScannerPageV2(page).primaryType)).filter(Boolean));
  const missingDomains = [...new Set(domains)].filter((domain) => !existingDomains.has(domain));
  if (!missingDomains.length) return;

  const discoveredUrls = uniqueStrings([
    ...(base.discovery.navigationUrls || []),
    ...(base.discovery.internalLinkUrls || []),
    ...(base.discovery.sitemapPageUrls || []),
  ]).filter((url) => !existingUrls.has(canonicalizeHotelIntakeUrl(url)));

  const targets = missingDomains.slice(0, QUICK_PREVIEW_MAX_AUTHORITY_FETCHES).map((domain) => {
    const ranked = discoveredUrls
      .map((url) => ({ url, score: quickAuthorityCandidateScore(url, domain, requestedLanguage) }))
      .filter((candidate) => candidate.score >= 0)
      .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url));
    return ranked[0] ? { domain, url: ranked[0].url } : null;
  }).filter((value): value is { domain: string; url: string } => Boolean(value));

  if (!targets.length) return;
  const policy = await renderedRobotsPolicy(base.canonicalUrl);
  const propertyScope = deriveHotelPropertyScopeV2(base.requestedUrl, base.canonicalUrl);
  const origin = new URL(base.canonicalUrl).origin;
  const fetched = await Promise.all(targets.map(async ({ domain, url }) => {
    try {
      if (!isHotelScannerRobotsAllowed(url, policy)) return null;
      const response = await fetchPublicHtmlV2(new URL(url), {
        timeoutMs: RENDER_DISCOVERED_FETCH_TIMEOUT_MS,
        maxBytes: RENDER_DISCOVERED_MAX_PAGE_BYTES,
        userAgent: RENDER_USER_AGENT,
      });
      if (response.url.origin !== origin) return null;
      if (!isHotelPropertyPageUrlInScopeV2(response.url.toString(), propertyScope)) return null;
      return { domain, page: buildPageEvidence(response.url, response.html, propertyScope) };
    } catch {
      return null;
    }
  }));

  const added: string[] = [];
  for (const result of fetched) {
    if (!result || existingUrls.has(result.page.url)) continue;
    base.pages.push(result.page);
    existingUrls.add(result.page.url);
    added.push(`${result.domain}:${result.page.url}`);
  }
  if (added.length) console.info("scanner_v2_quick_authority_fetch", { added });
}

function quickPreviewRenderSchedule(
  base: BrowserEnrichedEvidenceBundle,
  domains: string[],
) {
  const requestedLanguage = pathLanguage(base.requestedUrl);
  const requested = new Set(domains);
  const selected = new Set<number>();

  for (const domain of QUICK_PREVIEW_DOMAIN_PRIORITY) {
    if (!requested.has(domain) || selected.size >= QUICK_PREVIEW_MAX_BROWSER_RENDERS) continue;
    const candidates = base.pages
      .map((page, index) => {
        const primaryType = classifyHotelScannerPageV2(page).primaryType;
        const pageDomain = hotelScannerPageTypeDomain(primaryType);
        if (pageDomain !== domain) return null;
        const language = pathLanguage(page.url);
        const languageRank = requestedLanguage && language === requestedLanguage
          ? 0
          : language === "en"
            ? 1
            : language
              ? 2
              : 3;
        const landingRank = primaryType === domain ? 0 : 1;
        const structureRank = -(Array.isArray(page.contentBlocks) ? page.contentBlocks.length : 0);
        return { index, languageRank, landingRank, depth: pathDepth(page.url), structureRank };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
      .sort((left, right) =>
        left.languageRank - right.languageRank
        || left.landingRank - right.landingRank
        || left.depth - right.depth
        || left.structureRank - right.structureRank
        || left.index - right.index);
    const candidate = candidates[0];
    if (candidate) selected.add(candidate.index);
  }

  return selected;
}

export async function enrichHotelEvidenceQuickRenderedV2(
  input: HotelScannerV2EvidenceBundle,
  domains: string[],
): Promise<HotelScannerV2EvidenceBundle> {
  const base = input as BrowserEnrichedEvidenceBundle;
  await ensureQuickPreviewDomainPages(base, domains);
  const schedule = quickPreviewRenderSchedule(base, domains);
  if (!schedule.size) return base;

  const renderer = new HotelScannerV2BrowserRenderer();
  const browserRenderedUrls: string[] = [];
  const browserRenderFailedUrls: string[] = [];
  const browserRenderFailures: Array<{ url: string; error: string }> = [];
  const startedAt = Date.now();

  try {
    let cursor = 0;
    const indices = [...schedule];
    async function worker() {
      while (cursor < indices.length) {
        const index = indices[cursor++];
        if (Date.now() - startedAt >= QUICK_PREVIEW_BROWSER_WALL_MS) return;
        const page = base.pages[index];
        try {
          const rendered = await renderer.render(page.url);
          const structure = rendered.html ? extractHotelPageStructureV2(rendered.html) : null;
          const renderedText = rendered.text.trim();
          base.pages[index] = {
            ...page,
            text: renderedText.length >= 400 ? renderedText : page.text,
            headings: structure?.headings?.length ? structure.headings : page.headings,
            jsonLdEntities: structure ? mergeJsonLd(page.jsonLdEntities, structure.jsonLdEntities) : page.jsonLdEntities,
            contentBlocks: structure?.contentBlocks?.length ? structure.contentBlocks : page.contentBlocks,
            renderedContentBlocks: rendered.blocks,
            renderMode: "browser",
            renderReason: "quick_preview_targeted_authority",
          };
          browserRenderedUrls.push(page.url);
        } catch (error) {
          const failure = { url: page.url, error: browserRenderFailureReason(error) };
          browserRenderFailedUrls.push(page.url);
          browserRenderFailures.push(failure);
          base.pages[index] = {
            ...page,
            renderMode: "http",
            renderReason: "quick_preview_targeted_render_failed",
          };
        }
      }
    }
    await Promise.all(Array.from(
      { length: Math.min(QUICK_PREVIEW_BROWSER_CONCURRENCY, indices.length) },
      () => worker(),
    ));
  } finally {
    await renderer.close();
  }

  base.discovery = {
    ...base.discovery,
    browserRenderedUrls: uniqueStrings([
      ...(base.discovery.browserRenderedUrls || []),
      ...browserRenderedUrls,
    ]),
    browserRenderFailedUrls: uniqueStrings([
      ...(base.discovery.browserRenderFailedUrls || []),
      ...browserRenderFailedUrls,
    ]),
    browserRenderFailures: [
      ...(base.discovery.browserRenderFailures || []),
      ...browserRenderFailures,
    ],
    browserRenderLatencyMs: Date.now() - startedAt,
  };

  console.info("scanner_v2_quick_render_summary", {
    requestedDomains: domains,
    scheduled: schedule.size,
    concurrency: QUICK_PREVIEW_BROWSER_CONCURRENCY,
    rendered: browserRenderedUrls.length,
    failed: browserRenderFailedUrls.length,
    latencyMs: Date.now() - startedAt,
  });

  return base;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

async function runConcurrent(items: number[], worker: (index: number) => Promise<void>) {
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(HOTEL_SCANNER_V2_BROWSER_RENDER_CONCURRENCY, items.length) }, () => run()));
}

export async function crawlPublicHotelWebsiteRenderedV2(rawUrl: string): Promise<HotelScannerV2EvidenceBundle> {
  const base = await crawlPublicHotelWebsiteV2(rawUrl) as BrowserEnrichedEvidenceBundle;
  const renderer = new HotelScannerV2BrowserRenderer();
  const browserRenderedUrls: string[] = [];
  const browserRenderFailedUrls: string[] = [];
  const browserRenderFailures: Array<{ url: string; error: string }> = [];
  const browserRenderSkippedBudgetUrls: string[] = [];
  const schedule = buildRenderSchedule(base.pages);
  const startedAt = Date.now();

  for (let index = 0; index < base.pages.length; index += 1) {
    if (!schedule.has(index)) base.pages[index] = { ...base.pages[index], renderMode: "http", renderReason: "browser_render_not_scheduled" };
  }

  try {
    await runConcurrent([...schedule], async (index) => {
      const page = base.pages[index];
      const primaryType = classifyHotelScannerPageV2(page).primaryType;
      const decision = browserRenderDecisionV2({ primaryType, page, renderedCount: 0 });
      if (!decision.render) {
        base.pages[index] = { ...page, renderMode: "http", renderReason: decision.reason };
        return;
      }
      if (Date.now() - startedAt >= HOTEL_SCANNER_V2_BROWSER_RENDER_WALL_MS) {
        browserRenderSkippedBudgetUrls.push(page.url);
        base.pages[index] = { ...page, renderMode: "http", renderReason: `${decision.reason}:browser_wall_budget_exhausted` };
        return;
      }
      try {
        const rendered = await renderer.render(page.url);
        const structure = rendered.html ? extractHotelPageStructureV2(rendered.html) : null;
        const renderedText = rendered.text.trim();
        base.pages[index] = {
          ...page,
          text: renderedText.length >= 400 ? renderedText : page.text,
          headings: structure?.headings?.length ? structure.headings : page.headings,
          jsonLdEntities: structure ? mergeJsonLd(page.jsonLdEntities, structure.jsonLdEntities) : page.jsonLdEntities,
          contentBlocks: structure?.contentBlocks?.length ? structure.contentBlocks : page.contentBlocks,
          renderedContentBlocks: rendered.blocks,
          renderMode: "browser",
          renderReason: decision.reason,
        };
        browserRenderedUrls.push(page.url);
      } catch (error) {
        browserRenderFailedUrls.push(page.url);
        const failure = { url: page.url, error: browserRenderFailureReason(error) };
        browserRenderFailures.push(failure);
        console.warn("scanner_v2_browser_render_failed", failure);
        base.pages[index] = { ...page, renderMode: "http", renderReason: `${decision.reason}:browser_render_failed` };
      }
    });
  } finally {
    await renderer.close();
  }

  const renderedOfferDetails = await fetchRenderedDiscoveredOfferDetails(base);
  const browserRenderLatencyMs = Date.now() - startedAt;
  base.discovery = { ...base.discovery, browserRenderedUrls, browserRenderFailedUrls, browserRenderFailures, browserRenderSkippedBudgetUrls, browserRenderLatencyMs };
  console.info("scanner_v2_browser_render_summary", {
    scheduled: schedule.size,
    concurrency: HOTEL_SCANNER_V2_BROWSER_RENDER_CONCURRENCY,
    rendered: browserRenderedUrls.length,
    failed: browserRenderFailedUrls.length,
    failures: browserRenderFailures,
    skippedBudget: browserRenderSkippedBudgetUrls.length,
    renderedOfferDetails,
    latencyMs: browserRenderLatencyMs,
  });
  return base;
}

export type { BrowserEnrichedPageEvidence, BrowserEnrichedEvidenceBundle };
