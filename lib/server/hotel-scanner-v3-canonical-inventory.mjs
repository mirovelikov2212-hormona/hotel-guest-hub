import { createHash } from "node:crypto";
import { canonicalizeHotelIntakeUrl } from "./hotel-scanner-v2-site-map.mjs";
import { buildHotelStructuralInventoryGraphV3 } from "./hotel-scanner-v3-structural-inventory.mjs";
import { classifyHotelStructuralFamiliesV3, HOTEL_SCANNER_V3_OPERATIONAL_DOMAINS } from "./hotel-scanner-v3-ontology.mjs";
import { hotelScannerV3LogicalUrlKey } from "./hotel-scanner-v3-frontier.mjs";

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
  const members = unique((family?.members || []).map((member) => hotelScannerV3LogicalUrlKey(member?.url)).filter(Boolean)).sort();
  return `family:${hash(stableJson({ sourceKey, members }), 20)}`;
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

function familyClaimMap(structuralInventory, ontology) {
  const ontologyById = new Map((ontology?.families || []).map((item) => [item.familyId, item]));
  const familySourceKeys = new Set(
    (structuralInventory?.families || []).map((family) => hotelScannerV3LogicalUrlKey(family?.sourceUrl)).filter(Boolean),
  );
  const groups = new Map();

  for (const family of structuralInventory?.families || []) {
    const classification = ontologyById.get(family.id);
    const familyKey = stableFamilyKey(family);
    for (const member of family.members || []) {
      const logicalUrl = hotelScannerV3LogicalUrlKey(member?.url);
      if (!logicalUrl || familySourceKeys.has(logicalUrl)) continue;
      if (!groups.has(logicalUrl)) groups.set(logicalUrl, []);
      groups.get(logicalUrl).push({
        logicalUrl,
        url: canonicalizeHotelIntakeUrl(member?.url || ""),
        label: clean(member?.label, 240),
        familyId: clean(family?.id, 1_000),
        familyKey,
        familySourceUrl: canonicalizeHotelIntakeUrl(family?.sourceUrl || ""),
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

function buildEntities(structuralInventory, ontology) {
  const groups = familyClaimMap(structuralInventory, ontology);
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
    members: unique((family?.members || []).map((member) => hotelScannerV3LogicalUrlKey(member?.url)).filter(Boolean)).sort(),
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
  const entities = buildEntities(structuralInventory, ontology);
  const domains = domainSummaries(entities);
  const structuralHash = structuralFingerprint(structuralInventory, entities);
  const ontologyHash = ontologyFingerprint(ontology, entities);
  const snapshotFingerprint = hash(stableJson({ structuralHash, ontologyHash }), 24);
  const unclassified = entities.filter((entity) => entity.status === "UNCLASSIFIED");
  const conflicts = entities.filter((entity) => entity.status === "ONTOLOGY_CONFLICT");
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
      : unclassified.length
        ? "PARTIAL_ONTOLOGY"
        : "READY",
    counts: {
      structuralFamilies: Number(structuralInventory?.families?.length || 0),
      structuralEntities: entities.length,
      classifiedEntities: entities.filter((entity) => entity.status === "CLASSIFIED").length,
      unclassifiedEntities: unclassified.length,
      conflictingEntities: conflicts.length,
    },
    domains,
    entities,
    unclassifiedEntityIds: unclassified.map((entity) => entity.id),
    conflictingEntityIds: conflicts.map((entity) => entity.id),
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
