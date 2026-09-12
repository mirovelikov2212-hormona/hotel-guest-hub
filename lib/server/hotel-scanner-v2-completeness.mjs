import { canonicalizeHotelIntakeUrl } from "./hotel-scanner-v2-site-map.mjs";

const DOMAIN_FACT_RULES = Object.freeze({
  accommodation: (fact) => key(fact?.category) === "accommodation" || key(fact?.attribute) === "room_type",
  gastronomy: (fact) => key(fact?.category) === "dining" || key(fact?.attribute) === "venue",
  spa: (fact) => key(fact?.category) === "wellness" || ["treatment", "treatment_category", "technology", "equipment", "session_duration", "recommended_stay", "facility"].includes(key(fact?.attribute)),
  services: (fact) => ["services", "amenities"].includes(key(fact?.category)) || ["service", "facility", "amenity"].includes(key(fact?.attribute)),
  experiences: (fact) => key(fact?.category) === "experiences" || ["experience", "activity", "attraction"].includes(key(fact?.attribute)),
  events: (fact) => key(fact?.category) === "events" || key(fact?.attribute) === "event",
  offers: (fact) => key(fact?.category) === "offers" || key(fact?.attribute) === "offer",
  policies: (fact) => key(fact?.category) === "policy" || /_policy$/.test(key(fact?.attribute)) || key(fact?.attribute) === "quiet_hours",
  contacts: (fact) => key(fact?.category) === "contact" || ["phone", "email", "social_profile"].includes(key(fact?.attribute)),
});

const ENTITY_ATTRIBUTES = new Set([
  "room_type", "venue", "service", "treatment", "treatment_category", "technology", "equipment", "facility", "amenity",
  "experience", "activity", "attraction", "offer", "event",
]);
const GENERIC_SUBJECTS = new Set([
  "hotel", "resort", "property", "accommodation", "gastronomy", "spa", "wellness", "services",
  "experiences", "events", "offers",
]);

