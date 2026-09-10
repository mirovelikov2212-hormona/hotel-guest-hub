from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    if old not in content:
        raise SystemExit(f"expected source fragment missing in {path}: {old[:120]!r}")
    write(path, content.replace(old, new, 1))


# ---------------------------------------------------------------------------
# A. Scanner crawl hardening: bounded multi-wave crawl + sitemap discovery.
# ---------------------------------------------------------------------------
scanner_path = "lib/server/factory-hotel-scanner.ts"
replace_once(
    scanner_path,
    'const MAX_PAGES = 6;\nconst MAX_SECONDARY_PAGES = MAX_PAGES - 1;\nconst MAX_PAGE_BYTES = 1_000_000;\nconst MAX_TOTAL_TEXT = 45_000;\nconst MAX_REDIRECTS = 5;\nconst FETCH_TIMEOUT_MS = 6_000;',
    'const MAX_PAGES = 14;\nconst MAX_SECONDARY_PAGES = MAX_PAGES - 1;\nconst MAX_CRAWL_BATCH_SIZE = 6;\nconst MAX_CRAWL_WAVES = 3;\nconst MAX_DISCOVERED_URLS = 240;\nconst MAX_PAGE_BYTES = 1_000_000;\nconst MAX_TOTAL_TEXT = 80_000;\nconst MAX_REDIRECTS = 5;\nconst FETCH_TIMEOUT_MS = 6_000;\nconst SITEMAP_TIMEOUT_MS = 4_000;\nconst MAX_SITEMAP_BYTES = 500_000;',
)

replace_once(
    scanner_path,
    'const GENERIC_FONTS = new Set([\n  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif",\n  "ui-sans-serif", "ui-monospace", "inherit", "initial", "unset", "revert", "emoji",\n]);',
    'const GENERIC_FONTS = new Set([\n  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif",\n  "ui-sans-serif", "ui-monospace", "inherit", "initial", "unset", "revert", "emoji",\n]);\nconst UTILITY_FONT_PATTERN = /(font\\s*awesome|bootstrap[- ]?icons?|flaticon|themify|material(?:[- ]?(?:icons?|symbols?))?|icomoon|glyphicons?|feather|remixicon|apple color emoji|segoe ui emoji|noto color emoji|wingdings|webdings|symbol)/i;',
)
replace_once(
    scanner_path,
    '    if (!cleaned || GENERIC_FONTS.has(cleaned.toLowerCase()) || /^var\\(/i.test(cleaned)) return;',
    '    if (!cleaned || GENERIC_FONTS.has(cleaned.toLowerCase()) || UTILITY_FONT_PATTERN.test(cleaned) || /^var\\(/i.test(cleaned)) return;',
)

scanner = read(scanner_path)
marker = "async function fetchStylesheet(startUrl: URL) {"
if marker not in scanner:
    raise SystemExit("fetchStylesheet insertion marker missing")
