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
  contacts: (fact) => key(fact?.category) === "contact" || ["phone", "email", "website", "social_profile", "address"].includes(key(fact?.attribute)),
});

const ENTITY_ATTRIBUTES = new Set([
  "room_type", "venue", "service", "treatment", "treatment_category", "technology", "equipment", "facility", "amenity",
  "experience", "activity", "attraction", "offer", "event",
]);
const META_ATTRIBUTES = new Set(["display_name"]);
const GENERIC_SUBJECTS = new Set([
  "hotel", "resort", "property", "accommodation", "gastronomy", "spa", "wellness", "services",
  "experiences", "events", "offers",
]);
const DETAIL_BASES = new Set(["deterministic_detail_resource", "canonical_detail_entity", "canonical_linked_detail_entity"]);
const NAMED_BASES = new Set([
  "deterministic_landing_entity",
  "deterministic_semantic_block_entity",
  "deterministic_json_ld_entity",
  "canonical_section_entity",
  "canonical_structural_entity",
  "canonical_service_text_entity",
  "canonical_facility_text_entity",
  "canonical_verified_document_entity",
]);
const EXISTENCE_ONLY_BASES = new Set([
  "canonical_service_text_entity",
  "canonical_facility_text_entity",
  "canonical_verified_document_entity",
]);

function clean(value, max = 500) { return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max); }
function key(value) { return clean(value, 120).toLocaleLowerCase("en-US"); }
function entityKey(value) {
  return clean(value, 240).toLocaleLowerCase("en-US").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function sameEntityName(left, right) {
  const a = entityKey(left);
  const b = entityKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 7) return false;
  return a.includes(b) || b.includes(a);
}
function canonicalSourceUrls(fact) {
  return [...new Set((Array.isArray(fact?.sourceUrls) ? fact.sourceUrls : []).map((url) => canonicalizeHotelIntakeUrl(url)).filter(Boolean))];
}
function relevantFacts(profile, domain) {
  const facts = Array.isArray(profile?.facts) ? profile.facts : [];
  return facts.filter(DOMAIN_FACT_RULES[domain] || (() => false));
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
  const primary = canonicalizeHotelIntakeUrl(item?.url);
  if (primary) urls.add(primary);
  return urls;
}
function sourceMatchesItem(fact, item) {
  const urls = expectedUrls(item);
  if (!urls.size) return true;
  return canonicalSourceUrls(fact).some((url) => urls.has(url));
}
function itemSummary(item) {
  return {
    id: item.id,
    nameHint: clean(item.nameHint, 200),
    url: clean(item.url, 2_048),
    crawled: Boolean(item.crawled),
  };
}
function matchingFactForItem(item, facts, domain) {
  if (domain === "contacts") return facts.find((fact) => sourceMatchesItem(fact, item)) || facts[0] || null;
  if (domain === "policies") return facts.find((fact) => sourceMatchesItem(fact, item)) || null;

  const basis = key(item?.basis);
  if (basis === "deterministic_explicit_count_slot") return null;
  const expectedName = entityKey(item?.nameHint);

  if (DETAIL_BASES.has(basis)) {
    if (expectedName) {
      return facts.find((fact) => sourceMatchesItem(fact, item) && sameEntityName(factEntityKey(fact), expectedName)) || null;
    }
    return facts.find((fact) => sourceMatchesItem(fact, item) && Boolean(factEntityKey(fact))) || null;
  }
  if (NAMED_BASES.has(basis)) {
    if (!expectedName) return null;
    return facts.find((fact) => sourceMatchesItem(fact, item) && sameEntityName(factEntityKey(fact), expectedName)) || null;
  }
  if (basis === "deterministic_logical_surface") return facts[0] || null;
  return facts.find((fact) => sourceMatchesItem(fact, item)) || null;
}

function primarySourceUrl(item) {
  return canonicalizeHotelIntakeUrl(item?.url);
}

function detailEntityAliases(item, facts, seed = "") {
  const aliases = new Set([seed || entityKey(item?.nameHint)].filter(Boolean));
  const basis = key(item?.basis);
  if (!DETAIL_BASES.has(basis)) return aliases;

  const primary = primarySourceUrl(item);
  if (!primary) return aliases;
  const sourceFacts = facts.filter((fact) => canonicalSourceUrls(fact).includes(primary));
  const anchored = sourceFacts.some((fact) =>
    [...aliases].some((alias) => sameEntityName(factEntityKey(fact), alias)));
  if (!anchored) return aliases;

  for (const fact of sourceFacts) {
    const factKey = factEntityKey(fact);
    if (factKey) aliases.add(factKey);
    if (key(fact?.attribute) === "display_name") {
      const subject = entityKey(fact?.subject);
      const value = entityKey(fact?.value);
      if (subject) aliases.add(subject);
      if (value) aliases.add(value);
    }
  }
  return aliases;
}

