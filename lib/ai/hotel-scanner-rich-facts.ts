import OpenAI from "openai";

import type { HotelScanEvidenceBundle } from "@/lib/server/factory-hotel-scanner";
import type { HotelScanFact } from "@/lib/ai/hotel-scanner";
import { extractHotelScannerCriticalClaims } from "@/lib/ai/hotel-scanner-critical-claims.mjs";
import { selectCriticalHotelScannerPages } from "@/lib/ai/hotel-scanner-critical-pages.mjs";
import { selectHotelScannerHubPages } from "@/lib/ai/hotel-scanner-hub-pages.mjs";

let client: OpenAI | null = null;

const FACT_CATEGORIES = [
  "identity", "location", "contact", "operations", "accommodation", "dining", "amenities", "wellness",
  "events", "experiences", "offers", "policy", "sustainability", "family", "beach", "parking", "services", "brand", "hotel",
] as const;

const FACT_ATTRIBUTES = [
  "name", "description", "address", "phone", "email", "social_profile", "check_in", "check_out", "language",
  "room_type", "capacity", "size", "bed", "view", "meal_inclusion", "price", "price_context", "hours", "external_access",
  "access", "dress_code", "age_policy", "venue", "amenity", "facility", "service", "treatment", "duration", "session_duration",
  "recommended_stay", "booking", "experience", "activity", "attraction", "experience_access", "experience_booking",
  "event_space", "event_capacity", "event_service", "pet_policy", "smoking_policy", "quiet_hours", "cancellation_policy",
  "payment_policy", "parking", "wifi", "offer", "other",
] as const;

export type HotelScannerOutputLanguage = "bg" | "en";
type RichFact = HotelScanFact & { subject?: string; attribute?: string };
type FactExtractionMode = "comprehensive" | "critical" | "hub";

function getClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("openai_api_key_missing");
  if (!client) client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 0 });
  return client;
}

function clean(value: unknown, max = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}
function normalized(value: unknown) { return clean(value, 500).normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim(); }
function isGenericHoursLabel(label: string) {
  const value = label.toLocaleLowerCase("bg-BG").replace(/\s+/g, " ").trim();
  if (["работно време", "часове", "hours", "opening hours"].includes(value)) return true;
  const bulgarianHours = value.includes("работно време") || value.includes("часове");
  if (bulgarianHours && /(удобств|обект|услуг)/u.test(value)) return true;
  const englishHours = value.includes("hours");
  return englishHours && /(amenit|facilit|venue|service)/u.test(value);
}

const GENERIC_BUSINESS_EMAIL_LOCAL_PARTS = new Set([
  "info", "contact", "contacts", "hello", "office", "hotel", "reception", "frontdesk", "frontoffice", "reservation", "reservations",
  "booking", "bookings", "sales", "events", "event", "spa", "wellness", "restaurant", "restaurants", "marketing", "conference",
  "conferences", "groups", "group", "guestrelations", "guestservice", "guestservices", "service", "services",
]);
function isPrivacyMinimalBusinessEmail(raw: string) {
  const value = clean(raw, 200).toLocaleLowerCase("en-US");
  const match = value.match(/^([^@]+)@([^@]+)$/); if (!match) return false;
  return GENERIC_BUSINESS_EMAIL_LOCAL_PARTS.has(match[1].replace(/[^a-z0-9]+/g, ""));
}
function canonicalizeRoomType(subject: string, value: string) {
  const subjectValue = clean(subject, 160); const subjectKey = normalized(subjectValue);
  if (subjectValue && !["hotel", "resort", "property"].includes(subjectKey) && subjectValue.length <= 120) return subjectValue;
  const raw = clean(value, 160);
  if (raw.length <= 120 && !/[;:.]|(?:with|със|с |featuring|подходящ|разполага)/iu.test(raw)) return raw;
  return "";
}

