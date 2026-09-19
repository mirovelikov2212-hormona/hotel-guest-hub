import OpenAI, { toFile } from "openai";

import type { HotelScanFact } from "@/lib/ai/hotel-scanner";
import type { HotelScannerV2Inventory } from "@/lib/server/hotel-scanner-v2-inventory.mjs";
import type { HotelScannerV2OutputLanguage } from "@/lib/ai/hotel-scanner-v2-domain-extractors";
import { fetchPublicBinaryV2, probePublicResourceV2 } from "@/lib/server/hotel-scanner-v2-network";

let client: OpenAI | null = null;

const MAX_DOCUMENTS_PER_SCAN = 16;
const MAX_INLINE_DOCUMENT_BYTES = 10_000_000;
const MAX_REMOTE_DOCUMENT_BYTES = 50_000_000;
const DOCUMENT_TIMEOUT_MS = 10_000;
const DOCUMENT_REMOTE_PROBE_TIMEOUT_MS = 25_000;
const DOCUMENT_UPLOAD_FALLBACK_TIMEOUT_MS = 45_000;
const DOCUMENT_CONCURRENCY = 1;
const DOCUMENT_AI_RATE_LIMIT_RETRIES = 1;
const DOCUMENT_AI_RATE_LIMIT_MAX_DELAY_MS = 12_000;
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

type DocumentInputFile =
  | { type: "input_file"; filename: string; file_data: string }
  | { type: "input_file"; file_url: string }
  | { type: "input_file"; file_id: string };

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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "");
}

function errorCode(error: unknown) {
  const value = error as { code?: unknown; error?: { code?: unknown; type?: unknown } } | null;
  return String(value?.code || value?.error?.code || value?.error?.type || "").trim().toLocaleLowerCase("en-US");
}

function isQuotaExhaustedError(error: unknown) {
  const code = errorCode(error);
  const message = errorMessage(error);
  return [
    "credit_balance_exhausted",
    "organization_usage_limit_exceeded",
    "organization_spend_limit_exceeded",
    "project_spend_limit_exceeded",
    "insufficient_quota",
  ].includes(code)
    || /no credits remaining|credit balance exhausted|insufficient quota|usage limit exceeded|spend limit exceeded/i.test(message);
}

function isRateLimitError(error: unknown) {
  if (isQuotaExhaustedError(error)) return false;
  const status = Number((error as { status?: unknown } | null)?.status || 0);
  const message = errorMessage(error);
  return status === 429 || /\b429\b|rate limit|tokens per min|TPM/iu.test(message);
}

function isDocumentNetworkTimeout(error: unknown) {
  const name = String((error as { name?: unknown } | null)?.name || "");
  const code = String((error as { code?: unknown } | null)?.code || "");
  const message = errorMessage(error);
  return ["TimeoutError", "AbortError"].includes(name)
    || /(?:timeout|timed out|aborted due to timeout)/iu.test(message)
    || /(?:ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT)/iu.test(code);
}

function isRemoteFileUrlFetchError(error: unknown) {
  if (isQuotaExhaustedError(error) || isRateLimitError(error)) return false;
  const status = Number((error as { status?: unknown } | null)?.status || 0);
  const message = errorMessage(error);
  if (status !== 400) return false;
  return /unable to download content from the provided url/iu.test(message)
    || /(?:file_url|provided url).*(?:download|fetch|timeout)/iu.test(message)
    || /(?:download|fetch|timeout).*(?:file_url|provided url)/iu.test(message);
}

function retryDelayMs(error: unknown) {
  const message = errorMessage(error);
  const seconds = Number(message.match(/try again in\s+([0-9.]+)s/iu)?.[1] || 0);
  const requested = seconds > 0 ? Math.ceil(seconds * 1_000) + 250 : 2_000;
  return Math.min(DOCUMENT_AI_RATE_LIMIT_MAX_DELAY_MS, Math.max(500, requested));
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withDocumentRateLimitRetry<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= DOCUMENT_AI_RATE_LIMIT_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt >= DOCUMENT_AI_RATE_LIMIT_RETRIES) throw error;
      await sleep(retryDelayMs(error));
    }
  }
  throw lastError;
}

