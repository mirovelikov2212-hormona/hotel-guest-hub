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

export function buildDeterministicContactFactsV2(
  pages: Array<{ url: string; contactSignals?: { phones?: string[]; emails?: string[]; addresses?: string[] } }>,
  canonicalUrl: string,
) {
  const values = {
    phone: new Map<string, string>(),
    email: new Map<string, string>(),
    address: new Map<string, string>(),
  };
  for (const page of pages || []) {
    const signals = page.contactSignals || {};
    for (const phone of signals.phones || []) if (!values.phone.has(phone)) values.phone.set(phone, page.url);
    for (const email of signals.emails || []) if (!values.email.has(email)) values.email.set(email, page.url);
    for (const address of signals.addresses || []) if (!values.address.has(address)) values.address.set(address, page.url);
  }
  const result: HotelScanFact[] = [];
  const push = (attribute: string, label: string, entries: Map<string, string>) => {
    for (const [value, sourceUrl] of entries) {
      result.push({
        category: "contact",
        subject: "Hotel contacts",
        attribute,
        label,
        value,
        confidence: 1,
        sourceUrls: [sourceUrl || canonicalUrl],
      } as HotelScanFact);
    }
  };
  push("phone", "Phone", values.phone);
  push("email", "Email", values.email);
  push("address", "Address", values.address);
  if (canonicalUrl) {
    result.push({
      category: "contact",
      subject: "Hotel contacts",
      attribute: "website",
      label: "Website",
      value: canonicalUrl,
      confidence: 1,
      sourceUrls: [canonicalUrl],
    } as HotelScanFact);
  }
  return result;
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


function normalizedUrl(value: unknown) {
  try {
    const url = new URL(clean(value, 2_048));
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/u, "");
    return url.toString();
  } catch {
    return clean(value, 2_048);
  }
}

function substantiveOfferDetailText(page: HotelScannerV2PagePayload) {
  const blockText = (page.content_blocks || [])
    .map((block) => clean(block?.text, 1_200))
    .find((value) => value.length >= 120);
  if (blockText) return blockText;

  const description = clean(page.description, 700);
  if (description.length >= 100) return description;

  const pageText = clean(page.text, 1_200);
  return pageText.length >= 240 ? pageText : "";
}

export function buildDeterministicOfferDetailFactsV2(
  pages: HotelScannerV2PagePayload[],
  domainInventory: HotelScannerV2DomainInventory | undefined,
) {
  if (domainInventory?.domain !== "offers") return [] as HotelScanFact[];

  const byUrl = new Map((pages || []).map((page) => [normalizedUrl(page.url), page]));
  const result: HotelScanFact[] = [];
  for (const item of domainInventory.expectedItems || []) {
    if (!item?.crawled || !["canonical_detail_entity", "canonical_linked_detail_entity"].includes(String(item?.basis || ""))) continue;
    const candidateUrls = [item.url, ...(item.urls || [])].map(normalizedUrl).filter(Boolean);
    const page = candidateUrls.map((url) => byUrl.get(url)).find(Boolean);
    if (!page) continue;

    const value = substantiveOfferDetailText(page);
    const subject = clean(item.nameHint, 240);
    if (!value || !subject) continue;
    result.push({
      category: "offers",
      subject,
      attribute: "description",
      label: "Offer detail",
      value,
      confidence: 0.99,
      sourceUrls: [page.url],
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
