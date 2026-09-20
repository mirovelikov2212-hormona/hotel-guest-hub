import type { HotelScannerV2Inventory } from "./hotel-scanner-v2-inventory.mjs";

export type HotelScannerV3AuthorityEntity = {
  id: string;
  logicalUrl: string;
  url: string;
  urls: string[];
  label: string;
  domain: string;
  entityType: string;
  status: string;
  familyKeys: string[];
  structuralConfidence: number;
  ontologyConfidence: number;
  [key: string]: unknown;
};

export type HotelScannerV3AuthorityDomain = {
  domain: string;
  count: number;
  entityIds: string[];
  status: string;
};

export type HotelScannerV3InventoryAuthority = {
  schemaVersion: "hotel-scanner-v3-inventory-authority-1";
  snapshotId: string;
  canonicalUrl: string;
  structuralFingerprint: string;
  ontologyFingerprint: string;
  snapshotFingerprint: string;
  status: string;
  counts: {
    structuralFamilies: number;
    structuralEntities: number;
    classifiedEntities: number;
    unclassifiedEntities: number;
    conflictingEntities: number;
  };
  domains: HotelScannerV3AuthorityDomain[];
  entities: HotelScannerV3AuthorityEntity[];
};

export type HotelScannerV3CanonicalInventorySnapshot = {
  schemaVersion: "hotel-scanner-v3-canonical-inventory-1";
  snapshotId: string;
  inventoryRevision: number;
  generatedAt: string;
  canonicalUrl: string;
  structuralFingerprint: string;
  ontologyFingerprint: string;
  snapshotFingerprint: string;
  status: string;
  counts: {
    structuralFamilies: number;
    structuralEntities: number;
    classifiedEntities: number;
    unclassifiedEntities: number;
    conflictingEntities: number;
  };
  domains: HotelScannerV3AuthorityDomain[];
  entities: HotelScannerV3AuthorityEntity[];
  unclassifiedEntityIds: string[];
  conflictingEntityIds: string[];
  ontology: Record<string, unknown>;
  structural: Record<string, unknown>;
  enrichmentFingerprint?: string;
};

export type HotelScannerV3InventoryDelta = {
  schemaVersion: "hotel-scanner-v3-inventory-delta-1";
  changed: boolean;
  previousSnapshotId: string;
  nextSnapshotId: string;
  addedEntityIds: string[];
  removedEntityIds: string[];
  domainChangedEntityIds: string[];
};

export type HotelScannerV3InventoryAuthoritySummary = {
  schemaVersion: string;
  snapshotId: string;
  snapshotFingerprint: string;
  structuralFingerprint: string;
  ontologyFingerprint: string;
  status: string;
  counts: Record<string, unknown>;
  domains: Array<{ domain: string; count: number; status: string }>;
};

export function buildHotelInventorySnapshotV3(
  evidence?: unknown,
  options?: Record<string, unknown>,
): HotelScannerV3CanonicalInventorySnapshot;

export function applyHotelInventoryEnrichmentV3(
  snapshot?: HotelScannerV3CanonicalInventorySnapshot,
  enrichmentByEntityId?: Map<string, Record<string, unknown>> | Record<string, Record<string, unknown>>,
): HotelScannerV3CanonicalInventorySnapshot;

export function compareHotelInventorySnapshotsV3(
  previous?: Partial<HotelScannerV3InventoryAuthority> | Partial<HotelScannerV3CanonicalInventorySnapshot> | Record<string, unknown>,
  next?: Partial<HotelScannerV3InventoryAuthority> | Partial<HotelScannerV3CanonicalInventorySnapshot> | Record<string, unknown>,
): HotelScannerV3InventoryDelta;

export function projectHotelInventoryAuthorityV3(
  snapshot?: HotelScannerV3CanonicalInventorySnapshot | Record<string, unknown>,
): HotelScannerV3InventoryAuthority;

export function applyHotelInventoryAuthorityV3(
  legacyInventory?: HotelScannerV2Inventory,
  authority?: HotelScannerV3InventoryAuthority | Record<string, unknown>,
): HotelScannerV2Inventory;

export function summarizeHotelInventoryAuthorityV3(
  authority?: HotelScannerV3InventoryAuthority | Record<string, unknown>,
): HotelScannerV3InventoryAuthoritySummary;
