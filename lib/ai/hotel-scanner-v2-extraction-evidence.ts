import type { HotelScannerV2EvidenceBundle } from "@/lib/server/hotel-scanner-v2-crawler";
import type { HotelScannerV2SiteMap } from "@/lib/server/hotel-scanner-v2-site-map.mjs";
import type { HotelScannerV2DomainInventory } from "@/lib/server/hotel-scanner-v2-inventory.mjs";
import {
  MAX_AI_EVIDENCE_CHARS,
  MAX_CONTENT_BLOCKS_PER_PAGE,
  MAX_CONTENT_BLOCK_TEXT_CHARS,
  MAX_HEADINGS_PER_PAGE,
  MAX_JSON_LD_PER_PAGE,
  MAX_PAGE_TEXT_CHARS,
  type HotelScannerV2DomainConfig,
} from "@/lib/ai/hotel-scanner-v2-extraction-config";

export type HotelScannerV2PagePayload = {
  url: string;
  title: string;
  description: string;
  headings: unknown[];
  content_blocks: Array<{ heading: string; text: string; links: unknown[] }>;
  json_ld_entities: Array<{ name: string; types: unknown[] }>;
  text: string;
};

export function cleanV2(value: unknown, max = 500) {
  const text = String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
  return text.length <= max ? text : text.slice(0, max);
}

export function entityKeyV2(value: unknown) {
  return cleanV2(value, 240)
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function uniqueV2(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function pageTypeSet(resource: HotelScannerV2SiteMap["resources"][number]) {
  return new Set(resource.classification?.types || []);
}

export function sourceUrlsForDomainV2(
  config: HotelScannerV2DomainConfig,
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
  return uniqueV2([...urls]);
}

function compactPagePayload(page: HotelScannerV2EvidenceBundle["pages"][number]): HotelScannerV2PagePayload {
  return {
    url: page.url,
    title: cleanV2(page.title, 300),
    description: cleanV2(page.description, 700),
    headings: page.headings.slice(0, MAX_HEADINGS_PER_PAGE),
    content_blocks: page.contentBlocks.slice(0, MAX_CONTENT_BLOCKS_PER_PAGE).map((block) => ({
      heading: cleanV2(block?.heading, 240),
      text: cleanV2(block?.text, MAX_CONTENT_BLOCK_TEXT_CHARS),
      links: Array.isArray(block?.links) ? block.links.slice(0, 8) : [],
    })),
    json_ld_entities: page.jsonLdEntities.slice(0, MAX_JSON_LD_PER_PAGE).map((entity) => ({
      name: cleanV2(entity?.name, 240),
      types: Array.isArray(entity?.types) ? entity.types.slice(0, 8) : [],
    })),
    text: cleanV2(page.text, MAX_PAGE_TEXT_CHARS),
  };
}

export function pagePayloadsV2(evidence: HotelScannerV2EvidenceBundle, allowedUrls: Set<string>) {
  return evidence.pages.filter((page) => allowedUrls.has(page.url)).map(compactPagePayload);
}

export function chunkPagePayloadsV2(pages: HotelScannerV2PagePayload[]) {
  const chunks: HotelScannerV2PagePayload[][] = [];
  let current: HotelScannerV2PagePayload[] = [];
  let currentChars = 0;
  for (const page of pages) {
    const pageChars = JSON.stringify(page).length;
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

export function expectedInventoryPayloadV2(domainInventory: HotelScannerV2DomainInventory | undefined) {
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
