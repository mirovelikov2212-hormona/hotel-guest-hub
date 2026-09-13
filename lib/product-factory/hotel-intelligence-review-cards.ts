import type { HotelScanVerificationConflict, VerifiedHotelScanFact } from "@/lib/ai/hotel-scanner-verification.mjs";
import type { HotelIntelligenceCandidateV2 } from "@/lib/product-factory/hotel-intelligence-v2";
import type { HotelScannerV2ExpectedItem } from "@/lib/server/hotel-scanner-v2-inventory.mjs";

export type HotelReviewCardAttributeV2 = {
  attribute: string;
  label: string;
  value: string;
  verificationStatus: string;
  independentSourceCount: number;
  sourceUrls: string[];
};

export type HotelReviewCardConflictV2 = {
  attribute: string;
  claims: Array<{ value: string; sourceUrls: string[] }>;
};

export type HotelReviewEntityCardV2 = {
  id: string;
  domain: string;
  entityType: string;
  name: string;
  status: "VERIFIED" | "SINGLE_SOURCE" | "CONFLICT" | "MISSING";
  sourceUrls: string[];
  attributes: HotelReviewCardAttributeV2[];
  conflicts: HotelReviewCardConflictV2[];
};

export type HotelReviewSectionV2 = {
  domain: string;
  expectedCount: number;
  cardCount: number;
  verifiedCount: number;
  conflictCount: number;
  missingCount: number;
  cards: HotelReviewEntityCardV2[];
};

const DOMAIN_CATEGORY = Object.freeze({
  accommodation: new Set(["accommodation"]),
  gastronomy: new Set(["dining", "gastronomy"]),
  spa: new Set(["wellness", "spa"]),
  services: new Set(["services", "amenities"]),
  experiences: new Set(["experiences"]),
  events: new Set(["events"]),
  offers: new Set(["offers"]),
  policies: new Set(["policy", "policies", "operations"]),
  contacts: new Set(["contact", "contacts"]),
});

const ENTITY_DEFINING_ATTRIBUTES = new Set([
  "room_type", "venue", "service", "facility", "amenity", "treatment", "treatment_category", "technology", "equipment",
  "experience", "activity", "attraction", "event", "offer",
]);

const ATTRIBUTE_PRIORITY: Record<string, string[]> = {
  accommodation: ["size", "area", "capacity", "occupancy", "guests", "bed", "bed_type", "view", "meal_inclusion", "price", "booking"],
  gastronomy: ["venue_type", "cuisine", "opening_hours", "meal", "reservation_required", "reservation", "external_access", "dress_code", "price"],
  spa: ["facility", "treatment_category", "treatment", "technology", "duration", "session_duration", "opening_hours", "price", "external_access"],
  services: ["service", "amenity", "facility", "opening_hours", "price", "availability", "reservation_required"],
  experiences: ["experience", "activity", "attraction", "location", "opening_hours", "price", "booking"],
  events: ["date", "start_date", "end_date", "price", "event_service", "booking", "description"],
  offers: ["date", "start_date", "end_date", "validity", "price", "meal_inclusion", "booking", "description"],
  policies: ["check_in", "check_out", "quiet_hours", "pet_policy", "pet_fee", "smoking_policy", "external_access", "dress_code"],
  contacts: ["address", "phone", "email", "website", "social_profile"],
};

function clean(value: unknown, max = 2_048) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
}

function key(value: unknown) {
  return clean(value, 320).toLocaleLowerCase("en-US").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => clean(value)).filter(Boolean))];
}

function factAttribute(fact: VerifiedHotelScanFact) {
  return clean(fact.attribute, 100).toLocaleLowerCase("en-US");
}

function factSubjectKey(fact: VerifiedHotelScanFact) {
  return key(fact.subject);
}

function factEntityKey(fact: VerifiedHotelScanFact) {
  const subject = factSubjectKey(fact);
  if (subject && !["hotel", "resort", "property"].includes(subject)) return subject;
  return ENTITY_DEFINING_ATTRIBUTES.has(factAttribute(fact)) ? key(fact.value) : "";
}

function sameEntityName(left: string, right: string) {
  const a = key(left);
  const b = key(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 7) return false;
  return a.includes(b) || b.includes(a);
}

function dedicatedBasis(item: HotelScannerV2ExpectedItem) {
  return /detail_resource|detail_entity/i.test(item.basis);
}

function matchesItem(fact: VerifiedHotelScanFact, item: HotelScannerV2ExpectedItem) {
  const itemName = clean(item.nameHint, 320);
  const entity = factEntityKey(fact);
  if (itemName && entity && sameEntityName(entity, itemName)) return true;
  if (itemName && sameEntityName(fact.subject, itemName)) return true;
  if (ENTITY_DEFINING_ATTRIBUTES.has(factAttribute(fact)) && itemName && sameEntityName(fact.value, itemName)) return true;
  if (!dedicatedBasis(item)) return false;
  const itemUrls = new Set(unique([item.url, ...(item.urls || [])]));
  return (fact.sourceUrls || []).some((url) => itemUrls.has(clean(url)));
}