function factsForItemContent(item, facts, domain, entityHint = "") {
  if (domain === "contacts") return facts.filter((fact) => !META_ATTRIBUTES.has(key(fact?.attribute)));
  if (domain === "policies") return facts.filter((fact) => sourceMatchesItem(fact, item) && !META_ATTRIBUTES.has(key(fact?.attribute)));

  const basis = key(item?.basis);
  const aliases = detailEntityAliases(item, facts, entityHint || entityKey(item?.nameHint));
  return facts.filter((fact) => {
    if (META_ATTRIBUTES.has(key(fact?.attribute))) return false;
    const factEntity = factEntityKey(fact);
    if (factEntity && [...aliases].some((alias) => sameEntityName(factEntity, alias))) return true;
    return DETAIL_BASES.has(basis) && !factEntity && sourceMatchesItem(fact, item);
  });
}
function isIdentityOnlyFact(fact, item, entityAliases = new Set()) {
  const attribute = key(fact?.attribute);
  if (META_ATTRIBUTES.has(attribute)) return true;
  if (!ENTITY_ATTRIBUTES.has(attribute)) return false;
  const aliases = entityAliases instanceof Set
    ? entityAliases
    : new Set([entityAliases || entityKey(item?.nameHint) || factEntityKey(fact)].filter(Boolean));
  return [...aliases].some((identity) => identity && sameEntityName(fact?.value, identity));
}

function notApplicableDomain(domain, reason, expected = 0) {
  const inventory = { status: "NOT_APPLICABLE", reason, expected, extracted: 0, missingItems: [], extractedItemIds: [] };
  const content = { status: "NOT_APPLICABLE", reason, detailed: 0, totalEntities: 0, missingDetailItems: [] };
  return {
    domain, status: "NOT_APPLICABLE", reason, expected, extracted: 0, missingItems: [], extractedItemIds: [],
    inventory, content, blocking: false,
  };
}

