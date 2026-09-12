import OpenAI from "openai";

import type { HotelScanFact } from "@/lib/ai/hotel-scanner";
import type { HotelScannerV2Inventory } from "@/lib/server/hotel-scanner-v2-inventory.mjs";
import type { HotelScannerV2OutputLanguage } from "@/lib/ai/hotel-scanner-v2-domain-extractors";
import { fetchPublicBinaryV2 } from "@/lib/server/hotel-scanner-v2-network";

let client: OpenAI | null = null;

const MAX_DOCUMENTS_PER_SCAN = 16;
const MAX_DOCUMENT_BYTES = 10_000_000;
const DOCUMENT_TIMEOUT_MS = 10_000;
const USER_AGENT = "StayHub-Hotel-Scanner/2.0 (+https://stayhub.app)";

const DOCUMENT_CATEGORIES = [
  "accommodation", "dining", "wellness", "services", "amenities", "events", "experiences", "offers", "policy", "operations", "contact", "location",
] as const;
const DOCUMENT_ATTRIBUTES = [
  "room_type", "capacity", "size", "bed", "view", "meal_inclusion", "price", "hours", "external_access", "access", "dress_code", "age_policy",
  "venue", "amenity", "facility", "service", "treatment", "treatment_category", "technology", "equipment", "session_duration", "recommended_stay", "booking",
  "experience", "activity", "attraction", "experience_access", "experience_booking", "event", "event_capacity", "event_service", "offer", "validity",
  "pet_policy", "smoking_policy", "quiet_hours", "cancellation_policy", "payment_policy", "check_in", "check_out",
  "phone", "email", "website", "social_profile", "address", "description", "other",
] as const;

const SOCIAL_HOST = /(?:^|\.)(?:facebook\.com|instagram\.com|tiktok\.com|linkedin\.com|youtube\.com|youtu\.be|x\.com|twitter\.com)$/iu;

export type HotelScannerV2DocumentStatus = "INGESTED" | "FAILED" | "SKIPPED_LIMIT";
export type HotelScannerV2DocumentResult = {
  url: string;
  status: HotelScannerV2DocumentStatus;
  domains: string[];
  facts: HotelScanFact[];
  byteCount?: number;
  error?: string;
  latencyMs: number;
};

export type HotelScannerV2DocumentIngestionResult = {
  schemaVersion: "hotel-document-ingestion-v2";
  documents: HotelScannerV2DocumentResult[];
  facts: HotelScanFact[];
  diagnostics: {
    model: string;
    discoveredDocumentCount: number;
    ingestedDocumentCount: number;
    failedDocumentCount: number;
    skippedDocumentCount: number;
  };
};

function getClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("openai_api_key_missing");
  if (!client) client = new OpenAI({ apiKey, timeout: 45_000, maxRetries: 0 });
  return client;
}

