import OpenAI from "openai";

import type { HotelScanFact } from "@/lib/ai/hotel-scanner";
import type { HotelScannerV2EvidenceBundle } from "@/lib/server/hotel-scanner-v2-crawler";
import type { HotelScannerV2SiteMap } from "@/lib/server/hotel-scanner-v2-site-map.mjs";
import type { HotelScannerV2Inventory, HotelScannerV2DomainInventory } from "@/lib/server/hotel-scanner-v2-inventory.mjs";

let client: OpenAI | null = null;

export type HotelScannerV2OutputLanguage = "bg" | "en";
export type HotelScannerV2DomainExtractionStatus = "EXTRACTED" | "NO_EVIDENCE" | "SKIPPED";

export type HotelScannerV2DomainExtraction = {
  domain: string;
  status: HotelScannerV2DomainExtractionStatus;
  facts: HotelScanFact[];
  sourceUrls: string[];
  expectedCount: number | null;
  latencyMs: number;
  requestCount: number;
};

export type HotelScannerV2ExtractionResult = {
  schemaVersion: "hotel-domain-extraction-v2";
  facts: HotelScanFact[];
  domains: HotelScannerV2DomainExtraction[];
  diagnostics: {
    model: string;
    extractedDomainCount: number;
    factCount: number;
    aiRequestCount: number;
    maxEvidenceCharsPerRequest: number;
  };
};

type DomainConfig = {
  domain: string;
  categories: string[];
  attributes: string[];
  pageTypes: string[];
  propertyWide?: boolean;
};

type PagePayload = {
  url: string;
  title: string;
  description: string;
  headings: unknown[];
  content_blocks: Array<{ heading: string; text: string; links: unknown[] }>;
  json_ld_entities: Array<{ name: string; types: unknown[] }>;
  text: string;
};

const MAX_AI_EVIDENCE_CHARS = 48_000;
const MAX_PAGE_TEXT_CHARS = 7_500;
const MAX_CONTENT_BLOCKS_PER_PAGE = 36;
const MAX_CONTENT_BLOCK_TEXT_CHARS = 700;
const MAX_HEADINGS_PER_PAGE = 80;
const MAX_JSON_LD_PER_PAGE = 60;
const DOMAIN_CONCURRENCY = 2;
const RATE_LIMIT_RETRY_DELAY_MS = 9_000;

const DOMAIN_CONFIGS: DomainConfig[] = [
  {
    domain: "accommodation",
    categories: ["accommodation"],
    attributes: ["room_type", "description", "capacity", "size", "bed", "view", "meal_inclusion", "price", "booking"],
    pageTypes: ["accommodation", "room_detail"],
  },
  {
    domain: "gastronomy",
    categories: ["dining"],
    attributes: ["venue", "description", "hours", "external_access", "booking", "dress_code", "age_policy", "price"],
    pageTypes: ["gastronomy", "restaurant_detail"],
  },
  {
    domain: "spa",
    categories: ["wellness"],
    attributes: [
      "service", "treatment", "treatment_category", "facility", "technology", "equipment",
      "description", "price", "hours", "booking", "age_policy", "access", "session_duration", "recommended_stay",
    ],
    pageTypes: ["spa", "spa_detail"],
  },
  {
    domain: "services",
    categories: ["services", "amenities"],
    attributes: ["service", "facility", "amenity", "description", "price", "hours", "booking", "access", "age_policy"],
    pageTypes: ["services", "service_detail"],
  },
  {
    domain: "experiences",
    categories: ["experiences"],
    attributes: ["experience", "activity", "attraction", "description", "experience_access", "experience_booking", "price", "hours"],
    pageTypes: ["experiences", "experience_detail"],
  },
  {
    domain: "events",
    categories: ["events"],
    attributes: ["event", "description", "date", "hours", "price", "booking", "event_capacity", "event_service"],
    pageTypes: ["events", "event_detail"],
  },
  {
    domain: "offers",
    categories: ["offers"],
    attributes: ["offer", "description", "validity", "price", "booking"],
    pageTypes: ["offers", "offer_detail"],
  },
  {
    domain: "policies",
    categories: ["policy", "operations"],
    attributes: ["pet_policy", "smoking_policy", "quiet_hours", "cancellation_policy", "payment_policy", "external_access", "age_policy", "check_in", "check_out", "other"],
    pageTypes: ["policies", "faq"],
    propertyWide: true,
  },
  {
    domain: "contacts",
    categories: ["contact", "location"],
    attributes: ["phone", "email", "website", "social_profile", "address"],
    pageTypes: ["contacts"],
    propertyWide: true,
  },
];

