import type { HotelScanFact } from "@/lib/ai/hotel-scanner";
import type { HotelScannerV2PagePayload } from "@/lib/ai/hotel-scanner-v2-extraction-evidence";
import type { HotelScannerV2DomainInventory } from "@/lib/server/hotel-scanner-v2-inventory.mjs";

function clean(value: unknown, max = 600) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, max);
}

function identityShape(domain: string, entityType: string) {
  if (domain === "accommodation") return { category: "accommodation", attribute: "room_type", label: "Room type" };
  if (domain === "gastronomy") return { category: "dining", attribute: "venue", label: "Venue" };
  if (domain === "services") return { category: "services", attribute: "service", label: "Service" };
  if (domain === "experiences") return { category: "experiences", attribute: "experience", label: "Experience" };
  if (domain === "events") return { category: "events", attribute: "event", label: "Event" };
  if (domain === "offers") return { category: "offers", attribute: "offer", label: "Offer" };
  if (domain === "spa") {
    if (/technology|apparatus|device/i.test(entityType)) return { category: "wellness", attribute: "technology", label: "Technology" };
    if (/equipment/i.test(entityType)) return { category: "wellness", attribute: "equipment", label: "Equipment" };
    if (/facility/i.test(entityType)) return { category: "wellness", attribute: "facility", label: "SPA facility" };
    if (/category/i.test(entityType)) return { category: "wellness", attribute: "treatment_category", label: "Treatment category" };
    if (/treatment|therapy|ritual|massage/i.test(entityType)) return { category: "wellness", attribute: "treatment", label: "Treatment" };
    return { category: "wellness", attribute: "service", label: "SPA service" };
  }
  return null;
}

export function buildInventoryIdentityFactsV2(domainInventory: HotelScannerV2DomainInventory | undefined) {
  if (!domainInventory || !["DETERMINISTIC", "CONFLICT"].includes(String(domainInventory.expectationState || ""))) return [] as HotelScanFact[];
  const result: HotelScanFact[] = [];
  for (const item of domainInventory.expectedItems || []) {
    const name = clean(item.nameHint, 240);
    const sourceUrl = clean(item.url || item.urls?.[0], 2_048);
    const shape = identityShape(domainInventory.domain, clean(item.entityType, 100));
    if (!shape || !name || !sourceUrl || !item.crawled) continue;
    result.push({
      category: shape.category,
      subject: name,
      attribute: shape.attribute,
      label: shape.label,
      value: name,
      confidence: 1,
      sourceUrls: [sourceUrl],
    } as HotelScanFact);
  }
  return result;
}

const PET_HEADING = /(?:pet(?:s| policy)?|domestic animals?|домашн(?:и|ите)?\s+любимц|haustier|animale\s+de\s+companie|domácí\s+mazlíč|домашн(?:ие|их)?\s+животн|миленич)/iu;
const PET_ALLOWED = /(?:allow(?:s|ed)?|permit(?:s|ted)?|accept(?:s|ed)?|welcome|допуска|разрешава|позволява|erlaubt|gestattet|willkommen|permise|acceptate|povoleny|přijímáme|разрешены|допускаются)/iu;
const PET_PROHIBITED = /(?:no\s+pets?|not\s+(?:allowed|permitted|accepted)|prohibit(?:ed)?|forbidden|не\s+се\s+допуск|не\s+се\s+разреш|забран|nicht\s+(?:erlaubt|gestattet)|verboten|nu\s+(?:sunt\s+)?permise|interzis|nejsou\s+povoleny|zakáz|не\s+допускаются|запрещ)/iu;

function petClaimFromPage(page: HotelScannerV2PagePayload) {
  for (const block of page.content_blocks || []) {
    const heading = clean(block.heading, 300);
    if (!PET_HEADING.test(heading)) continue;
    const text = clean(block.text, 1_200);
    const combined = `${heading} ${text}`;
    if (!PET_ALLOWED.test(combined) && !PET_PROHIBITED.test(combined)) continue;
    return text || heading;
  }
  return "";
}

export function buildDeterministicPolicyFactsV2(pages: HotelScannerV2PagePayload[]) {
  const result: HotelScanFact[] = [];
  for (const page of pages) {
    const claim = petClaimFromPage(page);
    if (!claim) continue;
    result.push({
      category: "policy",
      subject: "hotel",
      attribute: "pet_policy",
      label: "Pet policy",
      value: claim,
      confidence: 0.99,
      sourceUrls: [page.url],
    } as HotelScanFact);
  }
  return result;
}
