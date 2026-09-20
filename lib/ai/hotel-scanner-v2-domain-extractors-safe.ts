import type { HotelScanFact } from "@/lib/ai/hotel-scanner";
import type { HotelScannerV2EvidenceBundle } from "@/lib/server/hotel-scanner-v2-crawler";
import type { HotelScannerV2SiteMap } from "@/lib/server/hotel-scanner-v2-site-map.mjs";
import type { HotelScannerV2Inventory } from "@/lib/server/hotel-scanner-v2-inventory.mjs";
import {
  DOMAIN_CONCURRENCY,
  HOTEL_SCANNER_V2_DOMAIN_CONFIGS,
  MAX_AI_EVIDENCE_CHARS,
  MAX_AI_OUTPUT_TOKENS,
  type HotelScannerV2DomainConfig,
} from "@/lib/ai/hotel-scanner-v2-extraction-config";
import {
  buildDeterministicOfferDetailFactsV2,
  buildDeterministicPolicyFactsV2,
  buildInventoryIdentityFactsV2,
} from "@/lib/ai/hotel-scanner-v2-deterministic-facts";
import {
  chunkPagePayloadsV2,
  expectedInventoryPayloadV2,
  pagePayloadsV2,
  sourceUrlsForDomainV2,
} from "@/lib/ai/hotel-scanner-v2-extraction-evidence";
import {
  boundHotelScannerV2FactsToInventory,
  mergeHotelScannerV2Facts,
} from "@/lib/ai/hotel-scanner-v2-extraction-facts";
import { extractHotelScannerV2Chunk } from "@/lib/ai/hotel-scanner-v2-extraction-openai";
import type {
  HotelScannerV2DomainExtraction,
  HotelScannerV2ExtractionResult,
  HotelScannerV2OutputLanguage,
} from "@/lib/ai/hotel-scanner-v2-extraction-types";

export type { HotelScannerV2OutputLanguage } from "@/lib/ai/hotel-scanner-v2-extraction-types";

type GlobalAiQuotaGate = {
  isExhausted: () => boolean;
  exhaust: () => void;
};

function quotaGateIssue(
  config: HotelScannerV2DomainConfig,
  sourceUrls: string[],
  chunkCount: number,
) {
  return {
    domain: config.domain,
    chunkIndex: 1,
    chunkCount: Math.max(1, chunkCount),
    code: "AI_QUOTA_EXHAUSTED" as const,
    reason: "global_ai_quota_exhausted_before_domain_request",
    sourceUrls,
  };
}

