import { createHash } from "node:crypto";
import { canonicalizeHotelIntakeUrl } from "./hotel-scanner-v2-site-map.mjs";
import { buildHotelStructuralInventoryGraphV3 } from "./hotel-scanner-v3-structural-inventory.mjs";
import { classifyHotelStructuralFamiliesV3, HOTEL_SCANNER_V3_OPERATIONAL_DOMAINS } from "./hotel-scanner-v3-ontology.mjs";
import { hotelScannerV3LogicalUrlKey } from "./hotel-scanner-v3-frontier.mjs";
import { extractOperationalServiceLabelsV2 } from "./hotel-scanner-v2-hospitality-taxonomy.mjs";

const ENTITY_TYPES = Object.freeze({
  accommodation: "room_type",
  gastronomy: "venue",
  spa: "spa_item",
  services: "service",
  experiences: "experience",
  offers: "offer",
  events: "event",
  UNKNOWN: "unknown",
});

function clean(value, max = 2_048) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, max);
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function hash(value, size = 24) {
  return createHash("sha256").update(String(value ?? "")).digest("hex").slice(0, size);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function stableFamilyKey(family = {}) {
  const sourceKey = hotelScannerV3LogicalUrlKey(family?.sourceUrl);
  const members = unique((family?.members || []).map((member) => {
    const urlKey = hotelScannerV3LogicalUrlKey(member?.url);
    if (urlKey) return `url:${urlKey}`;
    const inlineKey = clean(member?.inlineKey, 160);
    const label = clean(member?.label, 240).toLocaleLowerCase("en-US");
    return inlineKey ? `inline:${inlineKey}:${label}` : label ? `label:${label}` : "";
  }).filter(Boolean)).sort();
  return `family:${hash(stableJson({ sourceKey, members }), 20)}`;
}

function structuralFamilyStateMap(evidence = {}) {
  const states = evidence?.discovery?.structuralCrawl?.familyStates || [];
  return new Map(states.map((state) => [state.familyId, state]));
}

function familyCertifiedForAuthority(familyId, stateMap) {
  if (!stateMap.size) return true;
  const state = stateMap.get(familyId);
  if (!state) return false;
  return state.status === "CLOSED_INFERRED_LEAF"
    || state.status === "CLOSED_EXPANDED"
    || state.status === "CLOSED_INLINE";
}

function inlineLogicalIdentity(familyKey, member = {}) {
  const inlineKey = clean(member?.inlineKey, 160);
  const label = clean(member?.label, 240).toLocaleLowerCase("en-US");
  if (!inlineKey && !label) return "";
  return `inline:${hash(stableJson({ familyKey, inlineKey, label }), 20)}`;
}

function chooseLabel(claims) {
  const values = claims.map((claim) => clean(claim?.label, 240)).filter(Boolean);
  if (!values.length) return "";
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].length - right[0].length || left[0].localeCompare(right[0]))[0][0];
}

function entityType(domain) {
  return ENTITY_TYPES[domain] || ENTITY_TYPES.UNKNOWN;
}

