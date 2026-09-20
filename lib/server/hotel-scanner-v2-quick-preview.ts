import "server-only";

import type { HotelIntelligenceItem, HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";
import { buildInventoryIdentityFactsV2 } from "@/lib/ai/hotel-scanner-v2-deterministic-facts";
import type { HotelIntakeV2DiscoveryResult } from "@/lib/server/hotel-scanner-v2-intake";
import type { HotelScannerV2DomainInventory } from "@/lib/server/hotel-scanner-v2-inventory.mjs";
import { classifyHotelScannerPageV2, hotelScannerPageTypeDomain } from "@/lib/server/hotel-scanner-v2-page-classifier.mjs";
import {
  applyHotelInventoryAuthorityV3,
  projectHotelInventoryAuthorityV3,
  summarizeHotelInventoryAuthorityV3,
} from "@/lib/server/hotel-scanner-v3-canonical-inventory.mjs";

const CORE_DOMAINS = ["accommodation", "gastronomy", "spa", "services", "experiences", "offers", "contacts"] as const;

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

function clientPreviewNameAllowed(domain: string, value: unknown) {
  const name = clean(value, 240);
  if (!name) return false;
  if (domain === "accommodation"
    && /^(?:rooms?\s*(?:&|and)\s*suites?)(?:\s+(?:in|at)\s+.+)?$|^zimmer\s*(?:&|und)\s*suiten(?:\s+im\s+.+)?$/iu.test(name)) return false;
  if (domain === "experiences"
    && /(?:^|\s)(?:hotel|resort|ferienhotel|urlaubshotel|bikehotel|skihotel|wellnesshotel)(?:\s|$)/iu.test(name)) return false;
  if (domain === "spa"
    && ((/[|]/u.test(name) && /(?:spa|wellness|massage|beauty|treatment|behandlung)/iu.test(name))
      || (/(?:^|\s)(?:hotel|resort|wellnesshotel|spahotel)(?:\s|$)/iu.test(name)
        && /(?:spa|wellness)/iu.test(name))
      || /^faq\b|^fragen\s*&\s*antworten\b|\bmomente?\b|\binsider\s+deals?\b/iu.test(name))) return false;
  if (domain === "offers"
    && /^(?:holiday\s+offers?(?:\s+in\s+.+)?|my\s+favo(?:u)?rite\s+place\s*:?.*|offers?(?:\s+in\s+.+)?|angebote(?:\s+im\s+.+)?)$/iu.test(name)) return false;
  return true;
}

function normalizedPhoneKey(value: unknown) {
  let digits = clean(value, 120).replace(/\D+/gu, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits;
}

function normalizedAddressKey(value: unknown) {
  return clean(value, 500)
    .toLocaleLowerCase("en-US")
    .replace(/ß/gu, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function preferredPhoneDisplay(values: string[]) {
  const cleaned = unique(values, 20);
  const plus = cleaned.find((value) => /^\s*\+/u.test(value));
  if (plus) return plus;
  const international = cleaned.find((value) => /^\s*00/u.test(value));
  if (international) return international.replace(/^\s*00/u, "+");
  return cleaned[0] || "";
}
const HOURS_LABEL = /(?:opening\s+hours?|opening\s+times?|öffnungszeiten|oeffnungszeiten|работно\s+време|program|orar|otev[ií]rac[ií]\s+doba|часы\s+работы)/iu;
const HOURS_STOP_LABEL = /(?:\bdress\s*code\b|\bdresscode\b|\bspeisekarte\b|\bgetränkekarte\b|\bgetraenkekarte\b|\bbar(?:-?\s*)?karte\b|\bmenu\b|\bmenü\b|\breservierung\b|\breservation\b|\bbook\s+a\s+table\b|\bzur\s+(?:speise|bar|getränke|getraenke)karte\b)/iu;
const TIME_RANGE = /\b\d{1,2}(?::|\.)\d{2}\s*(?:-|–|—|to|bis|до)\s*\d{1,2}(?::|\.)\d{2}\b/giu;

function hoursFromText(value: unknown) {
  const text = clean(value, 1_200);
  if (!text) return "";
  const marker = text.search(HOURS_LABEL);
  if (marker >= 0) {
    let slice = text.slice(marker, marker + 220);
    const stop = slice.search(HOURS_STOP_LABEL);
    if (stop > 12) slice = slice.slice(0, stop);
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

const SPA_PREVIEW_HEADING = /(?:adults?\s*only.*(?:spa|wellness)|family.*spa|mountain\s+spa|day\s+spa|beauty.*spa|saunen?|sauna|ruher[aä]ume?|relaxation\s+rooms?|pools?|behandlungen|treatments?|massagen?|massage|hamam|hammam|kosmetik|rituale?|therap(?:y|ies)|k[oö]rperbehandlungen|gesichtsbehandlungen|packungen)/iu;
const EXPERIENCE_PREVIEW_HEADING = /(?:e-?trial|trial[-\s]?park|single\s+trail|bike\s+trail|mountain\s*bik|hiking|wander|kletter|climb|tennis|golf|fitness|gym|playground|kids?\s+(?:club|area)|aqua\s*park|water\s*park|rutschenpark|ski(?:ing)?|langlauf|toboggan|rodel)/iu;
const PREVIEW_GENERIC_HEADING = /^(?:spa|wellness|experiences?|activities|aktiv(?:it[aä]ten)?|fahrrad[-\s]?erlebnisse|angebote|offers?|mehr\s+lesen|weniger\s+lesen|faq|fragen\s*&\s*antworten)$/iu;
const PREVIEW_QUESTION_HEADING = /\?$|^(?:was|wann|warum|wie|wo|welche[rsnm]?|welcher|welches|gibt\s+es|eignet\s+sich|kann\s+man|für\s+wen|fuer\s+wen|ist\s+es|sind\s+|does\s+|do\s+|is\s+|are\s+|can\s+|which\s+|what\s+|when\s+|where\s+|why\s+|how\s+)/iu;

const SPA_TEXT_FACILITY_PATTERNS = Object.freeze([
  /\b(?:Adults?\s+Only|Family|Beauty)\s+(?:Mountain\s+)?Spa\b/giu,
  /\bDay\s+Spa\b/giu,
  /\b(?:Panorama|Bio|Finnische|Finnish|Textil|Family)\s+Sauna\b/giu,
  /\bDampfbad\b/giu,
  /\bInfrarot(?:[-\s]+(?:Liegen|Sauna|Kabine|Cabin))?\b/giu,
  /\bSaunaterrasse\b/giu,
  /\bRuheraum\s+[A-ZÄÖÜ][\p{L}\p{N}’'&-]{2,32}\b/gu,
  /\b(?:Infinity\s+Pool|Sportpool|Hallenbad|Family\s+Whirlpool|Babyschwimmbad|Kinderpool|Solebecken|Tauchbecken|Whirlpool\s+Indoor)\b/giu,
  /\b(?:Indoor|Outdoor)\s+Pool\b/giu,
  /\b(?:1000\s+und\s+1\s+Nacht\s+)?Hamam\b/giu,
  /\b(?:Massagen?|Massages?)\b/giu,
  /\b(?:Beauty\s+Treatments?|Spa\s+Treatments?|Behandlungen)\b/giu,
]);

function previewSpaTextFacilities(discovery: HotelIntakeV2DiscoveryResult) {
  const names: string[] = [];
  for (const page of discovery.evidence.pages || []) {
    const classification = classifyHotelScannerPageV2(page);
    if (hotelScannerPageTypeDomain(classification.primaryType) !== "spa") continue;
    const texts = [
      clean(page.text, 20_000),
      ...(page.contentBlocks || []).map((block) => clean(block.text, 4_000)),
    ];
    for (const text of texts) {
      if (!text) continue;
      for (const pattern of SPA_TEXT_FACILITY_PATTERNS) {
        pattern.lastIndex = 0;
        for (const match of text.matchAll(pattern)) {
          const name = clean(match[0], 120);
          if (!name || PREVIEW_QUESTION_HEADING.test(name) || !clientPreviewNameAllowed("spa", name)) continue;
          names.push(name);
        }
      }
    }
  }
  return unique(names, 24);
}


function previewEvidenceHeadings(discovery: HotelIntakeV2DiscoveryResult, domain: "spa" | "experiences") {
  const result: string[] = [];
  const pattern = domain === "spa" ? SPA_PREVIEW_HEADING : EXPERIENCE_PREVIEW_HEADING;
  for (const page of discovery.evidence.pages || []) {
    const classification = classifyHotelScannerPageV2(page);
    if (hotelScannerPageTypeDomain(classification.primaryType) !== domain) continue;
    const pageTitle = entityKey(clean(page.title, 240).split(/\s+[|]\s+/u)[0] || "");
    const headings = [
      ...(page.contentBlocks || []).map((block) => clean(block.heading, 240)),
      ...(page.headings || []).map((heading) => clean(heading.text, 240)),
    ];
    for (const heading of headings) {
      if (!heading || PREVIEW_GENERIC_HEADING.test(heading) || PREVIEW_QUESTION_HEADING.test(heading) || !pattern.test(heading)) continue;
      if (entityKey(heading) === pageTitle) continue;
      if (!clientPreviewNameAllowed(domain, heading)) continue;
      result.push(heading);
    }
  }
  return unique(result, 24);
}

function previewItemsForDomain(discovery: HotelIntakeV2DiscoveryResult, domain: string, expectedItems: Array<{ nameHint?: string; url?: string; urls?: string[] }>) {
  const base = expectedItems.map((item) => ({
    name: clean(item.nameHint, 240),
    hours: domain === "gastronomy" ? openingHoursForItem(discovery, item) : "",
  })).filter((item) => item.name && clientPreviewNameAllowed(domain, item.name));

  if (domain !== "spa" && domain !== "experiences") return base;

  const evidenceNames = previewEvidenceHeadings(discovery, domain);
  const spaFacilities = domain === "spa" ? previewSpaTextFacilities(discovery) : [];
  const detailedSpa = spaFacilities.length >= 4;
  const merged = base.filter((item) =>
    !(domain === "spa" && detailedSpa && /^(?:saunen?|ruher[aä]ume?|pools?)$/iu.test(item.name)));
  for (const name of [...spaFacilities, ...evidenceNames]) {
    if (domain === "spa" && detailedSpa && /^(?:saunen?|ruher[aä]ume?|pools?)$/iu.test(name)) continue;
    if (merged.some((item) => sameEntityName(item.name, name))) continue;
    merged.push({ name, hours: "" });
  }
  return merged.slice(0, 24);
}

function quickContacts(discovery: HotelIntakeV2DiscoveryResult) {
  const phoneGroups = new Map<string, { values: string[]; pages: Set<string> }>();
  const emails: string[] = [];
  const addressGroups = new Map<string, { values: string[]; pages: Set<string> }>();

  for (const page of discovery.evidence.pages || []) {
    const pageUrl = clean(page.url, 2_048);
    for (const phone of page.contactSignals?.phones || []) {
      const key = normalizedPhoneKey(phone);
      if (!key) continue;
      if (!phoneGroups.has(key)) phoneGroups.set(key, { values: [], pages: new Set() });
      const group = phoneGroups.get(key)!;
      group.values.push(clean(phone, 120));
      group.pages.add(pageUrl);
    }
    emails.push(...(page.contactSignals?.emails || []));
    for (const address of page.contactSignals?.addresses || []) {
      const key = normalizedAddressKey(address);
      if (!key) continue;
      if (!addressGroups.has(key)) addressGroups.set(key, { values: [], pages: new Set() });
      const group = addressGroups.get(key)!;
      group.values.push(clean(address, 500));
      group.pages.add(pageUrl);
    }
  }

  const rankedPhones = [...phoneGroups.values()]
    .sort((left, right) => right.pages.size - left.pages.size || preferredPhoneDisplay(left.values).localeCompare(preferredPhoneDisplay(right.values)));
  const maxPhonePages = rankedPhones[0]?.pages.size || 0;
  const phones = rankedPhones
    .filter((group, index) => index === 0 || (maxPhonePages <= 1 ? index < 3 : group.pages.size >= Math.max(2, Math.ceil(maxPhonePages / 2))))
    .map((group) => preferredPhoneDisplay(group.values))
    .filter(Boolean)
    .slice(0, 3);

  const rankedAddresses = [...addressGroups.values()]
    .sort((left, right) => right.pages.size - left.pages.size || clean(left.values[0], 500).localeCompare(clean(right.values[0], 500)));
  const addresses = rankedAddresses.slice(0, 1).map((group) => group.values[0]).filter(Boolean);

  return {
    phones,
    emails: unique(emails.map((email) => clean(email, 240).toLocaleLowerCase("en-US")), 5),
    addresses,
    website: discovery.evidence.canonicalUrl,
  };
}

function v3InventoryAuthority(discovery: HotelIntakeV2DiscoveryResult) {
  const snapshot = discovery.evidence.v3InventorySnapshot;
  if (!snapshot || snapshot.schemaVersion !== "hotel-scanner-v3-canonical-inventory-1") return null;
  return projectHotelInventoryAuthorityV3(snapshot);
}

function authorityInventory(discovery: HotelIntakeV2DiscoveryResult) {
  const authority = v3InventoryAuthority(discovery);
  return authority ? applyHotelInventoryAuthorityV3(discovery.inventory, authority) : discovery.inventory;
}

function itemize(discovery: HotelIntakeV2DiscoveryResult): HotelIntelligenceItem[] {
  const inventory = authorityInventory(discovery);
  const facts = inventory.domains
    .filter((domain: { domain: string }) => CORE_DOMAINS.includes(domain.domain as (typeof CORE_DOMAINS)[number]))
    .flatMap((domain: Parameters<typeof buildInventoryIdentityFactsV2>[0]) => buildInventoryIdentityFactsV2(domain));
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
  const authority = v3InventoryAuthority(discovery);
  const inventory = authority ? applyHotelInventoryAuthorityV3(discovery.inventory, authority) : discovery.inventory;
  const items = itemize(discovery);
  const canonicalUrl = discovery.evidence.canonicalUrl;
  const rooms = inventory.domains.find((domain: { domain: string }) => domain.domain === "accommodation")?.expectedItems || [];
  const venues = inventory.domains.find((domain: { domain: string }) => domain.domain === "gastronomy")?.expectedItems || [];
  const spa = inventory.domains.find((domain: { domain: string }) => domain.domain === "spa")?.expectedItems || [];
  const services = inventory.domains.find((domain: { domain: string }) => domain.domain === "services")?.expectedItems || [];
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
        roomTypes: unique(rooms.map((item) => clean(item.nameHint, 180)).filter((name) => clientPreviewNameAllowed("accommodation", name)), 50),
        amenities: unique(services.map((item) => clean(item.nameHint, 180)), 50),
        venues: venues.map((item) => ({ name: clean(item.nameHint, 180), type: "venue", hours: "", summary: "" })).filter((item) => item.name),
        spaServices: unique(spa.map((item) => clean(item.nameHint, 180)).filter((name) => clientPreviewNameAllowed("spa", name)), 50),
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
    components: inventory.domains
      .filter((domain: HotelScannerV2DomainInventory) => CORE_DOMAINS.includes(domain.domain as (typeof CORE_DOMAINS)[number]))
      .map((domain: HotelScannerV2DomainInventory) => {
        const rawComponentItems = (domain.expectedItems || []).map((item) => ({
          name: clean(item.nameHint, 240),
          hours: domain.domain === "gastronomy" ? openingHoursForItem(discovery, item) : "",
        })).filter((item) => item.name);
        const componentItems = previewItemsForDomain(discovery, domain.domain, domain.expectedItems || []);
        const contactMethodCount = contacts.phones.length + contacts.emails.length + contacts.addresses.length;
        return {
          domain: domain.domain,
          count: domain.domain === "contacts"
            ? contactMethodCount
            : componentItems.length || domain.expectedCount,
          state: domain.expectationState,
          namedCount: domain.domain === "contacts" ? contactMethodCount : componentItems.length,
          needsOnboarding: domain.domain !== "contacts"
            && domain.expectedCount > rawComponentItems.length,
          items: componentItems,
        };
      }),
    contacts,
    documents: summarizeHotelScannerV2Documents(discovery),
    inventoryAuthority: authority ? summarizeHotelInventoryAuthorityV3(authority) : null,
    diagnostics: {
      pageCount: discovery.evidence.pages.length,
      resourceCount: discovery.siteMap.counts.resources,
      expectedItems: inventory.counts.expectedItems,
      inventorySnapshotId: authority?.snapshotId || "",
    },
  };
}