function parseFacts(value: string, allowed: Set<string>): HotelScanFact[] {
  const parsed = JSON.parse(value) as { facts?: RichFact[] }; if (!parsed || !Array.isArray(parsed.facts)) return [];
  const seen = new Map<string, RichFact>();
  for (const raw of parsed.facts) {
    const category = clean(raw?.category, 80) || "hotel"; const subject = clean(raw?.subject, 160) || "hotel";
    const attribute = clean(raw?.attribute, 80) || "other"; const label = clean(raw?.label, 120); let factValue = clean(raw?.value, 500);
    const sourceUrls = [...new Set((Array.isArray(raw?.sourceUrls) ? raw.sourceUrls : []).map(String).filter((url) => allowed.has(url)))].slice(0, 8);
    if (!label || !factValue || !sourceUrls.length || isGenericHoursLabel(label)) continue;
    if (attribute === "room_type") { factValue = canonicalizeRoomType(subject, factValue); if (!factValue) continue; }
    if (attribute === "email" && !isPrivacyMinimalBusinessEmail(factValue)) continue;
    if (["phone", "email", "social_profile"].includes(attribute) && normalized(subject) !== "hotel") continue;
    const key = `${category.toLowerCase()}|${subject.toLowerCase()}|${attribute.toLowerCase()}|${factValue.toLowerCase()}`;
    const previous = seen.get(key);
    if (previous) { previous.sourceUrls = [...new Set([...(previous.sourceUrls || []), ...sourceUrls])].slice(0, 8); previous.confidence = Math.max(Number(previous.confidence || 0), Math.max(0, Math.min(1, Number(raw?.confidence || 0)))); continue; }
    seen.set(key, { category, subject, attribute, label, value: factValue, confidence: Math.max(0, Math.min(1, Number(raw?.confidence || 0))), sourceUrls } as RichFact);
  }
  return [...seen.values()].slice(0, 180) as HotelScanFact[];
}

function languageInstruction(outputLanguage: HotelScannerOutputLanguage) {
  return outputLanguage === "bg"
    ? "Write every human-readable fact label and value in Bulgarian. Preserve official hotel/venue/room/service/experience names, brand names, phone numbers, emails, URLs and technical brand tokens exactly."
    : "Write every human-readable fact label and value in English. Preserve official hotel/venue/room/service/experience names, brand names, phone numbers, emails, URLs and technical brand tokens exactly.";
}
function inputPages(pages: HotelScanEvidenceBundle["pages"], maxChars: number) {
  return pages.map((page) => ({ url: page.url, title: page.title, description: page.description, text: page.text.slice(0, maxChars) }));
}

