export type HotelScannerV2DomainConfig = {
  domain: string;
  categories: string[];
  attributes: string[];
  pageTypes: string[];
  propertyWide?: boolean;
};

export const MAX_AI_EVIDENCE_CHARS = 32_000;
export const MAX_AI_OUTPUT_TOKENS = 5_500;
export const MAX_PAGE_TEXT_CHARS = 7_500;
export const MAX_CONTENT_BLOCKS_PER_PAGE = 36;
export const MAX_CONTENT_BLOCK_TEXT_CHARS = 700;
export const MAX_HEADINGS_PER_PAGE = 80;
export const MAX_JSON_LD_PER_PAGE = 60;
export const DOMAIN_CONCURRENCY = 2;
export const RATE_LIMIT_RETRY_DELAY_MS = 9_000;

export const HOTEL_SCANNER_V2_DOMAIN_CONFIGS: HotelScannerV2DomainConfig[] = [
  { domain: "accommodation", categories: ["accommodation"], attributes: ["room_type", "description", "capacity", "size", "bed", "view", "meal_inclusion", "price", "booking"], pageTypes: ["accommodation", "room_detail"] },
  { domain: "gastronomy", categories: ["dining"], attributes: ["venue", "description", "hours", "external_access", "booking", "dress_code", "age_policy", "price"], pageTypes: ["gastronomy", "restaurant_detail"] },
  { domain: "spa", categories: ["wellness"], attributes: ["service", "treatment", "treatment_category", "facility", "technology", "equipment", "description", "price", "hours", "booking", "age_policy", "access", "session_duration", "recommended_stay"], pageTypes: ["spa", "spa_detail"] },
  { domain: "services", categories: ["services", "amenities"], attributes: ["service", "facility", "amenity", "description", "price", "hours", "booking", "access", "age_policy"], pageTypes: ["services", "service_detail"] },
  { domain: "experiences", categories: ["experiences"], attributes: ["experience", "activity", "attraction", "description", "experience_access", "experience_booking", "price", "hours"], pageTypes: ["experiences", "experience_detail"] },
  { domain: "events", categories: ["events"], attributes: ["event", "description", "date", "hours", "price", "booking", "event_capacity", "event_service"], pageTypes: ["events", "event_detail"] },
  { domain: "offers", categories: ["offers"], attributes: ["offer", "description", "validity", "price", "booking"], pageTypes: ["offers", "offer_detail"] },
  { domain: "policies", categories: ["policy", "operations"], attributes: ["pet_policy", "smoking_policy", "quiet_hours", "cancellation_policy", "payment_policy", "external_access", "age_policy", "check_in", "check_out", "other"], pageTypes: ["policies", "faq"], propertyWide: true },
  { domain: "contacts", categories: ["contact", "location"], attributes: ["phone", "email", "website", "social_profile", "address"], pageTypes: ["contacts"], propertyWide: true },
];
