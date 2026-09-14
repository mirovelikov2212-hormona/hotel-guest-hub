export type HotelScannerV2PageType =
  | "accommodation"
  | "room_detail"
  | "gastronomy"
  | "restaurant_detail"
  | "spa"
  | "spa_detail"
  | "services"
  | "service_detail"
  | "experiences"
  | "experience_detail"
  | "events"
  | "event_detail"
  | "offers"
  | "offer_detail"
  | "faq"
  | "policies"
  | "contacts"
  | "documents"
  | "other";

export type HotelScannerV2Domain =
  | "accommodation"
  | "gastronomy"
  | "spa"
  | "services"
  | "experiences"
  | "events"
  | "offers"
  | "policies"
  | "contacts"
  | "faq"
  | "documents"
  | "other";

export type HotelScannerV2PageClassification = {
  primaryType: HotelScannerV2PageType;
  types: HotelScannerV2PageType[];
  confidence: number;
  signals: string[];
};

export function classifyHotelScannerPageV2(page?: {
  url?: unknown;
  title?: unknown;
  description?: unknown;
  text?: unknown;
}): HotelScannerV2PageClassification;

export function hotelScannerPageTypeDomain(type: unknown): HotelScannerV2Domain;

export const HOTEL_SCANNER_V2_PAGE_TYPES: readonly HotelScannerV2PageType[];
