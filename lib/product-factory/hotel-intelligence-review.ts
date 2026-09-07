import { findInvalidHotelProfileValues, validateHotelIntelligenceValue } from "@/lib/ai/hotel-intelligence-value-quality.mjs";
import type {
  HotelIntelligenceItem,
  HotelIntelligencePackage,
  HotelIntelligenceTarget,
} from "@/lib/product-factory/hotel-intelligence-package";

export const HOTEL_INTELLIGENCE_REVIEW_SCHEMA_VERSION = "hotel-intelligence-review-v1" as const;
export const APPROVED_HOTEL_INTELLIGENCE_SCHEMA_VERSION = "approved-hotel-intelligence-v1" as const;

export type HotelIntelligenceReviewDecision =
  | "pending"
  | "approved"
  | "rejected"
  | "corrected"
  | "added";

export type HotelIntelligenceReviewItem = {
  id: string;
  origin: "scanner" | "manual";
  category: string;
  label: string;
  scannerValue: string;
  effectiveValue: string;
  confidence: number | null;
  sourceUrls: string[];
  targets: HotelIntelligenceTarget[];
  decision: HotelIntelligenceReviewDecision;
  reviewerNote?: string;
};

export type HotelIntelligenceReviewContent = {
  schemaVersion: typeof HOTEL_INTELLIGENCE_REVIEW_SCHEMA_VERSION;
  source: HotelIntelligencePackage["source"];
  scannerGeneratedAt: string;
  hotelProfileLayer: HotelIntelligencePackage["hotelProfileLayer"];
  designIntelligenceLayer: HotelIntelligencePackage["designIntelligenceLayer"];
  items: HotelIntelligenceReviewItem[];
  unresolvedNotes: string[];
  scannerDiagnostics: {
    provider: "openai" | "deterministic_fallback" | "mixed" | "unknown";
    model: string;
    scannerVersion: "hotel-scanner-v1";
  };
};

export type ApprovedHotelIntelligenceEnvelope = {
  schemaVersion: typeof APPROVED_HOTEL_INTELLIGENCE_SCHEMA_VERSION;
  authority: "approved_hotel_intelligence_revision";
  lineage: {
    workspaceId: string;
    revisionId: string;
    revisionNo: number;
    scanRunId: string;
    scanEvidenceChecksum: string;
    contentChecksum: string;
    approvedAt: string;
    approvedBy: string;
  };
  intelligencePackage: HotelIntelligencePackage;
};

const DECISIONS = new Set<HotelIntelligenceReviewDecision>([
  "pending",
  "approved",
  "rejected",
  "corrected",
  "added",
]);

function text(value: unknown, max = 4_000) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : normalized.slice(0, max);
}