sitemap_helpers = r'''
function sitemapLocs(xml: string) {
  const result: string[] = [];
  const regex = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) && result.length < MAX_DISCOVERED_URLS) {
    const value = cleanText(match[1] || "", 2_048);
    if (value) result.push(value);
  }
  return result;
}

async function fetchScannerText(startUrl: URL, timeoutMs: number, maxBytes: number) {
  let current = new URL(startUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicHostname(current);
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: {
        Accept: "application/xml,text/xml,text/plain,*/*;q=0.1",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) return null;
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxBytes) return null;
    return { url: current, text: (await response.text()).slice(0, maxBytes) };
  }
  return null;
}

function collectSitemapUrls(
  xml: string,
  canonicalOrigin: string,
  pageUrls: Set<string>,
  childSitemaps: Set<string>,
) {
  for (const raw of sitemapLocs(xml)) {
    try {
      const url = new URL(raw);
      if (url.origin !== canonicalOrigin) continue;
      url.hash = "";
      if (/\.xml(?:\.gz)?$/i.test(url.pathname)) childSitemaps.add(url.toString());
      else if (!/\.(?:pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|pptx?)(?:$|\?)/i.test(url.pathname)) {
        pageUrls.add(url.toString());
      }
    } catch {
      continue;
    }
    if (pageUrls.size >= MAX_DISCOVERED_URLS) break;
  }
}

async function discoverSitemapPageUrls(baseUrl: URL, canonicalOrigin: string) {
  const pageUrls = new Set<string>();
  const childSitemaps = new Set<string>();
  const roots = [
    new URL("/sitemap.xml", baseUrl),
    new URL("/sitemap_index.xml", baseUrl),
  ];

  const rootDocuments = await Promise.all(
    roots.map((url) => fetchScannerText(url, SITEMAP_TIMEOUT_MS, MAX_SITEMAP_BYTES).catch(() => null)),
  );
  for (const document of rootDocuments) {
    if (!document || document.url.origin !== canonicalOrigin) continue;
    collectSitemapUrls(document.text, canonicalOrigin, pageUrls, childSitemaps);
  }

  const childDocuments = await Promise.all(
    [...childSitemaps].slice(0, 4).map((raw) => (
      fetchScannerText(new URL(raw), SITEMAP_TIMEOUT_MS, MAX_SITEMAP_BYTES).catch(() => null)
    )),
  );
  for (const document of childDocuments) {
    if (!document || document.url.origin !== canonicalOrigin) continue;
    collectSitemapUrls(document.text, canonicalOrigin, pageUrls, new Set<string>());
  }

  return [...pageUrls].slice(0, MAX_DISCOVERED_URLS);
}

'''
scanner = scanner.replace(marker, sitemap_helpers + marker, 1)
write(scanner_path, scanner)

scanner = read(scanner_path)
start = scanner.find("export async function crawlPublicHotelWebsite")
if start < 0:
    raise SystemExit("crawler function marker missing")
new_crawler = r'''export async function crawlPublicHotelWebsite(rawUrl: string): Promise<HotelScanEvidenceBundle> {
  const requested = await validatePublicHotelUrl(rawUrl);
  const first = await fetchHtml(requested);
  const firstPage = buildPageEvidence(first.url, first.html);
  const canonicalOrigin = first.url.origin;

  // Brand and sitemap discovery run in parallel with the bounded crawl work.
  const brandPromise = collectBrandEvidence(first.html, first.url);
  const sitemapUrls = await discoverSitemapPageUrls(first.url, canonicalOrigin).catch(() => [] as string[]);

  const pages: HotelScanPageEvidence[] = [firstPage];
  const attemptedUrls = new Set<string>([first.url.toString()]);
  const seenFinalUrls = new Set<string>([first.url.toString()]);
  const discoveredLinks = new Set<string>([...firstPage.links, ...sitemapUrls]);
  const coveredDomains = new Set<string>(classifyHotelScannerPageCoverage(firstPage));
  let totalText = firstPage.text.length;

  for (let wave = 0; wave < MAX_CRAWL_WAVES; wave += 1) {
    if (pages.length >= MAX_PAGES || totalText >= MAX_TOTAL_TEXT) break;
    const remainingBudget = Math.min(MAX_SECONDARY_PAGES, MAX_PAGES - pages.length);
    if (remainingBudget <= 0) break;

    const candidates = [...discoveredLinks]
      .filter((url) => !attemptedUrls.has(url) && !seenFinalUrls.has(url))
      .slice(0, MAX_DISCOVERED_URLS);
    if (!candidates.length) break;

    const crawlPlan = planHotelScannerSecondaryUrls({
      links: candidates,
      canonicalOrigin,
      firstUrl: first.url.toString(),
      maxPages: Math.min(MAX_CRAWL_BATCH_SIZE, remainingBudget),
      alreadyCoveredDomains: [...coveredDomains],
    });
    if (!crawlPlan.urls.length) break;

    for (const url of crawlPlan.urls) attemptedUrls.add(url);
    const secondaryResults = await Promise.all(
      crawlPlan.urls.map((url) => fetchSecondaryEvidence(url, canonicalOrigin)),
    );

    for (const page of secondaryResults) {
      if (!page || pages.length >= MAX_PAGES || totalText >= MAX_TOTAL_TEXT) continue;
      attemptedUrls.add(page.url);
      if (seenFinalUrls.has(page.url)) continue;
      seenFinalUrls.add(page.url);

      const remainingText = Math.max(0, MAX_TOTAL_TEXT - totalText);
      if (!remainingText) break;
      page.text = page.text.slice(0, remainingText);
      totalText += page.text.length;
      pages.push(page);

      for (const link of page.links) {
        if (discoveredLinks.size >= MAX_DISCOVERED_URLS) break;
        discoveredLinks.add(link);
      }
      for (const domain of classifyHotelScannerPageCoverage(page)) coveredDomains.add(domain);
    }
  }

  const brand = await brandPromise;
  return {
    requestedUrl: requested.toString(),
    canonicalUrl: first.url.toString(),
    scannedAt: new Date().toISOString(),
    pages,
    brand,
  };
}
'''
write(scanner_path, scanner[:start] + new_crawler)

