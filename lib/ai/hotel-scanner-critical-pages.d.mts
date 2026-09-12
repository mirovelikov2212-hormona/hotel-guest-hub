export const DEFAULT_MAX_CRITICAL_PAGES: 14;

export type HotelScannerCriticalPageLike = {
  url: string;
  title?: string;
  description?: string;
  text?: string;
};

export type HotelScannerCriticalPageScore = {
  score: number;
  categories: string[];
  structuralCategories: string[];
};

export function scoreCriticalHotelScannerPage(page: HotelScannerCriticalPageLike): HotelScannerCriticalPageScore;

export function selectCriticalHotelScannerPages<T extends HotelScannerCriticalPageLike>(
  pages: T[],
  options?: { maxPages?: number },
): T[];
