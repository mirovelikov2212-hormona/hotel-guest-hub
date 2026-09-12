import { findInvalidHotelProfileValues, validateHotelIntelligenceValue } from "@/lib/ai/hotel-intelligence-value-quality.mjs";
import type {
  HotelReviewSemanticIssue,
  HotelReviewSemanticKind,
  HotelReviewSemanticsV2,
} from "@/lib/ai/hotel-review-semantics-v2.mjs";
import type {
  HotelIntelligenceItem,
  HotelIntelligencePackage,
  HotelIntelligenceTarget,
} from "@/lib/product-factory/hotel-intelligence-package";
import { professionalizeHotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-professionalizer.mjs";

export const HOTEL_INTELLIGENCE_REVIEW_SCHEMA_VERSION = "hotel-intelligence-review-v1" as const;
export const APPROVED_HOTEL_INTELLIGENCE_SCHEMA_VERSION = "approved-hotel-intelligence-v1" as const;

export type HotelIntelligenceReviewDecision =
  | "pending"
  | "approved"
  | "rejected"
  | "corrected"
  | "added";

export type HotelFactVerificationStatus = "VERIFIED" | "SINGLE_SOURCE" | "CONFLICT" | "UNSCORED";

export type HotelFactVerificationMetadata = {
  status: HotelFactVerificationStatus;
  independentSourceCount: number;
  sourceUrls: string[];
};

export type HotelIntelligenceReviewItem = {
  id: string;
  origin: "scanner" | "manual";
  category: string;
  subject?: string;
  attribute?: string;
  verification?: HotelFactVerificationMetadata;
  label: string;
  scannerValue: string;
  effectiveValue: string;
  confidence: number | null;
  sourceUrls: string[];
  targets: HotelIntelligenceTarget[];
  decision: HotelIntelligenceReviewDecision;
  reviewerNote?: string;
};

export type HotelIntelligenceReviewTask = {
  id: string;
  kind: HotelReviewSemanticKind;
  state: string;
  domain?: string;
  subject: string;
  detail: string;
  sourceUrls: string[];
  candidateUrls: string[];
  observedValue?: string;
  requiresHumanReview: boolean;
  decision: HotelIntelligenceReviewDecision;
  reviewerNote?: string;
};

export type HotelIntelligenceReviewProjection = {
  schemaVersion: "hotel-review-semantics-v2";
  authority: {
    kind: "review_projection_only";
    persistenceAuthority: false;
    lifecycleReadinessAuthority: false;
    approvalAuthority: false;
  };
  lineage: {
    scanRunId: string;
    scanEvidenceChecksum: string;
  };
  tasks: HotelIntelligenceReviewTask[];
};

export type HotelIntelligenceReviewContent = {
  schemaVersion: typeof HOTEL_INTELLIGENCE_REVIEW_SCHEMA_VERSION;
  source: HotelIntelligencePackage["source"];
  scannerGeneratedAt: string;
  hotelProfileLayer: HotelIntelligencePackage["hotelProfileLayer"];
  designIntelligenceLayer: HotelIntelligencePackage["designIntelligenceLayer"];
  items: HotelIntelligenceReviewItem[];
  unresolvedNotes: string[];
  reviewProjection?: HotelIntelligenceReviewProjection;
  scannerDiagnostics: {
    provider: "openai" | "deterministic_fallback" | "mixed" | "unknown";
    model: string;
    scannerVersion: "hotel-scanner-v1" | "hotel-scanner-v2-verification";
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

const REVIEW_SEMANTIC_KINDS = new Set<HotelReviewSemanticKind>([
  "conflict",
  "coverage_gap",
  "invalid_value",
  "profile_evidence_mismatch",
  "technology_ambiguity",
  "human_enrichment",
]);

const VERIFICATION_STATUSES = new Set<HotelFactVerificationStatus>([
  "VERIFIED",
  "SINGLE_SOURCE",
  "CONFLICT",
  "UNSCORED",
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

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableJsonValue(child)]),
    );
  }
  return value;
}

function scannerProvider(model: string) {
  if (model === "deterministic-fallback") return "deterministic_fallback" as const;
  if (model) return "openai" as const;
  return "unknown" as const;
}

function errorToken(value: unknown) {
  return text(value, 240).replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "invalid";
}

function evidenceMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<HotelFactVerificationMetadata>;
  const status = text(candidate.status, 40) as HotelFactVerificationStatus;
  if (!VERIFICATION_STATUSES.has(status)) return undefined;
  const independentSourceCount = Number(candidate.independentSourceCount || 0);
  return {
    status,
    independentSourceCount: Number.isFinite(independentSourceCount) && independentSourceCount >= 0
      ? Math.floor(independentSourceCount)
      : 0,
    sourceUrls: unique(Array.isArray(candidate.sourceUrls) ? candidate.sourceUrls : [], 24),
  } satisfies HotelFactVerificationMetadata;
}

