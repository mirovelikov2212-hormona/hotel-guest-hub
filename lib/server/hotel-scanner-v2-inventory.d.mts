export type HotelScannerV2InventoryExpectationState = "DETERMINISTIC" | "UNKNOWN" | "ABSENT";

export type HotelScannerV2ExpectedItem = {
  id: string;
  domain: string;
  variantGroupId: string;
  nameHint: string;
  url: string;
  urls: string[];
  languages: string[];
  crawled: boolean;
  basis: string;
};

export type HotelScannerV2DomainInventory = {
  domain: string;
  expectationState: HotelScannerV2InventoryExpectationState;
  expectedCount: number;
  expectedItems: HotelScannerV2ExpectedItem[];
  landingUrls: string[];
  detailUrls: string[];
};

export type HotelScannerV2DocumentInventory = {
  url: string;
  variantGroupId: string;
  domains: string[];
  ingestionStatus: "PENDING" | "INGESTED";
};

export type HotelScannerV2Inventory = {
  schemaVersion: "hotel-inventory-v2";
  domains: HotelScannerV2DomainInventory[];
  documents: HotelScannerV2DocumentInventory[];
  counts: {
    deterministicDomains: number;
    unknownExpectationDomains: number;
    expectedItems: number;
    pendingDocuments: number;
  };
};

export function buildHotelInventoryV2(siteMap?: unknown): HotelScannerV2Inventory;
export const HOTEL_SCANNER_V2_INVENTORY_DOMAINS: readonly string[];
