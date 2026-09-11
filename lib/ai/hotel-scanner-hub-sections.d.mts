export interface HotelScannerHubFact {
  category?: string;
  subject?: string;
  attribute?: string;
  label?: string;
  value?: string;
  confidence?: number;
  sourceUrls?: string[];
  verification?: { status?: "VERIFIED" | "SINGLE_SOURCE" | "CONFLICT" | "UNSCORED"; sourceUrls?: string[]; [key: string]: unknown };
  [key: string]: unknown;
}
export interface HotelScannerHubItem<T extends HotelScannerHubFact = HotelScannerHubFact> {
  key: string;
  name: string;
  facts: T[];
  sourceUrls: string[];
  verification: "VERIFIED" | "SINGLE_SOURCE" | "CONFLICT" | "UNSCORED";
  maxConfidence: number;
}
export interface HotelScannerHubSection<T extends HotelScannerHubFact = HotelScannerHubFact> {
  key: string;
  facts: T[];
  items: HotelScannerHubItem<T>[];
  sourceUrls: string[];
}
export const HOTEL_SCANNER_HUB_SECTION_ORDER: readonly string[];
export function hotelScannerHubSectionForFact(fact?: HotelScannerHubFact): string;
export function buildHotelScannerHubSections<T extends HotelScannerHubFact>(facts?: T[]): HotelScannerHubSection<T>[];
