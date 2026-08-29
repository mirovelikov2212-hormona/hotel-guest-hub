import OpenAI from "openai";

import type { HotelScanEvidenceBundle } from "@/lib/server/factory-hotel-scanner";

let client: OpenAI | null = null;

export type HotelScannerOutputLanguage = "bg" | "en";

function getClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("openai_api_key_missing");
  if (!client) client = new OpenAI({ apiKey, timeout: 20_000, maxRetries: 0 });
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
    return allowedOrigins.has(url.origin) && ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
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
    fonts: string[];
    styleKeywords: string[];
  };
  facts: HotelScanFact[];
  uncertainties: string[];
};

type AiHotelScanPayload = Omit<HotelScanProfile, "schemaVersion" | "source" | "brand" | "facts"> & {
  brand: {
    logoUrls: string[];
    imageUrls: string[];
    styleKeywords: string[];
  };
};

function parsePayload(value: string): AiHotelScanPayload {
  const parsed = JSON.parse(value) as AiHotelScanPayload;
  if (!parsed || typeof parsed !== "object") throw new Error("hotel_scanner_invalid_json");
  return parsed;
}

function normalizeProfile(payload: AiHotelScanPayload, evidence: HotelScanEvidenceBundle): HotelScanProfile {
  const imageUrls = new Set(evidence.pages.flatMap((page) => page.imageUrls));
  const allowedOrigins = new Set(evidence.pages.map((page) => new URL(page.url).origin));

  const venues = Array.isArray(payload?.hospitality?.venues)
    ? payload.hospitality.venues.slice(0, 20).map((venue) => ({
        name: clean(venue?.name, 160),
        type: clean(venue?.type, 80),
        hours: clean(venue?.hours, 160),
        summary: clean(venue?.summary, 320),
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
      summary: clean(payload?.identity?.summary, 600),
      address: clean(payload?.identity?.address, 300),
      city: clean(payload?.identity?.city, 120),
      country: clean(payload?.identity?.country, 120),
      bookingUrl: safeUrl(payload?.identity?.bookingUrl, allowedOrigins),
      contactUrl: safeUrl(payload?.identity?.contactUrl, allowedOrigins),
    },
    contacts: {
      phones: unique(Array.isArray(payload?.contacts?.phones) ? payload.contacts.phones : [], 10, 80),
      emails: unique(Array.isArray(payload?.contacts?.emails) ? payload.contacts.emails : [], 10, 200),
      socialLinks: unique(Array.isArray(payload?.contacts?.socialLinks) ? payload.contacts.socialLinks : [], 12, 2_048),
    },
    operations: {
      checkIn: clean(payload?.operations?.checkIn, 120),
      checkOut: clean(payload?.operations?.checkOut, 120),
      languages: unique(Array.isArray(payload?.operations?.languages) ? payload.operations.languages : [], 12, 80),
    },
    hospitality: {
      roomTypes: unique(Array.isArray(payload?.hospitality?.roomTypes) ? payload.hospitality.roomTypes : [], 30, 160),
      amenities: unique(Array.isArray(payload?.hospitality?.amenities) ? payload.hospitality.amenities : [], 40, 160),
      venues,
      spaServices: unique(Array.isArray(payload?.hospitality?.spaServices) ? payload.hospitality.spaServices : [], 30, 160),
      policies: unique(Array.isArray(payload?.hospitality?.policies) ? payload.hospitality.policies : [], 24, 300),
    },
    brand: {
      logoUrls: unique(rawLogoUrls.filter((url) => imageUrls.has(String(url))), 6, 2_048),
      imageUrls: unique(rawBrandImages.filter((url) => imageUrls.has(String(url))), 16, 2_048),
      colors: unique(evidence.brand.colors, 12, 16),
      fonts: unique(evidence.brand.fonts, 8, 100),
      styleKeywords: unique(Array.isArray(payload?.brand?.styleKeywords) ? payload.brand.styleKeywords : [], 10, 80),
    },
    facts: [],
    uncertainties: unique(Array.isArray(payload?.uncertainties) ? payload.uncertainties : [], 20, 300),
  };
}

export async function normalizeHotelScanWithOpenAi(
  evidence: HotelScanEvidenceBundle,
  outputLanguage: HotelScannerOutputLanguage,
) {
  const openai = getClient();
  const model = String(process.env.OPENAI_HOTEL_SCANNER_MODEL || "gpt-5.6-luna").trim();
  const allowedSourceUrls = evidence.pages.map((page) => page.url);
  const detectedImageUrls = [...new Set(evidence.pages.flatMap((page) => page.imageUrls))].slice(0, 50);
  const languageInstruction = outputLanguage === "bg"
    ? "Write ALL human-readable review content in Bulgarian: summary, address/city/country wording, language names, room/service/venue/policy text, style keywords and uncertainty text. Preserve official hotel/venue names, brand names, phones, emails, URLs, CSS colors and font family names exactly."
    : "Write ALL human-readable review content in English: summary, address/city/country wording, language names, room/service/venue/policy text, style keywords and uncertainty text. Preserve official hotel/venue names, brand names, phones, emails, URLs, CSS colors and font family names exactly.";

  const inputPages = evidence.pages.map((page) => ({
    url: page.url,
    title: page.title,
    description: page.description,
    text: page.text.slice(0, 3_000),
    image_urls: page.imageUrls.slice(0, 10),
  }));

  const startedAt = Date.now();
  const response = await openai.responses.create({
    model,
    store: false,
    max_output_tokens: 1_800,
    reasoning: { effort: "none" },
    instructions: [
      "Normalize public hotel website evidence into a concise StayHub core profile draft.",
      languageInstruction,
      "Use ONLY WEBSITE_EVIDENCE and DETECTED_BRAND_SIGNALS. Never browse or use outside knowledge.",
      "If a field is not clearly supported, return empty data and add a short uncertainty. Never guess.",
      "Do not infer prices, hours, check-in/out, amenities, policies or services unless stated in evidence.",
      "Prefer short paraphrases; never reproduce long website copy.",
      "bookingUrl/contactUrl must be same-site evidence URLs or empty.",
      "logoUrls/imageUrls must come only from DETECTED_IMAGE_URLS.",
      "Brand colors and fonts are deterministic CSS evidence supplied in DETECTED_BRAND_SIGNALS; do not invent or replace them.",
      "If detected colors or fonts are non-empty, do not report them as missing.",
      "styleKeywords may summarize the observable design direction using the supplied colors, fonts, images and page evidence.",
      "Do not generate evidence fact cards here; a separate bounded extractor owns the rich fact review.",
      "Keep arrays concise and prioritize the most useful onboarding and hub-design information.",
      "This is a human-review DRAFT and never means created, published or activated.",
    ].join("\n"),
    input: JSON.stringify({
      OUTPUT_LANGUAGE: outputLanguage,
      ALLOWED_SOURCE_URLS: allowedSourceUrls,
      DETECTED_IMAGE_URLS: detectedImageUrls,
      DETECTED_BRAND_SIGNALS: {
        colors: evidence.brand.colors,
        fonts: evidence.brand.fonts,
        stylesheet_urls: evidence.brand.stylesheetUrls,
      },
      WEBSITE_EVIDENCE: inputPages,
    }),
    text: {
      format: {
        type: "json_schema",
        name: "stayhub_hotel_scan_core_profile",
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
                phones: { type: "array", items: { type: "string" }, maxItems: 10 },
                emails: { type: "array", items: { type: "string" }, maxItems: 10 },
                socialLinks: { type: "array", items: { type: "string" }, maxItems: 12 },
              },
              required: ["phones", "emails", "socialLinks"],
            },
            operations: {
              type: "object",
              additionalProperties: false,
              properties: {
                checkIn: { type: "string" },
                checkOut: { type: "string" },
                languages: { type: "array", items: { type: "string" }, maxItems: 12 },
              },
              required: ["checkIn", "checkOut", "languages"],
            },
            hospitality: {
              type: "object",
              additionalProperties: false,
              properties: {
                roomTypes: { type: "array", items: { type: "string" }, maxItems: 24 },
                amenities: { type: "array", items: { type: "string" }, maxItems: 32 },
                venues: {
                  type: "array",
                  maxItems: 16,
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
                spaServices: { type: "array", items: { type: "string" }, maxItems: 24 },
                policies: { type: "array", items: { type: "string" }, maxItems: 18 },
              },
              required: ["roomTypes", "amenities", "venues", "spaServices", "policies"],
            },
            brand: {
              type: "object",
              additionalProperties: false,
              properties: {
                logoUrls: { type: "array", items: { type: "string" }, maxItems: 6 },
                imageUrls: { type: "array", items: { type: "string" }, maxItems: 16 },
                styleKeywords: { type: "array", items: { type: "string" }, maxItems: 10 },
              },
              required: ["logoUrls", "imageUrls", "styleKeywords"],
            },
            uncertainties: { type: "array", items: { type: "string" }, maxItems: 16 },
          },
          required: ["identity", "contacts", "operations", "hospitality", "brand", "uncertainties"],
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
      stylesheetCount: evidence.brand.stylesheetUrls.length,
      detectedColorCount: evidence.brand.colors.length,
      detectedFontCount: evidence.brand.fonts.length,
    },
  };
}