function unique(values: unknown[], max = 80, itemMax = 2_048) {
  return [...new Set(values.map((value) => text(value, itemMax)).filter(Boolean))].slice(0, max);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function scannerProvider(model: string) {
  if (model === "deterministic-fallback") return "deterministic_fallback" as const;
  if (model) return "openai" as const;
  return "unknown" as const;
}

function errorToken(value: unknown) {
  return text(value, 240).replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "invalid";
}

export function createHotelIntelligenceReviewContent(
  intelligencePackage: HotelIntelligencePackage,
  diagnostics?: { model?: unknown },
): HotelIntelligenceReviewContent {
  if (intelligencePackage?.schemaVersion !== "hotel-intelligence-v1") {
    throw new Error("HOTEL_INTELLIGENCE_SOURCE_PACKAGE_INVALID");
  }

  const model = text(diagnostics?.model, 160);
  return {
    schemaVersion: HOTEL_INTELLIGENCE_REVIEW_SCHEMA_VERSION,
    source: cloneJson(intelligencePackage.source),
    scannerGeneratedAt: intelligencePackage.generatedAt,
    hotelProfileLayer: cloneJson(intelligencePackage.hotelProfileLayer),
    designIntelligenceLayer: cloneJson(intelligencePackage.designIntelligenceLayer),
    items: intelligencePackage.evidenceLayer.facts.map((fact) => ({
      id: text(fact.id, 160),
      origin: "scanner" as const,
      category: text(fact.category, 160),
      label: text(fact.label, 240),
      scannerValue: text(fact.value),
      effectiveValue: text(fact.value),
      confidence: Number.isFinite(Number(fact.confidence)) ? Number(fact.confidence) : null,
      sourceUrls: unique(fact.sourceUrls || []),
      targets: [...fact.targets],
      decision: "pending" as const,
    })),
    unresolvedNotes: unique(intelligencePackage.evidenceLayer.uncertainties || [], 80, 1_000),
    scannerDiagnostics: {
      provider: scannerProvider(model),
      model,
      scannerVersion: "hotel-scanner-v1",
    },
  };
}

export function validateHotelIntelligenceReviewContent(
  value: unknown,
  options: { forApproval?: boolean } = {},
) {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["review_content_object_required"] };
  }

  const content = value as Partial<HotelIntelligenceReviewContent>;
  if (content.schemaVersion !== HOTEL_INTELLIGENCE_REVIEW_SCHEMA_VERSION) errors.push("schema_version_invalid");
  if (!text(content.source?.canonicalUrl, 2_048)) errors.push("canonical_url_required");
  if (!Array.isArray(content.items)) errors.push("items_array_required");
  if (!Array.isArray(content.unresolvedNotes)) errors.push("unresolved_notes_array_required");

  const ids = new Set<string>();
  for (const [index, candidate] of (content.items || []).entries()) {
    if (!candidate || typeof candidate !== "object") {
      errors.push(`item_${index}_object_required`);
      continue;
    }
    const item = candidate as HotelIntelligenceReviewItem;
    const id = text(item.id, 160);
    if (!id) errors.push(`item_${index}_id_required`);
    if (ids.has(id)) errors.push(`item_${index}_id_duplicate`);
    ids.add(id);
    if (item.origin !== "scanner" && item.origin !== "manual") errors.push(`item_${index}_origin_invalid`);
    if (!DECISIONS.has(item.decision)) errors.push(`item_${index}_decision_invalid`);
    if (!text(item.category, 160)) errors.push(`item_${index}_category_required`);
    if (!text(item.label, 240)) errors.push(`item_${index}_label_required`);
    if (!Array.isArray(item.sourceUrls)) errors.push(`item_${index}_source_urls_invalid`);
    if (!Array.isArray(item.targets)) errors.push(`item_${index}_targets_invalid`);

    if (item.origin === "manual" && item.decision !== "added") {
      errors.push(`item_${index}_manual_decision_invalid`);
    }
    if (item.decision === "corrected" && text(item.effectiveValue) === text(item.scannerValue)) {
      errors.push(`item_${index}_correction_missing`);
    }
    if (["approved", "corrected", "added"].includes(item.decision) && !text(item.effectiveValue)) {
      errors.push(`item_${index}_effective_value_required`);
    }
    if (["approved", "corrected", "added"].includes(item.decision) && text(item.effectiveValue)) {
      const quality = validateHotelIntelligenceValue({
        category: item.category,
        label: item.label,
        value: item.effectiveValue,
      });
      if (!quality.valid) {
        errors.push(`item_${index}_effective_value_invalid_${errorToken(quality.reason)}`);
      }
    }
    if (options.forApproval && item.decision === "pending") errors.push(`item_${index}_pending`);
  }

  if (options.forApproval && (content.unresolvedNotes || []).some((item) => text(item, 1_000))) {
    errors.push("unresolved_notes_present");
  }

  if (options.forApproval) {
    for (const invalid of findInvalidHotelProfileValues(content.hotelProfileLayer)) {
      errors.push(`hotel_profile_invalid_${errorToken(invalid.path)}_${errorToken(invalid.reason)}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function reviewedFact(item: HotelIntelligenceReviewItem): HotelIntelligenceItem {
  return {
    id: item.id,
    category: item.category,
    label: item.label,
    value: item.effectiveValue,
    confidence: item.origin === "manual" ? 1 : Number(item.confidence ?? 1),
    sourceUrls: [...item.sourceUrls],
    targets: [...item.targets],
    status: "candidate",
  };
}

export function buildApprovedHotelIntelligencePackage(
  content: HotelIntelligenceReviewContent,
): HotelIntelligencePackage {
  const validation = validateHotelIntelligenceReviewContent(content, { forApproval: true });
  if (!validation.ok) {
    throw new Error(`HOTEL_INTELLIGENCE_APPROVAL_INVALID:${validation.errors.join(",")}`);
  }

  const facts = content.items
    .filter((item) => item.decision !== "rejected")
    .map(reviewedFact);
  const routed = (target: HotelIntelligenceTarget) => facts.filter((fact) => fact.targets.includes(target));
  const hub = routed("hub");
  const smartSetup = routed("smart_setup");
  const designStudio = routed("design_studio");
  const review = routed("review");

  return {
    schemaVersion: "hotel-intelligence-v1",
    generatedAt: content.scannerGeneratedAt,
    source: cloneJson(content.source),
    evidenceLayer: {
      facts,
      sourceUrls: unique([content.source.canonicalUrl, ...facts.flatMap((fact) => fact.sourceUrls)]),
      uncertainties: [],
    },
    hotelProfileLayer: cloneJson(content.hotelProfileLayer),
    designIntelligenceLayer: cloneJson(content.designIntelligenceLayer),
    routing: { hub, smartSetup, designStudio, review },
    readiness: {
      evidenceFactCount: facts.length,
      hubCandidateCount: hub.length,
      smartSetupCandidateCount: smartSetup.length,
      designSignalCount: [
        ...content.designIntelligenceLayer.colors,
        ...content.designIntelligenceLayer.fonts,
        ...content.designIntelligenceLayer.styleKeywords,
      ].filter(Boolean).length,
      reviewRequiredCount: 0,
    },
  };
}
