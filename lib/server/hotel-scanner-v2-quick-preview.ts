import "server-only";

import type { HotelIntelligenceItem, HotelIntelligencePackage, HotelOnboardingSource, HotelOnboardingSourceCategory } from "@/lib/product-factory/hotel-intelligence-package";
import { buildInventoryIdentityFactsV2 } from "@/lib/ai/hotel-scanner-v2-deterministic-facts";
import type { HotelIntakeV2DiscoveryResult } from "@/lib/server/hotel-scanner-v2-intake";
import type { HotelScannerV2DomainInventory } from "@/lib/server/hotel-scanner-v2-inventory.mjs";
import { deriveHotelPageInventoryHintsV2 } from "@/lib/server/hotel-scanner-v2-landing-inventory.mjs";
import { classifyHotelScannerPageV2, hotelScannerPageTypeDomain } from "@/lib/server/hotel-scanner-v2-page-classifier.mjs";
import {
  applyHotelInventoryAuthorityV3,
  hasReadyHotelInventoryAuthorityV3,
  projectHotelInventoryAuthorityV3,
  summarizeHotelInventoryAuthorityV3,
} from "@/lib/server/hotel-scanner-v3-canonical-inventory.mjs";

const CORE_DOMAINS = ["accommodation", "gastronomy", "policies", "contacts"] as const;
const INTAKE_DOMAINS = ["accommodation", "gastronomy", "policies", "contacts"] as const;

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

