import "server-only";

import crypto from "crypto";

import type { HotelScanProfile } from "@/lib/ai/hotel-scanner";
import {
  buildHotelIntelligencePackage,
  type HotelIntelligencePackage,
} from "@/lib/product-factory/hotel-intelligence-package";
import {
  APPROVED_HOTEL_INTELLIGENCE_SCHEMA_VERSION,
  HOTEL_INTELLIGENCE_REVIEW_SCHEMA_VERSION,
  assertHotelReviewSemanticsProjectionMatches,
  buildApprovedHotelIntelligencePackage,
  createHotelIntelligenceReviewContent,
  projectHotelReviewSemanticsV2,
  validateHotelIntelligenceReviewContent,
  type ApprovedHotelIntelligenceEnvelope,
  type HotelIntelligenceReviewContent,
} from "@/lib/product-factory/hotel-intelligence-review";
import { buildHotelScanEvidenceChecksum } from "@/lib/server/hotel-scan-run-payload.mjs";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type HotelIntelligenceRevisionMetadata = {
  id: string;
  revisionNo: number;
  parentRevisionId: string | null;
  approvedFromRevisionId: string | null;
  status: "draft" | "approved";
  scanRunId: string | null;
  scanEvidenceChecksum: string | null;
  scannerPackageChecksum: string;
  contentChecksum: string;
  createdAt: string;
  createdBy: string;
  approvedAt: string | null;
  approvedBy: string | null;
};

export type HotelIntelligenceWorkspaceSnapshot = {
  workspace: {
    id: string;
    sourceKey: string;
    canonicalUrl: string;
    hotelName: string;
    currentRevisionId: string | null;
    approvedRevisionId: string | null;
    createdAt: string;
    updatedAt: string;
  };
  revisions: HotelIntelligenceRevisionMetadata[];
  currentContent: HotelIntelligenceReviewContent | null;
};

type HotelScanRunReviewSource = {
  scanRunId: string;
  sourceKey: string;
  requestedUrl: string;
  canonicalUrl: string;
  scannedUrls: string[];
  scannedAt: string;
  evidenceChecksum: string;
  evidenceSnapshot: Record<string, unknown>;
  reviewSemantics: Record<string, unknown>;
  technologySignals: Record<string, unknown>;
  designSignals: Record<string, unknown>;
  scannerMetadata: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
  intelligencePackage: HotelIntelligencePackage;
};

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function stableHotelIntelligenceStringify(value: unknown) {
  return JSON.stringify(stableValue(value));
}

export function normalizeHotelIntelligenceCanonicalUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    throw new Error("HOTEL_INTELLIGENCE_CANONICAL_URL_INVALID");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("HOTEL_INTELLIGENCE_CANONICAL_URL_INVALID");
  }
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString();
}

export function buildHotelIntelligenceSourceKey(canonicalUrl: string) {
  return sha256Hex(`stayhub:hotel-intelligence-source:v1:${normalizeHotelIntelligenceCanonicalUrl(canonicalUrl)}`);
}

function requirePackage(value: unknown): HotelIntelligencePackage {
  if (!value || typeof value !== "object") throw new Error("HOTEL_INTELLIGENCE_SOURCE_PACKAGE_REQUIRED");
  const pkg = value as Partial<HotelIntelligencePackage>;
  if (pkg.schemaVersion !== "hotel-intelligence-v1") throw new Error("HOTEL_INTELLIGENCE_SOURCE_PACKAGE_INVALID");
  normalizeHotelIntelligenceCanonicalUrl(String(pkg.source?.canonicalUrl || ""));
  return value as HotelIntelligencePackage;
}

function reviewContent(value: unknown) {
  const validation = validateHotelIntelligenceReviewContent(value);
  if (!validation.ok) {
    throw new Error(`HOTEL_INTELLIGENCE_REVIEW_CONTENT_INVALID:${validation.errors.join(",")}`);
  }
  return JSON.parse(stableHotelIntelligenceStringify(value)) as HotelIntelligenceReviewContent;
}

