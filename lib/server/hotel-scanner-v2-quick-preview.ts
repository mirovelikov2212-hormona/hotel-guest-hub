import "server-only";

import type { HotelIntelligenceItem, HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";
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

function targetedDomainItems(
  discovery: HotelIntakeV2DiscoveryResult,
  domain: "accommodation" | "gastronomy",
) {
  const requestedLanguage = intakePathLanguage(discovery.evidence.canonicalUrl || discovery.evidence.requestedUrl);
  const candidates = (discovery.evidence.pages || [])
    .map((page) => {
      const classification = classifyHotelScannerPageV2(page);
      if (classification.primaryType !== domain) return null;
      const hint = deriveHotelPageInventoryHintsV2(page, classification)
        .find((entry: { domain?: string }) => entry?.domain === domain);
      if (!hint || !Array.isArray(hint.candidates) || !hint.candidates.length) return null;
      const language = intakePathLanguage(page.url);
      return {
        page,
        hint,
        languageRank: requestedLanguage && language === requestedLanguage ? 0 : language === "en" ? 1 : language ? 2 : 3,
        depth: intakePathDepth(page.url),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) =>
      left.languageRank - right.languageRank
      || left.depth - right.depth
      || Number(right.hint.confidence === "HIGH") - Number(left.hint.confidence === "HIGH")
      || left.page.url.localeCompare(right.page.url));

  const selected = candidates[0];
  if (!selected) return [] as IntakePreviewItem[];

  const items = selected.hint.candidates
    .map((candidate: { name?: string; links?: string[] }) => {
      const name = clean(candidate?.name, 240);
      if (!name || !clientPreviewNameAllowed(domain, name)) return null;
      const linkedUrl = (candidate.links || [])
        .map((url) => absoluteEvidenceUrl(url, selected.page.url))
        .find(Boolean) || selected.page.url;
      const hours = domain === "gastronomy"
        ? openingHoursForItem(discovery, { nameHint: name, url: linkedUrl, urls: [linkedUrl] })
        : "";
      return { name, hours, url: linkedUrl };
    })
    .filter((item): item is { name: string; hours: string; url: string } => Boolean(item));

  // A landing page is the authority for Intake. If it produces an implausibly
  // large navigation-like set, do not expose that noise as hotel inventory.
  const maxItems = domain === "accommodation" ? 30 : 20;
  if (items.length > maxItems) return [];
  return uniqueIntakeItems(items, maxItems);
}

const CHECK_IN_MARKER = /(?:check[-\s]?in|anreise(?:tag)?|ankunft|arrival|настаняване|пристигане|заезд|giri[sş]|sosire|p[řr]íjezd)/iu;
const CHECK_OUT_MARKER = /(?:check[-\s]?out|abreise(?:tag)?|departure|освобождаване|заминаване|выезд|çıkış|cikis|plecare|odjezd)/iu;
const CLOCK_VALUE = /\b(?:[01]?\d|2[0-3])(?:[:.]\d{2})\b/u;
const PARKING_MARKER = /(?:parking|car\s*park|parkplatz|parkplätze|parkplaetze|garage|паркинг|парковк|otopark|parcare|parkoviště|parkoviste)/iu;

function operationEvidencePages(discovery: HotelIntakeV2DiscoveryResult) {
  const selected = (discovery.evidence.pages || []).filter((page, index) => {
    const type = classifyHotelScannerPageV2(page).primaryType;
    return index === 0 || ["faq", "policies", "contacts", "accommodation"].includes(type);
  });
  return selected.length ? selected : (discovery.evidence.pages || []).slice(0, 1);
}

function timeNearMarker(discovery: HotelIntakeV2DiscoveryResult, marker: RegExp) {
  for (const page of operationEvidencePages(discovery)) {
    const texts = [
      clean(page.text, 30_000),
      ...(page.contentBlocks || []).map((block) => clean(block.text, 4_000)),
    ];
    for (const text of texts) {
      marker.lastIndex = 0;
      const match = marker.exec(text);
      if (!match) continue;
      const window = text.slice(match.index, match.index + 220);
      const clock = window.match(CLOCK_VALUE)?.[0];
      if (clock) return clock.replace(".", ":");
    }
  }
  return "";
}

function parkingInfo(discovery: HotelIntakeV2DiscoveryResult) {
  for (const page of operationEvidencePages(discovery)) {
    const texts = [
      clean(page.text, 30_000),
      ...(page.contentBlocks || []).map((block) => clean(block.text, 4_000)),
    ];
    for (const text of texts) {
      const sentences = text.split(/(?<=[.!?])\s+|\n+/u).map((value) => clean(value, 500)).filter(Boolean);
      const sentence = sentences.find((value) => PARKING_MARKER.test(value) && value.length >= 8 && value.length <= 420);
      if (sentence) return sentence;
    }
  }
  return "";
}

function buildIntakeInfo(discovery: HotelIntakeV2DiscoveryResult) {
  return {
    checkIn: timeNearMarker(discovery, CHECK_IN_MARKER),
    checkOut: timeNearMarker(discovery, CHECK_OUT_MARKER),
    parking: parkingInfo(discovery),
  };
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
  const rooms = targetedDomainItems(discovery, "accommodation");
  const venues = targetedDomainItems(discovery, "gastronomy");
  const contacts = quickContacts(discovery);
  const info = buildIntakeInfo(discovery);

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
      colors: [],
      fonts: [],
      styleKeywords: [],
      imageReferences: [],
      logoReferences: [],
      visualAssetPolicy: "hotel_authorization_required",
    },
    routing: { hub: items, smartSetup: [], designStudio: [], review: [] },
    readiness: {
      evidenceFactCount: items.length,
      hubCandidateCount: items.length,
      smartSetupCandidateCount: 0,
      designSignalCount: 0,
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