function previewItemsForDomain(
  discovery: HotelIntakeV2DiscoveryResult,
  domain: string,
  expectedItems: Array<{ nameHint?: string; url?: string; urls?: string[] }>,
  options: { allowEvidenceExpansion?: boolean } = {},
) {
  const base = expectedItems.map((item) => ({
    name: clean(item.nameHint, 240),
    hours: domain === "gastronomy" ? openingHoursForItem(discovery, item) : "",
  })).filter((item) => item.name && clientPreviewNameAllowed(domain, item.name));

  if (domain !== "spa" && domain !== "experiences") return base;
  if (options.allowEvidenceExpansion === false) return base;

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

  const allPages = discovery.evidence.pages || [];
  const contactPages = allPages.filter((page) => classifyHotelScannerPageV2(page).primaryType === "contacts");
  const selectedPages = contactPages.length ? contactPages : allPages;

  for (const page of selectedPages) {
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
  const authority = projectHotelInventoryAuthorityV3(snapshot);
  return hasReadyHotelInventoryAuthorityV3(authority) ? authority : null;
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
    policies_faq: { bg: "Политики / FAQ", en: "Policies / FAQ", onboarding: false },
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

type IntakePreviewItem = {
  name: string;
  hours?: string;
  url?: string;
  value?: string;
};

function intakePathLanguage(rawUrl: string) {
  try {
    const segment = new URL(rawUrl).pathname.split("/").filter(Boolean)[0] || "";
    return /^(?:bg|en|de|ro|ru|cs|cz|fr|it|es|pl|tr|el|sr|mk|uk|hu|nl|pt)$/iu.test(segment)
      ? segment.toLocaleLowerCase("en-US")
      : "";
  } catch {
    return "";
  }
}

function intakePathDepth(rawUrl: string) {
  try { return new URL(rawUrl).pathname.split("/").filter(Boolean).length; }
  catch { return 99; }
}

function absoluteEvidenceUrl(rawUrl: unknown, baseUrl: string) {
  const raw = clean(rawUrl, 2_048);
  if (!raw) return "";
  try { return new URL(raw, baseUrl).toString(); }
  catch { return "";
  }
}

function uniqueIntakeItems(values: IntakePreviewItem[], max = 40) {
  const seen = new Set<string>();
  const result: IntakePreviewItem[] = [];
  for (const item of values) {
    const name = clean(item.name, 240);
    const key = entityKey(name);
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    result.push({
      name,
      hours: clean(item.hours, 220),
      url: clean(item.url, 2_048),
      value: clean(item.value, 500),
    });
    if (result.length >= max) break;
  }
  return result;
}

function pageTitleItemName(page: { title?: string }) {
  return clean(page.title, 240).split(/\s+(?:[-–—|])\s+/u)[0] || "";
}


const ROOM_ENTITY_HEADING = /(?:\broom\b|\bsuite\b|\bstudio\b|\bapartment\b|\bvilla\b|\bzimmer\b|\bappartement\b|\bcamer[ăa]\b|\bpokoj\b|\bстая\b|\bстудио\b|\bапартамент\b|\bномер\b|\boda\b|\bsüit\b)/iu;
const ROOM_AREA_SIGNAL = /\b\d{1,3}(?:[.,]\d+)?\s*(?:m²|m2|sq\.?\s*(?:m|ft)|ft²)\b/iu;
const ROOM_OCCUPANCY_SIGNAL = /\b\d{1,2}\s*(?:-|–|—|bis|to|до)\s*\d{1,2}\s*(?:personen|persons?|people|guests?|гости|човека|persoane|osoby|os[oó]b|kişi|kisi)\b|\b(?:up\s+to|max(?:imum)?|bis\s+zu)\s*\d{1,2}\s*(?:personen|persons?|people|guests?|гости|човека)\b/iu;
const CTA_TEXT = /^(?:mehr\s+erfahren|details?|learn\s+more|discover|view|see\s+more|weiter|lesen|read\s+more|виж|детайли|подробности)$/iu;
const VENUE_TERM = /(?:restaurant|restoran|lokanta|bar|pub|cafe|café|kafe|bistro|lounge|grill|brasserie|taverna|таверна|ресторант|бар|кафе)/iu;
const VENUE_JSON_LD = /^(?:restaurant|foodestablishment|barorpub|cafeorcoffeeshop)$/iu;

function pageLanguage(page: HotelIntakeV2DiscoveryResult["evidence"]["pages"][number]) {
  return clean(page.language, 40).toLocaleLowerCase("en-US") || intakePathLanguage(page.url);
}

function languageRank(page: HotelIntakeV2DiscoveryResult["evidence"]["pages"][number], requestedLanguage: string) {
  const language = pageLanguage(page);
  if (requestedLanguage && language === requestedLanguage) return 0;
  if (!requestedLanguage && !language) return 0;
  if (language === "en") return 1;
  if (!language) return 2;
  return 3;
}

function roomCardItems(page: HotelIntakeV2DiscoveryResult["evidence"]["pages"][number]) {
  const raw = (page.contentBlocks || [])
    .map((block) => {
      const name = clean(block.heading, 240);
      if (!name || !ROOM_ENTITY_HEADING.test(name) || !clientPreviewNameAllowed("accommodation", name)) return null;
      const localText = clean(block.text, 650);
      const hasArea = ROOM_AREA_SIGNAL.test(localText);
      const hasOccupancy = ROOM_OCCUPANCY_SIGNAL.test(localText);
      const links = (block.linkItems || [])
        .map((link) => ({
          text: clean(link.text, 120),
          href: absoluteEvidenceUrl(link.href, page.url),
        }))
        .filter((link) => link.href);
      const hasCompactCta = links.some((link) => CTA_TEXT.test(link.text)) && links.length <= 4;
      if (!hasArea && !(hasOccupancy && hasCompactCta)) return null;
      return {
        name,
        hours: "",
        url: links.find((link) => CTA_TEXT.test(link.text))?.href || page.url,
        group: Number(block.level || 0) + "|" + (block.sectionPath || []).map((value) => entityKey(value)).join(">"),
        strength: (hasArea ? 4 : 0) + (hasOccupancy ? 3 : 0) + (hasCompactCta ? 2 : 0),
      };
    })
    .filter((item): item is { name: string; hours: string; url: string; group: string; strength: number } => Boolean(item));

  if (!raw.length) return [] as IntakePreviewItem[];
  const grouped = new Map<string, typeof raw>();
  for (const item of raw) {
    const group = grouped.get(item.group) || [];
    group.push(item);
    grouped.set(item.group, group);
  }
  const bestGroup = [...grouped.values()]
    .sort((left, right) =>
      right.length - left.length
      || right.reduce((sum, item) => sum + item.strength, 0) - left.reduce((sum, item) => sum + item.strength, 0))[0] || [];
  const selected = bestGroup.length >= 2 ? bestGroup : raw.filter((item) => item.strength >= 7);
  return uniqueIntakeItems(selected, 30);
}

function quotedVenueName(heading: string) {
  const quoted = heading.match(/(?:restaurant|restoran|bar|pub|cafe|café|bistro|lounge|grill)[^„“"'’]{0,24}[„“"']([^„“"']{2,80})[„“"']/iu);
  if (!quoted?.[1]) return "";
  const type = clean(heading.match(VENUE_TERM)?.[0], 40);
  return clean(type + " " + quoted[1], 120);
}

function conciseVenueHeading(heading: string) {
  let value = clean(heading, 180);
  if (!value || PREVIEW_QUESTION_HEADING.test(value) || !VENUE_TERM.test(value)) return "";
  const quoted = quotedVenueName(value);
  if (quoted) return quoted;
  value = value.split(/\s*(?:,|–|—|\||:)\s*/u)[0] || value;
  value = value.replace(/\s+in\s+[\p{L}\p{M} .'-]{2,50}$/iu, "").trim();
  return value.length <= 90 ? value : "";
}

function atomicVenueItems(discovery: HotelIntakeV2DiscoveryResult, requestedLanguage: string) {
  const pages = (discovery.evidence.pages || [])
    .filter((page) => hotelScannerPageTypeDomain(classifyHotelScannerPageV2(page).primaryType) === "gastronomy")
    .filter((page) => languageRank(page, requestedLanguage) <= 1);

  const items: IntakePreviewItem[] = [];
  for (const page of pages) {
    const jsonLdNames = (page.jsonLdEntities || [])
      .filter((entity) => (entity.types || []).some((type) => VENUE_JSON_LD.test(clean(type, 80))))
      .map((entity) => clean(entity.name, 160))
      .filter((name) => name && clientPreviewNameAllowed("gastronomy", name));
    const h1 = (page.headings || []).find((heading) => Number(heading.level) === 1)?.text || "";
    const name = jsonLdNames[0] || conciseVenueHeading(h1);
    if (!name) continue;
    items.push({
      name,
      hours: openingHoursForItem(discovery, { nameHint: name, url: page.url, urls: [page.url] }),
      url: page.url,
    });
  }
  return uniqueIntakeItems(items, 20);
}

function domainHintItems(
  discovery: HotelIntakeV2DiscoveryResult,
  page: HotelIntakeV2DiscoveryResult["evidence"]["pages"][number],
  domain: "accommodation" | "gastronomy",
) {
  const classification = classifyHotelScannerPageV2(page);
  const hint = deriveHotelPageInventoryHintsV2(page, classification)
    .find((entry: { domain?: string }) => entry?.domain === domain);
  if (!hint || !Array.isArray(hint.candidates) || !hint.candidates.length) return [] as IntakePreviewItem[];

  const items = hint.candidates
    .map((candidate: { name?: string; links?: string[] }) => {
      const name = clean(candidate?.name, 240);
      if (!name || !clientPreviewNameAllowed(domain, name)) return null;
      const linkedUrl = (candidate.links || [])
        .map((url) => absoluteEvidenceUrl(url, page.url))
        .find(Boolean) || page.url;
      const hours = domain === "gastronomy"
        ? openingHoursForItem(discovery, { nameHint: name, url: linkedUrl, urls: [linkedUrl] })
        : "";
      return { name, hours, url: linkedUrl };
    })
    .filter((item): item is { name: string; hours: string; url: string } => Boolean(item));

  return uniqueIntakeItems(items, domain === "accommodation" ? 30 : 20);
}

function targetedDomainItems(
  discovery: HotelIntakeV2DiscoveryResult,
  domain: "accommodation" | "gastronomy",
) {
  const pages = discovery.evidence.pages || [];
  const requestedLanguage = pages[0] ? pageLanguage(pages[0]) : "";

  if (domain === "gastronomy") {
    const atomic = atomicVenueItems(discovery, requestedLanguage);
    if (atomic.length) return atomic;
  }

  const rankedLandings = pages
    .map((page) => {
      const classification = classifyHotelScannerPageV2(page);
      if (hotelScannerPageTypeDomain(classification.primaryType) !== domain) return null;
      const items = domain === "accommodation"
        ? roomCardItems(page)
        : domainHintItems(discovery, page, domain);
      if (!items.length) return null;
      return {
        page,
        items,
        languageRank: languageRank(page, requestedLanguage),
        depth: intakePathDepth(page.url),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) =>
      left.languageRank - right.languageRank
      || right.items.length - left.items.length
      || left.depth - right.depth
      || left.page.url.localeCompare(right.page.url));

  const landing = rankedLandings[0];
  if (landing) return landing.items;

  const homepage = pages[0];
  if (homepage) {
    const homepageItems = domain === "accommodation"
      ? roomCardItems(homepage)
      : domainHintItems(discovery, homepage, domain);
    if (homepageItems.length) return homepageItems;
  }

  const detailSuffix = domain === "accommodation" ? "room_detail" : "restaurant_detail";
  const detailItems = pages
    .filter((page) => classifyHotelScannerPageV2(page).primaryType === detailSuffix)
    .filter((page) => languageRank(page, requestedLanguage) <= 1)
    .map((page) => {
      const name = pageTitleItemName(page);
      if (!name || !clientPreviewNameAllowed(domain, name)) return null;
      return {
        name,
        hours: domain === "gastronomy"
          ? openingHoursForItem(discovery, { nameHint: name, url: page.url, urls: [page.url] })
          : "",
        url: clean(page.url, 2_048),
      };
    })
    .filter((item): item is { name: string; hours: string; url: string } => Boolean(item));

  return uniqueIntakeItems(detailItems, domain === "accommodation" ? 30 : 20);
}

const CHECK_IN_MARKER = /(?:check[-\s]?in|anreise(?:tag)?|ankunft|arrival|настаняване|пристигане|заезд|giri[sş]|sosire|p[řr]íjezd)/iu;
const CHECK_OUT_MARKER = /(?:check[-\s]?out|abreise(?:tag)?|departure|освобождаване|заминаване|выезд|çıkış|cikis|plecare|odjezd)/iu;
const CLOCK_VALUE = /\b(?:[01]?\d|2[0-3])(?:[:.]\d{2})\b/u;
const PARKING_MARKER = /(?:parking|car\s*park|parkplatz|parkplätze|parkplaetze|garage|паркинг|парковк|otopark|parcare|parkoviště|parkoviste)/iu;

function operationEvidencePages(discovery: HotelIntakeV2DiscoveryResult) {
  const selected = (discovery.evidence.pages || []).map((page, index) => {
    const type = classifyHotelScannerPageV2(page).primaryType;
    const priority = ["faq", "policies"].includes(type)
      ? 0
      : type === "contacts"
        ? 1
        : type === "accommodation"
          ? 2
          : index === 0
            ? 3
            : 99;
    return { page, priority, index };
  }).filter((entry) => entry.priority < 99)
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .map((entry) => entry.page);
  return selected.length ? selected : (discovery.evidence.pages || []).slice(0, 1);
}

function timeNearMarker(discovery: HotelIntakeV2DiscoveryResult, marker: RegExp) {
  for (const page of operationEvidencePages(discovery)) {
    const texts = [
      clean(page.text, 30_000),
      ...(page.contentBlocks || []).map((block) => clean(block.text, 4_000)),
    ];
    for (const text of texts) {
      const sentences = text.split(/(?<=[.!?])\s+|\n+/u).map((value) => clean(value, 700)).filter(Boolean);
      for (const sentence of sentences) {
        marker.lastIndex = 0;
        const markerMatch = marker.exec(sentence);
        if (!markerMatch) continue;
        const clocks = [...sentence.matchAll(/\b(?:[01]?\d|2[0-3])(?:[:.]\d{2})\b/gu)];
        if (!clocks.length) continue;
        const nearest = clocks.sort((left, right) =>
          Math.abs(Number(left.index || 0) - markerMatch.index)
          - Math.abs(Number(right.index || 0) - markerMatch.index))[0];
        const clock = clean(nearest?.[0], 20);
        if (clock) return clock.replace(".", ":");
      }
    }
  }
  return "";
}

function parkingInfo(discovery: HotelIntakeV2DiscoveryResult) {
  const strongParking = /(?:hoteleigen|on[-\s]?site|kostenlos|free|gratis|garage|parkplatz|parkplätze|parkplaetze|parking\s+(?:lot|area)|car\s*park)/iu;
  const candidates: Array<{ text: string; score: number }> = [];
  for (const page of operationEvidencePages(discovery)) {
    const texts = [
      clean(page.text, 30_000),
      ...(page.contentBlocks || []).map((block) => clean(block.text, 4_000)),
    ];
    for (const text of texts) {
      const sentences = text.split(/(?<=[.!?])\s+|\n+/u).map((value) => clean(value, 500)).filter(Boolean);
      for (const sentence of sentences) {
        if (!PARKING_MARKER.test(sentence) || sentence.length < 8 || sentence.length > 420) continue;
        const score = (strongParking.test(sentence) ? 10 : 0)
          + (/guest|gäste|gast|hotel|гост/iu.test(sentence) ? 3 : 0)
          - Math.floor(sentence.length / 140);
        candidates.push({ text: sentence, score });
      }
    }
  }
  return candidates.sort((left, right) => right.score - left.score || left.text.length - right.text.length)[0]?.text || "";
}

function buildIntakeInfo(discovery: HotelIntakeV2DiscoveryResult) {
  return {
    checkIn: timeNearMarker(discovery, CHECK_IN_MARKER),
    checkOut: timeNearMarker(discovery, CHECK_OUT_MARKER),
    parking: parkingInfo(discovery),
  };
}


const SOURCE_CATEGORY_ORDER: HotelOnboardingSourceCategory[] = [
  "accommodation",
  "gastronomy",
  "wellness",
  "services",
  "experiences",
  "events",
  "offers",
  "policies",
  "contacts",
  "documents",
];

function decodeHtmlEntities(value: unknown) {
  return clean(value, 500)
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code) || 32))
    .replace(/&#x([\da-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16) || 32))
    .replace(/&quot;|&ldquo;|&rdquo;/giu, '"')
    .replace(/&apos;|&#39;|&lsquo;|&rsquo;/giu, "'")
    .replace(/&amp;/giu, "&")
    .replace(/&nbsp;/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function sourceCategoryFromPageType(type: unknown): HotelOnboardingSourceCategory | null {
  const value = clean(type, 80);
  if (["accommodation", "room_detail"].includes(value)) return "accommodation";
  if (["gastronomy", "restaurant_detail"].includes(value)) return "gastronomy";
  if (["spa", "spa_detail"].includes(value)) return "wellness";
  if (["services", "service_detail"].includes(value)) return "services";
  if (["experiences", "experience_detail"].includes(value)) return "experiences";
  if (["events", "event_detail"].includes(value)) return "events";
  if (["offers", "offer_detail"].includes(value)) return "offers";
  if (["faq", "policies"].includes(value)) return "policies";
  if (value === "contacts") return "contacts";
  if (value === "documents") return "documents";
  return null;
}

function sourceTitleFromUrl(rawUrl: string, fallback: string) {
  const decodedFallback = decodeHtmlEntities(fallback);
  if (decodedFallback) return decodedFallback;
  try {
    const parsed = new URL(rawUrl);
    const segment = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    const title = segment.replace(/\.pdf$/iu, "").replace(/[-_]+/gu, " ").trim();
    return title || parsed.hostname.replace(/^www\./u, "");
  } catch {
    return rawUrl;
  }
}

function pageTypePriority(type: string) {
  if (["accommodation", "gastronomy", "spa", "services", "experiences", "events", "offers", "faq", "policies", "contacts"].includes(type)) return 0;
  if (type === "documents") return 1;
  return 2;
}

function buildOnboardingSources(discovery: HotelIntakeV2DiscoveryResult): HotelOnboardingSource[] {
  const requestedLanguage = intakePathLanguage(discovery.evidence.canonicalUrl || discovery.evidence.requestedUrl);
  const candidates = (discovery.siteMap.resources || [])
    .map((resource) => {
      const pageType = clean(resource.classification?.primaryType, 80);
      const category = resource.resourceType === "pdf" ? "documents" : sourceCategoryFromPageType(pageType);
      if (!category) return null;
      const url = clean(resource.url, 2_048);
      if (!url) return null;
      const resourceLanguage = (resource.languages || [])[0] || intakePathLanguage(url);
      const languagePriority = requestedLanguage && resourceLanguage === requestedLanguage
        ? 0
        : resourceLanguage === "en"
          ? 1
          : resourceLanguage
            ? 2
            : 3;
      return {
        category,
        url,
        kind: resource.resourceType === "pdf" ? "document" as const : "page" as const,
        pageType,
        title: sourceTitleFromUrl(url, resource.title || ""),
        variantKey: clean(resource.variantGroupId, 500) || url,
        languagePriority,
        typePriority: pageTypePriority(pageType),
        crawledPriority: resource.crawled ? 0 : 1,
        depth: intakePathDepth(url),
      };
    })
    .filter((source): source is NonNullable<typeof source> => Boolean(source))
    .sort((left, right) =>
      SOURCE_CATEGORY_ORDER.indexOf(left.category) - SOURCE_CATEGORY_ORDER.indexOf(right.category)
      || left.languagePriority - right.languagePriority
      || left.typePriority - right.typePriority
      || left.crawledPriority - right.crawledPriority
      || left.depth - right.depth
      || left.url.localeCompare(right.url));

  const seen = new Set<string>();
  const categoryCounts = new Map<HotelOnboardingSourceCategory, number>();
  const result: HotelOnboardingSource[] = [];
  for (const candidate of candidates) {
    const dedupeKey = candidate.category + "|" + candidate.variantKey;
    if (seen.has(dedupeKey)) continue;
    const count = categoryCounts.get(candidate.category) || 0;
    if (count >= 16) continue;
    seen.add(dedupeKey);
    categoryCounts.set(candidate.category, count + 1);
    result.push({
      id: "onboarding-source-" + (result.length + 1),
      category: candidate.category,
      title: candidate.title,
      url: candidate.url,
      kind: candidate.kind,
      pageType: candidate.pageType,
    });
  }
  return result;
}

function buildQuickIntakeFacts(input: {
  rooms: IntakePreviewItem[];
  venues: IntakePreviewItem[];
  policies: IntakePreviewItem[];
  contacts: ReturnType<typeof quickContacts>;
  info: { checkIn: string; checkOut: string; parking: string };
}) {
  const raw: Array<{ category: string; label: string; value: string; sourceUrls: string[] }> = [];
  for (const room of input.rooms) raw.push({ category: "accommodation", label: "Room type", value: room.name, sourceUrls: room.url ? [room.url] : [] });
  for (const venue of input.venues) raw.push({
    category: "dining",
    label: "Venue",
    value: [venue.name, venue.hours].filter(Boolean).join(" · "),
    sourceUrls: venue.url ? [venue.url] : [],
  });
  for (const policy of input.policies) raw.push({ category: "policy", label: "Policy / FAQ", value: policy.name, sourceUrls: policy.url ? [policy.url] : [] });
  for (const phone of input.contacts.phones) raw.push({ category: "contact", label: "Phone", value: phone, sourceUrls: [] });
  for (const email of input.contacts.emails) raw.push({ category: "contact", label: "Email", value: email, sourceUrls: [] });
  if (input.info.checkIn) raw.push({ category: "operations", label: "Check-in", value: input.info.checkIn, sourceUrls: [] });
  if (input.info.checkOut) raw.push({ category: "operations", label: "Check-out", value: input.info.checkOut, sourceUrls: [] });
  if (input.info.parking) raw.push({ category: "parking", label: "Parking", value: input.info.parking, sourceUrls: [] });

  return raw.map((fact, index): HotelIntelligenceItem => ({
    ...fact,
    confidence: 0.9,
    id: `quick-intake-${index + 1}`,
    targets: ["hub"],
    status: "candidate",
    verification: {
      status: "SINGLE_SOURCE",
      independentSourceCount: 1,
      sourceUrls: fact.sourceUrls,
    },
  }));
}

export function buildHotelScannerV2QuickPreview(discovery: HotelIntakeV2DiscoveryResult) {
  // Intake deliberately ignores site-wide V3 inventory authority. The public
  // landing pages for rooms and dining are the source for the onboarding list.
  const canonicalUrl = discovery.evidence.canonicalUrl;
  const rooms: IntakePreviewItem[] = [];
  const venues: IntakePreviewItem[] = [];
  const contacts = quickContacts(discovery);
  const info = buildIntakeInfo(discovery);
  const onboardingSources = buildOnboardingSources(discovery);

  const policyPages: IntakePreviewItem[] = (discovery.evidence.pages || [])
    .filter((page) => {
      const type = classifyHotelScannerPageV2(page).primaryType;
      return type === "faq" || type === "policies";
    })
    .map((page, index) => ({
      name: clean(page.title, 240).split(/\s+[|]\s+/u)[0] || `Policy / FAQ ${index + 1}`,
      url: clean(page.url, 2_048),
    }));

  const policyDocuments: IntakePreviewItem[] = (discovery.inventory.documents || [])
    .filter((document: { domains?: string[] }) => document.domains?.includes("policies"))
    .map((document: { url?: string }, index: number) => {
      const url = clean(document.url, 2_048);
      let name = `Policy / FAQ ${index + 1}`;
      try {
        name = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || name)
          .replace(/\.pdf$/iu, "")
          .replace(/[-_]+/gu, " ")
          .trim() || name;
      } catch {}
      return { name, url };
    });
  const policies = uniqueIntakeItems([...policyPages, ...policyDocuments], 20);
  const items = buildQuickIntakeFacts({ rooms, venues, policies, contacts, info });
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
    onboardingSources,
    evidenceLayer: { facts: items, sourceUrls, uncertainties: ["quick_intake_only", "manual_onboarding_required"] },
    hotelProfileLayer: {
      identity: {
        hotelName: name,
        summary: "",
        address: contacts.addresses[0] || "",
        city: "",
        country: "",
        bookingUrl: "",
        contactUrl: canonicalUrl,
      },
      contacts: { phones: contacts.phones, emails: contacts.emails, socialLinks: [] },
      operations: { checkIn: info.checkIn, checkOut: info.checkOut, languages: [] },
      hospitality: {
        roomTypes: rooms.map((item) => item.name),
        amenities: info.parking ? [info.parking] : [],
        venues: venues.map((item) => ({
          name: item.name,
          type: "venue",
          hours: item.hours || "",
          summary: "",
        })),
        spaServices: [],
        policies: policies.map((item) => item.name),
      },
    },
    designIntelligenceLayer: {
      colors: discovery.evidence.brand?.colors || [],
      fonts: discovery.evidence.brand?.fonts || [],
      styleKeywords: [],
      imageReferences: [],
      logoReferences: [],
      brandKit: discovery.evidence.brand ? {
        colorRoles: discovery.evidence.brand.colorRoles || [],
        typography: discovery.evidence.brand.typography,
        visualCues: discovery.evidence.brand.visualCues,
        stylesheetUrls: discovery.evidence.brand.stylesheetUrls || [],
      } : undefined,
      visualAssetPolicy: "hotel_authorization_required",
    },
    routing: { hub: items, smartSetup: [], designStudio: [], review: [] },
    readiness: {
      evidenceFactCount: items.length,
      hubCandidateCount: items.length,
      smartSetupCandidateCount: 0,
      designSignalCount: (discovery.evidence.brand?.colors?.length || 0)
        + (discovery.evidence.brand?.fonts?.length || 0)
        + (discovery.evidence.brand?.colorRoles?.length || 0),
      reviewRequiredCount: 0,
      verifiedFactCount: 0,
      singleSourceFactCount: items.length,
      conflictFactCount: 0,
      humanReviewResolved: false,
    },
  };

  const contactMethodCount = contacts.phones.length + contacts.emails.length + contacts.addresses.length;
  const infoItems: IntakePreviewItem[] = [
    ...(info.checkIn ? [{ name: "Check-in", value: info.checkIn }] : []),
    ...(info.checkOut ? [{ name: "Check-out", value: info.checkOut }] : []),
    ...(info.parking ? [{ name: "Паркинг", value: info.parking }] : []),
  ];

  return {
    sourcePackage,
    components: [
      { domain: "accommodation", count: rooms.length, namedCount: rooms.length, items: rooms },
      { domain: "gastronomy", count: venues.length, namedCount: venues.length, items: venues },
      { domain: "policies", count: policies.length, namedCount: policies.length, items: policies },
      { domain: "contacts", count: contactMethodCount, namedCount: contactMethodCount, items: [] },
      { domain: "info", count: infoItems.length, namedCount: infoItems.length, items: infoItems },
    ],
    contacts,
    info,
    onboardingSources,
    brandKit: sourcePackage.designIntelligenceLayer.brandKit,
    documents: summarizeHotelScannerV2Documents(discovery),
    inventoryAuthority: null,
    diagnostics: {
      pageCount: discovery.evidence.pages.length,
      resourceCount: discovery.siteMap.counts.resources,
      expectedItems: rooms.length + venues.length + policies.length,
      inventorySnapshotId: "",
    },
  };
}
