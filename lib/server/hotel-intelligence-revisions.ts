import "server-only";

import crypto from "crypto";

import type { HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";
import {
  APPROVED_HOTEL_INTELLIGENCE_SCHEMA_VERSION,
  HOTEL_INTELLIGENCE_REVIEW_SCHEMA_VERSION,
  buildApprovedHotelIntelligencePackage,
  createHotelIntelligenceReviewContent,
  validateHotelIntelligenceReviewContent,
  type ApprovedHotelIntelligenceEnvelope,
  type HotelIntelligenceReviewContent,
} from "@/lib/product-factory/hotel-intelligence-review";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type HotelIntelligenceRevisionMetadata = {
  id: string;
  revisionNo: number;
  parentRevisionId: string | null;
  approvedFromRevisionId: string | null;
  status: "draft" | "approved";
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

export function prepareInitialHotelIntelligenceReview(input: {
  intelligencePackage: unknown;
  diagnostics?: { model?: unknown; coreMode?: unknown } | null;
}) {
  const sourcePackage = requirePackage(input.intelligencePackage);
  const content = createHotelIntelligenceReviewContent(sourcePackage, { model: input.diagnostics?.model });
  return prepareHotelIntelligenceReview({
    content,
    scannerPackageChecksum: sha256Hex(stableHotelIntelligenceStringify(sourcePackage)),
    provenance: {
      kind: "scanner_import",
      scannerVersion: "hotel-scanner-v1",
      provider: content.scannerDiagnostics.provider,
      model: safeModel(input.diagnostics?.model),
      coreMode: safeModel(input.diagnostics?.coreMode),
    },
  });
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
    .select("id,revision_no,parent_revision_id,approved_from_revision_id,status,scanner_package_checksum,content_checksum,created_at,created_by,approved_at,approved_by")
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

export async function saveHotelIntelligenceRevision(input: {
  actorAdminId: string;
  idempotencyKey: string;
  parentRevisionId: string | null;
  content: unknown;
  intelligencePackage?: unknown;
  scannerPackageChecksum?: string;
  provenance?: Record<string, unknown> | null;
  diagnostics?: { model?: unknown; coreMode?: unknown } | null;
}) {
  let prepared;
  if (input.intelligencePackage) {
    const initial = prepareInitialHotelIntelligenceReview({
      intelligencePackage: input.intelligencePackage,
      diagnostics: input.diagnostics,
    });
    const suppliedContent = input.content || initial.contentJson;
    prepared = prepareHotelIntelligenceReview({
      content: suppliedContent,
      scannerPackageChecksum: initial.scannerPackageChecksum,
      provenance: input.provenance || initial.provenanceJson,
    });
  } else {
    prepared = prepareHotelIntelligenceReview({
      content: input.content,
      scannerPackageChecksum: String(input.scannerPackageChecksum || ""),
      provenance: input.provenance,
    });
  }

  const { data, error } = await supabaseAdmin.rpc("save_hotel_intelligence_revision_v1", {
    p_actor_admin_id: input.actorAdminId,
    p_source_key: prepared.sourceKey,
    p_canonical_url: prepared.canonicalUrl,
    p_hotel_name: prepared.hotelName,
    p_idempotency_key: input.idempotencyKey,
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
    .select("content_json,content_checksum,status")
    .eq("workspace_id", input.workspaceId)
    .eq("id", input.sourceRevisionId)
    .maybeSingle();
  if (sourceError) throw new Error(`HOTEL_INTELLIGENCE_APPROVAL_SOURCE_READ_FAILED:${sourceError.message}`);
  if (!sourceData) throw new Error("HOTEL_INTELLIGENCE_SOURCE_REVISION_NOT_FOUND");
  if (sourceData.status !== "draft") throw new Error("HOTEL_INTELLIGENCE_SOURCE_NOT_DRAFT");
  const content = reviewContent(sourceData.content_json);
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
    contentChecksum: String(row.content_checksum),
    replayed: Boolean(row.replayed),
  };
}

export async function loadApprovedHotelIntelligenceEnvelope(
  revisionId: string,
): Promise<ApprovedHotelIntelligenceEnvelope> {
  const { data, error } = await supabaseAdmin
    .from("hotel_intelligence_revisions")
    .select("id,workspace_id,revision_no,status,content_checksum,content_json,approved_at,approved_by")
    .eq("id", revisionId)
    .maybeSingle();
  if (error) throw new Error(`HOTEL_INTELLIGENCE_APPROVED_READ_FAILED:${error.message}`);
  if (!data) throw new Error("HOTEL_INTELLIGENCE_APPROVED_REVISION_NOT_FOUND");
  if (data.status !== "approved" || !data.approved_at || !data.approved_by) {
    throw new Error("HOTEL_INTELLIGENCE_REVISION_NOT_APPROVED");
  }
  const content = reviewContent(data.content_json);
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
      contentChecksum: calculatedChecksum,
      approvedAt: String(data.approved_at),
      approvedBy: String(data.approved_by),
    },
    intelligencePackage: buildApprovedHotelIntelligencePackage(content),
  };
}
