import OpenAI from "openai";

import type { HotelScanEvidenceBundle } from "@/lib/server/factory-hotel-scanner";
import type { HotelScanFact } from "@/lib/ai/hotel-scanner";

let client: OpenAI | null = null;

const FACT_CATEGORIES = [
  "identity",
  "location",
  "contact",
  "operations",
  "accommodation",
  "dining",
  "amenities",
  "wellness",
  "events",
  "policy",
  "sustainability",
  "family",
  "beach",
  "parking",
  "services",
  "brand",
  "hotel",
] as const;

const FACT_ATTRIBUTES = [
  "name",
  "description",
  "address",
  "phone",
  "email",
  "social_profile",
  "check_in",
  "check_out",
  "language",
  "room_type",
  "capacity",
  "size",
  "bed",
  "view",
  "meal_inclusion",
  "price",
  "hours",
  "external_access",
  "access",
  "venue",
  "amenity",
  "facility",
  "service",
  "treatment",
  "duration",
  "booking",
  "pet_policy",
  "smoking_policy",
  "quiet_hours",
  "cancellation_policy",
  "payment_policy",
  "parking",
  "wifi",
  "offer",
  "other",
] as const;

export type HotelScannerOutputLanguage = "bg" | "en";

type RichFact = HotelScanFact & { subject?: string; attribute?: string };

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

function isGenericHoursLabel(label: string) {
  const normalized = label.toLocaleLowerCase("bg-BG").replace(/\s+/g, " ").trim();
  if (["работно време", "часове", "hours", "opening hours"].includes(normalized)) return true;
  const bulgarianHours = normalized.includes("работно време") || normalized.includes("часове");
  if (bulgarianHours && /(удобств|обект|услуг)/u.test(normalized)) return true;
  const englishHours = normalized.includes("hours");
  return englishHours && /(amenit|facilit|venue|service)/u.test(normalized);
}