# ---------------------------------------------------------------------------
# B. Invalid evidence must never remain visible as a fact card.
# ---------------------------------------------------------------------------
quality_path = "lib/ai/hotel-intelligence-value-quality.mjs"
replace_once(
    quality_path,
    '''  for (const [index, fact] of profile.facts.entries()) {\n    const validation = validateHotelIntelligenceValue(fact);\n    if (!validation.valid) {\n      invalidValues.push(invalidEntry(\n        `facts.${index}`,\n        text(fact?.category),\n        text(fact?.label),\n        fact?.value,\n        validation,\n      ));\n    }\n  }\n\n  return { profile, invalidValues };'''.replace('\\n', '\n'),
    '''  const retainedFacts = [];\n  for (const [index, fact] of profile.facts.entries()) {\n    const validation = validateHotelIntelligenceValue(fact);\n    if (!validation.valid) {\n      invalidValues.push(invalidEntry(\n        `facts.${index}`,\n        text(fact?.category),\n        text(fact?.label),\n        fact?.value,\n        validation,\n      ));\n      continue;\n    }\n    retainedFacts.push(\n      validation.kind === "email" && validation.normalizedValue\n        ? { ...fact, value: validation.normalizedValue }\n        : fact,\n    );\n  }\n  profile.facts = retainedFacts;\n\n  return { profile, invalidValues };'''.replace('\\n', '\n'),
)

quality = read(quality_path)
needle = '''  const emails = Array.isArray(profile.contacts?.emails) ? profile.contacts.emails : [];\n  for (const [index, email] of emails.entries()) {\n    const validation = validateHotelIntelligenceValue({ category: "contact", label: "Email", value: email });\n    if (!validation.valid) invalidValues.push(invalidEntry(`contacts.emails.${index}`, "contact", "Email", email, validation));\n  }\n  return invalidValues;'''.replace('\\n', '\n')
replacement = '''  const emails = Array.isArray(profile.contacts?.emails) ? profile.contacts.emails : [];\n  for (const [index, email] of emails.entries()) {\n    const validation = validateHotelIntelligenceValue({ category: "contact", label: "Email", value: email });\n    if (!validation.valid) invalidValues.push(invalidEntry(`contacts.emails.${index}`, "contact", "Email", email, validation));\n  }\n\n  const facts = Array.isArray(profile.facts) ? profile.facts : [];\n  for (const [index, fact] of facts.entries()) {\n    const validation = validateHotelIntelligenceValue(fact);\n    if (!validation.valid) {\n      invalidValues.push(invalidEntry(\n        `facts.${index}`,\n        text(fact?.category),\n        text(fact?.label),\n        fact?.value,\n        validation,\n      ));\n    }\n  }\n  return invalidValues;'''.replace('\\n', '\n')
if needle not in quality:
    raise SystemExit("quality final validation marker missing")
