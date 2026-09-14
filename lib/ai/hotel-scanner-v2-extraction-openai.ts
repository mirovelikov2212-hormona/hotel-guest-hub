import OpenAI from "openai";

import type { HotelScanFact } from "@/lib/ai/hotel-scanner";
import {
  MAX_AI_OUTPUT_TOKENS,
  RATE_LIMIT_RETRY_DELAY_MS,
  type HotelScannerV2DomainConfig,
} from "@/lib/ai/hotel-scanner-v2-extraction-config";
import type {
  HotelScannerV2ExtractionIssue,
  HotelScannerV2OutputLanguage,
} from "@/lib/ai/hotel-scanner-v2-extraction-types";
import type { HotelScannerV2PagePayload } from "@/lib/ai/hotel-scanner-v2-extraction-evidence";
import { cleanV2, uniqueV2 } from "@/lib/ai/hotel-scanner-v2-extraction-evidence";
import { parseHotelScannerV2Facts } from "@/lib/ai/hotel-scanner-v2-extraction-facts";

let client: OpenAI | null = null;

function getClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("openai_api_key_missing");
  if (!client) client = new OpenAI({ apiKey, timeout: 55_000, maxRetries: 0 });
  return client;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorStatus(error: unknown) {
  return Number((error as { status?: unknown } | null)?.status || 0);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
  const status = errorStatus(error);
  const message = errorMessage(error);
  return status === 429 || /(?:^|\s)429(?:\s|$)|rate limit/i.test(message);
}

function isTransientAiError(error: unknown) {
  if (isQuotaExhaustedError(error)) return false;
  const status = errorStatus(error);
  if (status === 408 || status === 425 || status === 429 || status >= 500) return true;
  const message = errorMessage(error);
  return /timed?\s*out|timeout|ETIMEDOUT|ECONNRESET|ECONNABORTED|socket hang up|fetch failed|network error|connection reset/i.test(message);
}

async function withBoundedTransientRetry<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (!isTransientAiError(error)) throw error;
    await sleep(RATE_LIMIT_RETRY_DELAY_MS);
    return operation();
  }
}

function languageInstruction(outputLanguage: HotelScannerV2OutputLanguage) {
  return outputLanguage === "bg"
    ? "Write human-readable labels and descriptive values in Bulgarian. Preserve official entity names, prices, times, emails and phone numbers exactly."
    : "Write human-readable labels and descriptive values in English. Preserve official entity names, prices, times, emails and phone numbers exactly.";
}

function outputTokenBudget(domain: string, expectedCount: number | null) {
  if (domain === "policies") return MAX_AI_OUTPUT_TOKENS;
  const expected = Math.max(1, Number(expectedCount || 0));
  return Math.min(MAX_AI_OUTPUT_TOKENS, Math.max(3_000, 1_200 + expected * 650));
}

function compactRecoveryPages(pages: HotelScannerV2PagePayload[]) {
  return pages.map((page) => ({
    ...page,
    headings: page.headings.slice(0, 40),
    content_blocks: page.content_blocks.slice(0, 14).map((block) => ({
      ...block,
      text: cleanV2(block.text, 360),
      links: block.links.slice(0, 4),
    })),
    json_ld_entities: page.json_ld_entities.slice(0, 24),
    text: cleanV2(page.text, 3_600),
  }));
}

function issueFromError(input: {
  error: unknown;
  config: HotelScannerV2DomainConfig;
  chunkIndex: number;
  chunkCount: number;
  sourceUrls: string[];
}): HotelScannerV2ExtractionIssue {
  const message = errorMessage(input.error);
  const code = isQuotaExhaustedError(input.error)
    ? "AI_QUOTA_EXHAUSTED"
    : isRateLimitError(input.error)
      ? "AI_RATE_LIMITED"
      : "AI_ERROR";
  return {
    domain: input.config.domain,
    chunkIndex: input.chunkIndex + 1,
    chunkCount: input.chunkCount,
    code,
    reason: cleanV2(message || "ai_request_failed", 240),
    sourceUrls: input.sourceUrls,
  };
}

