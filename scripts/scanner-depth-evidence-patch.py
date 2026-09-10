from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    if old not in content:
        raise SystemExit(f"missing expected fragment in {path}: {old[:120]!r}")
    write(path, content.replace(old, new, 1))


scanner_path = "lib/server/factory-hotel-scanner.ts"

# Homepage marketing mentions are discovery signals, not proof that critical
# operational domains were deeply covered. Only low-risk identity/design
# coverage is seeded before detail-page verification.
replace_once(
    scanner_path,
    "  const coveredDomains = new Set<string>(classifyHotelScannerPageCoverage(firstPage));",
    '''  const homepageCoverage = classifyHotelScannerPageCoverage(firstPage);\n  const coveredDomains = new Set<string>(\n    homepageCoverage.filter((domain) => domain === "identity" || domain === "design"),\n  );'''.replace('\\n', '\n'),
)

# Surface public contact and structured operational hints that often exist only
# in mailto/tel attributes or JSON-LD. Hints are exact public evidence, bounded,
# and placed before marketing body text so AI evidence slices do not miss them.
scanner = read(scanner_path)
marker = "function buildPageEvidence(url: URL, html: string): HotelScanPageEvidence {"
if marker not in scanner:
    raise SystemExit("buildPageEvidence marker missing")
helper = r'''const JSON_LD_EVIDENCE_KEYS = new Set([
  "streetAddress",
  "addressLocality",
  "addressRegion",
  "postalCode",
  "addressCountry",
  "telephone",
  "email",
  "checkinTime",
  "checkoutTime",
  "openingHours",
  "petsAllowed",
]);

function pushPublicHint(hints: string[], seen: Set<string>, label: string, raw: unknown) {
  if (raw === null || raw === undefined) return;
  if (Array.isArray(raw)) {
    for (const item of raw.slice(0, 12)) pushPublicHint(hints, seen, label, item);
    return;
  }
  if (typeof raw === "object") return;
  const value = cleanText(String(raw), 500);
  if (!value) return;
  const hint = `${label}: ${value}`;
  const key = hint.toLocaleLowerCase("en-US");
  if (seen.has(key)) return;
  seen.add(key);
  hints.push(hint);
}

function collectJsonLdEvidence(value: unknown, hints: string[], seen: Set<string>, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 40)) collectJsonLdEvidence(item, hints, seen, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (JSON_LD_EVIDENCE_KEYS.has(key)) pushPublicHint(hints, seen, key, child);
    collectJsonLdEvidence(child, hints, seen, depth + 1);
    if (hints.length >= 60) break;
  }
}

function extractEmbeddedPublicHints(html: string) {
  const hints: string[] = [];
  const seen = new Set<string>();

  const mailto = /\bhref\s*=\s*["']mailto:([^"'?#]+)(?:\?[^"']*)?["']/gi;
  let mailMatch: RegExpExecArray | null;
  while ((mailMatch = mailto.exec(html)) && hints.length < 60) {
    try {
      pushPublicHint(hints, seen, "email", decodeURIComponent(mailMatch[1]));
    } catch {
      pushPublicHint(hints, seen, "email", mailMatch[1]);
    }
  }

  const tel = /\bhref\s*=\s*["']tel:([^"']+)["']/gi;
  let telMatch: RegExpExecArray | null;
  while ((telMatch = tel.exec(html)) && hints.length < 60) {
    try {
      pushPublicHint(hints, seen, "telephone", decodeURIComponent(telMatch[1]));
    } catch {
      pushPublicHint(hints, seen, "telephone", telMatch[1]);
    }
  }

  const jsonLd = /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonMatch: RegExpExecArray | null;
  while ((jsonMatch = jsonLd.exec(html)) && hints.length < 60) {
    const raw = String(jsonMatch[1] || "").trim();
    if (!raw || raw.length > 250_000) continue;
    try {
      collectJsonLdEvidence(JSON.parse(raw), hints, seen);
    } catch {
      // Invalid third-party JSON-LD is ignored instead of weakening the scan.
    }
  }

  return cleanText(hints.join(" | "), 8_000);
}

'''
scanner = scanner.replace(marker, helper + marker, 1)
scanner = scanner.replace(
    "    text: htmlText(html),",
    '    text: cleanText(`${extractEmbeddedPublicHints(html)} ${htmlText(html)}`, 25_000),',
    1,
)
write(scanner_path, scanner)

# Let the bounded coverage planner evaluate a realistic sitemap-sized candidate
# set. Page fetch count remains independently capped by the crawler.
plan_path = "lib/server/hotel-scanner-crawl-plan.mjs"
replace_once(plan_path, "  for (const [index, raw] of uniqueUrls(input.links || [], 80).entries()) {", "  for (const [index, raw] of uniqueUrls(input.links || [], 200).entries()) {")
replace_once(plan_path, "    if (candidates.length >= 40) break;", "    if (candidates.length >= 160) break;")

# Regression contract: a homepage mention must not be allowed to suppress the
# detail-page verification pass, and structured public hints remain bounded.
coverage_path = "tests/contracts/hotel-scanner-coverage-crawl-plan-v1.contract.test.mjs"
coverage = read(coverage_path)
coverage = coverage.replace(
    '  assert.match(crawler, /classifyHotelScannerPageCoverage\\(firstPage\\)/);',
    '  assert.match(crawler, /homepageCoverage = classifyHotelScannerPageCoverage\\(firstPage\\)/);\n  assert.match(crawler, /homepageCoverage\\.filter\\(\\(domain\\) => domain === "identity" \\|\\| domain === "design"\\)/);',
    1,
)
write(coverage_path, coverage)

professional_path = "tests/contracts/hotel-scanner-professional-regressions-v1.contract.test.mjs"
professional = read(professional_path)
professional += r'''

test("crawler verifies critical detail domains and preserves bounded embedded public evidence", async () => {
  const crawler = await readProjectFile("lib/server/factory-hotel-scanner.ts");
  const planner = await readProjectFile("lib/server/hotel-scanner-crawl-plan.mjs");

  assert.match(crawler, /homepageCoverage\.filter\(\(domain\) => domain === "identity" \|\| domain === "design"\)/);
  assert.match(crawler, /extractEmbeddedPublicHints/);
  assert.match(crawler, /application\\\/ld\\\+json/);
  assert.match(crawler, /mailto:/);
  assert.match(crawler, /tel:/);
  assert.match(crawler, /checkinTime/);
  assert.match(crawler, /checkoutTime/);
  assert.match(crawler, /petsAllowed/);
  assert.match(crawler, /cleanText\(`\$\{extractEmbeddedPublicHints\(html\)\} \$\{htmlText\(html\)\}`, 25_000\)/);
  assert.match(planner, /uniqueUrls\(input\.links \|\| \[\], 200\)/);
  assert.match(planner, /candidates\.length >= 160/);
});
'''
write(professional_path, professional)

print("Scanner depth verification and embedded public evidence hardening applied")