function clean(value, max = 500) { return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max); }
function key(value) { return clean(value, 120).toLocaleLowerCase("en-US"); }
function entityKey(value) {
  return clean(value, 240).toLocaleLowerCase("en-US").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function canonicalSourceUrls(fact) {
  return [...new Set((Array.isArray(fact?.sourceUrls) ? fact.sourceUrls : []).map((url) => canonicalizeHotelIntakeUrl(url)).filter(Boolean))];
}
function relevantFacts(profile, domain) {
  const facts = Array.isArray(profile?.facts) ? profile.facts : [];
  return facts.filter(DOMAIN_FACT_RULES[domain] || (() => false));
}
function contactProjectionAvailable(profile) {
  return Boolean((profile?.contacts?.phones || []).length || (profile?.contacts?.emails || []).length || (profile?.contacts?.socialLinks || []).length || clean(profile?.identity?.contactUrl));
}
function factEntityKey(fact) {
  const subject = entityKey(fact?.subject);
  if (subject && !GENERIC_SUBJECTS.has(subject)) return subject;
  const attribute = key(fact?.attribute);
  if (ENTITY_ATTRIBUTES.has(attribute)) return entityKey(fact?.value);
  return "";
}
function expectedUrls(item) {
  const urls = new Set((item?.urls || []).map((url) => canonicalizeHotelIntakeUrl(url)).filter(Boolean));
  const primary = canonicalizeHotelIntakeUrl(item?.url); if (primary) urls.add(primary); return urls;
}
function sourceMatchesItem(fact, item) {
  const urls = expectedUrls(item); if (!urls.size) return true;
  return canonicalSourceUrls(fact).some((url) => urls.has(url));
}
function matchingFactForItem(item, facts, profile, domain) {
  if (domain === "contacts" && contactProjectionAvailable(profile)) return { synthetic: true };
  if (domain === "policies") return facts.find((fact) => sourceMatchesItem(fact, item)) || null;

  const basis = key(item?.basis);
  if (basis === "deterministic_explicit_count_slot") return null;
  if (basis === "deterministic_detail_resource") {
    if (domain === "spa") return facts.find((fact) => sourceMatchesItem(fact, item)) || null;
    return facts.find((fact) => sourceMatchesItem(fact, item) && Boolean(factEntityKey(fact))) || null;
  }
  if (["deterministic_landing_entity", "deterministic_semantic_block_entity", "deterministic_json_ld_entity"].includes(basis)) {
    const expectedName = entityKey(item?.nameHint); if (!expectedName) return null;
    return facts.find((fact) => sourceMatchesItem(fact, item) && factEntityKey(fact) === expectedName) || null;
  }
  if (basis === "deterministic_logical_surface") return facts[0] || null;
  return facts.find((fact) => sourceMatchesItem(fact, item)) || null;
}

function domainCompleteness(domainInventory, profile) {
  const domain = key(domainInventory?.domain);
  const facts = relevantFacts(profile, domain);
  const expectedItems = Array.isArray(domainInventory?.expectedItems) ? domainInventory.expectedItems : [];
  const expectationState = clean(domainInventory?.expectationState, 40) || "ABSENT";

  if (expectationState === "UNKNOWN") return { domain, status: "INCOMPLETE", reason: "expected_inventory_unknown", expected: null, extracted: 0, missingItems: [], extractedItemIds: [], blocking: true };
  if (expectationState === "ABSENT") return { domain, status: "NOT_APPLICABLE", reason: "surface_not_discovered", expected: 0, extracted: 0, missingItems: [], extractedItemIds: [], blocking: false };

  const countSlots = expectedItems.filter((item) => key(item?.basis) === "deterministic_explicit_count_slot");
  const matchableItems = expectedItems.filter((item) => key(item?.basis) !== "deterministic_explicit_count_slot");
  const matched = matchableItems.map((item) => ({ item, fact: matchingFactForItem(item, facts, profile, domain) })).filter((entry) => Boolean(entry.fact));

  const consumedEntityKeys = new Set();
  for (const entry of matched) {
    const expectedName = entityKey(entry.item?.nameHint);
    const matchedFactKey = entry.fact?.synthetic ? "" : factEntityKey(entry.fact);
    if (expectedName) consumedEntityKeys.add(expectedName);
    if (matchedFactKey) consumedEntityKeys.add(matchedFactKey);
  }
  const remainingEntityKeys = [...new Set(facts.map(factEntityKey).filter(Boolean))].filter((factKey) => !consumedEntityKeys.has(factKey));
  const coveredSlots = countSlots.slice(0, Math.min(countSlots.length, remainingEntityKeys.length));
  const extractedIds = new Set([...matched.map((entry) => entry.item.id), ...coveredSlots.map((item) => item.id)]);
  const missingItems = expectedItems.filter((item) => !extractedIds.has(item.id)).map((item) => ({
    id: item.id, nameHint: clean(item.nameHint, 200), url: clean(item.url, 2_048), crawled: Boolean(item.crawled),
  }));
  const expected = Number(domainInventory?.expectedCount ?? expectedItems.length);
  const extracted = extractedIds.size;
  const inventoryConflict = expectationState === "CONFLICT";
  const complete = !inventoryConflict && expected === extracted;
  return {
    domain, status: complete ? "COMPLETE" : "INCOMPLETE",
    reason: inventoryConflict ? "expected_inventory_conflict" : complete ? "expected_inventory_covered" : "expected_inventory_missing_evidence",
    expected, extracted, missingItems, extractedItemIds: [...extractedIds], blocking: !complete,
  };
}

function unresolvedConflictCount(conflicts) {
  return (Array.isArray(conflicts) ? conflicts : []).filter((conflict) => !["resolved", "accepted", "dismissed"].includes(key(conflict?.resolution || conflict?.status))).length;
}

export function buildHotelCompletenessV2(input = {}) {
  const inventory = input.inventory || {};
  const profile = input.profile || {};
  const domains = (Array.isArray(inventory.domains) ? inventory.domains : []).map((domain) => domainCompleteness(domain, profile));
  const pendingDocuments = (Array.isArray(inventory.documents) ? inventory.documents : []).filter((document) => key(document?.ingestionStatus) !== "ingested");
  const unresolvedConflicts = unresolvedConflictCount(input.conflicts);
  const incompleteDomains = domains.filter((domain) => domain.blocking);
  const inventoryConflictCount = (Array.isArray(inventory.domains) ? inventory.domains : []).filter((domain) => clean(domain?.expectationState, 40) === "CONFLICT").length;

  let status = "READY_FOR_HUMAN_REVIEW";
  const blockingReasons = [];
  if (incompleteDomains.length) { status = "INCOMPLETE"; blockingReasons.push("domain_inventory_incomplete"); }
  if (inventoryConflictCount) blockingReasons.push("inventory_expectation_conflict");
  if (pendingDocuments.length) { status = "INCOMPLETE"; blockingReasons.push("documents_pending_ingestion"); }
  if (!incompleteDomains.length && !pendingDocuments.length && unresolvedConflicts > 0) { status = "CONFLICT_REVIEW_REQUIRED"; blockingReasons.push("unresolved_cross_source_conflicts"); }
  else if (unresolvedConflicts > 0) blockingReasons.push("unresolved_cross_source_conflicts");

  const prerequisitesSatisfied = status === "READY_FOR_HUMAN_REVIEW";
  return {
    schemaVersion: "hotel-completeness-v2", status, domains,
    documents: {
      discovered: Array.isArray(inventory.documents) ? inventory.documents.length : 0,
      ingested: (Array.isArray(inventory.documents) ? inventory.documents : []).length - pendingDocuments.length,
      pending: pendingDocuments.length,
      pendingUrls: pendingDocuments.map((document) => clean(document.url, 2_048)),
    },
    conflicts: { unresolved: unresolvedConflicts, inventory: inventoryConflictCount },
    blockingReasons: [...new Set(blockingReasons)], prerequisitesSatisfied, approvedHotelIntelligenceEligible: false,
    approvalReason: prerequisitesSatisfied ? "explicit_human_validation_and_approval_required" : "validation_prerequisites_not_satisfied",
  };
}