write(quality_path, quality.replace(needle, replacement, 1))

# ---------------------------------------------------------------------------
# C. Semantic duplicate reduction for review facts.
# ---------------------------------------------------------------------------
reconciliation_path = "lib/ai/hotel-scanner-reconciliation.mjs"
reconciliation = read(reconciliation_path)
insert_marker = "function supportedFact(fact) {"
semantic_helper = r'''function semanticFactTopic(fact) {
  const field = fieldForFact(fact);
  if (field) return field;

  const category = normalized(fact?.category).replace(/ /g, "_");
  const label = normalized(fact?.label);
  const value = normalized(fact?.value);
  const haystack = `${label} ${value}`;

  if (category === "contact" && (/(?:e mail|email|имейл|електронна поща)/iu.test(label) || value.includes("@"))) {
    return "contact_email";
  }
  if (category === "contact" && /(?:phone|telephone|tel|телефон)/iu.test(label)) {
    return "contact_phone";
  }
  if (category === "policy" && /(?:pet|pets|домашн.*любим)/iu.test(haystack)) {
    return "pet_policy";
  }
  if (["dining", "wellness", "services", "amenities"].includes(category)
      && /(?:hours|opening|working|работно време|часове)/iu.test(label)) {
    const facility = label
      .replace(/(?:opening hours|working hours|hours|работно време|часове)/giu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (facility) return `${category}_hours:${facility}`;
  }
  return label;
}

'''
if insert_marker not in reconciliation:
    raise SystemExit("reconciliation semantic helper marker missing")
reconciliation = reconciliation.replace(insert_marker, semantic_helper + insert_marker, 1)
reconciliation = reconciliation.replace("    const semanticLabel = field || label;", "    const semanticLabel = semanticFactTopic(raw);", 1)
write(reconciliation_path, reconciliation)

# ---------------------------------------------------------------------------
# D. Filter system/icon/emoji fonts out of brand typography.
# ---------------------------------------------------------------------------
refiner_path = "lib/server/hotel-scanner-brand-refiner.ts"
replace_once(
    refiner_path,
    'const ICON_FONT_PATTERN = /(font\\s*awesome|bootstrap[- ]?icons?|flaticon|themify|material[- ]?icons?|icomoon|glyphicons?|feather|remixicon)/i;',
    'const ICON_FONT_PATTERN = /(font\\s*awesome|bootstrap[- ]?icons?|flaticon|themify|material(?:[- ]?(?:icons?|symbols?))?|icomoon|glyphicons?|feather|remixicon|apple color emoji|segoe ui emoji|noto color emoji|wingdings|webdings|symbol)/i;',
)

# ---------------------------------------------------------------------------
# E. Shared Light/Dark theme shell for every /control-plane tool.
# ---------------------------------------------------------------------------
write("app/control-plane/ToolsThemeShell.tsx", r'''"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "stayhub.control-plane.theme.v1";
type ToolsTheme = "light" | "dark";

export default function ToolsThemeShell({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ToolsTheme>("light");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") setTheme(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [hydrated, theme]);

  const nextTheme: ToolsTheme = theme === "light" ? "dark" : "light";
  return (
    <div className="stayhub-tools-shell" data-stayhub-tools-theme={theme}>
      <button
        type="button"
        className="stayhub-tools-theme-toggle"
        onClick={() => setTheme(nextTheme)}
        aria-label={`Switch to ${nextTheme} theme`}
        title={`Switch to ${nextTheme} theme`}
      >
        <span aria-hidden="true">{theme === "light" ? "◐" : "◑"}</span>
        <span>{theme === "light" ? "Dark" : "Light"}</span>
      </button>
      {children}
    </div>
  );
}
''')

