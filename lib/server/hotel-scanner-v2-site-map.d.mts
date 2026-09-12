import type { HotelScannerV2PageClassification } from "./hotel-scanner-v2-page-classifier.mjs";

export type HotelScannerV2DiscoverySource = {
  kind: string;
  sourceUrl: string;
  language: string;
};

export type HotelScannerV2SiteResource = {
  url: string;
  resourceType: "page" | "pdf";
  discoveredBy: HotelScannerV2DiscoverySource[];
  sourceUrls: string[];
  languages: string[];
  crawled: boolean;
  canonicalTarget: string;
  title: string;
  description: string;
  classification: HotelScannerV2PageClassification;
  variantGroupId: string;
};

export type HotelScannerV2SiteRelation = {
  kind: string;
  fromUrl: string;
  toUrl: string;
  language?: string;
};

export type HotelScannerV2SiteMap = {
  schemaVersion: "hotel-site-map-v2";
  canonicalUrl: string;
  resources: HotelScannerV2SiteResource[];
  relations: HotelScannerV2SiteRelation[];
  counts: {
    resources: number;
    pages: number;
    documents: number;
    crawledPages: number;
    languageVariantGroups: number;
  };
};

export function canonicalizeHotelIntakeUrl(rawUrl: unknown, baseUrl?: unknown): string;
export function inferHotelPageLanguage(rawUrl: unknown): string;
export function buildHotelSiteMapV2(evidence?: Record<string, unknown>): HotelScannerV2SiteMap;