async function runFactExtraction(evidence: HotelScanEvidenceBundle, outputLanguage: HotelScannerOutputLanguage, mode: FactExtractionMode) {
  const openai = getClient(); const model = String(process.env.OPENAI_HOTEL_SCANNER_MODEL || "gpt-5.6-luna").trim();
  const critical = mode === "critical"; const hub = mode === "hub";
  const extractionPages = critical ? selectCriticalHotelScannerPages(evidence.pages) : hub ? selectHotelScannerHubPages(evidence.pages) : evidence.pages;
  const allowedSourceUrls = extractionPages.map((page) => page.url); const allowed = new Set(allowedSourceUrls);
  const commonInstructions = [
    "Use ONLY WEBSITE_EVIDENCE. Never browse, infer from outside knowledge, or guess.",
    "This scanner is privacy-minimal. Never extract guest names, staff names, personal biographies, personal profiles, personal email addresses or direct-person contact details.",
    "For contacts, extract only property-level business channels clearly presented as hotel contacts. Generic hotel inboxes such as info@, reservations@, reception@, spa@ or sales@ are allowed; named-person inboxes are not.",
    "Do not extract content from login/account/profile/member/private/admin/payment/manage-booking areas even if referenced in page text.",
    "Never hide contradictions. If two supplied pages state different values for the same entity+attribute, emit BOTH claims with their exact source URLs.",
    "Different language variants of the same document may disagree; preserve both claims and let the verifier decide.",
    "Every fact MUST cite one or more exact URLs from ALLOWED_SOURCE_URLS.",
    "Confidence reflects clarity of the cited website statement only; high confidence does not resolve conflicts.",
    "Keep labels and values concise; paraphrase instead of copying long website text.", "Return JSON only via the requested schema.",
  ];
  const modeInstructions = critical ? [
    "Perform a CRITICAL VERIFICATION PASS over every supplied page, especially FAQ, policy, terms, hotel information, venue detail and service detail pages.",
    "Do not omit a critical rule because the comprehensive extraction already found many room or wellness facts.",
    "Extract every explicit check-in/check-out statement, pet policy, smoking policy, quiet hours, cancellation/payment rule, venue/service opening hours, external guest access rule, reservation requirement, dress code, age/children restriction, price and critical service duration rule.",
    "For dining/service access: external guest eligibility is external_access; clothing requirements are dress_code; adult/child restrictions are age_policy. Never encode those three as one generic access attribute.",
    "For duration: minutes/hours for one treatment/session are session_duration; recommended/minimum stay measured in days/nights is recommended_stay.",
    "Prefer atomic facts. A policy page with pets, smoking and quiet hours must produce separate facts.",
  ] : hub ? [
    "Build a complete evidence-backed CONTENT INVENTORY for a future mobile hotel Hub and Design Studio. This is the primary guest-facing payload, not a legal/policy dump.",
    "Treat top-level hotel landing pages such as rooms/accommodation, gastronomy/dining, services, spa/wellness, experiences/activities, events and offers as authoritative inventories of named guest-facing content.",
    "FIRST enumerate every named guest-facing item visible in each supplied inventory page. THEN add concise supporting facts for those items. Do not stop after representative examples.",
    "Extract EVERY named accommodation type, dining venue, guest service, SPA/wellness/medical service, experience/activity/nearby attraction, public event and public offer that the supplied pages explicitly support, even when the landing page only links to a detail page.",
    "Do not summarize multiple named offerings into one generic fact. Each named room, restaurant/bar, service, experience and active event/offer must remain separately addressable through subject.",
    "Accommodation: emit room_type plus separate capacity, size, bed, view, meal_inclusion, price and booking facts when present.",
    "Dining: emit every venue plus concise description, hours, external_access, booking, dress_code and price when present.",
    "Services and wellness: emit every named service/treatment/facility plus concise description, price, hours, booking, age/access and duration when present.",
    "Experiences: use category experiences and attribute experience/activity/attraction for every named on-property activity, excursion or nearby attraction; use experience_booking/access when stated.",
    "Static conference rooms, meeting rooms, wedding halls and event facilities are facilities, not current events. Represent them as category services with attribute facility unless the page describes a specific scheduled event occurrence.",
    "Events: use category events only for specific public event occurrences. Preserve explicit dates in the event fact value whenever present so the Scanner Bridge can expire or remove them correctly.",
    "Offers: use category offers and attribute offer for public packages or bookable stay/service offers, preserving explicit validity dates when present.",
    "Policies are secondary in this HUB pass. Extract only guest-essential rules that affect the stay directly (check-in/out, quiet hours, smoking, access/reservation requirements). Leave exhaustive house rules, legal conditions and fee schedules to the critical/comprehensive evidence passes.",
    "Contacts/social/location remain atomic and should not be repeated under every venue or page.",
  ] : [
    "Extract a professional, entity-aware evidence set from a hotel website for StayHub Hotel Factory and Design Studio.",
    "The goal is COMPREHENSIVE HOTEL ONBOARDING, not a marketing summary. Capture every useful operational, guest-facing, content, service, accommodation, policy, venue and design-relevant fact that the supplied pages explicitly support.",
    "Aim for 55-80 DISTINCT facts when evidence is rich. Return fewer only when the supplied website evidence is genuinely sparse.",
    "For every official room type emit a concise room_type fact whose value is ONLY the official room-type name; put capacity, size, bed/view, meal inclusion, price and description in separate facts.",
    "For every named restaurant, bar or dining venue emit a venue fact and separate hours, external_access, booking, dress_code, description or price facts when explicitly stated.",
    "For every named SPA, medical, wellness or guest service emit separate service/treatment/facility facts and separate session_duration, recommended_stay, price, age_policy, access and booking facts when explicitly stated.",
    "For every named experience/activity/nearby attraction emit a category experiences fact instead of hiding it in a generic services summary.",
    "For hotel policies emit separate atomic facts. Use pet_policy, smoking_policy, quiet_hours, cancellation_policy and payment_policy when applicable.",
    "For check-in and check-out use subject hotel and attributes check_in/check_out. For contacts use subject hotel and attributes phone/email/social_profile.",
    "For amenities and facilities emit the amenity/facility NAME as label/entity, not an access sentence. Opening-hours facts MUST name one specific facility, venue, service or guest area through subject.",
  ];

  const maxItems = critical ? 40 : hub ? 140 : 80;
  const response = await openai.responses.create({
    model, store: false, max_output_tokens: critical ? 4_200 : hub ? 12_000 : 8_200, reasoning: { effort: "none" },
    instructions: [...modeInstructions, languageInstruction(outputLanguage), ...commonInstructions,
      `category MUST be one canonical lowercase machine key from: ${FACT_CATEGORIES.join(", ")}.`,
      `attribute MUST be one canonical machine key from: ${FACT_ATTRIBUTES.join(", ")}.`,
      "subject identifies the hotel entity the fact is about: hotel for property-wide facts; exact official room type for room facts; exact venue name for restaurant/bar facts; exact SPA/medical/service/experience name for those facts.",
    ].join("\n"),
    input: JSON.stringify({ MODE: mode, OUTPUT_LANGUAGE: outputLanguage, ALLOWED_SOURCE_URLS: allowedSourceUrls, WEBSITE_EVIDENCE: inputPages(extractionPages, critical ? 7_500 : hub ? 20_000 : 6_000) }),
    text: { format: { type: "json_schema", name: `stayhub_hotel_scan_${mode}_facts_v5`, strict: true, schema: {
      type: "object", additionalProperties: false, properties: { facts: { type: "array", minItems: 1, maxItems, items: {
        type: "object", additionalProperties: false, properties: {
          category: { type: "string", enum: FACT_CATEGORIES }, subject: { type: "string" }, attribute: { type: "string", enum: FACT_ATTRIBUTES },
          label: { type: "string" }, value: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 },
          sourceUrls: { type: "array", items: { type: "string", enum: allowedSourceUrls }, minItems: 1, maxItems: 8 },
        }, required: ["category", "subject", "attribute", "label", "value", "confidence", "sourceUrls"],
      } } }, required: ["facts"],
    } } },
  });
  if (response.status === "incomplete") return [];
  const outputText = String(response.output_text || "").trim();
  if (!outputText) return [];
  return parseFacts(outputText, allowed);
}