write("app/control-plane/layout.tsx", r'''import ToolsThemeShell from "@/app/control-plane/ToolsThemeShell";

export default function ControlPlaneLayout({ children }: { children: React.ReactNode }) {
  return <ToolsThemeShell>{children}</ToolsThemeShell>;
}
''')

css_path = "app/globals.css"
css = read(css_path)
css_marker = "/* StayHub internal tools shared light/dark theme v1 */"
if css_marker not in css:
    css += r'''

/* StayHub internal tools shared light/dark theme v1 */
.stayhub-tools-shell {
  min-height: 100vh;
  background: #0a0a0a;
  color: #fafafa;
  color-scheme: dark;
  transition: background-color 160ms ease, color 160ms ease;
}

.stayhub-tools-theme-toggle {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 80;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid #404040;
  border-radius: 999px;
  background: rgba(10, 10, 10, 0.92);
  color: #f5f5f5;
  padding: 0.6rem 0.8rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(12px);
}

.stayhub-tools-theme-toggle:hover {
  border-color: #737373;
}

.stayhub-tools-shell[data-stayhub-tools-theme="light"] {
  background: #f3f6f7;
  color: #172126;
  color-scheme: light;
}

.stayhub-tools-shell[data-stayhub-tools-theme="light"] .stayhub-tools-theme-toggle {
  border-color: #c8d2d6;
  background: rgba(255, 255, 255, 0.94);
  color: #172126;
  box-shadow: 0 8px 24px rgba(24, 45, 54, 0.12);
}

.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-neutral-950,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-neutral-950\/90,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-neutral-950\/80,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-neutral-950\/70,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-neutral-950\/60,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-neutral-950\/50,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-neutral-950\/40 {
  background-color: #f7f9fa !important;
}

.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-neutral-900,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-neutral-900\/90,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-neutral-900\/80,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-neutral-900\/70,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-neutral-900\/60,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-neutral-900\/50 {
  background-color: #ffffff !important;
}

.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-neutral-800,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .bg-neutral-800\/50 {
  background-color: #edf1f2 !important;
}

.stayhub-tools-shell[data-stayhub-tools-theme="light"] .border-neutral-900,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .border-neutral-800,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .border-neutral-700,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .border-neutral-600 {
  border-color: #d3dde0 !important;
}

.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-white,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-neutral-50,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-neutral-100,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-neutral-200 {
  color: #172126 !important;
}

.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-neutral-300 {
  color: #33454d !important;
}

.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-neutral-400,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-neutral-500 {
  color: #5d7078 !important;
}

.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-neutral-600,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-neutral-700 {
  color: #71838a !important;
}

.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-cyan-100,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-cyan-200,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-cyan-300 { color: #086476 !important; }
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-emerald-100,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-emerald-200,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-emerald-300 { color: #08744f !important; }
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-amber-100,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-amber-200,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-amber-300,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-yellow-100,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-yellow-300,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-orange-100 { color: #8a4a00 !important; }
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-rose-100,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-rose-200,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-rose-300 { color: #a32945 !important; }
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-violet-100,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-violet-300,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] .text-fuchsia-100 { color: #6f3dad !important; }

.stayhub-tools-shell[data-stayhub-tools-theme="light"] input,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] textarea,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] select {
  color-scheme: light;
}

.stayhub-tools-shell[data-stayhub-tools-theme="light"] input::placeholder,
.stayhub-tools-shell[data-stayhub-tools-theme="light"] textarea::placeholder {
  color: #7b8b91 !important;
}
'''
    write(css_path, css)