function domainCompleteness(domainInventory, profile) {
  const domain = key(domainInventory?.domain);
  const facts = relevantFacts(profile, domain);
  const expectedItems = Array.isArray(domainInventory?.expectedItems) ? domainInventory.expectedItems : [];
  const expectationState = clean(domainInventory?.expectationState, 40) || "ABSENT";

  if (expectationState === "UNKNOWN") {
    const inventory = { status: "INCOMPLETE", reason: "expected_inventory_unknown", expected: null, extracted: 0, missingItems: [], extractedItemIds: [] };
    const content = { status: "INCOMPLETE", reason: "content_inventory_unknown", detailed: 0, totalEntities: 0, missingDetailItems: [] };
    return {
      domain, status: "INCOMPLETE", reason: "expected_inventory_unknown", expected: null, extracted: 0, missingItems: [], extractedItemIds: [],
      inventory, content, blocking: true,
    };
  }
  if (expectationState === "ABSENT") return notApplicableDomain(domain, "surface_not_discovered");

  const countSlots = expectedItems.filter((item) => key(item?.basis) === "deterministic_explicit_count_slot");
  const matchableItems = expectedItems.filter((item) => key(item?.basis) !== "deterministic_explicit_count_slot");
  const deterministicPresenceItems = matchableItems.filter((item) => {
    const basis = key(item?.basis);
    return EXISTENCE_ONLY_BASES.has(basis)
      && (Boolean(item?.crawled) || basis === "canonical_verified_document_entity");
  });
  const deterministicPresenceIds = new Set(deterministicPresenceItems.map((item) => item.id));

  const matched = matchableItems
    .filter((item) => !deterministicPresenceIds.has(item.id))
    .map((item) => ({ item, fact: matchingFactForItem(item, facts, domain) }))
    .filter((entry) => Boolean(entry.fact));

  const consumedEntityKeys = new Set();
  const itemEntityKeys = new Map();
  for (const item of deterministicPresenceItems) {
    const expectedName = entityKey(item?.nameHint);
    if (expectedName) consumedEntityKeys.add(expectedName);
    itemEntityKeys.set(item.id, expectedName);
  }
  for (const entry of matched) {
    const expectedName = entityKey(entry.item?.nameHint);
    const matchedFactKey = factEntityKey(entry.fact);
    if (expectedName) consumedEntityKeys.add(expectedName);
    if (matchedFactKey) consumedEntityKeys.add(matchedFactKey);
    itemEntityKeys.set(entry.item.id, expectedName || matchedFactKey);
  }

  const remainingEntityKeys = [...new Set(facts.map(factEntityKey).filter(Boolean))]
    .filter((factKey) => !consumedEntityKeys.has(factKey));
  const coveredSlots = countSlots.slice(0, Math.min(countSlots.length, remainingEntityKeys.length));
  coveredSlots.forEach((item, index) => itemEntityKeys.set(item.id, remainingEntityKeys[index] || ""));

  const extractedIds = new Set([
    ...deterministicPresenceItems.map((item) => item.id),
    ...matched.map((entry) => entry.item.id),
    ...coveredSlots.map((item) => item.id),
  ]);
  const missingItems = expectedItems.filter((item) => !extractedIds.has(item.id)).map(itemSummary);
  const expected = Number(domainInventory?.expectedCount ?? expectedItems.length);
  const extracted = extractedIds.size;
  const inventoryConflict = expectationState === "CONFLICT";
  const inventoryComplete = !inventoryConflict && expected === extracted;
  const inventory = {
    status: inventoryComplete ? "COMPLETE" : "INCOMPLETE",
    reason: inventoryConflict ? "expected_inventory_conflict" : inventoryComplete ? "expected_inventory_covered" : "expected_inventory_missing_evidence",
    expected,
    extracted,
    missingItems,
    extractedItemIds: [...extractedIds],
  };

  const missingDetailItems = expectedItems
    .filter((item) => extractedIds.has(item.id))
    .filter((item) => {
      const basis = key(item?.basis);
      if (EXISTENCE_ONLY_BASES.has(basis)) return false;
      const entityHint = itemEntityKeys.get(item.id) || "";
      const aliases = detailEntityAliases(item, facts, entityHint || entityKey(item?.nameHint));
      const detailFacts = factsForItemContent(item, facts, domain, entityHint)
        .filter((fact) => !isIdentityOnlyFact(fact, item, aliases));
      return detailFacts.length === 0;
    })
    .map(itemSummary);
  const detailed = Math.max(0, extracted - missingDetailItems.length);
  const contentComplete = inventoryComplete && missingDetailItems.length === 0;
  const content = {
    status: contentComplete ? "COMPLETE" : "INCOMPLETE",
    reason: contentComplete ? "entity_details_covered" : "entity_details_missing",
    detailed,
    totalEntities: extracted,
    missingDetailItems,
  };

  const complete = inventoryComplete && contentComplete;
  const reason = !inventoryComplete ? inventory.reason : !contentComplete ? content.reason : "inventory_and_content_complete";
  return {
    domain,
    status: complete ? "COMPLETE" : "INCOMPLETE",
    reason,
    expected,
    extracted,
    missingItems,
    extractedItemIds: [...extractedIds],
    inventory,
    content,
    blocking: !complete,
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
  const inventoryIncompleteDomains = domains.filter((domain) => domain.inventory?.status === "INCOMPLETE");
  const contentIncompleteDomains = domains.filter((domain) => domain.content?.status === "INCOMPLETE");
  const inventoryConflictCount = (Array.isArray(inventory.domains) ? inventory.domains : []).filter((domain) => clean(domain?.expectationState, 40) === "CONFLICT").length;

  let status = "READY_FOR_HUMAN_REVIEW";
  const blockingReasons = [];
  if (inventoryIncompleteDomains.length) {
    status = "INCOMPLETE";
    blockingReasons.push("domain_inventory_incomplete");
  }
  if (contentIncompleteDomains.length) {
    status = "INCOMPLETE";
    blockingReasons.push("domain_content_incomplete");
  }
  if (inventoryConflictCount) blockingReasons.push("inventory_expectation_conflict");
  if (pendingDocuments.length) {
    status = "INCOMPLETE";
    blockingReasons.push("documents_pending_ingestion");
  }
  if (!inventoryIncompleteDomains.length && !contentIncompleteDomains.length && !pendingDocuments.length && unresolvedConflicts > 0) {
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
    conflicts: { unresolved: unresolvedConflicts, inventory: inventoryConflictCount },
    blockingReasons: [...new Set(blockingReasons)],
    prerequisitesSatisfied,
    approvedHotelIntelligenceEligible: false,
    approvalReason: prerequisitesSatisfied ? "explicit_human_validation_and_approval_required" : "validation_prerequisites_not_satisfied",
  };
}
