export interface HotelScannerHubPage {
  url: string;
  title?: string;
  description?: string;
  text?: string;
  [key: string]: unknown;
}

export const DEFAULT_MAX_HUB_PAGES: number;
export function classifyHotelScannerHubPage(page?: HotelScannerHubPage): string[];
export function scoreHotelScannerHubPage(page?: HotelScannerHubPage): number;
export function selectHotelScannerHubPages<T extends HotelScannerHubPage>(pages?: T[], options?: { maxPages?: number }): T[];
