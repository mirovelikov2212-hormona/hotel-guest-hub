import { createHash } from "node:crypto";

import type { VerifiedHotelScanFact, HotelScanVerificationConflict } from "@/lib/ai/hotel-scanner-verification.mjs";
import type { HotelScannerV2Inventory } from "@/lib/server/hotel-scanner-v2-inventory.mjs";
import type { HotelScannerV2Completeness } from "@/lib/server/hotel-scanner-v2-completeness.mjs";

export type HotelIntelligenceCandidateV2 = {
  schemaVersion: "hotel-intelligence-candidate-v2";
  generatedAt: string;
  source: {
    requestedUrl: string;
    canonicalUrl: string;
    scannedAt: string;
  };
  inventory: HotelScannerV2Inventory;
  facts: VerifiedHotelScanFact[];
  conflicts: HotelScanVerificationConflict[];
  completeness: HotelScannerV2Completeness;
  provenance: {
    pageUrls: string[];
    documentUrls: string[];
    crawlerVersion: "production-hotel-intake-v2";
    extractionVersion: "domain-extractors-v2";
    verificationVersion: "hotel-scan-verification-v2";
  };
  validation: {
    status: "READY_FOR_APPROVAL" | "BLOCKED";
    downstreamHandoffAllowed: false;
    blockingReasons: string[];
  };
};

export type ApprovedHotelIntelligenceV2 = Omit<HotelIntelligenceCandidateV2, "schemaVersion" | "validation"> & {
  schemaVersion: "approved-hotel-intelligence-v2";
  status: "APPROVED";
  approval: {
    approvedByAdminId: string;
    approvedAt: string;
    candidateChecksum: string;
  };
  downstreamHandoffAllowed: true;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hotelIntelligenceCandidateChecksumV2(candidate: HotelIntelligenceCandidateV2) {
  return createHash("sha256").update(stable(candidate)).digest("hex");
}

export function buildHotelIntelligenceCandidateV2(input: {
  source: HotelIntelligenceCandidateV2["source"];
  inventory: HotelScannerV2Inventory;
  facts: VerifiedHotelScanFact[];
  conflicts: HotelScanVerificationConflict[];
  completeness: HotelScannerV2Completeness;
  pageUrls: string[];
  documentUrls: string[];
}): HotelIntelligenceCandidateV2 {
  const ready = input.completeness.prerequisitesSatisfied && input.conflicts.length === 0;
  const blockingReasons = [
    ...input.completeness.blockingReasons,
    ...(input.conflicts.length ? ["unresolved_cross_source_conflicts"] : []),
  ];
  return {
    schemaVersion: "hotel-intelligence-candidate-v2",
    generatedAt: new Date().toISOString(),
    source: input.source,
    inventory: input.inventory,
    facts: input.facts,
    conflicts: input.conflicts,
    completeness: input.completeness,
    provenance: {
      pageUrls: [...new Set(input.pageUrls)].sort(),
      documentUrls: [...new Set(input.documentUrls)].sort(),
      crawlerVersion: "production-hotel-intake-v2",
      extractionVersion: "domain-extractors-v2",
      verificationVersion: "hotel-scan-verification-v2",
    },
    validation: {
      status: ready ? "READY_FOR_APPROVAL" : "BLOCKED",
      downstreamHandoffAllowed: false,
      blockingReasons: [...new Set(blockingReasons)],
    },
  };
}

export function approveHotelIntelligenceV2(input: {
  candidate: HotelIntelligenceCandidateV2;
  approvedByAdminId: string;
  approvedAt?: string;
}): ApprovedHotelIntelligenceV2 {
  const approvedByAdminId = String(input.approvedByAdminId || "").trim();
  if (!approvedByAdminId) throw new Error("hotel_intelligence_v2_approver_required");
  if (input.candidate.validation.status !== "READY_FOR_APPROVAL" || !input.candidate.completeness.prerequisitesSatisfied || input.candidate.conflicts.length) {
    throw new Error("hotel_intelligence_v2_not_ready_for_approval");
  }

  const { schemaVersion: _schemaVersion, validation: _validation, ...candidate } = input.candidate;
  return {
    ...candidate,
    schemaVersion: "approved-hotel-intelligence-v2",
    status: "APPROVED",
    approval: {
      approvedByAdminId,
      approvedAt: input.approvedAt || new Date().toISOString(),
      candidateChecksum: hotelIntelligenceCandidateChecksumV2(input.candidate),
    },
    downstreamHandoffAllowed: true,
  };
}

export function isApprovedHotelIntelligenceV2(value: unknown): value is ApprovedHotelIntelligenceV2 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ApprovedHotelIntelligenceV2>;
  return candidate.schemaVersion === "approved-hotel-intelligence-v2"
    && candidate.status === "APPROVED"
    && candidate.downstreamHandoffAllowed === true
    && Boolean(candidate.approval?.approvedByAdminId)
    && Boolean(candidate.approval?.candidateChecksum);
}
