import OpenAI from "openai";

import type { HotelScanEvidenceBundle } from "@/lib/server/factory-hotel-scanner";

let client: OpenAI | null = null;

function getClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("openai_api_key_missing");
  if (!client) client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 });
  return client;
}

function clean(value: unknown, max = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

function unique(values: unknown[], max = 30, itemMax = 300) {
  return [...new Set(values.map((value) => clean(value, itemMax)).filter(Boolean))].slice(0, max);
}

function safeUrl(value: unknown, allowedOrigins: Set<string>) {
  const raw = clean(value, 2_048);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return allowedOrigins.has(url.origin) && ['http:', 'https:'].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

export type HotelScanFact = {
  category: string;
  label: string;
  value: string;
  confidence: number;
  sourceUrls: string[];
};

export type HotelScanProfile = {
  schemaVersion: "hotel-scan-v1";
  source: {
    requestedUrl: string;
    canonicalUrl: string;
    scannedAt: string;
    pageCount: number;
  };
  identity: {
    hotelName: string;
    summary: string;
    address: string;
    city: string;
    country: string;
    bookingUrl: string;
    contactUrl: string;
  };
  contacts: {
    phones: string[];
    emails: string[];
    socialLinks: string[];
  };
  operations: {
    checkIn: string;
    checkOut: string;
    languages: string[];
  };
  hospitality: {
    roomTypes: string[];
    amenities: string[];
    venues: Array<{ name: string; type: string; hours: string; summary: string }>;
    spaServices: string[];
    policies: string[];
  };
  brand: {
    logoUrls: string[];
    imageUrls: string[];
    colors: string[];
    styleKeywords: string[];
  };
  facts: HotelScanFact[];
  uncertainties: string[];
};

type AiHotelScanPayload = Omit<HotelScanProfile, "schemaVersion" | "source">;

function parsePayload(value: string): AiHotelScanPayload {
  const parsed = JSON.parse(value) as AiHotelScanPayload;
  if (!parsed || typeof parsed !== "object") throw new Error("hotel_scanner_invalid_json");
  return parsed;
}

function normalizeProfile(payload: AiHotelScanPayload, evidence: HotelScanEvidenceBundle): HotelScanProfile {
  const sourceUrls = new Set(evidence.pages.map((page) => page.url));
  const imageUrls = new Set(evidence.pages.flatMap((page) => page.imageUrls));
  const allowedOrigins = new Set(evidence.pages.map((page) => new URL(page.url).origin));
  const detectedColors = new Set(evidence.pages.flatMap((page) => page.colors).map((value) => value.toLowerCase()));

  const normalizeFact = (fact: HotelScanFact): HotelScanFact | null => {
    const value = clean(fact?.value, 500);
    const label = clean(fact?.label, 120);
    if (!value || !label) return null;
    const urls = Array.isArray(fact?.sourceUrls)
      ? unique(fact.sourceUrls.filter((url) => sourceUrls.has(String(url))), 6, 2_048)
      : [];
    if (!urls.length) return null;
    return {
      category: clean(fact?.category, 80) || "hotel",
      label,
      value,
      confidence: Math.max(0, Math.min(1, Number(fact?.confidence || 0))),
      sourceUrls: urls,
    };
  };

  const venues = Array.isArray(payload?.hospitality?.venues)
    ? payload.hospitality.venues.slice(0, 30).map((venue) => ({
        name: clean(venue?.name, 160),
        type: clean(venue?.type, 80),
        hours: clean(venue?.hours, 160),
        summary: clean(venue?.summary, 360),
      })).filter((venue) => venue.name)
    : [];

  const rawBrandImages = Array.isArray(payload?.brand?.imageUrls) ? payload.brand.imageUrls : [];
  const rawLogoUrls = Array.isArray(payload?.brand?.logoUrls) ? payload.brand.logoUrls : [];

  return {
    schemaVersion: "hotel-scan-v1",
    source: {
      requestedUrl: evidence.requestedUrl,
      canonicalUrl: evidence.canonicalUrl,
      scannedAt: evidence.scannedAt,
      pageCount: evidence.pages.length,
    },
    identity: {
      hotelName: clean(payload?.identity?.hotelName, 160),
      summary: clean(payload?.identity?.summary, 700),
      address: clean(payload?.identity?.address, 300),
      city: clean(payload?.identity?.city, 120),
      country: clean(payload?.identity?.country, 120),
      bookingUrl: safeUrl(payload?.identity?.bookingUrl, allowedOrigins),
      contactUrl: safeUrl(payload?.identity?.contactUrl, allowedOrigins),
    },
    contacts: {
      phones: unique(Array.isArray(payload?.contacts?.phones) ? payload.contacts.phones : [], 12, 80),
      emails: unique(Array.isArray(payload?.contacts?.emails) ? payload.contacts.emails : [], 12, 200),
      socialLinks: unique(Array.isArray(payload?.contacts?.socialLinks) ? payload.contacts.socialLinks : [], 20, 2_048),
    },
    operations: {
      checkIn: clean(payload?.operations?.checkIn, 120),
      checkOut: clean(payload?.operations?.checkOut, 120),
      languages: unique(Array.isArray(payload?.operations?.languages) ? payload.operations.languages : [], 20, 80),
    },
    hospitality: {
      roomTypes: unique(Array.isArray(payload?.hospitality?.roomTypes) ? payload.hospitality.roomTypes : [], 50, 160),
      amenities: unique(Array.isArray(payload?.hospitality?.amenities) ? payload.hospitality.amenities : [], 80, 160),
      venues,
      spaServices: unique(Array.isArray(payload?.hospitality?.spaServices) ? payload.hospitality.spaServices : [], 50, 160),
      policies: unique(Array.isArray(payload?.hospitality?.policies) ? payload.hospitality.policies : [], 40, 300),
    },
    brand: {
      logoUrls: unique(rawLogoUrls.filter((url) => imageUrls.has(String(url))), 8, 2_048),
      imageUrls: unique(rawBrandImages.filter((url) => imageUrls.has(String(url))), 20, 2_048),
      colors: unique(
        (Array.isArray(payload?.brand?.colors) ? payload.brand.colors : [])
          .map((value) => String(value).toLowerCase())
          .filter((value) => detectedColors.has(value)),
        12,
        16,
      ),
      styleKeywords: unique(Array.isArray(payload?.brand?.styleKeywords) ? payload.brand.styleKeywords : [], 12, 80),
    },
    facts: (Array.isArray(payload?.facts) ? payload.facts : [])
      .map(normalizeFact)
      .filter((fact): fact is HotelScanFact => Boolean(fact))
      .slice(0, 80),
    uncertainties: unique(Array.isArray(payload?.uncertainties) ? payload.uncertainties : [], 30, 300),
  };
}

export async function normalizeHotelScanWithOpenAi(evidence: HotelScanEvidenceBundle) {
  const openai = getClient();
  const model = String(
    process.env.OPENAI_HOTEL_SCANNER_MODEL || process.env.OPENAI_HOTEL_MODEL || "gpt-5-mini",
  ).trim();
  const allowedSourceUrls = evidence.pages.map((page) => page.url);
  const detectedImageUrls = [...new Set(evidence.pages.flatMap((page) => page.imageUrls))].slice(0, 80);
  const detectedColors = [...new Set(evidence.pages.flatMap((page) => page.colors))].slice(0, 24);

  const inputPages = evidence.pages.map((page) => ({
    url: page.url,
    title: page.title,
    description: page.description,
    text: page.text.slice(0, 10_000),
    image_urls: page.imageUrls.slice(0, 20),
    colors: page.colors,
  }));

  const startedAt = Date.now();
  const response = await openai.responses.create({
    model,
    store: false,
    max_output_tokens: 5_000,
    reasoning: { effort: "low" },
    instructions: [
      "You normalize public hotel website evidence for StayHub Hotel Factory.",
      "Use ONLY the supplied WEBSITE_EVIDENCE. Never browse and never use outside knowledge.",
      "Every factual claim in facts must include one or more exact source URLs from ALLOWED_SOURCE_URLS.",
      "If the evidence does not clearly support a field, return an empty string/array and add a short uncertainty instead of guessing.",
      "Do not infer star rating, prices, opening hours, check-in/out, amenities, policies or services unless stated in the evidence.",
      "Prefer concise paraphrases. Do not reproduce long website copy.",
      "bookingUrl and contactUrl must be same-site URLs visible in the evidence; otherwise return an empty string.",
      "logoUrls and imageUrls must be selected only from DETECTED_IMAGE_URLS.",
      "colors must be selected only from DETECTED_COLORS.",
      "styleKeywords should describe observable visual direction only, such as minimal, coastal, classic, family, wellness, luxury, playful, dark or bright.",
      "This output is a DRAFT for human review. It must never imply that a hotel has been created, published or activated.",
    ].join("\n"),
    input: JSON.stringify({
      ALLOWED_SOURCE_URLS: allowedSourceUrls,
      DETECTED_IMAGE_URLS: detectedImageUrls,
      DETECTED_COLORS: detectedColors,
      WEBSITE_EVIDENCE: inputPages,
    }),
    text: {
      format: {
        type: "json_schema",
        name: "stayhub_hotel_scan_profile",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            identity: {
              type: "object",
              additionalProperties: false,
              properties: {
                hotelName: { type: "string" },
                summary: { type: "string" },
                address: { type: "string" },
                city: { type: "string" },
                country: { type: "string" },
                bookingUrl: { type: "string" },
                contactUrl: { type: "string" },
              },
              required: ["hotelName", "summary", "address", "city", "country", "bookingUrl", "contactUrl"],
            },
            contacts: {
              type: "object",
              additionalProperties: false,
              properties: {
                phones: { type: "array", items: { type: "string" }, maxItems: 12 },
                emails: { type: "array", items: { type: "string" }, maxItems: 12 },
                socialLinks: { type: "array", items: { type: "string" }, maxItems: 20 },
              },
              required: ["phones", "emails", "socialLinks"],
            },
            operations: {
              type: "object",
              additionalProperties: false,
              properties: {
                checkIn: { type: "string" },
                checkOut: { type: "string" },
                languages: { type: "array", items: { type: "string" }, maxItems: 20 },
              },
              required: ["checkIn", "checkOut", "languages"],
            },
            hospitality: {
              type: "object",
              additionalProperties: false,
              properties: {
                roomTypes: { type: "array", items: { type: "string" }, maxItems: 50 },
                amenities: { type: "array", items: { type: "string" }, maxItems: 80 },
                venues: {
                  type: "array",
                  maxItems: 30,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" },
                      type: { type: "string" },
                      hours: { type: "string" },
                      summary: { type: "string" },
                    },
                    required: ["name", "type", "hours", "summary"],
                  },
                },
                spaServices: { type: "array", items: { type: "string" }, maxItems: 50 },
                policies: { type: "array", items: { type: "string" }, maxItems: 40 },
              },
              required: ["roomTypes", "amenities", "venues", "spaServices", "policies"],
            },
            brand: {
              type: "object",
              additionalProperties: false,
              properties: {
                logoUrls: { type: "array", items: { type: "string" }, maxItems: 8 },
                imageUrls: { type: "array", items: { type: "string" }, maxItems: 20 },
                colors: { type: "array", items: { type: "string" }, maxItems: 12 },
                styleKeywords: { type: "array", items: { type: "string" }, maxItems: 12 },
              },
              required: ["logoUrls", "imageUrls", "colors", "styleKeywords"],
            },
            facts: {
              type: "array",
              maxItems: 80,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  category: { type: "string" },
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
                required: ["category", "label", "value", "confidence", "sourceUrls"],
              },
            },
            uncertainties: { type: "array", items: { type: "string" }, maxItems: 30 },
          },
          required: ["identity", "contacts", "operations", "hospitality", "brand", "facts", "uncertainties"],
        },
      },
    },
  });

  if (response.status === "incomplete") {
    throw new Error(`hotel_scanner_ai_incomplete:${response.incomplete_details?.reason || "unknown"}`);
  }
  const outputText = String(response.output_text || "").trim();
  if (!outputText) throw new Error("hotel_scanner_ai_empty");

  const profile = normalizeProfile(parsePayload(outputText), evidence);
  return {
    profile,
    diagnostics: {
      model,
      latencyMs: Date.now() - startedAt,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      pageCount: evidence.pages.length,
    },
  };
}
