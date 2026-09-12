export type HotelScannerCrawlSelection = {
  url: string;
  domains: string[];
  newlyCoveredDomains: string[];
  corroboratedDomains: string[];
  legacyPriority: number;
  score: number;
};

export type HotelScannerDomainVisitCounts = Record<string, number>;

export function isPublicBusinessCrawlUrl(rawUrl: string, canonicalOrigin?: string): boolean;

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
  domainVisitCounts?: HotelScannerDomainVisitCounts;
}): {
  urls: string[];
  selections: HotelScannerCrawlSelection[];
  domainVisitCounts: HotelScannerDomainVisitCounts;
  coveredDomains: string[];
  uncoveredDomains: string[];
  underCorroboratedDomains: string[];
};