async function extractDomain(
  config: HotelScannerV2DomainConfig,
  evidence: HotelScannerV2EvidenceBundle,
  siteMap: HotelScannerV2SiteMap,
  inventory: HotelScannerV2Inventory,
  outputLanguage: HotelScannerV2OutputLanguage,
  model: string,
  quotaGate: GlobalAiQuotaGate,
): Promise<HotelScannerV2DomainExtraction> {
  const domainInventory = inventory.domains.find((entry) => entry.domain === config.domain);
  if (domainInventory?.expectationState === "ABSENT" && !config.propertyWide) {
    return { domain: config.domain, status: "SKIPPED", facts: [], sourceUrls: [], expectedCount: 0, latencyMs: 0, requestCount: 0, issues: [] };
  }

  const sourceUrls = sourceUrlsForDomainV2(config, evidence, siteMap, domainInventory);
  const pages = pagePayloadsV2(evidence, new Set(sourceUrls));
  if (!pages.length) {
    return {
      domain: config.domain,
      status: "NO_EVIDENCE",
      facts: [],
      sourceUrls,
      expectedCount: domainInventory?.expectationState === "UNKNOWN" ? null : domainInventory?.expectedCount ?? null,
      latencyMs: 0,
      requestCount: 0,
      issues: [],
    };
  }

  const expected = expectedInventoryPayloadV2(domainInventory);
  const chunks = chunkPagePayloadsV2(pages);
  const startedAt = Date.now();
  const extracted: HotelScanFact[] = [];
  const issues = [] as HotelScannerV2DomainExtraction["issues"];
  let requestCount = 0;

  if (quotaGate.isExhausted()) {
    issues.push(quotaGateIssue(config, sourceUrls, chunks.length));
  } else {
    for (let index = 0; index < chunks.length; index += 1) {
      if (quotaGate.isExhausted()) {
        issues.push(quotaGateIssue(config, sourceUrls, chunks.length));
        break;
      }
      requestCount += 1;
      const chunk = await extractHotelScannerV2Chunk({
        config,
        pages: chunks[index],
        expected,
        outputLanguage,
        model,
        chunkIndex: index,
        chunkCount: chunks.length,
      });
      extracted.push(...chunk.facts);
      if (chunk.issue) {
        issues.push(chunk.issue);
        if (chunk.issue.code === "AI_QUOTA_EXHAUSTED") {
          quotaGate.exhaust();
          break;
        }
      }
    }
  }

  // Entity existence comes from deterministic inventory/discovery, not from an
  // LLM successfully echoing every name. AI enriches attributes; it is never
  // inventory authority. Explicit policy polarity from a dedicated policy/FAQ
  // block is also preserved deterministically so real cross-source conflicts do
  // not appear/disappear between identical scans.
  const deterministic = [
    ...buildInventoryIdentityFactsV2(domainInventory),
    ...(config.domain === "offers" ? buildDeterministicOfferDetailFactsV2(pages, domainInventory) : []),
    ...(config.domain === "policies" ? buildDeterministicPolicyFactsV2(pages) : []),
  ];
  const facts = boundHotelScannerV2FactsToInventory(
    config,
    mergeHotelScannerV2Facts([...deterministic, ...extracted]),
    domainInventory,
  );
  return {
    domain: config.domain,
    status: issues.length ? "PARTIAL" : facts.length ? "EXTRACTED" : "NO_EVIDENCE",
    facts,
    sourceUrls,
    expectedCount: domainInventory?.expectationState === "UNKNOWN" ? null : domainInventory?.expectedCount ?? null,
    latencyMs: Date.now() - startedAt,
    requestCount,
    issues,
  };
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

export async function extractHotelDomainsV2(input: {
  evidence: HotelScannerV2EvidenceBundle;
  siteMap: HotelScannerV2SiteMap;
  inventory: HotelScannerV2Inventory;
  outputLanguage: HotelScannerV2OutputLanguage;
  domains?: string[];
}): Promise<HotelScannerV2ExtractionResult> {
  const model = String(process.env.OPENAI_HOTEL_SCANNER_MODEL || "gpt-5.6-luna").trim();
  let quotaExhausted = false;
  const quotaGate: GlobalAiQuotaGate = {
    isExhausted: () => quotaExhausted,
    exhaust: () => { quotaExhausted = true; },
  };
  const requestedDomains = new Set((input.domains || []).map((domain) => String(domain || "").trim()).filter(Boolean));
  const configs = requestedDomains.size
    ? HOTEL_SCANNER_V2_DOMAIN_CONFIGS.filter((config) => requestedDomains.has(config.domain))
    : HOTEL_SCANNER_V2_DOMAIN_CONFIGS;
  const domains = await mapWithConcurrency(configs, DOMAIN_CONCURRENCY, (config) =>
    extractDomain(config, input.evidence, input.siteMap, input.inventory, input.outputLanguage, model, quotaGate));
  const facts = domains.flatMap((domain) => domain.facts);
  const issues = domains.flatMap((domain) => domain.issues);

  return {
    schemaVersion: "hotel-domain-extraction-v2",
    facts,
    domains,
    issues,
    diagnostics: {
      model,
      extractedDomainCount: domains.filter((domain) => domain.status === "EXTRACTED").length,
      partialDomainCount: domains.filter((domain) => domain.status === "PARTIAL").length,
      factCount: facts.length,
      aiRequestCount: domains.reduce((sum, domain) => sum + domain.requestCount, 0),
      incompleteChunkCount: issues.filter((issue) => issue.code === "AI_INCOMPLETE").length,
      maxEvidenceCharsPerRequest: MAX_AI_EVIDENCE_CHARS,
      maxOutputTokensPerRequest: MAX_AI_OUTPUT_TOKENS,
    },
  };
}
