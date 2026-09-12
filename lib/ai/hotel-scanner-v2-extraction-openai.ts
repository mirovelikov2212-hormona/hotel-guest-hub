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
  if (!client) client = new OpenAI({ apiKey, timeout: 35_000, maxRetries: 0 });
  return client;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown) {
  const status = Number((error as { status?: unknown } | null)?.status || 0);
  const message = error instanceof Error ? error.message : String(error);
  return status === 429 || /(?:^|\s)429(?:\s|$)|rate limit/i.test(message);
}

async function withBoundedRateLimitRetry<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (!isRateLimitError(error)) throw error;
    await sleep(RATE_LIMIT_RETRY_DELAY_MS);
    return operation();
  }
}

function languageInstruction(outputLanguage: HotelScannerV2OutputLanguage) {
  return outputLanguage === "bg"
    ? "Write human-readable labels and descriptive values in Bulgarian. Preserve official entity names, prices, times, emails and phone numbers exactly."
    : "Write human-readable labels and descriptive values in English. Preserve official entity names, prices, times, emails and phone numbers exactly.";
}

function outputTokenBudget(expectedCount: number | null) {
  const expected = Math.max(1, Number(expectedCount || 0));
  return Math.min(MAX_AI_OUTPUT_TOKENS, Math.max(3_000, 1_200 + expected * 650));
}

function issueFromError(input: {
  error: unknown;
  config: HotelScannerV2DomainConfig;
  chunkIndex: number;
  chunkCount: number;
  sourceUrls: string[];
}): HotelScannerV2ExtractionIssue {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  return {
    domain: input.config.domain,
    chunkIndex: input.chunkIndex + 1,
    chunkCount: input.chunkCount,
    code: isRateLimitError(input.error) ? "AI_RATE_LIMITED" : "AI_ERROR",
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
  try {
    const response = await withBoundedRateLimitRetry(() => getClient().responses.create({
      model: input.model,
      store: false,
      max_output_tokens: outputTokenBudget(input.expected.expectedCount),
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
        WEBSITE_EVIDENCE: input.pages,
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
                maxItems: 100,
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