function safeModel(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function objectValue(value: unknown, code: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function stringArray(value: unknown, code: string) {
  if (!Array.isArray(value)) throw new Error(code);
  const result = value.map((item) => String(item || "").trim()).filter(Boolean);
  if (!result.length) throw new Error(code);
  return result;
}

async function loadHotelScanRunReviewSource(scanRunId: string): Promise<HotelScanRunReviewSource> {
  const id = String(scanRunId || "").trim();
  if (!id) throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_REQUIRED");

  const { data, error } = await supabaseAdmin
    .from("hotel_scan_runs")
    .select("id,source_key,requested_url,canonical_url,scanned_urls,schema_version,evidence_checksum,evidence_json,technology_json,design_signals_json,scanner_metadata_json,diagnostics_json,scanned_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`HOTEL_INTELLIGENCE_SCAN_RUN_READ_FAILED:${error.message}`);
  if (!data) throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_NOT_FOUND");
  if (data.schema_version !== "hotel-scan-run-v1") throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_SCHEMA_INVALID");

  const canonicalUrl = normalizeHotelIntelligenceCanonicalUrl(String(data.canonical_url || ""));
  const requestedUrl = normalizeHotelIntelligenceCanonicalUrl(String(data.requested_url || ""));
  const scannedUrls = stringArray(data.scanned_urls, "HOTEL_INTELLIGENCE_SCAN_RUN_URLS_INVALID");
  const evidenceSnapshot = objectValue(data.evidence_json, "HOTEL_INTELLIGENCE_SCAN_RUN_EVIDENCE_INVALID");
  const reviewSemantics = objectValue(
    evidenceSnapshot.reviewSemantics,
    "HOTEL_INTELLIGENCE_SCAN_RUN_REVIEW_SEMANTICS_INVALID",
  );
  const technologySignals = objectValue(data.technology_json, "HOTEL_INTELLIGENCE_SCAN_RUN_TECHNOLOGY_INVALID");
  const designSignals = objectValue(data.design_signals_json, "HOTEL_INTELLIGENCE_SCAN_RUN_DESIGN_INVALID");
  const scannerMetadata = objectValue(data.scanner_metadata_json, "HOTEL_INTELLIGENCE_SCAN_RUN_METADATA_INVALID");
  const diagnostics = objectValue(data.diagnostics_json, "HOTEL_INTELLIGENCE_SCAN_RUN_DIAGNOSTICS_INVALID");
  if (evidenceSnapshot.schemaVersion !== "hotel-scan-evidence-v1") {
    throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_EVIDENCE_INVALID");
  }
  if (technologySignals.schemaVersion !== "hotel-technology-discovery-v1") {
    throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_TECHNOLOGY_INVALID");
  }
  if (designSignals.schemaVersion !== "hotel-scan-design-signals-v1") {
    throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_DESIGN_INVALID");
  }

  const evidenceChecksum = String(data.evidence_checksum || "").toLowerCase().trim();
  const calculatedChecksum = buildHotelScanEvidenceChecksum({
    canonicalUrl,
    scannedUrls,
    evidenceSnapshot,
    technologySignals,
    designSignals,
  });
  if (calculatedChecksum !== evidenceChecksum) {
    throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_CHECKSUM_MISMATCH");
  }

  const sourceKey = buildHotelIntelligenceSourceKey(canonicalUrl);
  if (sourceKey !== String(data.source_key || "")) {
    throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_SOURCE_MISMATCH");
  }

  const profileValue = objectValue(evidenceSnapshot.profile, "HOTEL_INTELLIGENCE_SCAN_RUN_PROFILE_INVALID");
  if (profileValue.schemaVersion !== "hotel-scan-v1") {
    throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_PROFILE_INVALID");
  }
  const profile = profileValue as unknown as HotelScanProfile;
  const profileCanonicalUrl = normalizeHotelIntelligenceCanonicalUrl(String(profile.source?.canonicalUrl || ""));
  if (profileCanonicalUrl !== canonicalUrl) {
    throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_SOURCE_MISMATCH");
  }
  const intelligencePackage = buildHotelIntelligencePackage(profile);
  if (normalizeHotelIntelligenceCanonicalUrl(intelligencePackage.source.canonicalUrl) !== canonicalUrl) {
    throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_SOURCE_MISMATCH");
  }

  return {
    scanRunId: String(data.id),
    sourceKey,
    requestedUrl,
    canonicalUrl,
    scannedUrls,
    scannedAt: String(data.scanned_at),
    evidenceChecksum,
    evidenceSnapshot,
    reviewSemantics,
    technologySignals,
    designSignals,
    scannerMetadata,
    diagnostics,
    intelligencePackage,
  };
}

export async function verifyHotelScanRunLineage(input: {
  scanRunId: string;
  scanEvidenceChecksum: string;
  sourceKey?: string;
}) {
  const scanRun = await loadHotelScanRunReviewSource(input.scanRunId);
  if (scanRun.evidenceChecksum !== String(input.scanEvidenceChecksum || "").toLowerCase().trim()) {
    throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_CHECKSUM_MISMATCH");
  }
  if (input.sourceKey && scanRun.sourceKey !== input.sourceKey) {
    throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_SOURCE_MISMATCH");
  }
  return scanRun;
}

export function prepareInitialHotelIntelligenceReview(input: {
  intelligencePackage: unknown;
  diagnostics?: { model?: unknown; coreMode?: unknown } | null;
  provenance?: Record<string, unknown> | null;
  reviewSemantics?: unknown;
  scanRunId?: string;
  scanEvidenceChecksum?: string;
}) {
  const sourcePackage = requirePackage(input.intelligencePackage);
  const baseContent = createHotelIntelligenceReviewContent(sourcePackage, { model: input.diagnostics?.model });
  const content = input.reviewSemantics === undefined
    ? baseContent
    : projectHotelReviewSemanticsV2({
      content: baseContent,
      reviewSemantics: input.reviewSemantics,
      scanRunId: input.scanRunId || "",
      scanEvidenceChecksum: input.scanEvidenceChecksum || "",
    });
  return prepareHotelIntelligenceReview({
    content,
    scannerPackageChecksum: sha256Hex(stableHotelIntelligenceStringify(sourcePackage)),
    provenance: {
      kind: "scanner_import",
      scannerVersion: "hotel-scanner-v1",
      provider: content.scannerDiagnostics.provider,
      model: safeModel(input.diagnostics?.model),
      coreMode: safeModel(input.diagnostics?.coreMode),
      ...(input.provenance || {}),
    },
  });
}

async function prepareInitialHotelIntelligenceReviewFromScanRun(scanRunId: string) {
  const scanRun = await loadHotelScanRunReviewSource(scanRunId);
  const scannerMetadata = scanRun.scannerMetadata;
  const prepared = prepareInitialHotelIntelligenceReview({
    intelligencePackage: scanRun.intelligencePackage,
    diagnostics: {
      model: scannerMetadata.model,
      coreMode: scannerMetadata.coreMode,
    },
    reviewSemantics: scanRun.reviewSemantics,
    scanRunId: scanRun.scanRunId,
    scanEvidenceChecksum: scanRun.evidenceChecksum,
    provenance: {
      scanRunId: scanRun.scanRunId,
      scanEvidenceChecksum: scanRun.evidenceChecksum,
      scanScannedAt: scanRun.scannedAt,
      reviewSemanticsSchemaVersion: scanRun.reviewSemantics.schemaVersion,
      technologySchemaVersion: scanRun.technologySignals.schemaVersion,
    },
  });
  if (prepared.sourceKey !== scanRun.sourceKey) {
    throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_SOURCE_MISMATCH");
  }
  return {
    ...prepared,
    scanRunId: scanRun.scanRunId,
    scanEvidenceChecksum: scanRun.evidenceChecksum,
  };
}

export function prepareHotelIntelligenceReview(input: {
  content: unknown;
  scannerPackageChecksum: string;
  provenance?: Record<string, unknown> | null;
}) {
  const content = reviewContent(input.content);
  const canonicalUrl = normalizeHotelIntelligenceCanonicalUrl(content.source.canonicalUrl);
  const hotelName = String(content.hotelProfileLayer?.identity?.hotelName || "").replace(/\s+/g, " ").trim().slice(0, 240);
  if (!hotelName) throw new Error("HOTEL_INTELLIGENCE_HOTEL_NAME_REQUIRED");
  const scannerPackageChecksum = String(input.scannerPackageChecksum || "").toLowerCase().trim();
  if (!/^[a-f0-9]{64}$/.test(scannerPackageChecksum)) {
    throw new Error("HOTEL_INTELLIGENCE_SCANNER_CHECKSUM_INVALID");
  }

  const draftValidation = validateHotelIntelligenceReviewContent(content);
  const approvalValidation = validateHotelIntelligenceReviewContent(content, { forApproval: true });
  const contentJson = JSON.parse(stableHotelIntelligenceStringify(content)) as HotelIntelligenceReviewContent;
  const contentChecksum = sha256Hex(stableHotelIntelligenceStringify(contentJson));
  const provenanceJson = {
    ...(input.provenance || {}),
    schemaVersion: HOTEL_INTELLIGENCE_REVIEW_SCHEMA_VERSION,
  };

  return {
    sourceKey: buildHotelIntelligenceSourceKey(canonicalUrl),
    canonicalUrl,
    hotelName,
    scannerPackageChecksum,
    contentChecksum,
    contentJson,
    provenanceJson,
    validationJson: {
      ok: draftValidation.ok,
      errors: draftValidation.errors,
      approvalReady: approvalValidation.ok,
      approvalErrors: approvalValidation.errors,
    },
  };
}

function mapRevision(row: Record<string, unknown>): HotelIntelligenceRevisionMetadata {
  return {
    id: String(row.id),
    revisionNo: Number(row.revision_no),
    parentRevisionId: row.parent_revision_id ? String(row.parent_revision_id) : null,
    approvedFromRevisionId: row.approved_from_revision_id ? String(row.approved_from_revision_id) : null,
    status: row.status === "approved" ? "approved" : "draft",
    scanRunId: row.scan_run_id ? String(row.scan_run_id) : null,
    scanEvidenceChecksum: row.scan_evidence_checksum ? String(row.scan_evidence_checksum) : null,
    scannerPackageChecksum: String(row.scanner_package_checksum),
    contentChecksum: String(row.content_checksum),
    createdAt: String(row.created_at),
    createdBy: String(row.created_by),
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    approvedBy: row.approved_by ? String(row.approved_by) : null,
  };
}

export async function loadHotelIntelligenceWorkspaceByCanonicalUrl(
  canonicalUrl: string,
): Promise<HotelIntelligenceWorkspaceSnapshot | null> {
  const normalizedUrl = normalizeHotelIntelligenceCanonicalUrl(canonicalUrl);
  const sourceKey = buildHotelIntelligenceSourceKey(normalizedUrl);
  const { data: workspaceData, error: workspaceError } = await supabaseAdmin
    .from("hotel_intelligence_workspaces")
    .select("id,source_key,canonical_url,hotel_name,current_revision_id,approved_revision_id,created_at,updated_at")
    .eq("source_key", sourceKey)
    .maybeSingle();
  if (workspaceError) throw new Error(`HOTEL_INTELLIGENCE_WORKSPACE_READ_FAILED:${workspaceError.message}`);
  if (!workspaceData) return null;

  const { data: revisionData, error: revisionError } = await supabaseAdmin
    .from("hotel_intelligence_revisions")
    .select("id,revision_no,parent_revision_id,approved_from_revision_id,status,scan_run_id,scan_evidence_checksum,scanner_package_checksum,content_checksum,created_at,created_by,approved_at,approved_by")
    .eq("workspace_id", workspaceData.id)
    .order("revision_no", { ascending: false })
    .limit(50);
  if (revisionError) throw new Error(`HOTEL_INTELLIGENCE_REVISIONS_READ_FAILED:${revisionError.message}`);

  let currentContent: HotelIntelligenceReviewContent | null = null;
  if (workspaceData.current_revision_id) {
    const { data: currentData, error: currentError } = await supabaseAdmin
      .from("hotel_intelligence_revisions")
      .select("content_json")
      .eq("workspace_id", workspaceData.id)
      .eq("id", workspaceData.current_revision_id)
      .maybeSingle();
    if (currentError) throw new Error(`HOTEL_INTELLIGENCE_CURRENT_REVISION_READ_FAILED:${currentError.message}`);
    if (currentData?.content_json) currentContent = reviewContent(currentData.content_json);
  }

  return {
    workspace: {
      id: String(workspaceData.id),
      sourceKey: String(workspaceData.source_key),
      canonicalUrl: String(workspaceData.canonical_url),
      hotelName: String(workspaceData.hotel_name),
      currentRevisionId: workspaceData.current_revision_id ? String(workspaceData.current_revision_id) : null,
      approvedRevisionId: workspaceData.approved_revision_id ? String(workspaceData.approved_revision_id) : null,
      createdAt: String(workspaceData.created_at),
      updatedAt: String(workspaceData.updated_at),
    },
    revisions: (revisionData || []).map((row) => mapRevision(row as Record<string, unknown>)),
    currentContent,
  };
}

async function loadParentRevisionLineage(parentRevisionId: string) {
  const id = String(parentRevisionId || "").trim();
  if (!id) throw new Error("HOTEL_INTELLIGENCE_PARENT_REVISION_REQUIRED");
  const { data, error } = await supabaseAdmin
    .from("hotel_intelligence_revisions")
    .select("id,scan_run_id,scan_evidence_checksum,scanner_package_checksum,provenance_json")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`HOTEL_INTELLIGENCE_PARENT_REVISION_READ_FAILED:${error.message}`);
  if (!data) throw new Error("HOTEL_INTELLIGENCE_PARENT_REVISION_NOT_FOUND");
  if (!data.scan_run_id || !data.scan_evidence_checksum) {
    throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_LINEAGE_REQUIRED");
  }
  return {
    scanRunId: String(data.scan_run_id),
    scanEvidenceChecksum: String(data.scan_evidence_checksum),
    scannerPackageChecksum: String(data.scanner_package_checksum),
    provenance: data.provenance_json && typeof data.provenance_json === "object"
      ? data.provenance_json as Record<string, unknown>
      : {},
  };
}

export async function saveHotelIntelligenceRevision(input: {
  actorAdminId: string;
  idempotencyKey?: string;
  parentRevisionId: string | null;
  content?: unknown;
  scanRunId?: string;
}) {
  let prepared;
  let scanRunId: string;
  let scanEvidenceChecksum: string;

  if (input.scanRunId) {
    if (input.content !== undefined && input.content !== null) {
      throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_IMPORT_CONTENT_FORBIDDEN");
    }
    const initial = await prepareInitialHotelIntelligenceReviewFromScanRun(input.scanRunId);
    prepared = initial;
    scanRunId = initial.scanRunId;
    scanEvidenceChecksum = initial.scanEvidenceChecksum;
  } else {
    if (!input.parentRevisionId) throw new Error("HOTEL_INTELLIGENCE_PARENT_REVISION_REQUIRED");
    const parent = await loadParentRevisionLineage(input.parentRevisionId);
    const scanRun = await verifyHotelScanRunLineage({
      scanRunId: parent.scanRunId,
      scanEvidenceChecksum: parent.scanEvidenceChecksum,
    });
    const projectedContent = projectHotelReviewSemanticsV2({
      content: input.content,
      reviewSemantics: scanRun.reviewSemantics,
      scanRunId: parent.scanRunId,
      scanEvidenceChecksum: parent.scanEvidenceChecksum,
    });
    prepared = prepareHotelIntelligenceReview({
      content: projectedContent,
      scannerPackageChecksum: parent.scannerPackageChecksum,
      provenance: {
        ...parent.provenance,
        kind: "human_review",
        parentRevisionId: input.parentRevisionId,
        scanRunId: parent.scanRunId,
        scanEvidenceChecksum: parent.scanEvidenceChecksum,
      },
    });
    if (scanRun.sourceKey !== prepared.sourceKey) {
      throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_SOURCE_MISMATCH");
    }
    scanRunId = parent.scanRunId;
    scanEvidenceChecksum = parent.scanEvidenceChecksum;
  }

  const requestedKey = String(input.idempotencyKey || "").trim();
  const idempotencyKey = requestedKey || `hotel-intelligence-save:${sha256Hex([
    input.actorAdminId,
    prepared.sourceKey,
    input.parentRevisionId || "-",
    scanRunId,
    scanEvidenceChecksum,
    prepared.contentChecksum,
  ].join("|"))}`;

  const { data, error } = await supabaseAdmin.rpc("save_hotel_intelligence_revision_v1", {
    p_actor_admin_id: input.actorAdminId,
    p_source_key: prepared.sourceKey,
    p_canonical_url: prepared.canonicalUrl,
    p_hotel_name: prepared.hotelName,
    p_idempotency_key: idempotencyKey,
    p_scan_run_id: scanRunId,
    p_scan_evidence_checksum: scanEvidenceChecksum,
    p_scanner_package_checksum: prepared.scannerPackageChecksum,
    p_content_checksum: prepared.contentChecksum,
    p_content: prepared.contentJson,
    p_provenance: prepared.provenanceJson,
    p_validation: prepared.validationJson,
    p_parent_revision_id: input.parentRevisionId,
  });
  if (error) throw new Error(`HOTEL_INTELLIGENCE_SAVE_FAILED:${error.message}`);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new Error("HOTEL_INTELLIGENCE_SAVE_EMPTY_RESULT");
  return {
    workspaceId: String(row.workspace_id),
    revisionId: String(row.revision_id),
    revisionNo: Number(row.revision_no),
    parentRevisionId: row.parent_revision_id ? String(row.parent_revision_id) : null,
    approvedRevisionId: row.approved_revision_id ? String(row.approved_revision_id) : null,
    scanRunId: String(row.scan_run_id || scanRunId),
    scanEvidenceChecksum: String(row.scan_evidence_checksum || scanEvidenceChecksum),
    replayed: Boolean(row.replayed),
    contentChecksum: prepared.contentChecksum,
    scannerPackageChecksum: prepared.scannerPackageChecksum,
    approvalReady: Boolean(prepared.validationJson.approvalReady),
  };
}

export async function approveHotelIntelligenceRevision(input: {
  actorAdminId: string;
  workspaceId: string;
  sourceRevisionId: string;
  expectedCurrentRevisionId: string;
  idempotencyKey: string;
}) {
  const { data: sourceData, error: sourceError } = await supabaseAdmin
    .from("hotel_intelligence_revisions")
    .select("content_json,content_checksum,status,scan_run_id,scan_evidence_checksum")
    .eq("workspace_id", input.workspaceId)
    .eq("id", input.sourceRevisionId)
    .maybeSingle();
  if (sourceError) throw new Error(`HOTEL_INTELLIGENCE_APPROVAL_SOURCE_READ_FAILED:${sourceError.message}`);
  if (!sourceData) throw new Error("HOTEL_INTELLIGENCE_SOURCE_REVISION_NOT_FOUND");
  if (sourceData.status !== "draft") throw new Error("HOTEL_INTELLIGENCE_SOURCE_NOT_DRAFT");
  if (!sourceData.scan_run_id || !sourceData.scan_evidence_checksum) {
    throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_LINEAGE_REQUIRED");
  }
  const scanRun = await verifyHotelScanRunLineage({
    scanRunId: String(sourceData.scan_run_id),
    scanEvidenceChecksum: String(sourceData.scan_evidence_checksum),
  });
  const content = reviewContent(sourceData.content_json);
  assertHotelReviewSemanticsProjectionMatches({
    content,
    reviewSemantics: scanRun.reviewSemantics,
    scanRunId: String(sourceData.scan_run_id),
    scanEvidenceChecksum: String(sourceData.scan_evidence_checksum),
  });
  const approvalValidation = validateHotelIntelligenceReviewContent(content, { forApproval: true });
  if (!approvalValidation.ok) {
    throw new Error(`HOTEL_INTELLIGENCE_APPROVAL_NOT_READY:${approvalValidation.errors.join(",")}`);
  }
  const calculatedChecksum = sha256Hex(stableHotelIntelligenceStringify(content));
  if (calculatedChecksum !== String(sourceData.content_checksum)) {
    throw new Error("HOTEL_INTELLIGENCE_CONTENT_CHECKSUM_MISMATCH");
  }

  const { data, error } = await supabaseAdmin.rpc("approve_hotel_intelligence_revision_v1", {
    p_actor_admin_id: input.actorAdminId,
    p_workspace_id: input.workspaceId,
    p_source_revision_id: input.sourceRevisionId,
    p_expected_current_revision_id: input.expectedCurrentRevisionId,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw new Error(`HOTEL_INTELLIGENCE_APPROVE_FAILED:${error.message}`);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new Error("HOTEL_INTELLIGENCE_APPROVE_EMPTY_RESULT");
  return {
    workspaceId: String(row.workspace_id),
    revisionId: String(row.revision_id),
    revisionNo: Number(row.revision_no),
    approvedFromRevisionId: String(row.approved_from_revision_id),
    scanRunId: String(row.scan_run_id),
    scanEvidenceChecksum: String(row.scan_evidence_checksum),
    contentChecksum: String(row.content_checksum),
    replayed: Boolean(row.replayed),
  };
}

export async function loadApprovedHotelIntelligenceEnvelope(
  revisionId: string,
): Promise<ApprovedHotelIntelligenceEnvelope> {
  const { data, error } = await supabaseAdmin
    .from("hotel_intelligence_revisions")
    .select("id,workspace_id,revision_no,status,scan_run_id,scan_evidence_checksum,content_checksum,content_json,approved_at,approved_by")
    .eq("id", revisionId)
    .maybeSingle();
  if (error) throw new Error(`HOTEL_INTELLIGENCE_APPROVED_READ_FAILED:${error.message}`);
  if (!data) throw new Error("HOTEL_INTELLIGENCE_APPROVED_REVISION_NOT_FOUND");
  if (data.status !== "approved" || !data.approved_at || !data.approved_by) {
    throw new Error("HOTEL_INTELLIGENCE_REVISION_NOT_APPROVED");
  }
  if (!data.scan_run_id || !data.scan_evidence_checksum) {
    throw new Error("HOTEL_INTELLIGENCE_SCAN_RUN_LINEAGE_REQUIRED");
  }
  const scanRun = await verifyHotelScanRunLineage({
    scanRunId: String(data.scan_run_id),
    scanEvidenceChecksum: String(data.scan_evidence_checksum),
  });
  const content = reviewContent(data.content_json);
  assertHotelReviewSemanticsProjectionMatches({
    content,
    reviewSemantics: scanRun.reviewSemantics,
    scanRunId: String(data.scan_run_id),
    scanEvidenceChecksum: String(data.scan_evidence_checksum),
  });
  const calculatedChecksum = sha256Hex(stableHotelIntelligenceStringify(content));
  if (calculatedChecksum !== String(data.content_checksum)) {
    throw new Error("HOTEL_INTELLIGENCE_CONTENT_CHECKSUM_MISMATCH");
  }

  return {
    schemaVersion: APPROVED_HOTEL_INTELLIGENCE_SCHEMA_VERSION,
    authority: "approved_hotel_intelligence_revision",
    lineage: {
      workspaceId: String(data.workspace_id),
      revisionId: String(data.id),
      revisionNo: Number(data.revision_no),
      scanRunId: String(data.scan_run_id),
      scanEvidenceChecksum: String(data.scan_evidence_checksum),
      contentChecksum: calculatedChecksum,
      approvedAt: String(data.approved_at),
      approvedBy: String(data.approved_by),
    },
    intelligencePackage: buildApprovedHotelIntelligencePackage(content),
  };
}