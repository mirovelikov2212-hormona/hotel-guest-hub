export type HotelScannerCrawlSelection = {
  url: string;
  domains: string[];
  newlyCoveredDomains: string[];
  legacyPriority: number;
};

export function classifyHotelScannerUrlCoverage(rawUrl: string): string[];

export function classifyHotelScannerPageCoverage(page?: {
  title?: unknown;
  description?: unknown;
  text?: unknown;
}): string[];

export function planHotelScannerSecondaryUrls(input?: {
  links?: string[];
  canonicalOrigin?: string;
  firstUrl?: string;
  maxPages?: number;
  alreadyCoveredDomains?: string[];
}): {
  urls: string[];
  selections: HotelScannerCrawlSelection[];
  coveredDomains: string[];
  uncoveredDomains: string[];
};