function mergeExtractions(...collections: HotelScanFact[][]) {
  const byKey = new Map<string, RichFact>();
  for (const fact of collections.flat()) {
    const enriched = fact as RichFact;
    const key = `${normalized(enriched.category)}|${normalized(enriched.subject)}|${normalized(enriched.attribute)}|${normalized(enriched.value)}`;
    if (!key) continue;
    const previous = byKey.get(key);
    if (!previous) {
      byKey.set(key, { ...enriched, sourceUrls: [...new Set(enriched.sourceUrls || [])] });
      continue;
    }
    previous.sourceUrls = [...new Set([...(previous.sourceUrls || []), ...(enriched.sourceUrls || [])])].slice(0, 8);
    previous.confidence = Math.max(Number(previous.confidence || 0), Number(enriched.confidence || 0));
  }
  return [...byKey.values()].slice(0, 220) as HotelScanFact[];
}

export async function extractRichHotelScanFactsWithOpenAi(evidence: HotelScanEvidenceBundle, outputLanguage: HotelScannerOutputLanguage) {
  const deterministic = extractHotelScannerCriticalClaims(evidence.pages, outputLanguage) as HotelScanFact[];
  const [critical, hub, comprehensive] = await Promise.all([
    runFactExtraction(evidence, outputLanguage, "critical").catch(() => [] as HotelScanFact[]),
    runFactExtraction(evidence, outputLanguage, "hub").catch(() => [] as HotelScanFact[]),
    runFactExtraction(evidence, outputLanguage, "comprehensive").catch(() => [] as HotelScanFact[]),
  ]);
  return mergeExtractions(deterministic, hub, critical, comprehensive);
}