function requireReviewSemantics(value: unknown): HotelReviewSemanticsV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("HOTEL_INTELLIGENCE_REVIEW_SEMANTICS_INVALID");
  }
  const semantics = value as Partial<HotelReviewSemanticsV2>;
  if (semantics.schemaVersion !== "hotel-review-semantics-v2") {
    throw new Error("HOTEL_INTELLIGENCE_REVIEW_SEMANTICS_INVALID");
  }
  if (
    semantics.authority?.kind !== "review_projection_only"
    || semantics.authority.persistenceAuthority !== false
    || semantics.authority.lifecycleReadinessAuthority !== false
    || semantics.authority.approvalAuthority !== false
    || !Array.isArray(semantics.issues)
  ) {
    throw new Error("HOTEL_INTELLIGENCE_REVIEW_SEMANTICS_AUTHORITY_INVALID");
  }
  return value as HotelReviewSemanticsV2;
}

function priorTaskResolutions(content: unknown) {
  const projection = content && typeof content === "object" && !Array.isArray(content)
    ? (content as { reviewProjection?: { tasks?: unknown } }).reviewProjection
    : undefined;
  const tasks = Array.isArray(projection?.tasks) ? projection.tasks : [];
  const resolutions = new Map<string, { decision: HotelIntelligenceReviewDecision; reviewerNote?: string }>();
  for (const raw of tasks) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const task = raw as { id?: unknown; decision?: unknown; reviewerNote?: unknown };
    const id = text(task.id, 180);
    const decision = text(task.decision, 40) as HotelIntelligenceReviewDecision;
    if (!id || !DECISIONS.has(decision)) continue;
    const reviewerNote = text(task.reviewerNote, 1_000);
    resolutions.set(id, {
      decision,
      ...(reviewerNote ? { reviewerNote } : {}),
    });
  }
  return resolutions;
}

function projectedTask(
  issue: HotelReviewSemanticIssue,
  resolution?: { decision: HotelIntelligenceReviewDecision; reviewerNote?: string },
): HotelIntelligenceReviewTask {
  const id = text(issue.id, 180);
  const kind = text(issue.kind, 80) as HotelReviewSemanticKind;
  if (!id || !REVIEW_SEMANTIC_KINDS.has(kind)) {
    throw new Error("HOTEL_INTELLIGENCE_REVIEW_SEMANTICS_ISSUE_INVALID");
  }
  const domain = text(issue.domain, 120);
  const observedValue = text(issue.observedValue, 1_000);
  return {
    id,
    kind,
    state: text(issue.state, 120),
    ...(domain ? { domain } : {}),
    subject: text(issue.subject, 240),
    detail: text(issue.detail, 2_000),
    sourceUrls: unique(issue.sourceUrls || [], 20),
    candidateUrls: unique(issue.candidateUrls || [], 20),
    ...(observedValue ? { observedValue } : {}),
    requiresHumanReview: issue.requiresHumanReview === true,
    decision: resolution?.decision || "pending",
    ...(resolution?.reviewerNote ? { reviewerNote: resolution.reviewerNote } : {}),
  };
}

export function projectHotelReviewSemanticsV2(input: {
  content: unknown;
  reviewSemantics: unknown;
  scanRunId: string;
  scanEvidenceChecksum: string;
}): HotelIntelligenceReviewContent {
  if (!input.content || typeof input.content !== "object" || Array.isArray(input.content)) {
    throw new Error("HOTEL_INTELLIGENCE_REVIEW_CONTENT_INVALID");
  }
  const semantics = requireReviewSemantics(input.reviewSemantics);
  const scanRunId = text(input.scanRunId, 160);
  const scanEvidenceChecksum = text(input.scanEvidenceChecksum, 80).toLowerCase();
  if (!scanRunId || !/^[a-f0-9]{64}$/.test(scanEvidenceChecksum)) {
    throw new Error("HOTEL_INTELLIGENCE_REVIEW_PROJECTION_LINEAGE_INVALID");
  }
  const resolutions = priorTaskResolutions(input.content);
  const tasks = semantics.issues.map((issue) => projectedTask(issue, resolutions.get(text(issue.id, 180))));
  return {
    ...(cloneJson(input.content) as HotelIntelligenceReviewContent),
    reviewProjection: {
      schemaVersion: "hotel-review-semantics-v2",
      authority: {
        kind: "review_projection_only",
        persistenceAuthority: false,
        lifecycleReadinessAuthority: false,
        approvalAuthority: false,
      },
      lineage: { scanRunId, scanEvidenceChecksum },
      tasks,
    },
  };
}