function normalizedEntityLabel(value) {
  return clean(value, 240)
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function serviceAssertionEntities(evidence = {}, existingEntities = []) {
  const existingLabels = new Set(
    existingEntities
      .filter((entity) => entity?.domain === "services")
      .map((entity) => normalizedEntityLabel(entity?.label))
      .filter(Boolean),
  );
  const byLabel = new Map();

  for (const page of evidence?.pages || []) {
    const sourceUrl = canonicalizeHotelIntakeUrl(page?.url || "");
    const texts = [
      clean(page?.title, 500),
      clean(page?.description, 1_500),
      clean(page?.text, 30_000),
      ...(page?.contentBlocks || []).map((block) =>
        clean(`${block?.heading || ""} ${block?.text || ""}`, 6_000)),
    ].filter(Boolean);

    for (const text of texts) {
      for (const assertion of extractOperationalServiceLabelsV2(text)) {
        const label = clean(assertion?.name, 240);
        const key = normalizedEntityLabel(label);
        if (!label || !key || existingLabels.has(key)) continue;
        if (!byLabel.has(key)) {
          byLabel.set(key, {
            label,
            sourceUrls: new Set(),
          });
        }
        if (sourceUrl) byLabel.get(key).sourceUrls.add(sourceUrl);
      }
    }
  }

  return [...byLabel.entries()].map(([key, value]) => {
    const sourceUrls = [...value.sourceUrls].sort();
    return {
      id: `entity:${hash(`service-assertion:${key}`, 20)}`,
      logicalUrl: `assertion:services:${hash(key, 20)}`,
      url: sourceUrls[0] || canonicalizeHotelIntakeUrl(evidence?.canonicalUrl || evidence?.requestedUrl || ""),
      urls: sourceUrls,
      label: value.label,
      domain: "services",
      entityType: "service",
      status: "CLASSIFIED",
      familyIds: [],
      familyKeys: [],
      structuralConfidence: 0,
      ontologyConfidence: 1,
      issues: [],
      memberMode: "capability_assertion",
      provenance: sourceUrls.map((sourceUrl) => ({
        familyId: "",
        familyKey: "",
        familySourceUrl: sourceUrl,
        familyHeading: "",
        label: value.label,
        domain: "services",
        structuralConfidence: 0,
        ontologyConfidence: 1,
        source: "deterministic_service_assertion",
      })),
    };
  });
}

function familyClaimMap(structuralInventory, ontology, evidence = {}) {
  const ontologyById = new Map((ontology?.families || []).map((item) => [item.familyId, item]));
  const familySourceKeys = new Set(
    (structuralInventory?.families || []).map((family) => hotelScannerV3LogicalUrlKey(family?.sourceUrl)).filter(Boolean),
  );
  const stateMap = structuralFamilyStateMap(evidence);
  const groups = new Map();

  for (const family of structuralInventory?.families || []) {
    if (!familyCertifiedForAuthority(family.id, stateMap)) continue;
    const classification = ontologyById.get(family.id);
    const familyKey = stableFamilyKey(family);
    const familySourceUrl = canonicalizeHotelIntakeUrl(family?.sourceUrl || "");

    for (const member of family.members || []) {
      const linkedLogicalUrl = hotelScannerV3LogicalUrlKey(member?.url);
      if (linkedLogicalUrl && familySourceKeys.has(linkedLogicalUrl)) continue;

      const logicalUrl = linkedLogicalUrl || inlineLogicalIdentity(familyKey, member);
      if (!logicalUrl) continue;
      if (!groups.has(logicalUrl)) groups.set(logicalUrl, []);
      groups.get(logicalUrl).push({
        logicalUrl,
        url: canonicalizeHotelIntakeUrl(member?.url || "") || familySourceUrl,
        label: clean(member?.label, 240),
        memberMode: linkedLogicalUrl ? "linked" : "inline",
        familyId: clean(family?.id, 1_000),
        familyKey,
        familySourceUrl,
        familyHeading: clean(family?.heading, 240),
        structuralConfidence: Number(family?.confidence || 0),
        domain: classification?.domain || "UNKNOWN",
        ontologyConfidence: Number(classification?.confidence || 0),
        ontologyStatus: classification?.status || "UNKNOWN",
      });
    }
  }
  return groups;
}

function buildEntities(structuralInventory, ontology, evidence = {}) {
  const groups = familyClaimMap(structuralInventory, ontology, evidence);
  const entities = [];

  for (const [logicalUrl, claims] of groups) {
    const classifiedDomains = unique(claims.map((claim) => claim.domain).filter((domain) => domain && domain !== "UNKNOWN"));
    const conflict = classifiedDomains.length > 1;
    const domain = classifiedDomains.length === 1 ? classifiedDomains[0] : "UNKNOWN";
    const urls = unique(claims.map((claim) => claim.url).filter(Boolean)).sort();
    const familyIds = unique(claims.map((claim) => claim.familyId)).sort();
    const familyKeys = unique(claims.map((claim) => claim.familyKey)).sort();
    const ontologyConfidence = domain === "UNKNOWN"
      ? 0
      : Math.max(...claims.filter((claim) => claim.domain === domain).map((claim) => claim.ontologyConfidence), 0);
    const structuralConfidence = Math.max(...claims.map((claim) => claim.structuralConfidence), 0);

    entities.push({
      id: `entity:${hash(logicalUrl, 20)}`,
      logicalUrl,
      url: urls[0] || logicalUrl,
      urls,
      label: chooseLabel(claims),
      domain,
      entityType: entityType(domain),
      status: conflict ? "ONTOLOGY_CONFLICT" : domain === "UNKNOWN" ? "UNCLASSIFIED" : "CLASSIFIED",
      familyIds,
      familyKeys,
      structuralConfidence: Number(structuralConfidence.toFixed(3)),
      ontologyConfidence: Number(ontologyConfidence.toFixed(3)),
      issues: conflict ? ["cross_family_domain_conflict"] : [],
      memberMode: claims.some((claim) => claim.memberMode === "linked") ? "linked" : "inline",
      provenance: claims.map((claim) => ({
        familyId: claim.familyId,
        familyKey: claim.familyKey,
        familySourceUrl: claim.familySourceUrl,
        familyHeading: claim.familyHeading,
        label: claim.label,
        domain: claim.domain,
        structuralConfidence: claim.structuralConfidence,
        ontologyConfidence: claim.ontologyConfidence,
      })),
    });
  }

  return entities.sort((left, right) => left.id.localeCompare(right.id));
}

function domainSummaries(entities) {
  return HOTEL_SCANNER_V3_OPERATIONAL_DOMAINS.map((domain) => {
    const values = entities.filter((entity) => entity.domain === domain);
    return {
      domain,
      count: values.length,
      entityIds: values.map((entity) => entity.id).sort(),
      status: values.length ? "DISCOVERED" : "NOT_DISCOVERED",
    };
  });
}

function structuralFingerprint(structuralInventory, entities) {
  const familyShape = (structuralInventory?.families || []).map((family) => ({
    familyKey: stableFamilyKey(family),
    sourceUrl: hotelScannerV3LogicalUrlKey(family?.sourceUrl),
    members: unique((family?.members || []).map((member) => {
      const urlKey = hotelScannerV3LogicalUrlKey(member?.url);
      return urlKey || clean(member?.inlineKey, 160) || clean(member?.label, 240);
    }).filter(Boolean)).sort(),
  })).sort((left, right) => left.familyKey.localeCompare(right.familyKey));

  return hash(stableJson({
    families: familyShape,
    entities: entities.map((entity) => ({
      id: entity.id,
      logicalUrl: entity.logicalUrl,
      familyKeys: entity.familyKeys,
    })),
  }), 24);
}

function ontologyFingerprint(ontology, entities) {
  return hash(stableJson({
    families: (ontology?.families || []).map((family) => ({
      familyId: family.familyId,
      domain: family.domain,
      status: family.status,
      confidence: family.confidence,
    })).sort((left, right) => left.familyId.localeCompare(right.familyId)),
    entities: entities.map((entity) => ({
      id: entity.id,
      domain: entity.domain,
      status: entity.status,
    })),
  }), 24);
}

export function buildHotelInventorySnapshotV3(evidence = {}, options = {}) {
  const structuralInventory = options.structuralInventory || buildHotelStructuralInventoryGraphV3(evidence);
  const ontology = options.ontology || classifyHotelStructuralFamiliesV3(structuralInventory, evidence);
  const structuralEntities = buildEntities(structuralInventory, ontology, evidence);
  const entities = [
    ...structuralEntities,
    ...serviceAssertionEntities(evidence, structuralEntities),
  ].sort((left, right) => left.id.localeCompare(right.id));
  const domains = domainSummaries(entities);
  const structuralHash = structuralFingerprint(structuralInventory, entities);
  const ontologyHash = ontologyFingerprint(ontology, entities);
  const snapshotFingerprint = hash(stableJson({ structuralHash, ontologyHash }), 24);
  const unclassified = entities.filter((entity) => entity.status === "UNCLASSIFIED");
  const conflicts = entities.filter((entity) => entity.status === "ONTOLOGY_CONFLICT");
  const structuralStateMap = structuralFamilyStateMap(evidence);
  const uncertifiedFamilies = structuralStateMap.size
    ? (structuralInventory?.families || []).filter((family) => !familyCertifiedForAuthority(family.id, structuralStateMap))
    : [];
  const generatedAt = clean(options.generatedAt || new Date().toISOString(), 80);

  return {
    schemaVersion: "hotel-scanner-v3-canonical-inventory-1",
    snapshotId: `inventory-v3:${snapshotFingerprint}`,
    inventoryRevision: 1,
    generatedAt,
    canonicalUrl: canonicalizeHotelIntakeUrl(evidence?.canonicalUrl || evidence?.requestedUrl || ""),
    structuralFingerprint: structuralHash,
    ontologyFingerprint: ontologyHash,
    snapshotFingerprint,
    status: conflicts.length
      ? "ONTOLOGY_CONFLICT"
      : uncertifiedFamilies.length
        ? "STRUCTURAL_PARTIAL"
        : unclassified.length
          ? "PARTIAL_ONTOLOGY"
          : "READY",
    counts: {
      structuralFamilies: Number(structuralInventory?.families?.length || 0),
      structuralEntities: entities.length,
      candidateStructuralEntities: Number(structuralInventory?.leafMembers?.length || structuralInventory?.counts?.leafEntities || entities.length),
      uncertifiedFamilies: uncertifiedFamilies.length,
      classifiedEntities: entities.filter((entity) => entity.status === "CLASSIFIED").length,
      unclassifiedEntities: unclassified.length,
      conflictingEntities: conflicts.length,
    },
    domains,
    entities,
    unclassifiedEntityIds: unclassified.map((entity) => entity.id),
    conflictingEntityIds: conflicts.map((entity) => entity.id),
    uncertifiedFamilyIds: uncertifiedFamilies.map((family) => family.id),
    ontology,
    structural: {
      schemaVersion: structuralInventory?.schemaVersion || "",
      counts: structuralInventory?.counts || {},
      closure: structuralInventory?.closure || {},
      familyKeys: (structuralInventory?.families || []).map((family) => ({
        familyId: family.id,
        familyKey: stableFamilyKey(family),
        sourceUrl: canonicalizeHotelIntakeUrl(family?.sourceUrl || ""),
      })),
    },
  };
}

export function applyHotelInventoryEnrichmentV3(snapshot = {}, enrichmentByEntityId = {}) {
  const values = enrichmentByEntityId instanceof Map
    ? enrichmentByEntityId
    : new Map(Object.entries(enrichmentByEntityId || {}));
  const entities = (snapshot?.entities || []).map((entity) => {
    const enrichment = values.get(entity.id);
    if (!enrichment || typeof enrichment !== "object") return entity;
    return {
      ...entity,
      enrichment: { ...enrichment },
    };
  });
  const enrichmentFingerprint = hash(stableJson(
    entities.map((entity) => ({ id: entity.id, enrichment: entity.enrichment || null })),
  ), 24);

  return {
    ...snapshot,
    entities,
    enrichmentFingerprint,
  };
}

export function compareHotelInventorySnapshotsV3(previous = {}, next = {}) {
  const previousById = new Map((previous?.entities || []).map((entity) => [entity.id, entity]));
  const nextById = new Map((next?.entities || []).map((entity) => [entity.id, entity]));
  const addedEntityIds = [...nextById.keys()].filter((id) => !previousById.has(id)).sort();
  const removedEntityIds = [...previousById.keys()].filter((id) => !nextById.has(id)).sort();
  const domainChangedEntityIds = [...nextById.keys()].filter((id) => {
    const before = previousById.get(id);
    const after = nextById.get(id);
    return before && before.domain !== after.domain;
  }).sort();

  return {
    schemaVersion: "hotel-scanner-v3-inventory-delta-1",
    changed: Boolean(addedEntityIds.length || removedEntityIds.length || domainChangedEntityIds.length),
    previousSnapshotId: clean(previous?.snapshotId, 200),
    nextSnapshotId: clean(next?.snapshotId, 200),
    addedEntityIds,
    removedEntityIds,
    domainChangedEntityIds,
  };
}


function authorityExpectedItem(entity) {
  return {
    id: entity.id,
    domain: entity.domain,
    entityType: entity.entityType,
    variantGroupId: entity.familyKeys?.[0] || entity.logicalUrl || entity.id,
    nameHint: clean(entity.label, 240),
    url: clean(entity.url, 2_048),
    urls: unique(entity.urls || [entity.url]).sort(),
    languages: [],
    crawled: true,
    basis: "canonical_inventory_v3_authority",
  };
}

function recomputeLegacyInventoryCounts(domains, documents) {
  return {
    deterministicDomains: domains.filter((domain) => domain.expectationState === "DETERMINISTIC").length,
    conflictingDomains: domains.filter((domain) => domain.expectationState === "CONFLICT").length,
    unknownExpectationDomains: domains.filter((domain) => domain.expectationState === "UNKNOWN").length,
    expectedItems: domains.reduce((sum, domain) => sum + Number(domain.expectedCount || 0), 0),
    pendingDocuments: (documents || []).filter((document) => document?.ingestionStatus === "PENDING").length,
    manualDocuments: (documents || []).filter((document) => document?.ingestionStatus === "MANUAL").length,
  };
}

export function projectHotelInventoryAuthorityV3(snapshot = {}) {
  const entities = (snapshot?.entities || []).map((entity) => ({
    id: clean(entity?.id, 200),
    logicalUrl: clean(entity?.logicalUrl, 2_048),
    url: clean(entity?.url, 2_048),
    urls: unique(entity?.urls || []).sort(),
    label: clean(entity?.label, 240),
    domain: clean(entity?.domain, 80),
    entityType: clean(entity?.entityType, 120),
    status: clean(entity?.status, 80),
    familyKeys: unique(entity?.familyKeys || []).sort(),
    structuralConfidence: Number(entity?.structuralConfidence || 0),
    ontologyConfidence: Number(entity?.ontologyConfidence || 0),
  })).filter((entity) => entity.id && entity.logicalUrl);

  return {
    schemaVersion: "hotel-scanner-v3-inventory-authority-1",
    snapshotId: clean(snapshot?.snapshotId, 200),
    canonicalUrl: canonicalizeHotelIntakeUrl(snapshot?.canonicalUrl || ""),
    structuralFingerprint: clean(snapshot?.structuralFingerprint, 120),
    ontologyFingerprint: clean(snapshot?.ontologyFingerprint, 120),
    snapshotFingerprint: clean(snapshot?.snapshotFingerprint, 120),
    status: clean(snapshot?.status, 80),
    counts: {
      structuralFamilies: Number(snapshot?.counts?.structuralFamilies || 0),
      structuralEntities: Number(snapshot?.counts?.structuralEntities || entities.length),
      classifiedEntities: Number(snapshot?.counts?.classifiedEntities || entities.filter((entity) => entity.status === "CLASSIFIED").length),
      unclassifiedEntities: Number(snapshot?.counts?.unclassifiedEntities || entities.filter((entity) => entity.status === "UNCLASSIFIED").length),
      conflictingEntities: Number(snapshot?.counts?.conflictingEntities || entities.filter((entity) => entity.status === "ONTOLOGY_CONFLICT").length),
    },
    domains: (snapshot?.domains || []).map((domain) => ({
      domain: clean(domain?.domain, 80),
      count: Number(domain?.count || 0),
      entityIds: unique(domain?.entityIds || []).sort(),
      status: clean(domain?.status, 80),
    })),
    entities,
  };
}

export function applyHotelInventoryAuthorityV3(legacyInventory = {}, authority = {}) {
  const authorityEntities = Array.isArray(authority?.entities) ? authority.entities : [];
  const operationalDomains = new Set(HOTEL_SCANNER_V3_OPERATIONAL_DOMAINS);
  const existingDomains = Array.isArray(legacyInventory?.domains) ? legacyInventory.domains : [];
  const byDomain = new Map(existingDomains.map((domain) => [domain.domain, domain]));

  for (const domain of HOTEL_SCANNER_V3_OPERATIONAL_DOMAINS) {
    const current = byDomain.get(domain) || {
      domain,
      expectationState: "ABSENT",
      expectedCount: 0,
      expectedItems: [],
      landingUrls: [],
      detailUrls: [],
      supportingUrls: [],
      issues: [],
      evidence: {
        detailCount: 0,
        landingExpectedCount: null,
        landingIdentifiedCount: null,
        observedLandingCounts: [],
      },
    };
    const domainEntities = authorityEntities.filter((entity) =>
      entity?.domain === domain && entity?.status === "CLASSIFIED");
    const expectedItems = domainEntities.map(authorityExpectedItem);
    const urls = unique(domainEntities.flatMap((entity) => entity?.urls || [entity?.url]).filter(Boolean)).sort();

    byDomain.set(domain, {
      ...current,
      expectationState: expectedItems.length ? "DETERMINISTIC" : "ABSENT",
      expectedCount: expectedItems.length,
      expectedItems,
      detailUrls: urls,
      supportingUrls: unique(current.supportingUrls || []).sort(),
      issues: unique([
        ...(current.issues || []).filter((issue) => issue !== "canonical_inventory_v3_authority"),
        "canonical_inventory_v3_authority",
      ]),
      evidence: {
        ...(current.evidence || {}),
        detailCount: expectedItems.length,
        landingExpectedCount: expectedItems.length,
        landingIdentifiedCount: expectedItems.length,
        observedLandingCounts: expectedItems.length ? [expectedItems.length] : [],
        authority: "CANONICAL_INVENTORY_V3",
        snapshotId: clean(authority?.snapshotId, 200),
        snapshotFingerprint: clean(authority?.snapshotFingerprint, 120),
      },
    });
  }

  const domains = [
    ...existingDomains.filter((domain) => !operationalDomains.has(domain.domain))
      .map((domain) => byDomain.get(domain.domain) || domain),
    ...HOTEL_SCANNER_V3_OPERATIONAL_DOMAINS.map((domain) => byDomain.get(domain)),
  ].filter(Boolean);

  const documents = Array.isArray(legacyInventory?.documents) ? legacyInventory.documents : [];
  return {
    ...legacyInventory,
    schemaVersion: "hotel-inventory-v2",
    domains,
    documents,
    counts: recomputeLegacyInventoryCounts(domains, documents),
    v3Authority: {
      snapshotId: clean(authority?.snapshotId, 200),
      snapshotFingerprint: clean(authority?.snapshotFingerprint, 120),
      structuralFingerprint: clean(authority?.structuralFingerprint, 120),
      ontologyFingerprint: clean(authority?.ontologyFingerprint, 120),
    },
  };
}

export function summarizeHotelInventoryAuthorityV3(authority = {}) {
  return {
    schemaVersion: clean(authority?.schemaVersion, 120),
    snapshotId: clean(authority?.snapshotId, 200),
    snapshotFingerprint: clean(authority?.snapshotFingerprint, 120),
    structuralFingerprint: clean(authority?.structuralFingerprint, 120),
    ontologyFingerprint: clean(authority?.ontologyFingerprint, 120),
    status: clean(authority?.status, 80),
    counts: authority?.counts || {},
    domains: (authority?.domains || []).map((domain) => ({
      domain: clean(domain?.domain, 80),
      count: Number(domain?.count || 0),
      status: clean(domain?.status, 80),
    })),
  };
}