async function ingestOne(
  document: HotelScannerV2Inventory["documents"][number],
  canonicalOrigin: string,
  outputLanguage: HotelScannerV2OutputLanguage,
  model: string,
): Promise<HotelScannerV2DocumentResult> {
  const startedAt = Date.now();
  try {
    let byteCount = 0;
    let inputFile: DocumentInputFile;

    try {
      const fetched = await fetchPublicBinaryV2(new URL(document.url), {
        timeoutMs: DOCUMENT_TIMEOUT_MS,
        maxBytes: MAX_INLINE_DOCUMENT_BYTES,
        accept: "application/pdf,application/octet-stream;q=0.8,*/*;q=0.1",
        userAgent: USER_AGENT,
      });
      if (fetched.url.origin !== canonicalOrigin) {
        return { url: document.url, status: "FAILED", domains: document.domains, facts: [], error: "document_cross_origin_redirect", latencyMs: Date.now() - startedAt };
      }
      if (!isPdf(fetched.buffer)) {
        return { url: document.url, status: "FAILED", domains: document.domains, facts: [], error: "document_not_pdf", byteCount: fetched.buffer.byteLength, latencyMs: Date.now() - startedAt };
      }
      byteCount = fetched.buffer.byteLength;
      inputFile = {
        type: "input_file",
        filename: filenameForUrl(document.url),
        file_data: `data:application/pdf;base64,${fetched.buffer.toString("base64")}`,
      };
    } catch (error) {
      const code = String((error as { code?: unknown } | null)?.code || "");
      const timedOut = isDocumentNetworkTimeout(error);
      if (code !== "scanner_v2_resource_too_large" && !timedOut) throw error;

      const probed = await probePublicResourceV2(new URL(document.url), {
        timeoutMs: timedOut ? DOCUMENT_REMOTE_PROBE_TIMEOUT_MS : DOCUMENT_TIMEOUT_MS,
        maxBytes: MAX_REMOTE_DOCUMENT_BYTES,
        accept: "application/pdf,application/octet-stream;q=0.8,*/*;q=0.1",
        userAgent: USER_AGENT,
      });
      if (probed.url.origin !== canonicalOrigin) {
        return { url: document.url, status: "FAILED", domains: document.domains, facts: [], error: "document_cross_origin_redirect", latencyMs: Date.now() - startedAt };
      }
      if (!/application\/pdf/iu.test(probed.contentType) && !/\.pdf$/iu.test(probed.url.pathname)) {
        return { url: document.url, status: "FAILED", domains: document.domains, facts: [], error: "document_not_pdf", byteCount: probed.contentLength, latencyMs: Date.now() - startedAt };
      }
      byteCount = probed.contentLength;
      inputFile = {
        type: "input_file",
        file_url: probed.url.toString(),
      };
    }

    const createResponse = (fileInput: DocumentInputFile) => withDocumentRateLimitRetry(() => getClient().responses.create({
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
          fileInput,
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
    }));

    let response: Awaited<ReturnType<typeof createResponse>>;
    try {
      response = await createResponse(inputFile);
    } catch (error) {
      const remoteFetchFailure = isRemoteFileUrlFetchError(error);
      const remoteTimeout = isDocumentNetworkTimeout(error);
      if (!("file_url" in inputFile) || (!remoteFetchFailure && !remoteTimeout)) throw error;

      // One bounded transport fallback only: if OpenAI cannot fetch the remote
      // PDF or times out while doing so, download it through the scanner's
      // public-network guard, upload it once, and retry extraction by file_id.
      const fetched = await fetchPublicBinaryV2(new URL(inputFile.file_url), {
        timeoutMs: DOCUMENT_UPLOAD_FALLBACK_TIMEOUT_MS,
        maxBytes: MAX_REMOTE_DOCUMENT_BYTES,
        accept: "application/pdf,application/octet-stream;q=0.8,*/*;q=0.1",
        userAgent: USER_AGENT,
      });
      if (fetched.url.origin !== canonicalOrigin) {
        return { url: document.url, status: "FAILED", domains: document.domains, facts: [], error: "document_cross_origin_redirect", latencyMs: Date.now() - startedAt };
      }
      if (!isPdf(fetched.buffer)) {
        return { url: document.url, status: "FAILED", domains: document.domains, facts: [], error: "document_not_pdf", byteCount: fetched.buffer.byteLength, latencyMs: Date.now() - startedAt };
      }

      byteCount = fetched.buffer.byteLength;
      const openai = getClient();
      const uploaded = await openai.files.create({
        file: await toFile(fetched.buffer, filenameForUrl(fetched.url.toString()), { type: "application/pdf" }),
        purpose: "user_data",
      });
      try {
        response = await createResponse({ type: "input_file", file_id: uploaded.id });
      } finally {
        await openai.files.delete(uploaded.id).catch(() => {});
      }
    }

    if (response.status === "incomplete") {
      return { url: document.url, status: "FAILED", domains: document.domains, facts: [], error: "document_ai_incomplete", byteCount, latencyMs: Date.now() - startedAt };
    }
    const outputText = String(response.output_text || "").trim();
    const facts = outputText ? parseFacts(outputText, document.url) : [];
    return {
      url: document.url,
      status: "INGESTED",
      domains: document.domains,
      facts,
      byteCount,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      url: document.url,
      status: "FAILED",
      domains: document.domains,
      facts: [],
      error: isQuotaExhaustedError(error) ? "document_ai_quota_exhausted" : errorMessage(error),
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
  const ingested = await mapWithConcurrency(selected, DOCUMENT_CONCURRENCY, (document) => ingestOne(document, canonicalOrigin, input.outputLanguage, model));
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