const GENERIC_BUSINESS_EMAIL_LOCAL_PARTS = new Set([
  "info", "contact", "contacts", "hello", "office", "hotel", "reception", "frontdesk", "frontoffice",
  "reservation", "reservations", "booking", "bookings", "sales", "events", "event", "spa", "wellness",
  "restaurant", "restaurants", "marketing", "conference", "conferences", "groups", "group", "guestrelations",
  "guestservice", "guestservices", "service", "services",
]);

const NAMED_INVENTORY_BASES = new Set([
  "deterministic_semantic_block_entity",
  "deterministic_json_ld_entity",
]);

function getClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("openai_api_key_missing");
  if (!client) client = new OpenAI({ apiKey, timeout: 35_000, maxRetries: 0 });
  return client;
}

function clean(value: unknown, max = 500) {
  const text = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : text.slice(0, max);
}

function entityKey(value: unknown) {
  return clean(value, 240)
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
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

function isPrivacyMinimalBusinessEmail(raw: string) {
  const value = clean(raw, 200).toLocaleLowerCase("en-US");
  const match = value.match(/^([^@]+)@([^@]+)$/);
  return Boolean(match && GENERIC_BUSINESS_EMAIL_LOCAL_PARTS.has(match[1].replace(/[^a-z0-9]+/g, "")));
}

function pageTypeSet(resource: HotelScannerV2SiteMap["resources"][number]) {
  return new Set(resource.classification?.types || []);
}

function sourceUrlsForDomain(
  config: DomainConfig,
  evidence: HotelScannerV2EvidenceBundle,
  siteMap: HotelScannerV2SiteMap,
  inventory: HotelScannerV2DomainInventory | undefined,
) {
  const urls = new Set<string>([
    ...(inventory?.landingUrls || []),
    ...(inventory?.detailUrls || []),
    ...(inventory?.supportingUrls || []),
  ]);
  for (const resource of siteMap.resources) {
    const types = pageTypeSet(resource);
    if (config.pageTypes.some((type) => types.has(type as never))) urls.add(resource.url);
  }
  if (config.domain === "contacts" && evidence.pages[0]?.url) urls.add(evidence.pages[0].url);
  return unique([...urls]);
}

function compactPagePayload(page: HotelScannerV2EvidenceBundle["pages"][number]): PagePayload {
  const blocks = page.contentBlocks.slice(0, MAX_CONTENT_BLOCKS_PER_PAGE).map((block) => ({
    heading: clean(block?.heading, 240),
    text: clean(block?.text, MAX_CONTENT_BLOCK_TEXT_CHARS),
    links: Array.isArray(block?.links) ? block.links.slice(0, 8) : [],
  }));
  const jsonLd = page.jsonLdEntities.slice(0, MAX_JSON_LD_PER_PAGE).map((entity) => ({
    name: clean(entity?.name, 240),
    types: Array.isArray(entity?.types) ? entity.types.slice(0, 8) : [],
  }));
  return {
    url: page.url,
    title: clean(page.title, 300),
    description: clean(page.description, 700),
    headings: page.headings.slice(0, MAX_HEADINGS_PER_PAGE),
    content_blocks: blocks,
    json_ld_entities: jsonLd,
    text: clean(page.text, MAX_PAGE_TEXT_CHARS),
  };
}

function pagePayloads(evidence: HotelScannerV2EvidenceBundle, allowedUrls: Set<string>) {
  return evidence.pages
    .filter((page) => allowedUrls.has(page.url))
    .map(compactPagePayload);
}

function pagePayloadSize(page: PagePayload) {
  return JSON.stringify(page).length;
}

function chunkPagePayloads(pages: PagePayload[]) {
  const chunks: PagePayload[][] = [];
  let current: PagePayload[] = [];
  let currentChars = 0;
  for (const page of pages) {
    const pageChars = pagePayloadSize(page);
    if (current.length && currentChars + pageChars > MAX_AI_EVIDENCE_CHARS) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(page);
    currentChars += pageChars;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function parseFacts(value: string, config: DomainConfig, allowedUrls: Set<string>) {
  const parsed = JSON.parse(value) as { facts?: Array<Record<string, unknown>> };
  if (!parsed || !Array.isArray(parsed.facts)) return [] as HotelScanFact[];
  const facts: HotelScanFact[] = [];
  const seen = new Set<string>();
  for (const raw of parsed.facts) {
    const category = clean(raw.category, 80).toLocaleLowerCase("en-US");
    const attribute = clean(raw.attribute, 80).toLocaleLowerCase("en-US");
    const subject = clean(raw.subject, 160) || "hotel";
    const label = clean(raw.label, 160);
    const factValue = clean(raw.value, 600);
    const confidence = Math.max(0, Math.min(1, Number(raw.confidence || 0)));
    const sourceUrls = unique((Array.isArray(raw.sourceUrls) ? raw.sourceUrls : [])
      .map((url) => clean(url, 2_048))
      .filter((url) => allowedUrls.has(url))).slice(0, 8);
    if (!config.categories.includes(category) || !config.attributes.includes(attribute)) continue;
    if (!label || !factValue || !sourceUrls.length) continue;
    if (attribute === "email" && !isPrivacyMinimalBusinessEmail(factValue)) continue;
    const dedupeKey = `${category}|${entityKey(subject)}|${attribute}|${entityKey(factValue)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    facts.push({ category, subject, attribute, label, value: factValue, confidence, sourceUrls } as HotelScanFact);
  }
  return facts;
}

function mergeFacts(values: HotelScanFact[]) {
  const merged = new Map<string, HotelScanFact>();
  for (const fact of values) {
    const enriched = fact as HotelScanFact & { subject?: string; attribute?: string };
    const key = `${clean(fact.category, 80).toLocaleLowerCase("en-US")}|${entityKey(enriched.subject)}|${clean(enriched.attribute, 80).toLocaleLowerCase("en-US")}|${entityKey(fact.value)}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, fact);
      continue;
    }
    merged.set(key, {
      ...existing,
      confidence: Math.max(Number(existing.confidence || 0), Number(fact.confidence || 0)),
      sourceUrls: unique([...(existing.sourceUrls || []), ...(fact.sourceUrls || [])]).slice(0, 8),
    } as HotelScanFact);
  }
  return [...merged.values()];
}

function expectedInventoryPayload(domainInventory: HotelScannerV2DomainInventory | undefined) {
  if (!domainInventory) return { expectationState: "ABSENT", expectedCount: 0, items: [] };
  return {
    expectationState: domainInventory.expectationState,
    expectedCount: domainInventory.expectedCount,
    items: domainInventory.expectedItems.map((item) => ({
      id: item.id,
      entityType: item.entityType,
      name: item.nameHint,
      basis: item.basis,
      urls: item.urls,
    })),
  };
}

function boundFactsToInventory(
  config: DomainConfig,
  facts: HotelScanFact[],
  domainInventory: HotelScannerV2DomainInventory | undefined,
) {
  if (config.propertyWide || !domainInventory || domainInventory.expectationState === "UNKNOWN") return facts;
  if (domainInventory.expectationState === "ABSENT") return [];

  const expectedItems = domainInventory.expectedItems;
  const namedLandingKeys = new Set(expectedItems
    .filter((item) => NAMED_INVENTORY_BASES.has(item.basis))
    .map((item) => entityKey(item.nameHint))
    .filter(Boolean));
  const detailUrls = new Set(expectedItems
    .filter((item) => item.basis === "deterministic_detail_resource")
    .flatMap((item) => item.urls));
  const anonymousSlotCount = expectedItems.filter((item) => item.basis === "deterministic_explicit_count_slot").length;
  const acceptedAnonymous = new Set<string>();

  function factEntity(fact: HotelScanFact) {
    const subject = entityKey((fact as HotelScanFact & { subject?: string }).subject);
    if (subject && !["hotel", "resort", "property"].includes(subject)) return subject;
    if ([
      "room_type", "venue", "service", "treatment", "treatment_category", "facility", "technology", "equipment", "amenity",
      "experience", "activity", "attraction", "offer", "event",
    ].includes(String((fact as HotelScanFact & { attribute?: string }).attribute || ""))) {
      return entityKey(fact.value);
    }
    return "";
  }

  const result: HotelScanFact[] = [];
  for (const fact of facts) {
    const enriched = fact as HotelScanFact & { subject?: string; attribute?: string };
    const entity = factEntity(fact);
    const sourcedFromDetail = fact.sourceUrls.some((url) => detailUrls.has(url));
    if (sourcedFromDetail) {
      result.push(fact);
      continue;
    }
    if (entity && namedLandingKeys.has(entity)) {
      result.push(fact);
      continue;
    }
    if (entity && anonymousSlotCount > 0) {
      if (acceptedAnonymous.has(entity) || acceptedAnonymous.size < anonymousSlotCount) {
        acceptedAnonymous.add(entity);
        result.push(fact);
      }
      continue;
    }
    if (!entity && enriched.attribute && result.some((accepted) => entityKey((accepted as HotelScanFact & { subject?: string }).subject) === entityKey(enriched.subject))) {
      result.push(fact);
    }
  }
  return result;
}

function languageInstruction(outputLanguage: HotelScannerV2OutputLanguage) {
  return outputLanguage === "bg"
    ? "Write human-readable labels and descriptive values in Bulgarian. Preserve official entity names, prices, times, emails and phone numbers exactly."
    : "Write human-readable labels and descriptive values in English. Preserve official entity names, prices, times, emails and phone numbers exactly.";
}

async function extractChunk(input: {
  config: DomainConfig;
  pages: PagePayload[];
  expected: ReturnType<typeof expectedInventoryPayload>;
  outputLanguage: HotelScannerV2OutputLanguage;
  model: string;
  chunkIndex: number;
  chunkCount: number;
}) {
  const sourceUrls = unique(input.pages.map((page) => page.url));
  const allowedUrls = new Set(sourceUrls);
  const response = await withBoundedRateLimitRetry(() => getClient().responses.create({
    model: input.model,
    store: false,
    max_output_tokens: Math.min(4_500, Math.max(1_500, 700 + Math.max(1, input.expected.expectedCount) * 220)),
    reasoning: { effort: "none" },
    instructions: [
      `You are the StayHub Production Hotel Scanner V2 ${input.config.domain} extractor.`,
      "The crawler and Inventory Engine have already determined what website surfaces and expected entities exist. You are NOT inventory authority.",
      "Use ONLY WEBSITE_EVIDENCE and EXPECTED_INVENTORY. Never browse, use outside knowledge, add an entity because it seems likely, or hide a contradiction.",
      "This is one bounded evidence chunk. Extract only facts supported by this chunk; later code merges chunks deterministically.",
      "For named EXPECTED_INVENTORY items, extract facts only for those entities or exact property-wide facts supported by the supplied pages.",
      "For unnamed deterministic count slots, you may identify names only when explicitly present in the supplied evidence, and never exceed the authoritative expected count.",
      "If an expected item has no supporting content, emit no invented fact for it. Completeness will report it as missing.",
      "Every fact must cite one or more exact URLs from ALLOWED_SOURCE_URLS.",
      "Facts must be atomic: one subject + one attribute + one value.",
      "Preserve conflicting values as separate facts with their own source URLs.",
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

  if (response.status === "incomplete") throw new Error(`hotel_scanner_v2_ai_incomplete:${input.config.domain}`);
  const outputText = String(response.output_text || "").trim();
  return outputText ? parseFacts(outputText, input.config, allowedUrls) : [];
}

async function extractDomain(
  config: DomainConfig,
  evidence: HotelScannerV2EvidenceBundle,
  siteMap: HotelScannerV2SiteMap,
  inventory: HotelScannerV2Inventory,
  outputLanguage: HotelScannerV2OutputLanguage,
  model: string,
): Promise<HotelScannerV2DomainExtraction> {
  const domainInventory = inventory.domains.find((entry) => entry.domain === config.domain);
  if (domainInventory?.expectationState === "ABSENT" && !config.propertyWide) {
    return { domain: config.domain, status: "SKIPPED", facts: [], sourceUrls: [], expectedCount: 0, latencyMs: 0, requestCount: 0 };
  }

  const sourceUrls = sourceUrlsForDomain(config, evidence, siteMap, domainInventory);
  const allowedUrls = new Set(sourceUrls);
  const pages = pagePayloads(evidence, allowedUrls);
  if (!pages.length) {
    return {
      domain: config.domain,
      status: "NO_EVIDENCE",
      facts: [],
      sourceUrls,
      expectedCount: domainInventory?.expectationState === "UNKNOWN" ? null : domainInventory?.expectedCount ?? null,
      latencyMs: 0,
      requestCount: 0,
    };
  }

  const expected = expectedInventoryPayload(domainInventory);
  const chunks = chunkPagePayloads(pages);
  const startedAt = Date.now();
  const extracted: HotelScanFact[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    extracted.push(...await extractChunk({
      config,
      pages: chunks[index],
      expected,
      outputLanguage,
      model,
      chunkIndex: index,
      chunkCount: chunks.length,
    }));
  }
  const facts = boundFactsToInventory(config, mergeFacts(extracted), domainInventory);
  return {
    domain: config.domain,
    status: facts.length ? "EXTRACTED" : "NO_EVIDENCE",
    facts,
    sourceUrls,
    expectedCount: domainInventory?.expectationState === "UNKNOWN" ? null : domainInventory?.expectedCount ?? null,
    latencyMs: Date.now() - startedAt,
    requestCount: chunks.length,
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
}): Promise<HotelScannerV2ExtractionResult> {
  const model = String(process.env.OPENAI_HOTEL_SCANNER_MODEL || "gpt-5.6-luna").trim();
  const domains = await mapWithConcurrency(DOMAIN_CONFIGS, DOMAIN_CONCURRENCY, (config) =>
    extractDomain(config, input.evidence, input.siteMap, input.inventory, input.outputLanguage, model));
  const facts = domains.flatMap((domain) => domain.facts);
  return {
    schemaVersion: "hotel-domain-extraction-v2",
    facts,
    domains,
    diagnostics: {
      model,
      extractedDomainCount: domains.filter((domain) => domain.status === "EXTRACTED").length,
      factCount: facts.length,
      aiRequestCount: domains.reduce((sum, domain) => sum + domain.requestCount, 0),
      maxEvidenceCharsPerRequest: MAX_AI_EVIDENCE_CHARS,
    },
  };
}
