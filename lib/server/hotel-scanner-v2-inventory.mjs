const INVENTORY_DOMAINS = Object.freeze([
  { key: "accommodation", landingTypes: ["accommodation"], detailTypes: ["room_detail"] },
  { key: "gastronomy", landingTypes: ["gastronomy"], detailTypes: ["restaurant_detail"] },
  { key: "spa", landingTypes: ["spa"], detailTypes: ["spa_detail"] },
  { key: "services", landingTypes: ["services"], detailTypes: ["service_detail"], requireCrawledDetails: true },
  { key: "experiences", landingTypes: ["experiences"], detailTypes: ["experience_detail"] },
  { key: "events", landingTypes: ["events"], detailTypes: ["event_detail"] },
  { key: "offers", landingTypes: ["offers"], detailTypes: ["offer_detail"] },
  { key: "policies", landingTypes: ["policies"], detailTypes: ["policies"], sourceInventory: true },
  { key: "contacts", landingTypes: ["contacts"], detailTypes: [], logicalSingleton: true },
]);

function clean(value, max = 300) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
}
function unique(values) { return [...new Set((values || []).map((value) => clean(value, 2_048)).filter(Boolean))]; }
function entityKey(value) {
  return clean(value, 240).toLocaleLowerCase("en-US").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function resourceTypes(resource) {
  const values = Array.isArray(resource?.classification?.types) ? resource.classification.types : [];
  return new Set(values.map((value) => clean(value, 80)));
}
function hasAnyType(resource, expectedTypes) {
  const types = resourceTypes(resource); return expectedTypes.some((type) => types.has(type));
}
function resourceLanguagePriority(resource) {
  const languages = Array.isArray(resource?.languages) ? resource.languages : [];
  try {
    const path = new URL(String(resource?.url || "")).pathname.split("/").filter(Boolean);
    if (!path.length || !/^(?:bg|en|de|ro|ru|cs|cz|fr|it|es|pl|tr|el|sr|mk|uk|hu|nl|pt)$/iu.test(path[0])) return 60;
  } catch { /* URL quality is handled elsewhere. */ }
  if (languages.includes("bg")) return 50;
  if (languages.includes("en")) return 45;
  return 20;
}
function preferRepresentative(resources) {
  return [...resources].sort((left, right) => {
    if (Boolean(left.crawled) !== Boolean(right.crawled)) return left.crawled ? -1 : 1;
    const languageOrder = resourceLanguagePriority(right) - resourceLanguagePriority(left);
    if (languageOrder) return languageOrder;
    return String(left.url || "").localeCompare(String(right.url || ""));
  })[0];
}
function groupResources(resources) {
  const groups = new Map();
  for (const resource of resources) {
    const groupId = clean(resource?.variantGroupId, 500) || clean(resource?.url, 2_048);
    if (!groupId) continue;
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(resource);
  }
  return groups;
}
function expectedItem(domain, groupId, resources) {
  const representative = preferRepresentative(resources);
  return {
    id: `${domain}:${groupId}`, domain, variantGroupId: groupId,
    nameHint: clean(representative?.title, 200), url: clean(representative?.url, 2_048),
    urls: unique(resources.map((resource) => resource?.url)).sort(),
    languages: unique(resources.flatMap((resource) => resource?.languages || [])).sort(),
    crawled: resources.some((resource) => Boolean(resource?.crawled)), basis: "deterministic_detail_resource",
  };
}

const CONFIDENCE_SCORE = Object.freeze({ HIGH: 3, MEDIUM: 2, COUNT_ONLY: 1 });
function landingEvidence(resources, domain) {
  const candidates = resources
    .filter((resource) => resource?.inventoryHint?.domain === domain && Number(resource?.inventoryHint?.expectedCount || 0) > 0)
    .map((resource) => ({ resource, hint: resource.inventoryHint }));
  if (!candidates.length) return null;

  const strongCounts = [...new Set(candidates
    .filter((entry) => entry.hint.confidence === "HIGH")
    .map((entry) => Number(entry.hint.expectedCount || 0))
    .filter((count) => count > 0))];
  const hardConflict = strongCounts.length > 1 || candidates.some((entry) => entry.hint.consistency === "CONFLICT");
  const observedCounts = [...new Set(candidates.map((entry) => Number(entry.hint.expectedCount || 0)).filter((count) => count > 0))].sort((a, b) => a - b);

  const representative = [...candidates].sort((left, right) => {
    const confidenceOrder = Number(CONFIDENCE_SCORE[right.hint.confidence] || 0) - Number(CONFIDENCE_SCORE[left.hint.confidence] || 0);
    if (confidenceOrder) return confidenceOrder;
    const leftNamed = Number(left.hint.identifiedCount || left.hint.candidates?.length || 0);
    const rightNamed = Number(right.hint.identifiedCount || right.hint.candidates?.length || 0);
    if (leftNamed !== rightNamed) return rightNamed - leftNamed;
    const languageOrder = resourceLanguagePriority(right.resource) - resourceLanguagePriority(left.resource);
    if (languageOrder) return languageOrder;
    if (Boolean(left.hint.explicitCount) !== Boolean(right.hint.explicitCount)) return left.hint.explicitCount ? -1 : 1;
    return String(left.resource.url || "").localeCompare(String(right.resource.url || ""));
  })[0];

  return {
    resource: representative.resource,
    hint: representative.hint,
    expectedCount: Number(representative.hint.expectedCount || 0),
    identifiedCount: Number(representative.hint.identifiedCount || representative.hint.candidates?.length || 0),
    conflict: hardConflict,
    observedCounts,
  };
}

function landingExpectedItems(domain, evidence) {
  if (!evidence?.resource || !evidence?.expectedCount) return [];
  const resource = evidence.resource;
  const namedCandidates = Array.isArray(evidence.hint?.candidates) ? evidence.hint.candidates : [];
  const items = namedCandidates.slice(0, evidence.expectedCount).map((candidate, index) => {
    const name = clean(candidate?.name, 200); const candidateKey = entityKey(name) || `candidate-${index + 1}`;
    return {
      id: `${domain}:landing:${resource.variantGroupId || resource.url}:${candidateKey}`, domain,
      variantGroupId: `${resource.variantGroupId || resource.url}#${candidateKey}`, nameHint: name,
      url: clean(resource.url, 2_048), urls: [clean(resource.url, 2_048)].filter(Boolean),
      languages: unique(resource.languages || []).sort(), crawled: Boolean(resource.crawled),
      basis: candidate?.basis === "json_ld_entity" ? "deterministic_json_ld_entity" : "deterministic_semantic_block_entity",
    };
  });
  while (items.length < evidence.expectedCount) {
    const slot = items.length + 1;
    items.push({
      id: `${domain}:landing:${resource.variantGroupId || resource.url}:slot-${slot}`, domain,
      variantGroupId: `${resource.variantGroupId || resource.url}#slot-${slot}`, nameHint: "",
      url: clean(resource.url, 2_048), urls: [clean(resource.url, 2_048)].filter(Boolean),
      languages: unique(resource.languages || []).sort(), crawled: Boolean(resource.crawled), basis: "deterministic_explicit_count_slot",
    });
  }
  return items;
}

function mergeDetailAndLandingItems(detailItems, landingItems, expectedCount) {
  if (!landingItems.length) return detailItems;
  if (!detailItems.length) return landingItems;
  if (detailItems.length === expectedCount) return detailItems;
  const result = [...landingItems];
  const indexByName = new Map();
  result.forEach((item, index) => { const key = entityKey(item?.nameHint); if (key) indexByName.set(key, index); });
  const unmatchedDetails = [];
  for (const detail of detailItems) {
    const key = entityKey(detail?.nameHint); const index = key ? indexByName.get(key) : undefined;
    if (index !== undefined) result[index] = detail; else unmatchedDetails.push(detail);
  }
  for (const detail of unmatchedDetails) {
    const anonymousIndex = result.findIndex((item) => item.basis === "deterministic_explicit_count_slot");
    if (anonymousIndex >= 0) result[anonymousIndex] = detail;
    else if (result.length < expectedCount) result.push(detail);
  }
  return result.slice(0, Math.max(expectedCount, detailItems.length));
}

function buildDomainInventory(resources, config) {
  const surfaceResources = resources.filter((resource) => hasAnyType(resource, [...config.landingTypes, ...config.detailTypes]));
  const landingResources = surfaceResources.filter((resource) => hasAnyType(resource, config.landingTypes));
  const landingUrls = unique(landingResources.map((resource) => resource.url)).sort();

  if (config.logicalSingleton) {
    const expectedItems = surfaceResources.length ? [{
      id: `${config.key}:hotel`, domain: config.key, variantGroupId: "hotel", nameHint: "Hotel contacts",
      url: landingUrls[0] || "", urls: landingUrls, languages: unique(surfaceResources.flatMap((resource) => resource.languages || [])).sort(),
      crawled: surfaceResources.some((resource) => Boolean(resource.crawled)), basis: "deterministic_logical_surface",
    }] : [];
    return { domain: config.key, expectationState: expectedItems.length ? "DETERMINISTIC" : "ABSENT", expectedCount: expectedItems.length, expectedItems, landingUrls, detailUrls: [], issues: [], evidence: { detailCount: 0, landingExpectedCount: expectedItems.length || null, landingIdentifiedCount: expectedItems.length, observedLandingCounts: [] } };
  }

  const detailResources = config.sourceInventory
    ? surfaceResources
    : surfaceResources.filter((resource) => hasAnyType(resource, config.detailTypes) && (!config.requireCrawledDetails || resource.crawled));
  const groups = groupResources(detailResources);
  const detailItems = [...groups.entries()].map(([groupId, group]) => expectedItem(config.key, groupId, group));

  if (config.sourceInventory) {
    return { domain: config.key, expectationState: detailItems.length ? "DETERMINISTIC" : surfaceResources.length ? "UNKNOWN" : "ABSENT", expectedCount: detailItems.length, expectedItems: detailItems, landingUrls, detailUrls: detailItems.flatMap((item) => item.urls), issues: [], evidence: { detailCount: detailItems.length, landingExpectedCount: null, landingIdentifiedCount: null, observedLandingCounts: [] } };
  }

  const landing = landingEvidence(landingResources, config.key);
  const issues = [];
  let blockingInventoryConflict = false;
  if (landing?.conflict) { issues.push("landing_inventory_count_conflict"); blockingInventoryConflict = true; }
  if (landing && landing.identifiedCount < landing.expectedCount) issues.push("landing_entities_partially_identified");
  if (landing && detailItems.length > landing.expectedCount) { issues.push("detail_inventory_exceeds_landing_count"); blockingInventoryConflict = true; }

  if (!landing) {
    const expectationState = detailItems.length ? "DETERMINISTIC" : surfaceResources.length ? "UNKNOWN" : "ABSENT";
    return { domain: config.key, expectationState, expectedCount: detailItems.length, expectedItems: detailItems, landingUrls, detailUrls: detailItems.flatMap((item) => item.urls), issues, evidence: { detailCount: detailItems.length, landingExpectedCount: null, landingIdentifiedCount: null, observedLandingCounts: [] } };
  }

  const targetCount = Math.max(landing.expectedCount, detailItems.length);
  const landingItems = landingExpectedItems(config.key, landing);
  const expectedItems = mergeDetailAndLandingItems(detailItems, landingItems, targetCount);
  return {
    domain: config.key, expectationState: blockingInventoryConflict ? "CONFLICT" : "DETERMINISTIC", expectedCount: targetCount, expectedItems,
    landingUrls, detailUrls: detailItems.flatMap((item) => item.urls), issues,
    evidence: { detailCount: detailItems.length, landingExpectedCount: landing.expectedCount, landingIdentifiedCount: landing.identifiedCount, observedLandingCounts: landing.observedCounts },
  };
}

function inferDocumentDomains(resource) {
  const haystack = `${clean(resource?.url, 2_048)} ${clean(resource?.title, 200)}`; const result = [];
  if (/(?:spa|wellness|massage|treatment|спа|уелнес|масаж|процедур)/iu.test(haystack)) result.push("spa");
  if (/(?:menu|restaurant|bar|dining|gastronomy|меню|ресторант|бар)/iu.test(haystack)) result.push("gastronomy");
  if (/(?:price|prices|tariff|цени|ценоразпис)/iu.test(haystack)) result.push("services");
  if (/(?:policy|rules|terms|conditions|правил|услов|политик)/iu.test(haystack)) result.push("policies");
  return result.length ? result : ["documents"];
}

export function buildHotelInventoryV2(siteMap = {}) {
  const resources = Array.isArray(siteMap.resources) ? siteMap.resources : [];
  const pageResources = resources.filter((resource) => resource?.resourceType === "page");
  const documentResources = resources.filter((resource) => resource?.resourceType === "pdf");
  const domains = INVENTORY_DOMAINS.map((config) => buildDomainInventory(pageResources, config));
  const documents = documentResources.map((resource) => ({
    url: clean(resource.url, 2_048), variantGroupId: clean(resource.variantGroupId, 500), domains: inferDocumentDomains(resource), ingestionStatus: "PENDING",
  }));
  return {
    schemaVersion: "hotel-inventory-v2", domains, documents,
    counts: {
      deterministicDomains: domains.filter((domain) => domain.expectationState === "DETERMINISTIC").length,
      conflictingDomains: domains.filter((domain) => domain.expectationState === "CONFLICT").length,
      unknownExpectationDomains: domains.filter((domain) => domain.expectationState === "UNKNOWN").length,
      expectedItems: domains.reduce((sum, domain) => sum + domain.expectedCount, 0), pendingDocuments: documents.length,
    },
  };
}

export const HOTEL_SCANNER_V2_INVENTORY_DOMAINS = INVENTORY_DOMAINS.map((domain) => domain.key);