# ---------------------------------------------------------------------------
# F. Regression contracts.
# ---------------------------------------------------------------------------
coverage_test = "tests/contracts/hotel-scanner-coverage-crawl-plan-v1.contract.test.mjs"
coverage = read(coverage_test)
old_block = r'''test("production crawler keeps the six-page bound and seeds the coverage planner from the first page", async () => {
  const crawler = await readProjectFile(crawlerPath);
  assert.match(crawler, /MAX_PAGES = 6/);
  assert.match(crawler, /MAX_SECONDARY_PAGES = MAX_PAGES - 1/);
  assert.match(crawler, /classifyHotelScannerPageCoverage\(firstPage\)/);
  assert.match(crawler, /planHotelScannerSecondaryUrls/);
  assert.match(crawler, /alreadyCoveredDomains: firstPageCoverage/);
  assert.match(crawler, /maxPages: MAX_SECONDARY_PAGES/);
  assert.match(crawler, /Promise\.all\(crawlPlan\.urls\.map/);
  assert.doesNotMatch(crawler, /function pagePriority/);
  assert.doesNotMatch(crawler, /function uniqueCandidateUrls/);
});'''
new_block = r'''test("production crawler uses a bounded multi-wave coverage crawl instead of the former six-page ceiling", async () => {
  const crawler = await readProjectFile(crawlerPath);
  assert.match(crawler, /MAX_PAGES = 14/);
  assert.match(crawler, /MAX_SECONDARY_PAGES = MAX_PAGES - 1/);
  assert.match(crawler, /MAX_CRAWL_BATCH_SIZE = 6/);
  assert.match(crawler, /MAX_CRAWL_WAVES = 3/);
  assert.match(crawler, /discoverSitemapPageUrls/);
  assert.match(crawler, /classifyHotelScannerPageCoverage\(firstPage\)/);
  assert.match(crawler, /planHotelScannerSecondaryUrls/);
  assert.match(crawler, /alreadyCoveredDomains: \[\.\.\.coveredDomains\]/);
  assert.match(crawler, /for \(let wave = 0; wave < MAX_CRAWL_WAVES; wave \+= 1\)/);
  assert.match(crawler, /page\.links/);
  assert.doesNotMatch(crawler, /MAX_PAGES = 6/);
  assert.doesNotMatch(crawler, /function pagePriority/);
  assert.doesNotMatch(crawler, /function uniqueCandidateUrls/);
});'''
if old_block not in coverage:
    raise SystemExit("coverage regression block missing")
write(coverage_test, coverage.replace(old_block, new_block, 1))

value_test = "tests/contracts/hotel-intelligence-value-quality-v1.contract.test.mjs"
value_content = read(value_test)
value_content = value_content.replace(
    'test("scanner profile sanitizer removes invalid critical profile values while retaining raw fact evidence", () => {',
    'test("scanner profile sanitizer removes invalid critical profile values and invalid visible fact evidence", () => {',
    1,
)
value_content = value_content.replace('  assert.equal(result.profile.facts.length, 1);', '  assert.equal(result.profile.facts.length, 0);', 1)
write(value_test, value_content)

write("tests/contracts/hotel-scanner-professional-regressions-v1.contract.test.mjs", r'''import assert from "node:assert/strict";
import test from "node:test";

import { reconcileHotelScanProfileWithFacts } from "../../lib/ai/hotel-scanner-reconciliation.mjs";
import { sanitizeHotelScanProfileValues } from "../../lib/ai/hotel-intelligence-value-quality.mjs";
import { readProjectFile } from "../helpers/source-contract.mjs";

test("protected email placeholders are retained only as diagnostics, never as visible fact cards", () => {
  const result = sanitizeHotelScanProfileValues({
    identity: { address: "" },
    contacts: { emails: ["[email protected]", "reservations@grandresort.example.bg"] },
    facts: [
      { category: "contact", label: "Email", value: "[email protected]", confidence: 0.99, sourceUrls: ["https://hotel.test/contact"] },
      { category: "contact", label: "Email", value: "reservations@grandresort.example.bg", confidence: 0.98, sourceUrls: ["https://hotel.test/contact"] },
    ],
  });

  assert.deepEqual(result.profile.contacts.emails, ["reservations@grandresort.example.bg"]);
  assert.equal(result.profile.facts.length, 1);
  assert.equal(result.profile.facts[0].value, "reservations@grandresort.example.bg");
  assert.ok(result.invalidValues.some((item) => item.reason === "protected_email_placeholder"));
});

test("semantic review reconciliation merges equivalent contact facts with different labels", () => {
  const result = reconcileHotelScanProfileWithFacts({
    identity: {},
    operations: {},
    hospitality: {},
    uncertainties: [],
    facts: [
      { category: "contact", label: "Email", value: "reservations@hotel.test", confidence: 0.91, sourceUrls: ["https://hotel.test/contact"] },
      { category: "contact", label: "Електронна поща", value: "reservations@hotel.test", confidence: 0.95, sourceUrls: ["https://hotel.test/footer"] },
    ],
  });

  assert.equal(result.profile.facts.length, 1);
  assert.deepEqual(result.profile.facts[0].sourceUrls.sort(), ["https://hotel.test/contact", "https://hotel.test/footer"].sort());
  assert.equal(result.reconciliation.semanticDuplicatesRemoved.length, 1);
});

test("brand typography filters system emoji and icon-font families", async () => {
  const crawler = await readProjectFile("lib/server/factory-hotel-scanner.ts");
  const refiner = await readProjectFile("lib/server/hotel-scanner-brand-refiner.ts");
  for (const source of [crawler, refiner]) {
    assert.match(source, /material.*symbols/i);
    assert.match(source, /apple color emoji/i);
    assert.match(source, /segoe ui emoji/i);
  }
});
''')

