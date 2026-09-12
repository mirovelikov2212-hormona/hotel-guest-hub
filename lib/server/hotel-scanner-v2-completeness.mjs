import { canonicalizeHotelIntakeUrl } from "./hotel-scanner-v2-site-map.mjs";

const DOMAIN_FACT_RULES = Object.freeze({
  accommodation: (fact) => key(fact?.category) === "accommodation" || key(fact?.attribute) === "room_type",
  gastronomy: (fact) => key(fact?.category) === "dining" || key(fact?.attribute) === "venue",
  spa: (fact) => key(fact?.category) === "wellness" || ["treatment", "session_duration", "recommended_stay"].includes(key(fact?.attribute)),
  services: (fact) => ["services", "amenities"].includes(key(fact?.category)) || ["service", "facility", "amenity"].includes(key(fact?.attribute)),
  experiences: (fact) => key(fact?.category) === "experiences" || ["experience", "activity", "attraction"].includes(key(fact?.attribute)),
  events: (fact) => key(fact?.category) === "events",
  offers: (fact) => key(fact?.category) === "offers" || key(fact?.attribute) === "offer",
  policies: (fact) => key(fact?.category) === "policy" || /_policy$/.test(key(fact?.attribute)) || key(fact?.attribute) === "quiet_hours",
  contacts: (fact) => key(fact?.category) === "contact" || ["phone", "email", "social_profile"].includes(key(fact?.attribute)),
});

function clean(value, max = 500) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
}

function key(value) {
  return clean(value, 120).toLocaleLowerCase("en-US");
}

function canonicalSourceUrls(fact) {
  return [...new Set((Array.isArray(fact?.sourceUrls) ? fact.sourceUrls : [])
    .map((url) => canonicalizeHotelIntakeUrl(url))
    .filter(Boolean))];
}

function relevantFacts(profile, domain) {
  const facts = Array.isArray(profile?.facts) ? profile.facts : [];
  const rule = DOMAIN_FACT_RULES[domain] || (() => false);
  return facts.filter(rule);
}

function contactProjectionAvailable(profile) {
  return Boolean(
    (profile?.contacts?.phones || []).length ||
    (profile?.contacts?.emails || []).length ||
    (profile?.contacts?.socialLinks || []).length ||
    clean(profile?.identity?.contactUrl),
  );
}

function itemHasEvidence(item, facts, profile, domain) {
  if (domain === "contacts" && contactProjectionAvailable(profile)) return true;
  const expectedUrls = new Set((item?.urls || []).map((url) => canonicalizeHotelIntakeUrl(url)).filter(Boolean));
  if (!expectedUrls.size && item?.url) expectedUrls.add(canonicalizeHotelIntakeUrl(item.url));
  return facts.some((fact) => canonicalSourceUrls(fact).some((url) => expectedUrls.has(url)));
}

function domainCompleteness(domainInventory, profile) {
  const domain = key(domainInventory?.domain);
  const facts = relevantFacts(profile, domain);
  const expectedItems = Array.isArray(domainInventory?.expectedItems) ? domainInventory.expectedItems : [];
  const expectationState = clean(domainInventory?.expectationState, 40) || "ABSENT";

  if (expectationState === "UNKNOWN") {
    return {
      domain,
      status: "INCOMPLETE",
      reason: "expected_inventory_unknown",
      expected: null,
      extracted: 0,
      missingItems: [],
      extractedItemIds: [],
      blocking: true,
    };
  }
  if (expectationState === "ABSENT") {
    return {
      domain,
      status: "NOT_APPLICABLE",
      reason: "surface_not_discovered",
      expected: 0,
      extracted: 0,
      missingItems: [],
      extractedItemIds: [],
      blocking: false,
    };
  }

  const extractedItems = expectedItems.filter((item) => itemHasEvidence(item, facts, profile, domain));
  const extractedIds = new Set(extractedItems.map((item) => item.id));
  const missingItems = expectedItems.filter((item) => !extractedIds.has(item.id)).map((item) => ({
    id: item.id,
    nameHint: clean(item.nameHint, 200),
    url: clean(item.url, 2_048),
    crawled: Boolean(item.crawled),
  }));
  const expected = expectedItems.length;
  const extracted = extractedItems.length;
  const complete = expected === extracted;

  return {
    domain,
    status: complete ? "COMPLETE" : "INCOMPLETE",
    reason: complete ? "expected_inventory_covered" : "expected_inventory_missing_evidence",
    expected,
    extracted,
    missingItems,
    extractedItemIds: extractedItems.map((item) => item.id),
    blocking: !complete,
  };
}

function unresolvedConflictCount(conflicts) {
  return (Array.isArray(conflicts) ? conflicts : []).filter((conflict) => {
    const resolution = key(conflict?.resolution || conflict?.status);
    return !["resolved", "accepted", "dismissed"].includes(resolution);
  }).length;
}

export function buildHotelCompletenessV2(input = {}) {
  const inventory = input.inventory || {};
  const profile = input.profile || {};
  const domains = (Array.isArray(inventory.domains) ? inventory.domains : []).map((domain) => domainCompleteness(domain, profile));
  const pendingDocuments = (Array.isArray(inventory.documents) ? inventory.documents : []).filter((document) => key(document?.ingestionStatus) !== "ingested");
  const unresolvedConflicts = unresolvedConflictCount(input.conflicts);
  const incompleteDomains = domains.filter((domain) => domain.blocking);

  let status = "READY_FOR_HUMAN_REVIEW";
  const blockingReasons = [];
  if (incompleteDomains.length) {
    status = "INCOMPLETE";
    blockingReasons.push("domain_inventory_incomplete");
  }
  if (pendingDocuments.length) {
    status = "INCOMPLETE";
    blockingReasons.push("documents_pending_ingestion");
  }
  if (!incompleteDomains.length && !pendingDocuments.length && unresolvedConflicts > 0) {
    status = "CONFLICT_REVIEW_REQUIRED";
    blockingReasons.push("unresolved_cross_source_conflicts");
  } else if (unresolvedConflicts > 0) {
    blockingReasons.push("unresolved_cross_source_conflicts");
  }

  const prerequisitesSatisfied = status === "READY_FOR_HUMAN_REVIEW";
  return {
    schemaVersion: "hotel-completeness-v2",
    status,
    domains,
    documents: {
      discovered: Array.isArray(inventory.documents) ? inventory.documents.length : 0,
      ingested: (Array.isArray(inventory.documents) ? inventory.documents : []).length - pendingDocuments.length,
      pending: pendingDocuments.length,
      pendingUrls: pendingDocuments.map((document) => clean(document.url, 2_048)),
    },
    conflicts: {
      unresolved: unresolvedConflicts,
    },
    blockingReasons: [...new Set(blockingReasons)],
    prerequisitesSatisfied,
    approvedHotelIntelligenceEligible: false,
    approvalReason: prerequisitesSatisfied ? "explicit_human_validation_and_approval_required" : "validation_prerequisites_not_satisfied",
  };
}