function parseFacts(value: string, allowed: Set<string>): HotelScanFact[] {
  const parsed = JSON.parse(value) as { facts?: RichFact[] };
  if (!parsed || !Array.isArray(parsed.facts)) return [];

  const seen = new Set<string>();
  const result: HotelScanFact[] = [];
  for (const raw of parsed.facts) {
    const category = clean(raw?.category, 80) || "hotel";
    const subject = clean(raw?.subject, 160) || "hotel";
    const attribute = clean(raw?.attribute, 80) || "other";
    const label = clean(raw?.label, 120);
    const factValue = clean(raw?.value, 500);
    const sourceUrls = [...new Set((Array.isArray(raw?.sourceUrls) ? raw.sourceUrls : [])
      .map((url) => String(url))
      .filter((url) => allowed.has(url)))].slice(0, 6);
    if (!label || !factValue || !sourceUrls.length || isGenericHoursLabel(label)) continue;
    const key = `${category.toLowerCase()}|${subject.toLowerCase()}|${attribute.toLowerCase()}|${factValue.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      category,
      subject,
      attribute,
      label,
      value: factValue,
      confidence: Math.max(0, Math.min(1, Number(raw?.confidence || 0))),
      sourceUrls,
    } as HotelScanFact);
    if (result.length >= 64) break;
  }
  return result;
}

export async function extractRichHotelScanFactsWithOpenAi(
  evidence: HotelScanEvidenceBundle,
  outputLanguage: HotelScannerOutputLanguage,
) {
  const openai = getClient();
  const model = String(process.env.OPENAI_HOTEL_SCANNER_MODEL || "gpt-5.6-luna").trim();
  const allowedSourceUrls = evidence.pages.map((page) => page.url);
  const allowed = new Set(allowedSourceUrls);
  const languageInstruction = outputLanguage === "bg"
    ? "Write every human-readable fact label and value in Bulgarian. Preserve official hotel/venue/room/service names, brand names, phone numbers, emails, URLs and technical brand tokens exactly."
    : "Write every human-readable fact label and value in English. Preserve official hotel/venue/room/service names, brand names, phone numbers, emails, URLs and technical brand tokens exactly.";

  const inputPages = evidence.pages.map((page) => ({
    url: page.url,
    title: page.title,
    description: page.description,
    text: page.text.slice(0, 6_000),
  }));

  const response = await openai.responses.create({
    model,
    store: false,
    max_output_tokens: 6_800,
    reasoning: { effort: "none" },
    instructions: [
      "Extract a professional, entity-aware evidence set from a hotel website for StayHub Hotel Factory and Design Studio.",
      languageInstruction,
      "Use ONLY WEBSITE_EVIDENCE. Never browse, infer from outside knowledge, or guess.",
      "The goal is COMPREHENSIVE HOTEL ONBOARDING, not a marketing summary. Capture every useful operational, guest-facing, content, service, accommodation, policy, venue and design-relevant fact that the supplied pages explicitly support.",
      "Aim for 40-64 DISTINCT facts when the evidence is rich. Return fewer only when the supplied website evidence is genuinely sparse.",
      `category MUST be one canonical lowercase machine key from: ${FACT_CATEGORIES.join(", ")}.`,
      `attribute MUST be one canonical machine key from: ${FACT_ATTRIBUTES.join(", ")}.`,
      "subject identifies the hotel entity the fact is about: hotel for property-wide facts; exact official room type for room facts; exact venue name for restaurant/bar facts; exact SPA/medical/service name for service facts.",
      "For every official room type emit a room_type fact, then separate capacity, size, bed/view, meal inclusion and price facts when explicitly stated.",
      "For every named restaurant, bar or dining venue emit a venue fact and separate hours, access, booking, description or price facts when explicitly stated.",
      "For every named SPA, medical, wellness or guest service emit separate service/treatment facts and duration/price/access/booking facts when explicitly stated.",
      "For hotel policies emit separate atomic facts. Use pet_policy, smoking_policy, quiet_hours, cancellation_policy and payment_policy when applicable.",
      "For check-in and check-out use subject hotel and attributes check_in/check_out.",
      "For contacts use subject hotel and attributes phone/email/social_profile.",
      "For amenities and facilities emit atomic facts rather than one comma-separated mega-fact.",
      "Never hide contradictions. If two supplied pages state different values for the same entity+attribute, emit BOTH claims with their exact source URLs. A later verification layer will mark the conflict.",
      "If identical claims appear on multiple materially different pages, include all supporting source URLs on the same fact when possible.",
      "Different language variants of the same document may support a claim, but do not treat translation differences as permission to choose one side of a contradiction.",
      "Opening-hours facts MUST name one specific facility, venue, service or guest area through subject. Never emit generic hours facts.",
      "Do not duplicate the same claim under cosmetic label variants.",
      "Every fact MUST cite one or more exact URLs from ALLOWED_SOURCE_URLS.",
      "Confidence reflects clarity of the cited website statement only; high confidence does not resolve conflicts.",
      "Keep labels and values concise; paraphrase instead of copying long website text.",
      "Return JSON only via the requested schema.",
    ].join("\n"),
    input: JSON.stringify({
      OUTPUT_LANGUAGE: outputLanguage,
      ALLOWED_SOURCE_URLS: allowedSourceUrls,
      WEBSITE_EVIDENCE: inputPages,
    }),
    text: {
      format: {
        type: "json_schema",
        name: "stayhub_hotel_scan_rich_facts_v2",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            facts: {
              type: "array",
              minItems: 1,
              maxItems: 64,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  category: { type: "string", enum: FACT_CATEGORIES },
                  subject: { type: "string" },
                  attribute: { type: "string", enum: FACT_ATTRIBUTES },
                  label: { type: "string" },
                  value: { type: "string" },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                  sourceUrls: {
                    type: "array",
                    items: { type: "string", enum: allowedSourceUrls },
                    minItems: 1,
                    maxItems: 6,
                  },
                },
                required: ["category", "subject", "attribute", "label", "value", "confidence", "sourceUrls"],
              },
            },
          },
          required: ["facts"],
        },
      },
    },
  });

  if (response.status === "incomplete") return [];
  const outputText = String(response.output_text || "").trim();
  if (!outputText) return [];
  return parseFacts(outputText, allowed);
}