export function assertHotelReviewSemanticsProjectionMatches(input: {
  content: HotelIntelligenceReviewContent;
  reviewSemantics: unknown;
  scanRunId: string;
  scanEvidenceChecksum: string;
}) {
  const canonical = projectHotelReviewSemanticsV2(input).reviewProjection;
  const actual = input.content.reviewProjection;
  if (JSON.stringify(stableJsonValue(actual)) !== JSON.stringify(stableJsonValue(canonical))) {
    throw new Error("HOTEL_INTELLIGENCE_REVIEW_PROJECTION_MISMATCH");
  }
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
    items: intelligencePackage.evidenceLayer.facts.map((fact) => {
      const enriched = fact as HotelIntelligenceItem & {
        subject?: unknown;
        attribute?: unknown;
        verification?: unknown;
      };
      const subject = text(enriched.subject, 240);
      const attribute = text(enriched.attribute, 120);
      const verification = evidenceMetadata(enriched.verification);
      return {
        id: text(fact.id, 160),
        origin: "scanner" as const,
        category: text(fact.category, 160),
        ...(subject ? { subject } : {}),
        ...(attribute ? { attribute } : {}),
        ...(verification ? { verification } : {}),
        label: text(fact.label, 240),
        scannerValue: text(fact.value),
        effectiveValue: text(fact.value),
        confidence: Number.isFinite(Number(fact.confidence)) ? Number(fact.confidence) : null,
        sourceUrls: unique(fact.sourceUrls || []),
        targets: [...fact.targets],
        decision: "pending" as const,
      };
    }),
    unresolvedNotes: unique(intelligencePackage.evidenceLayer.uncertainties || [], 80, 1_000),
    scannerDiagnostics: {
      provider: scannerProvider(model),
      model,
      scannerVersion: "hotel-scanner-v2-verification",
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

    if (item.verification !== undefined) {
      const verification = evidenceMetadata(item.verification);
      if (!verification) errors.push(`item_${index}_verification_invalid`);
    }

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

  if (content.reviewProjection !== undefined) {
    const projection = content.reviewProjection;
    if (!projection || typeof projection !== "object" || Array.isArray(projection)) {
      errors.push("review_projection_object_required");
    } else {
      if (projection.schemaVersion !== "hotel-review-semantics-v2") errors.push("review_projection_schema_invalid");
      if (
        projection.authority?.kind !== "review_projection_only"
        || projection.authority.persistenceAuthority !== false
        || projection.authority.lifecycleReadinessAuthority !== false
        || projection.authority.approvalAuthority !== false
      ) errors.push("review_projection_authority_invalid");
      if (!text(projection.lineage?.scanRunId, 160)) errors.push("review_projection_scan_run_required");
      if (!/^[a-f0-9]{64}$/.test(text(projection.lineage?.scanEvidenceChecksum, 80).toLowerCase())) {
        errors.push("review_projection_scan_checksum_invalid");
      }
      if (!Array.isArray(projection.tasks)) {
        errors.push("review_projection_tasks_array_required");
      } else {
        const taskIds = new Set<string>();
        for (const [index, task] of projection.tasks.entries()) {
          if (!task || typeof task !== "object" || Array.isArray(task)) {
            errors.push(`review_task_${index}_object_required`);
            continue;
          }
          const id = text(task.id, 180);
          if (!id) errors.push(`review_task_${index}_id_required`);
          if (taskIds.has(id)) errors.push(`review_task_${index}_id_duplicate`);
          taskIds.add(id);
          if (!REVIEW_SEMANTIC_KINDS.has(task.kind)) errors.push(`review_task_${index}_kind_invalid`);
          if (!text(task.state, 120)) errors.push(`review_task_${index}_state_required`);
          if (!text(task.subject, 240)) errors.push(`review_task_${index}_subject_required`);
          if (!text(task.detail, 2_000)) errors.push(`review_task_${index}_detail_required`);
          if (!Array.isArray(task.sourceUrls)) errors.push(`review_task_${index}_source_urls_invalid`);
          if (!Array.isArray(task.candidateUrls)) errors.push(`review_task_${index}_candidate_urls_invalid`);
          if (typeof task.requiresHumanReview !== "boolean") errors.push(`review_task_${index}_human_review_invalid`);
          if (!DECISIONS.has(task.decision)) errors.push(`review_task_${index}_decision_invalid`);
          if (options.forApproval && task.requiresHumanReview && task.decision === "pending") {
            errors.push(`review_task_${index}_pending`);
          }
        }
      }
    }
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

type ReviewedEvidenceItem = HotelIntelligenceItem & {
  subject?: string;
  attribute?: string;
  verification?: HotelFactVerificationMetadata;
};

function reviewedFact(item: HotelIntelligenceReviewItem): HotelIntelligenceItem {
  const result: ReviewedEvidenceItem = {
    id: item.id,
    category: item.category,
    ...(item.subject ? { subject: item.subject } : {}),
    ...(item.attribute ? { attribute: item.attribute } : {}),
    ...(item.verification ? { verification: cloneJson(item.verification) } : {}),
    label: item.label,
    value: item.effectiveValue,
    confidence: item.origin === "manual" ? 1 : Number(item.confidence ?? 1),
    sourceUrls: [...item.sourceUrls],
    targets: [...item.targets],
    status: "candidate",
  };
  return result;
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

  const basePackage: HotelIntelligencePackage = {
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

  return professionalizeHotelIntelligencePackage(basePackage, { humanReviewResolved: true }) as HotelIntelligencePackage;
}