function conflictMatchesItem(conflict: HotelScanVerificationConflict, item: HotelScannerV2ExpectedItem) {
  if (item.nameHint && sameEntityName(conflict.subject, item.nameHint)) return true;
  if (!dedicatedBasis(item)) return false;
  const itemUrls = new Set(unique([item.url, ...(item.urls || [])]));
  return (conflict.claims || []).some((claim) => (claim.sourceUrls || []).some((url) => itemUrls.has(clean(url))));
}

function factAllowedForDomain(fact: VerifiedHotelScanFact, domain: string) {
  const categories = DOMAIN_CATEGORY[domain as keyof typeof DOMAIN_CATEGORY];
  return !categories || categories.has(clean(fact.category, 80).toLocaleLowerCase("en-US"));
}

function attributeRank(domain: string, attribute: string) {
  const index = (ATTRIBUTE_PRIORITY[domain] || []).indexOf(attribute);
  return index === -1 ? 10_000 : index;
}

function projectAttributes(domain: string, item: HotelScannerV2ExpectedItem, facts: VerifiedHotelScanFact[]) {
  const values = facts.filter((fact) => matchesItem(fact, item) && factAllowedForDomain(fact, domain));
  const seen = new Set<string>();
  return values.filter((fact) => {
    const attribute = factAttribute(fact);
    if (ENTITY_DEFINING_ATTRIBUTES.has(attribute) && item.nameHint && sameEntityName(fact.value, item.nameHint)) return false;
    const dedupe = `${attribute}|${key(fact.value)}`;
    if (!attribute || seen.has(dedupe)) return false;
    seen.add(dedupe);
    return true;
  }).sort((left, right) => attributeRank(domain, factAttribute(left)) - attributeRank(domain, factAttribute(right)) || factAttribute(left).localeCompare(factAttribute(right)))
    .slice(0, 10)
    .map((fact) => ({
      attribute: factAttribute(fact),
      label: clean(fact.label, 180) || factAttribute(fact),
      value: clean(fact.value, 800),
      verificationStatus: clean(fact.verification?.status || "SINGLE_SOURCE", 40),
      independentSourceCount: Number(fact.verification?.independentSourceCount || 1),
      sourceUrls: unique([...(fact.sourceUrls || []), ...(fact.verification?.sourceUrls || [])]).slice(0, 8),
    }));
}

function projectConflicts(item: HotelScannerV2ExpectedItem, conflicts: HotelScanVerificationConflict[]): HotelReviewCardConflictV2[] {
  return conflicts.filter((conflict) => conflictMatchesItem(conflict, item)).map((conflict) => ({
    attribute: clean(conflict.attribute, 120),
    claims: (conflict.claims || []).map((claim) => ({
      value: clean(claim.value || claim.canonicalValue, 800),
      sourceUrls: unique(claim.sourceUrls || []).slice(0, 8),
    })),
  }));
}

function statusFor(attributes: HotelReviewCardAttributeV2[], conflicts: HotelReviewCardConflictV2[]): HotelReviewEntityCardV2["status"] {
  if (conflicts.length) return "CONFLICT";
  if (!attributes.length) return "MISSING";
  if (attributes.some((attribute) => attribute.verificationStatus === "VERIFIED" || attribute.independentSourceCount >= 2)) return "VERIFIED";
  return "SINGLE_SOURCE";
}

export function buildHotelReviewSectionsV2(candidate: HotelIntelligenceCandidateV2): HotelReviewSectionV2[] {
  const sections: HotelReviewSectionV2[] = [];
  for (const domain of candidate.inventory.domains || []) {
    if (!domain.expectedItems?.length) continue;
    const cards = domain.expectedItems.map((item) => {
      const attributes = projectAttributes(domain.domain, item, candidate.facts || []);
      const conflicts = projectConflicts(item, candidate.conflicts || []);
      const factSources = attributes.flatMap((attribute) => attribute.sourceUrls);
      return {
        id: item.id,
        domain: domain.domain,
        entityType: item.entityType,
        name: clean(item.nameHint, 320) || "Unidentified entity",
        status: statusFor(attributes, conflicts),
        sourceUrls: unique([item.url, ...(item.urls || []), ...factSources]).slice(0, 8),
        attributes,
        conflicts,
      } satisfies HotelReviewEntityCardV2;
    });
    sections.push({
      domain: domain.domain,
      expectedCount: domain.expectedCount,
      cardCount: cards.length,
      verifiedCount: cards.filter((card) => card.status === "VERIFIED").length,
      conflictCount: cards.filter((card) => card.status === "CONFLICT").length,
      missingCount: cards.filter((card) => card.status === "MISSING").length,
      cards,
    });
  }
  return sections;
}
