import { classifyHotelScannerPageV2, hotelScannerPageTypeDomain } from "./hotel-scanner-v2-page-classifier.mjs";
import { canonicalizeHotelIntakeUrl } from "./hotel-scanner-v2-site-map.mjs";
import { classifyCommonHotelObjectV2 } from "./hotel-scanner-v2-hospitality-taxonomy.mjs";

function urlDescendsFrom(candidateUrl, parentUrl) {
  try {
    const candidate = new URL(canonicalizeHotelIntakeUrl(candidateUrl));
    const parent = new URL(canonicalizeHotelIntakeUrl(parentUrl));
    if (candidate.origin !== parent.origin) return false;
    const parentPath = parent.pathname.replace(/\/+$/, "") || "/";
    const candidatePath = candidate.pathname.replace(/\/+$/, "") || "/";
    return parentPath !== "/" && candidatePath.startsWith(`${parentPath}/`);
  } catch {
    return false;
  }
}


function entityKey(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ş/g, "s")
    .replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function failedUrlLabel(rawUrl) {
  try {
    const segment = decodeURIComponent(new URL(rawUrl).pathname.split("/").filter(Boolean).pop() || "");
    return segment.replace(/[-_]+/g, " ").trim();
  } catch {
    return "";
  }
}

function sameEntityName(left, right) {
  const a = entityKey(left);
  const b = entityKey(right);
  if (!a || !b) return false;
  return a === b || (Math.min(a.length, b.length) >= 5 && (a.includes(b) || b.includes(a)));
}

const DETAIL_BASES = new Set(["canonical_linked_detail_entity", "canonical_detail_entity", "deterministic_detail_resource"]);

export function buildHotelScannerCoverageBlockingReasonsV2(input = {}) {
  const coverage = input.coverage || {};
  const inventory = input.inventory || {};
  const completeness = input.completeness || {};
  const pending = Array.isArray(coverage.pendingRelevantUrls) ? coverage.pendingRelevantUrls : [];
  const failedUrls = Array.isArray(coverage.failedRelevantUrls) ? coverage.failedRelevantUrls : [];
  const failed = new Set(failedUrls);
  const nonFailedPending = pending.filter((url) => !failed.has(url));
  const completenessByDomain = new Map((completeness.domains || []).map((domain) => [domain.domain, domain]));
  const inventoryByDomain = new Map((inventory.domains || []).map((domain) => [domain.domain, domain]));

  const blockingFailedUrls = failedUrls.filter((url) => {
    const pathLabel = failedUrlLabel(url);
    const commonObject = classifyCommonHotelObjectV2(pathLabel, pathLabel, "");
    const classification = classifyHotelScannerPageV2({ url });
    const domain = commonObject?.domain || hotelScannerPageTypeDomain(classification.primaryType);
    if (["policies", "faq", "contacts"].includes(domain)) return true;

    const domainCompleteness = completenessByDomain.get(domain);
    if (!domainCompleteness || domainCompleteness.status !== "COMPLETE") return true;

    const expectedItems = inventoryByDomain.get(domain)?.expectedItems || [];
    return !expectedItems.some((item) => {
      const parents = [...(item.urls || []), item.url].filter(Boolean);
      const ownsRoute = parents.some((parentUrl) => urlDescendsFrom(url, parentUrl));
      if (!ownsRoute) return false;
      if (DETAIL_BASES.has(String(item.basis || "").toLocaleLowerCase("en-US"))) return true;
      return sameEntityName(pathLabel, item.nameHint);
    });
  });

  const reasons = [];
  if (nonFailedPending.length || blockingFailedUrls.length) reasons.push("relevant_site_coverage_incomplete");
  if (blockingFailedUrls.length) reasons.push("relevant_site_pages_failed");

  return {
    reasons,
    blockingFailedUrls,
    nonBlockingFailedUrls: failedUrls.filter((url) => !blockingFailedUrls.includes(url)),
    nonFailedPendingUrls: nonFailedPending,
    coverageSatisfied: reasons.length === 0,
  };
}