function clean(value: unknown, max = 500) {
  const text = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : text.slice(0, max);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function filenameForUrl(rawUrl: string) {
  try {
    const pathname = decodeURIComponent(new URL(rawUrl).pathname);
    const raw = pathname.split("/").filter(Boolean).pop() || "hotel-document.pdf";
    const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
    return /\.pdf$/i.test(safe) ? safe : `${safe || "hotel-document"}.pdf`;
  } catch {
    return "hotel-document.pdf";
  }
}

function isPdf(buffer: Buffer) {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function hostnameFromValue(raw: string) {
  const value = clean(raw, 500).replace(/^www\./iu, "");
  try {
    return new URL(/^https?:\/\//iu.test(value) ? value : `https://${value}`).hostname.toLocaleLowerCase("en-US");
  } catch {
    return "";
  }
}

function normalizeContactAttribute(category: string, attribute: string, value: string) {
  if (!["contact", "location"].includes(category)) return attribute;
  const hostname = hostnameFromValue(value);
  if (attribute === "social_profile" && hostname && !SOCIAL_HOST.test(hostname)) return "website";
  if (attribute === "website" && hostname && SOCIAL_HOST.test(hostname)) return "social_profile";
  return attribute;
}

function parseFacts(value: string, sourceUrl: string) {
  const parsed = JSON.parse(value) as { facts?: Array<Record<string, unknown>> };
  if (!parsed || !Array.isArray(parsed.facts)) return [] as HotelScanFact[];
  const seen = new Set<string>();
  const facts: HotelScanFact[] = [];
  for (const raw of parsed.facts) {
    const category = clean(raw.category, 80).toLocaleLowerCase("en-US");
    const parsedAttribute = clean(raw.attribute, 80).toLocaleLowerCase("en-US");
    const subject = clean(raw.subject, 160) || "hotel";
    const label = clean(raw.label, 160);
    const factValue = clean(raw.value, 700);
    const attribute = normalizeContactAttribute(category, parsedAttribute, factValue);
    const confidence = Math.max(0, Math.min(1, Number(raw.confidence || 0)));
    if (!DOCUMENT_CATEGORIES.includes(category as (typeof DOCUMENT_CATEGORIES)[number])) continue;
    if (!DOCUMENT_ATTRIBUTES.includes(attribute as (typeof DOCUMENT_ATTRIBUTES)[number])) continue;
    if (!label || !factValue) continue;
    const key = `${category}|${subject.toLocaleLowerCase("en-US")}|${attribute}|${factValue.toLocaleLowerCase("en-US")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({
      category,
      subject,
      attribute,
      label,
      value: factValue,
      confidence,
      sourceUrls: [sourceUrl],
    } as HotelScanFact);
  }
  return facts;
}

function languageInstruction(outputLanguage: HotelScannerV2OutputLanguage) {
  return outputLanguage === "bg"
    ? "Write human-readable labels and descriptions in Bulgarian; preserve official entity names, prices, dates, times, phones and emails exactly."
    : "Write human-readable labels and descriptions in English; preserve official entity names, prices, dates, times, phones and emails exactly.";
}

async function ingestOne(
  document: HotelScannerV2Inventory["documents"][number],
  canonicalOrigin: string,
  outputLanguage: HotelScannerV2OutputLanguage,
  model: string,
): Promise<HotelScannerV2DocumentResult> {
  const startedAt = Date.now();
  try {
    const fetched = await fetchPublicBinaryV2(new URL(document.url), {
      timeoutMs: DOCUMENT_TIMEOUT_MS,
      maxBytes: MAX_DOCUMENT_BYTES,
      accept: "application/pdf,application/octet-stream;q=0.8,*/*;q=0.1",
      userAgent: USER_AGENT,
    });
    if (fetched.url.origin !== canonicalOrigin) {
      return { url: document.url, status: "FAILED", domains: document.domains, facts: [], error: "document_cross_origin_redirect", latencyMs: Date.now() - startedAt };
    }
    if (!isPdf(fetched.buffer)) {
      return { url: document.url, status: "FAILED", domains: document.domains, facts: [], error: "document_not_pdf", byteCount: fetched.buffer.byteLength, latencyMs: Date.now() - startedAt };
    }

    const response = await getClient().responses.create({
      model,
      store: false,
      max_output_tokens: 7_000,
      reasoning: { effort: "none" },
      instructions: [
        "You are the StayHub Production Hotel Scanner V2 document ingestion extractor.",
        "The crawler has already established that this public PDF exists. You are not allowed to invent another document or external fact.",
        "Extract atomic hotel facts only from the supplied PDF. Never use outside knowledge.",
        "Keep contradictions as separate facts. Do not reconcile or choose a winner.",
        "Do not extract guest names, staff names, biographies, personal profiles or named-person contact details.",
        "Use concise facts suitable for later cross-source verification against website pages.",
        "Use website only for the hotel's own non-social web URL. Use social_profile only for actual social-network profiles such as Facebook, Instagram, TikTok, LinkedIn, YouTube or X/Twitter.",
        languageInstruction(outputLanguage),
        `category must be one of: ${DOCUMENT_CATEGORIES.join(", ")}.`,
        `attribute must be one of: ${DOCUMENT_ATTRIBUTES.join(", ")}.`,
      ].join("\n"),
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify({ SOURCE_URL: document.url, INFERRED_DOMAINS: document.domains, OUTPUT_LANGUAGE: outputLanguage }),
          },
          {
            type: "input_file",
            filename: filenameForUrl(document.url),
            file_data: `data:application/pdf;base64,${fetched.buffer.toString("base64")}`,
          },
        ],
      }],
      text: {
        format: {
          type: "json_schema",
          name: "stayhub_v2_document_facts",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              facts: {
                type: "array",
                maxItems: 140,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    category: { type: "string", enum: DOCUMENT_CATEGORIES },
                    subject: { type: "string" },
                    attribute: { type: "string", enum: DOCUMENT_ATTRIBUTES },
                    label: { type: "string" },
                    value: { type: "string" },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                  },
                  required: ["category", "subject", "attribute", "label", "value", "confidence"],
                },
              },
            },
            required: ["facts"],
          },
        },
      },
    });

    if (response.status === "incomplete") {
      return { url: document.url, status: "FAILED", domains: document.domains, facts: [], error: "document_ai_incomplete", byteCount: fetched.buffer.byteLength, latencyMs: Date.now() - startedAt };
    }
    const outputText = String(response.output_text || "").trim();
    const facts = outputText ? parseFacts(outputText, document.url) : [];
    return {
      url: document.url,
      status: "INGESTED",
      domains: document.domains,
      facts,
      byteCount: fetched.buffer.byteLength,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      url: document.url,
      status: "FAILED",
      domains: document.domains,
      facts: [],
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
    };
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}

export async function ingestHotelDocumentsV2(input: {
  inventory: HotelScannerV2Inventory;
  canonicalUrl: string;
  outputLanguage: HotelScannerV2OutputLanguage;
}): Promise<HotelScannerV2DocumentIngestionResult> {
  const model = String(process.env.OPENAI_HOTEL_SCANNER_MODEL || "gpt-5.6-luna").trim();
  const documents = input.inventory.documents;
  const canonicalOrigin = new URL(input.canonicalUrl).origin;
  const selected = documents.slice(0, MAX_DOCUMENTS_PER_SCAN);
  const ingested = await mapWithConcurrency(selected, 2, (document) => ingestOne(document, canonicalOrigin, input.outputLanguage, model));
  const skipped = documents.slice(MAX_DOCUMENTS_PER_SCAN).map((document) => ({
    url: document.url,
    status: "SKIPPED_LIMIT" as const,
    domains: document.domains,
    facts: [] as HotelScanFact[],
    error: "document_scan_limit_reached",
    latencyMs: 0,
  }));
  const results = [...ingested, ...skipped];
  const facts = results.flatMap((document) => document.facts);
  return {
    schemaVersion: "hotel-document-ingestion-v2",
    documents: results,
    facts,
    diagnostics: {
      model,
      discoveredDocumentCount: documents.length,
      ingestedDocumentCount: results.filter((document) => document.status === "INGESTED").length,
      failedDocumentCount: results.filter((document) => document.status === "FAILED").length,
      skippedDocumentCount: results.filter((document) => document.status === "SKIPPED_LIMIT").length,
    },
  };
}

export function applyDocumentIngestionToInventoryV2(
  inventory: HotelScannerV2Inventory,
  ingestion: HotelScannerV2DocumentIngestionResult,
): HotelScannerV2Inventory {
  const statusByUrl = new Map(ingestion.documents.map((document) => [document.url, document.status]));
  const documents = inventory.documents.map((document) => ({
    ...document,
    ingestionStatus: statusByUrl.get(document.url) === "INGESTED" ? "INGESTED" as const : "PENDING" as const,
  }));
  return {
    ...inventory,
    documents,
    counts: {
      ...inventory.counts,
      pendingDocuments: documents.filter((document) => document.ingestionStatus !== "INGESTED").length,
    },
  };
}