write("tests/contracts/control-plane-tools-theme.contract.test.mjs", r'''import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("all Control Plane tools inherit one persisted light-dark theme shell", async () => {
  const layout = await readProjectFile("app/control-plane/layout.tsx");
  const shell = await readProjectFile("app/control-plane/ToolsThemeShell.tsx");
  const css = await readProjectFile("app/globals.css");

  assert.match(layout, /ToolsThemeShell/);
  assert.match(shell, /stayhub\.control-plane\.theme\.v1/);
  assert.match(shell, /data-stayhub-tools-theme/);
  assert.match(shell, /"light"/);
  assert.match(shell, /"dark"/);
  assert.match(css, /StayHub internal tools shared light\/dark theme v1/);
  assert.match(css, /stayhub-tools-shell\[data-stayhub-tools-theme="light"\]/);
  assert.match(css, /\.bg-neutral-950/);
  assert.match(css, /\.text-neutral-100/);
});
''')

# Permanent validation workflow must own the new regressions after this temporary patcher is removed.
workflow_path = ".github/workflows/hotel-lifecycle-v1-validation.yml"
workflow = read(workflow_path)
path_anchor = '      - "app/api/control-plane/design-studio/**"\n'
path_insert = (
    path_anchor
    + '      - "app/control-plane/layout.tsx"\n'
    + '      - "app/control-plane/ToolsThemeShell.tsx"\n'
    + '      - "app/globals.css"\n'
    + '      - "tests/contracts/hotel-scanner-professional-regressions-v1.contract.test.mjs"\n'
    + '      - "tests/contracts/control-plane-tools-theme.contract.test.mjs"\n'
)
if path_anchor not in workflow:
    raise SystemExit("workflow path anchor missing")
workflow = workflow.replace(path_anchor, path_insert, 1)
step_anchor = '''      - name: Hotel Intelligence value quality contracts\n        run: node --test tests/contracts/hotel-intelligence-value-quality-v1.contract.test.mjs\n'''.replace('\\n', '\n')
step_insert = step_anchor + '''      - name: Hotel Scanner professional regression contracts\n        run: node --test tests/contracts/hotel-scanner-professional-regressions-v1.contract.test.mjs\n      - name: Control Plane shared tool theme contracts\n        run: node --test tests/contracts/control-plane-tools-theme.contract.test.mjs\n'''.replace('\\n', '\n')
if step_anchor not in workflow:
    raise SystemExit("workflow step anchor missing")
workflow = workflow.replace(step_anchor, step_insert, 1)
write(workflow_path, workflow)

print("Scanner + shared tools theme hardening patch applied")
