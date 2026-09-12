import type { HotelScanFact } from "@/lib/ai/hotel-scanner";
import type { HotelScannerV2DomainInventory } from "@/lib/server/hotel-scanner-v2-inventory.mjs";
import type { HotelScannerV2DomainConfig } from "@/lib/ai/hotel-scanner-v2-extraction-config";
import { cleanV2, entityKeyV2, uniqueV2 } from "@/lib/ai/hotel-scanner-v2-extraction-evidence";

const GENERIC_BUSINESS_EMAIL_LOCAL_PARTS = new Set([
  "info", "contact", "contacts", "hello", "office", "hotel", "reception", "frontdesk", "frontoffice",
  "reservation", "reservations", "booking", "bookings", "sales", "events", "event", "spa", "wellness",
  "restaurant", "restaurants", "marketing", "conference", "conferences", "groups", "group", "guestrelations",
  "guestservice", "guestservices", "service", "services",
]);

const NAMED_INVENTORY_BASES = new Set([
  "deterministic_semantic_block_entity",
  "deterministic_json_ld_entity",
]);

function isPrivacyMinimalBusinessEmail(raw: string) {
  const value = cleanV2(raw, 200).toLocaleLowerCase("en-US");
  const match = value.match(/^([^@]+)@([^@]+)$/);
  return Boolean(match && GENERIC_BUSINESS_EMAIL_LOCAL_PARTS.has(match[1].replace(/[^a-z0-9]+/g, "")));
}

export function parseHotelScannerV2Facts(
  value: string,
  config: HotelScannerV2DomainConfig,
  allowedUrls: Set<string>,
) {
  const parsed = JSON.parse(value) as { facts?: Array<Record<string, unknown>> };
  if (!parsed || !Array.isArray(parsed.facts)) return [] as HotelScanFact[];
  const facts: HotelScanFact[] = [];
  const seen = new Set<string>();
  for (const raw of parsed.facts) {
    const category = cleanV2(raw.category, 80).toLocaleLowerCase("en-US");
    const attribute = cleanV2(raw.attribute, 80).toLocaleLowerCase("en-US");
    const subject = cleanV2(raw.subject, 160) || "hotel";
    const label = cleanV2(raw.label, 160);
    const factValue = cleanV2(raw.value, 600);
    const confidence = Math.max(0, Math.min(1, Number(raw.confidence || 0)));
    const sourceUrls = uniqueV2((Array.isArray(raw.sourceUrls) ? raw.sourceUrls : [])
      .map((url) => cleanV2(url, 2_048))
      .filter((url) => allowedUrls.has(url))).slice(0, 8);
    if (!config.categories.includes(category) || !config.attributes.includes(attribute)) continue;
    if (!label || !factValue || !sourceUrls.length) continue;
    if (attribute === "email" && !isPrivacyMinimalBusinessEmail(factValue)) continue;
    const dedupeKey = `${category}|${entityKeyV2(subject)}|${attribute}|${entityKeyV2(factValue)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    facts.push({ category, subject, attribute, label, value: factValue, confidence, sourceUrls } as HotelScanFact);
  }
  return facts;
}

export function mergeHotelScannerV2Facts(values: HotelScanFact[]) {
  const merged = new Map<string, HotelScanFact>();
  for (const fact of values) {
    const enriched = fact as HotelScanFact & { subject?: string; attribute?: string };
    const key = `${cleanV2(fact.category, 80).toLocaleLowerCase("en-US")}|${entityKeyV2(enriched.subject)}|${cleanV2(enriched.attribute, 80).toLocaleLowerCase("en-US")}|${entityKeyV2(fact.value)}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, fact);
      continue;
    }
    merged.set(key, {
      ...existing,
      confidence: Math.max(Number(existing.confidence || 0), Number(fact.confidence || 0)),
      sourceUrls: uniqueV2([...(existing.sourceUrls || []), ...(fact.sourceUrls || [])]).slice(0, 8),
    } as HotelScanFact);
  }
  return [...merged.values()];
}

export function boundHotelScannerV2FactsToInventory(
  config: HotelScannerV2DomainConfig,
  facts: HotelScanFact[],
  domainInventory: HotelScannerV2DomainInventory | undefined,
) {
  if (config.propertyWide || !domainInventory || domainInventory.expectationState === "UNKNOWN") return facts;
  if (domainInventory.expectationState === "ABSENT") return [];

  const expectedItems = domainInventory.expectedItems;
  const namedLandingKeys = new Set(expectedItems
    .filter((item) => NAMED_INVENTORY_BASES.has(item.basis))
    .map((item) => entityKeyV2(item.nameHint))
    .filter(Boolean));
  const detailUrls = new Set(expectedItems
    .filter((item) => item.basis === "deterministic_detail_resource")
    .flatMap((item) => item.urls));
  const anonymousSlotCount = expectedItems.filter((item) => item.basis === "deterministic_explicit_count_slot").length;
  const acceptedAnonymous = new Set<string>();

  function factEntity(fact: HotelScanFact) {
    const subject = entityKeyV2((fact as HotelScanFact & { subject?: string }).subject);
    if (subject && !["hotel", "resort", "property"].includes(subject)) return subject;
    const attribute = String((fact as HotelScanFact & { attribute?: string }).attribute || "");
    if (["room_type", "venue", "service", "treatment", "treatment_category", "facility", "technology", "equipment", "amenity", "experience", "activity", "attraction", "offer", "event"].includes(attribute)) {
      return entityKeyV2(fact.value);
    }
    return "";
  }

  const result: HotelScanFact[] = [];
  for (const fact of facts) {
    const enriched = fact as HotelScanFact & { subject?: string; attribute?: string };
    const entity = factEntity(fact);
    if (fact.sourceUrls.some((url) => detailUrls.has(url))) {
      result.push(fact);
      continue;
    }
    if (entity && namedLandingKeys.has(entity)) {
      result.push(fact);
      continue;
    }
    if (entity && anonymousSlotCount > 0) {
      if (acceptedAnonymous.has(entity) || acceptedAnonymous.size < anonymousSlotCount) {
        acceptedAnonymous.add(entity);
        result.push(fact);
      }
      continue;
    }
    if (!entity && enriched.attribute && result.some((accepted) => entityKeyV2((accepted as HotelScanFact & { subject?: string }).subject) === entityKeyV2(enriched.subject))) {
      result.push(fact);
    }
  }
  return result;
}
