import type {
  HotelScannerV2EvidenceBundle,
  HotelScannerV2PageEvidence,
} from "@/lib/server/hotel-scanner-v2-crawler";
import {
  classifyHotelScannerPageV2,
  hotelScannerPageTypeDomain,
} from "@/lib/server/hotel-scanner-v2-page-classifier.mjs";

const SUPPORT_DOMAINS = new Set(["policies", "faq", "contacts"]);
const OPERATIONAL_TEXT_LIMIT = 2_000;
const OPERATIONAL_BLOCK_TEXT_LIMIT = 800;

function compactPage(page: HotelScannerV2PageEvidence): HotelScannerV2PageEvidence {
  const classification = classifyHotelScannerPageV2(page);
  const domain = hotelScannerPageTypeDomain(classification.primaryType);
  const preserveSupportText = SUPPORT_DOMAINS.has(domain);

  return {
    ...page,
    text: preserveSupportText
      ? String(page.text || "")
      : String(page.text || "").slice(0, OPERATIONAL_TEXT_LIMIT),
    contentBlocks: (page.contentBlocks || []).map((block) => ({
      ...block,
      text: preserveSupportText
        ? String(block.text || "")
        : String(block.text || "").slice(0, OPERATIONAL_BLOCK_TEXT_LIMIT),
    })),
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
});
