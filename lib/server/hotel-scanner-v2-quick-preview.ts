import "server-only";

import type { HotelIntelligenceItem, HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";
import { buildInventoryIdentityFactsV2 } from "@/lib/ai/hotel-scanner-v2-deterministic-facts";
import type { HotelIntakeV2DiscoveryResult } from "@/lib/server/hotel-scanner-v2-intake";

const CORE_DOMAINS = ["accommodation", "gastronomy", "spa", "services", "experiences", "events", "offers", "contacts"] as const;

function clean(value: unknown, max = 500) {
  const text = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : text.slice(0, max);
}
function unique(values: string[], max = 100) {
  return [...new Set(values.map((value) => clean(value, 2_048)).filter(Boolean))].slice(0, max);
}
function hotelName(discovery: HotelIntakeV2DiscoveryResult) {
  const raw = clean(discovery.evidence.pages[0]?.title, 240);
  const first = raw.split(/\s+(?:[-–—|])\s+/u)[0]?.trim();
  if (first && first.length >= 3) return first;
  try { return new URL(discovery.evidence.canonicalUrl).hostname.replace(/^www\./u, ""); }
  catch { return "Hotel"; }
}
function entityKey(value: unknown) {
  return clean(value, 320).toLocaleLowerCase("en-US").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function sameEntityName(left: unknown, right: unknown) {
  const a = entityKey(left);
  const b = entityKey(right);
  if (!a || !b) return false;
  return a === b || (Math.min(a.length, b.length) >= 6 && (a.includes(b) || b.includes(a)));
}
const HOURS_LABEL = /(?:opening\s+hours?|opening\s+times?|öffnungszeiten|oeffnungszeiten|работно\s+време|program|orar|otev[ií]rac[ií]\s+doba|часы\s+работы)/iu;
const TIME_RANGE = /\b\d{1,2}(?::|\.)\d{2}\s*(?:-|–|—|to|bis|до)\s*\d{1,2}(?::|\.)\d{2}\b/giu;

function hoursFromText(value: unknown) {
  const text = clean(value, 1_200);
  if (!text) return "";
  const marker = text.search(HOURS_LABEL);
  if (marker >= 0) {
    const slice = text.slice(marker, marker + 220);
    const nextSentence = slice.search(/[.!?](?=\s+[A-ZА-ЯÄÖÜ])/u);
    return clean(nextSentence > 20 ? slice.slice(0, nextSentence + 1) : slice, 220);
  }
  const ranges = [...text.matchAll(TIME_RANGE)].map((match) => clean(match[0], 80));
  return unique(ranges, 3).join(" · ");
}

function openingHoursForItem(discovery: HotelIntakeV2DiscoveryResult, item: { nameHint?: string; url?: string; urls?: string[] }) {
  const name = clean(item.nameHint, 240);
  const urls = new Set([item.url, ...(item.urls || [])].map((url) => clean(url, 2_048)).filter(Boolean));
  for (const page of discovery.evidence.pages || []) {
    for (const block of page.contentBlocks || []) {
      if (!sameEntityName(block.heading, name)) continue;
      const hours = hoursFromText(block.text);
      if (hours) return hours;
    }
  }
  for (const page of discovery.evidence.pages || []) {
    if (!urls.has(clean(page.url, 2_048))) continue;
    const hours = hoursFromText(page.text);
    if (hours) return hours;
  }
  return "";
}

function quickContacts(discovery: HotelIntakeV2DiscoveryResult) {
  const phones: string[] = [];
  const emails: string[] = [];
  const addresses: string[] = [];
  for (const page of discovery.evidence.pages || []) {
    phones.push(...(page.contactSignals?.phones || []));
    emails.push(...(page.contactSignals?.emails || []));
    addresses.push(...(page.contactSignals?.addresses || []));
  }
  return {
    phones: unique(phones, 10),
    emails: unique(emails, 10),
    addresses: unique(addresses, 5),
    website: discovery.evidence.canonicalUrl,
  };
}

function itemize(discovery: HotelIntakeV2DiscoveryResult): HotelIntelligenceItem[] {
  const facts = discovery.inventory.domains
    .filter((domain) => CORE_DOMAINS.includes(domain.domain as (typeof CORE_DOMAINS)[number]))
    .flatMap((domain) => buildInventoryIdentityFactsV2(domain));
  return facts.map((fact, index) => ({
    ...fact,
    id: `quick-preview-${index + 1}`,
    targets: ["hub"],
    status: "candidate",
    verification: {
      status: "UNSCORED",
      independentSourceCount: 1,
      sourceUrls: fact.sourceUrls,
    },
  }));
}
function docKind(document: { url: string; domains?: string[] }) {
  let text = String(document.url || "");
  try { text = decodeURIComponent(new URL(document.url).pathname); } catch {}
  const lower = text.toLocaleLowerCase("en-US");
  if ((document.domains || []).includes("policies") || /faq|rule|policy|richtlinie|bedingung|kurallar|kosullar|koşullar|правил|политик|услови/u.test(lower)) return "policies_faq";
  if (/menu|menü|speisekarte|restaurant|bar|food|dining|gastronom/u.test(lower)) return "restaurant_menu";
  if (/offer|package|angebot|special|promotion|promo|paket|teklif|kampanya|оферт|пакет/u.test(lower)) return "offers_packages";
  if (/spa|wellness|massage|treatment|beauty|masaj|терап|масаж/u.test(lower)) return "spa_brochures";
  if (/brochure|broschure|broschüre|prospekt|flyer|catalog|catalogue|guide|брошур|каталог/u.test(lower)) return "brochures";
  return "other_documents";
}
export function summarizeHotelScannerV2Documents(discovery: HotelIntakeV2DiscoveryResult) {
  const labels = {
    restaurant_menu: { bg: "Ресторант меню", en: "Restaurant menus", onboarding: true },
    brochures: { bg: "Брошури", en: "Brochures", onboarding: true },
    spa_brochures: { bg: "SPA / Wellness брошури", en: "SPA / Wellness brochures", onboarding: true },
    offers_packages: { bg: "Оферти / пакети", en: "Offers / packages", onboarding: true },
    policies_faq: { bg: "Политики / FAQ", en: "Policies / FAQ", onboarding: false },
    other_documents: { bg: "Други документи", en: "Other documents", onboarding: true },
  } as const;
  const counts = new Map<string, number>();
  for (const document of discovery.inventory.documents) {
    const kind = docKind(document);
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  return Object.entries(labels)
    .map(([kind, meta]) => ({ kind, ...meta, count: counts.get(kind) || 0 }))
    .filter((item) => item.count > 0);
}
export function buildHotelScannerV2QuickPreview(discovery: HotelIntakeV2DiscoveryResult) {
  const items = itemize(discovery);
  const canonicalUrl = discovery.evidence.canonicalUrl;
  const rooms = discovery.inventory.domains.find((domain) => domain.domain === "accommodation")?.expectedItems || [];
  const venues = discovery.inventory.domains.find((domain) => domain.domain === "gastronomy")?.expectedItems || [];
  const spa = discovery.inventory.domains.find((domain) => domain.domain === "spa")?.expectedItems || [];
  const services = discovery.inventory.domains.find((domain) => domain.domain === "services")?.expectedItems || [];
  const contacts = quickContacts(discovery);
  const name = hotelName(discovery);
  const sourceUrls = unique([canonicalUrl, ...items.flatMap((item) => item.sourceUrls)]);
  const sourcePackage: HotelIntelligencePackage = {
    schemaVersion: "hotel-intelligence-v1",
    pipelineVersion: "professional-crawler-v2",
    generatedAt: new Date().toISOString(),
    source: {
      requestedUrl: discovery.evidence.requestedUrl,
      canonicalUrl,
      scannedAt: discovery.evidence.scannedAt,
      pageCount: discovery.evidence.pages.length,
    },
    evidenceLayer: { facts: items, sourceUrls, uncertainties: ["quick_preview_only", "manual_onboarding_required"] },
    hotelProfileLayer: {
      identity: { hotelName: name, summary: "", address: contacts.addresses[0] || "", city: "", country: "", bookingUrl: "", contactUrl: canonicalUrl },
      contacts: { phones: contacts.phones, emails: contacts.emails, socialLinks: [] },
      operations: { checkIn: "", checkOut: "", languages: [] },
      hospitality: {
        roomTypes: unique(rooms.map((item) => clean(item.nameHint, 180)), 50),
        amenities: unique(services.map((item) => clean(item.nameHint, 180)), 50),
        venues: venues.map((item) => ({ name: clean(item.nameHint, 180), type: "venue", hours: "", summary: "" })).filter((item) => item.name),
        spaServices: unique(spa.map((item) => clean(item.nameHint, 180)), 50),
        policies: [],
      },
    },
    designIntelligenceLayer: { colors: [], fonts: [], styleKeywords: [], imageReferences: [], logoReferences: [], visualAssetPolicy: "hotel_authorization_required" },
    routing: { hub: items, smartSetup: [], designStudio: [], review: [] },
    readiness: {
      evidenceFactCount: items.length,
      hubCandidateCount: items.length,
      smartSetupCandidateCount: 0,
      designSignalCount: 0,
      reviewRequiredCount: 0,
      verifiedFactCount: 0,
      singleSourceFactCount: 0,
      conflictFactCount: 0,
      humanReviewResolved: false,
    },
  };
  return {
    sourcePackage,
    components: discovery.inventory.domains
      .filter((domain) => CORE_DOMAINS.includes(domain.domain as (typeof CORE_DOMAINS)[number]))
      .map((domain) => ({
        domain: domain.domain,
        count: domain.expectedCount,
        state: domain.expectationState,
        items: (domain.expectedItems || []).map((item) => ({
          name: clean(item.nameHint, 240),
          hours: domain.domain === "gastronomy" ? openingHoursForItem(discovery, item) : "",
        })).filter((item) => item.name),
      })),
    contacts,
    documents: summarizeHotelScannerV2Documents(discovery),
    diagnostics: {
      pageCount: discovery.evidence.pages.length,
      resourceCount: discovery.siteMap.counts.resources,
      expectedItems: discovery.inventory.counts.expectedItems,
    },
  };
}
