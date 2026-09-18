import { classifyHotelScannerPageV2, hotelScannerPageTypeDomain } from "./hotel-scanner-v2-page-classifier.mjs";
import { canonicalizeHotelIntakeUrl } from "./hotel-scanner-v2-site-map.mjs";

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
    const classification = classifyHotelScannerPageV2({ url });
    const domain = hotelScannerPageTypeDomain(classification.primaryType);
    if (["policies", "faq", "contacts"].includes(domain)) return true;

    const domainCompleteness = completenessByDomain.get(domain);
    if (!domainCompleteness || domainCompleteness.status !== "COMPLETE") return true;

    const expectedItems = inventoryByDomain.get(domain)?.expectedItems || [];
    return !expectedItems.some((item) => {
      const parents = [...(item.urls || []), item.url].filter(Boolean);
      return parents.some((parentUrl) => urlDescendsFrom(url, parentUrl));
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
