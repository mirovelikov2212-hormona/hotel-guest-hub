import type {
  HotelScannerV2EvidenceBundle,
  HotelScannerV2PageEvidence,
} from "@/lib/server/hotel-scanner-v2-crawler";
import {
  classifyHotelScannerPageV2,
  hotelScannerPageTypeDomain,
} from "@/lib/server/hotel-scanner-v2-page-classifier.mjs";

const SUPPORT_DOMAINS = new Set(["policies", "faq", "contacts"]);
const OPERATIONAL_TEXT_LIMIT = 800;
const OPERATIONAL_BLOCK_TEXT_LIMIT = 300;
const SUPPORT_TEXT_LIMIT = 20_000;
const SUPPORT_BLOCK_TEXT_LIMIT = 4_000;
const PAGE_LINK_LIMIT = 160;
const PAGE_BLOCK_LIMIT = 80;
const BLOCK_LINK_LIMIT = 80;

function compactPage(page: HotelScannerV2PageEvidence): HotelScannerV2PageEvidence {
  const classification = classifyHotelScannerPageV2(page);
  const domain = hotelScannerPageTypeDomain(classification.primaryType);
  const preserveSupportText = SUPPORT_DOMAINS.has(domain);
  const textLimit = preserveSupportText ? SUPPORT_TEXT_LIMIT : OPERATIONAL_TEXT_LIMIT;
  const blockTextLimit = preserveSupportText ? SUPPORT_BLOCK_TEXT_LIMIT : OPERATIONAL_BLOCK_TEXT_LIMIT;

  const v3Structure = page.v3Structure ? {
    ...page.v3Structure,
    repeatedStructures: (page.v3Structure.repeatedStructures || []).slice(0, 60).map((group) => ({
      ...group,
      items: (group.items || []).slice(0, 128),
    })),
  } : undefined;

  return {
    url: page.url,
    title: page.title,
    description: String(page.description || "").slice(0, 1_000),
    text: String(page.text || "").slice(0, textLimit),
    links: (page.links || []).slice(0, PAGE_LINK_LIMIT),
    contentLinks: (page.contentLinks || []).slice(0, PAGE_LINK_LIMIT),
    navigationLinks: (page.navigationLinks || []).slice(0, 80),
    documentUrls: (page.documentUrls || []).slice(0, 80),
    canonicalHint: page.canonicalHint,
    language: page.language,
    languageAlternates: (page.languageAlternates || []).slice(0, 20),
    headings: (page.headings || []).slice(0, 80),
    jsonLdEntities: (page.jsonLdEntities || []).slice(0, 60),
    contentBlocks: (page.contentBlocks || []).slice(0, PAGE_BLOCK_LIMIT).map((block) => ({
      ...block,
      text: String(block.text || "").slice(0, blockTextLimit),
      links: (block.links || []).slice(0, BLOCK_LINK_LIMIT),
      linkItems: (block.linkItems || []).slice(0, BLOCK_LINK_LIMIT),
    })),
    v3Structure,
    contactSignals: {
      phones: (page.contactSignals?.phones || []).slice(0, 20),
      emails: (page.contactSignals?.emails || []).slice(0, 20),
      addresses: (page.contactSignals?.addresses || []).slice(0, 20),
    },
    delegatedOfferDetailUrls: (page.delegatedOfferDetailUrls || []).slice(0, 24),
    delegatedAuthority: page.delegatedAuthority,
  };
}

export function projectHotelScannerDiscoveryCheckpointV3(
  evidence: HotelScannerV2EvidenceBundle,
): HotelScannerV2EvidenceBundle {
  const checkpoint: HotelScannerV2EvidenceBundle = {
    ...evidence,
    pages: (evidence.pages || []).map(compactPage),
    // The snapshot is derived state. Rebuild it after continuation rather than
    // serializing the large ontology/provenance object through Workflow input.
    v3InventorySnapshot: undefined,
    discovery: {
      ...evidence.discovery,
    },
    publicDocuments: [...(evidence.publicDocuments || [])],
    crawlPolicy: {
      ...evidence.crawlPolicy,
      propertyScope: { ...evidence.crawlPolicy.propertyScope },
    },
  };
  return checkpoint;
}

export function hotelScannerDiscoveryCheckpointBytesV3(
  evidence: HotelScannerV2EvidenceBundle,
) {
  return Buffer.byteLength(JSON.stringify(evidence), "utf8");
}

export const HOTEL_SCANNER_V3_CHECKPOINT_LIMITS = Object.freeze({
  operationalTextBytesPerPage: OPERATIONAL_TEXT_LIMIT,
  operationalBlockTextBytes: OPERATIONAL_BLOCK_TEXT_LIMIT,
  supportTextBytesPerPage: SUPPORT_TEXT_LIMIT,
  pageLinkLimit: PAGE_LINK_LIMIT,
  pageBlockLimit: PAGE_BLOCK_LIMIT,
});