export async function extractHotelScannerV2Chunk(input: {
  config: HotelScannerV2DomainConfig;
  pages: HotelScannerV2PagePayload[];
  expected: { expectationState: string; expectedCount: number | null; items: unknown[] };
  outputLanguage: HotelScannerV2OutputLanguage;
  model: string;
  chunkIndex: number;
  chunkCount: number;
}): Promise<{ facts: HotelScanFact[]; issue: HotelScannerV2ExtractionIssue | null }> {
  const sourceUrls = uniqueV2(input.pages.map((page) => page.url));
  const allowedUrls = new Set(sourceUrls);

  async function requestExtraction(pages: HotelScannerV2PagePayload[], maxItems: number, recovery: boolean) {
    return withBoundedTransientRetry(() => getClient().responses.create({
      model: input.model,
      store: false,
      max_output_tokens: outputTokenBudget(input.config.domain, input.expected.expectedCount),
      reasoning: { effort: "none" },
      instructions: [
        `You are the StayHub Production Hotel Scanner V2 ${input.config.domain} extractor.`,
        "The crawler and Inventory Engine have already determined what website surfaces and expected entities exist. You are NOT inventory authority.",
        "Use ONLY WEBSITE_EVIDENCE and EXPECTED_INVENTORY. Never browse, use outside knowledge, add an entity because it seems likely, or hide a contradiction.",
        "This is one bounded evidence chunk. Extract only facts supported by this chunk; later code merges chunks deterministically.",
        "For named EXPECTED_INVENTORY items, extract facts only for those entities or exact property-wide facts supported by the supplied pages.",
        "For unnamed deterministic count slots, identify names only when explicitly present in the evidence and never exceed the authoritative expected count.",
        "If an expected item has no supporting content, emit no invented fact for it. Completeness will report it as missing.",
        "Every fact must cite exact URLs from ALLOWED_SOURCE_URLS.",
        "Facts must be atomic: one subject + one attribute + one value.",
        "Preserve conflicting values separately. Do not reconcile them.",
        "Do not extract staff names, guest names, biographies, personal profiles or named-person email addresses.",
        recovery
          ? `Recovery pass after an output-limit cutoff: emit at most ${maxItems} highest-value facts. First cover each expected entity represented by this chunk, then prioritize hours, price, booking/access, duration/capacity and one concise description. Do not repeat equivalent facts.`
          : `Return no more than ${maxItems} facts for this chunk.`,
        languageInstruction(input.outputLanguage),
        `category must be one of: ${input.config.categories.join(", ")}.`,
        `attribute must be one of: ${input.config.attributes.join(", ")}.`,
      ].join("\n"),
      input: JSON.stringify({
        DOMAIN: input.config.domain,
        OUTPUT_LANGUAGE: input.outputLanguage,
        CHUNK: { index: input.chunkIndex + 1, total: input.chunkCount },
        EXPECTED_INVENTORY: input.expected,
        ALLOWED_SOURCE_URLS: sourceUrls,
        WEBSITE_EVIDENCE: pages,
      }),
      text: {
        format: {
          type: "json_schema",
          name: `stayhub_v2_${input.config.domain}_facts`,
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              facts: {
                type: "array",
                maxItems,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    category: { type: "string", enum: input.config.categories },
                    subject: { type: "string" },
                    attribute: { type: "string", enum: input.config.attributes },
                    label: { type: "string" },
                    value: { type: "string" },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                    sourceUrls: { type: "array", items: { type: "string", enum: sourceUrls }, minItems: 1, maxItems: 8 },
                  },
                  required: ["category", "subject", "attribute", "label", "value", "confidence", "sourceUrls"],
                },
              },
            },
            required: ["facts"],
          },
        },
      },
    }));
  }

  try {
    let response = await requestExtraction(input.pages, 100, false);
    if (response.status === "incomplete") {
      const reason = cleanV2((response as { incomplete_details?: { reason?: unknown } }).incomplete_details?.reason || "response_incomplete", 120);
      if (/max[_\s-]?output|max[_\s-]?tokens?/i.test(reason)) {
        // A dense page can legitimately contain more atomic facts than fit in a
        // single response. Retry once with compact evidence and a smaller,
        // priority-ordered fact set instead of letting entity coverage fluctuate
        // between identical scans.
        response = await requestExtraction(compactRecoveryPages(input.pages), 24, true);
      }
    }

    if (response.status === "incomplete") {
      const reason = (response as { incomplete_details?: { reason?: unknown } }).incomplete_details?.reason;
      return {
        facts: [],
        issue: {
          domain: input.config.domain,
          chunkIndex: input.chunkIndex + 1,
          chunkCount: input.chunkCount,
          code: "AI_INCOMPLETE",
          reason: cleanV2(reason || "response_incomplete", 120),
          sourceUrls,
        },
      };
    }

    const outputText = String(response.output_text || "").trim();
    return {
      facts: outputText ? parseHotelScannerV2Facts(outputText, input.config, allowedUrls) : [],
      issue: null,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "openai_api_key_missing") throw error;
    return {
      facts: [],
      issue: issueFromError({ error, config: input.config, chunkIndex: input.chunkIndex, chunkCount: input.chunkCount, sourceUrls }),
    };
  }
}
