const INVENTORY_DOMAINS = Object.freeze([
  { key: "accommodation", landingTypes: ["accommodation"], detailTypes: ["room_detail"] },
  { key: "gastronomy", landingTypes: ["gastronomy"], detailTypes: ["restaurant_detail"] },
  { key: "spa", landingTypes: ["spa"], detailTypes: ["spa_detail"] },
  { key: "services", landingTypes: ["services"], detailTypes: ["service_detail"] },
  { key: "experiences", landingTypes: ["experiences"], detailTypes: ["experience_detail"] },
  { key: "events", landingTypes: ["events"], detailTypes: ["event_detail"] },
  { key: "offers", landingTypes: ["offers"], detailTypes: ["offer_detail"] },
  { key: "policies", landingTypes: ["policies"], detailTypes: ["policies"], sourceInventory: true },
  { key: "contacts", landingTypes: ["contacts"], detailTypes: [], logicalSingleton: true },
]);

function clean(value, max = 300) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
}

function unique(values) {
  return [...new Set((values || []).map((value) => clean(value, 2_048)).filter(Boolean))];
}

function resourceTypes(resource) {
  const values = Array.isArray(resource?.classification?.types) ? resource.classification.types : [];
  return new Set(values.map((value) => clean(value, 80)));
}

function hasAnyType(resource, expectedTypes) {
  const types = resourceTypes(resource);
  return expectedTypes.some((type) => types.has(type));
}

function preferRepresentative(resources) {
  return [...resources].sort((left, right) => {
    if (Boolean(left.crawled) !== Boolean(right.crawled)) return left.crawled ? -1 : 1;
    const leftLanguagePenalty = (left.languages || []).includes("en") ? 0 : (left.languages || []).includes("bg") ? 1 : 2;
    const rightLanguagePenalty = (right.languages || []).includes("en") ? 0 : (right.languages || []).includes("bg") ? 1 : 2;
    if (leftLanguagePenalty !== rightLanguagePenalty) return leftLanguagePenalty - rightLanguagePenalty;
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
    id: `${domain}:${groupId}`,
    domain,
    variantGroupId: groupId,
    nameHint: clean(representative?.title, 200),
    url: clean(representative?.url, 2_048),
    urls: unique(resources.map((resource) => resource?.url)).sort(),
    languages: unique(resources.flatMap((resource) => resource?.languages || [])).sort(),
    crawled: resources.some((resource) => Boolean(resource?.crawled)),
    basis: "deterministic_detail_resource",
  };
}

function buildDomainInventory(resources, config) {
  const surfaceResources = resources.filter((resource) => hasAnyType(resource, [...config.landingTypes, ...config.detailTypes]));
  const landingUrls = unique(surfaceResources.filter((resource) => hasAnyType(resource, config.landingTypes)).map((resource) => resource.url)).sort();

  if (config.logicalSingleton) {
    const expectedItems = surfaceResources.length ? [{
      id: `${config.key}:hotel`,
      domain: config.key,
      variantGroupId: "hotel",
      nameHint: "Hotel contacts",
      url: landingUrls[0] || "",
      urls: landingUrls,
      languages: unique(surfaceResources.flatMap((resource) => resource.languages || [])).sort(),
      crawled: surfaceResources.some((resource) => Boolean(resource.crawled)),
      basis: "deterministic_logical_surface",
    }] : [];
    return {
      domain: config.key,
      expectationState: expectedItems.length ? "DETERMINISTIC" : "ABSENT",
      expectedCount: expectedItems.length,
      expectedItems,
      landingUrls,
      detailUrls: [],
    };
  }

  const detailResources = config.sourceInventory
    ? surfaceResources
    : surfaceResources.filter((resource) => hasAnyType(resource, config.detailTypes));
  const groups = groupResources(detailResources);
  const expectedItems = [...groups.entries()].map(([groupId, group]) => expectedItem(config.key, groupId, group));
  const hasSurface = surfaceResources.length > 0;
  const expectationState = expectedItems.length ? "DETERMINISTIC" : hasSurface ? "UNKNOWN" : "ABSENT";

  return {
    domain: config.key,
    expectationState,
    expectedCount: expectedItems.length,
    expectedItems,
    landingUrls,
    detailUrls: expectedItems.flatMap((item) => item.urls),
  };
}

function inferDocumentDomains(resource) {
  const haystack = `${clean(resource?.url, 2_048)} ${clean(resource?.title, 200)}`;
  const result = [];
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
    url: clean(resource.url, 2_048),
    variantGroupId: clean(resource.variantGroupId, 500),
    domains: inferDocumentDomains(resource),
    ingestionStatus: "PENDING",
  }));

  return {
    schemaVersion: "hotel-inventory-v2",
    domains,
    documents,
    counts: {
      deterministicDomains: domains.filter((domain) => domain.expectationState === "DETERMINISTIC").length,
      unknownExpectationDomains: domains.filter((domain) => domain.expectationState === "UNKNOWN").length,
      expectedItems: domains.reduce((sum, domain) => sum + domain.expectedCount, 0),
      pendingDocuments: documents.length,
    },
  };
}

export const HOTEL_SCANNER_V2_INVENTORY_DOMAINS = INVENTORY_DOMAINS.map((domain) => domain.key);
