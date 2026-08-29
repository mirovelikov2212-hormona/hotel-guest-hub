import "server-only";

import crypto from "crypto";

import type { HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";
import {
  asHubDesignDraftPayload,
  diffHubDesignDraftPayloads,
  normalizeCanonicalHotelSourceUrl,
  stableDesignDraftStringify,
  validateHubDesignDraftPayload,
  type HubDesignDraftPayload,
} from "@/lib/product-factory/hub-design-draft";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type HubDesignRevisionMetadata = {
  id: string;
  revisionNo: number;
  parentRevisionId: string | null;
  restoredFromRevisionId: string | null;
  status: "draft";
  schemaVersion: string;
  payloadChecksum: string;
  sourcePackageChecksum: string;
  createdAt: string;
  createdBy: string;
};

export type HubDesignWorkspaceSnapshot = {
  workspace: {
    id: string;
    sourceKey: string;
    canonicalUrl: string;
    hotelName: string;
    currentRevisionId: string | null;
    createdAt: string;
    updatedAt: string;
  };
  revisions: HubDesignRevisionMetadata[];
  currentPayload: HubDesignDraftPayload | null;
};

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function buildHubDesignSourceKey(canonicalUrl: string) {
  const normalized = normalizeCanonicalHotelSourceUrl(canonicalUrl);
  return sha256Hex(`stayhub:hub-design-source:v1:${normalized}`);
}

function requireIntelligencePackage(value: unknown): HotelIntelligencePackage {
  if (!value || typeof value !== "object") throw new Error("HUB_DESIGN_SOURCE_PACKAGE_REQUIRED");
  const pkg = value as Partial<HotelIntelligencePackage>;
  if (pkg.schemaVersion !== "hotel-intelligence-v1") throw new Error("HUB_DESIGN_SOURCE_PACKAGE_VERSION_INVALID");
  const canonicalUrl = String(pkg.source?.canonicalUrl || "").trim();
  if (!canonicalUrl) throw new Error("HUB_DESIGN_SOURCE_CANONICAL_URL_REQUIRED");
  normalizeCanonicalHotelSourceUrl(canonicalUrl);
  return value as HotelIntelligencePackage;
}

export function prepareHubDesignRevision(input: { sourcePackage: unknown; payload: unknown }) {
  const sourcePackage = requireIntelligencePackage(input.sourcePackage);
  const payload = asHubDesignDraftPayload(input.payload);
  if (!payload) {
    const validation = validateHubDesignDraftPayload(input.payload);
    throw new Error(`HUB_DESIGN_PAYLOAD_INVALID:${validation.errors.join(",")}`);
  }

  const packageCanonicalUrl = normalizeCanonicalHotelSourceUrl(sourcePackage.source.canonicalUrl);
  const payloadCanonicalUrl = normalizeCanonicalHotelSourceUrl(payload.source.canonicalUrl);
  if (packageCanonicalUrl !== payloadCanonicalUrl) throw new Error("HUB_DESIGN_SOURCE_MISMATCH");

  const hotelName = String(payload.source.hotelName || "").trim();
  if (!hotelName) throw new Error("HUB_DESIGN_HOTEL_NAME_REQUIRED");

  const validation = validateHubDesignDraftPayload(payload);
  const sourcePackageJson = JSON.parse(stableDesignDraftStringify(sourcePackage)) as HotelIntelligencePackage;
  const payloadJson = JSON.parse(stableDesignDraftStringify(payload)) as HubDesignDraftPayload;

  return {
    sourceKey: buildHubDesignSourceKey(packageCanonicalUrl),
    canonicalUrl: packageCanonicalUrl,
    hotelName,
    schemaVersion: payload.schemaVersion,
    sourcePackageChecksum: sha256Hex(stableDesignDraftStringify(sourcePackageJson)),
    payloadChecksum: sha256Hex(stableDesignDraftStringify(payloadJson)),
    sourcePackageJson,
    payloadJson,
    validation,
  };
}

function mapRevision(row: Record<string, unknown>): HubDesignRevisionMetadata {
  return {
    id: String(row.id),
    revisionNo: Number(row.revision_no),
    parentRevisionId: row.parent_revision_id ? String(row.parent_revision_id) : null,
    restoredFromRevisionId: row.restored_from_revision_id ? String(row.restored_from_revision_id) : null,
    status: "draft",
    schemaVersion: String(row.schema_version),
    payloadChecksum: String(row.payload_checksum),
    sourcePackageChecksum: String(row.source_package_checksum),
    createdAt: String(row.created_at),
    createdBy: String(row.created_by),
  };
}

export async function loadHubDesignWorkspaceByCanonicalUrl(canonicalUrl: string): Promise<HubDesignWorkspaceSnapshot | null> {
  const normalizedUrl = normalizeCanonicalHotelSourceUrl(canonicalUrl);
  const sourceKey = buildHubDesignSourceKey(normalizedUrl);
  const { data: workspaceData, error: workspaceError } = await supabaseAdmin
    .from("hub_design_workspaces")
    .select("id,source_key,canonical_url,hotel_name,current_revision_id,created_at,updated_at")
    .eq("source_key", sourceKey)
    .maybeSingle();
  if (workspaceError) throw new Error(`HUB_DESIGN_WORKSPACE_READ_FAILED:${workspaceError.message}`);
  if (!workspaceData) return null;

  const { data: revisionData, error: revisionError } = await supabaseAdmin
    .from("hub_design_draft_revisions")
    .select("id,revision_no,parent_revision_id,restored_from_revision_id,status,schema_version,payload_checksum,source_package_checksum,created_at,created_by")
    .eq("workspace_id", workspaceData.id)
    .order("revision_no", { ascending: false })
    .limit(50);
  if (revisionError) throw new Error(`HUB_DESIGN_REVISIONS_READ_FAILED:${revisionError.message}`);

  let currentPayload: HubDesignDraftPayload | null = null;
  if (workspaceData.current_revision_id) {
    const { data: currentData, error: currentError } = await supabaseAdmin
      .from("hub_design_draft_revisions")
      .select("payload_json")
      .eq("workspace_id", workspaceData.id)
      .eq("id", workspaceData.current_revision_id)
      .maybeSingle();
    if (currentError) throw new Error(`HUB_DESIGN_CURRENT_REVISION_READ_FAILED:${currentError.message}`);
    currentPayload = asHubDesignDraftPayload(currentData?.payload_json) || null;
  }

  return {
    workspace: {
      id: String(workspaceData.id),
      sourceKey: String(workspaceData.source_key),
      canonicalUrl: String(workspaceData.canonical_url),
      hotelName: String(workspaceData.hotel_name),
      currentRevisionId: workspaceData.current_revision_id ? String(workspaceData.current_revision_id) : null,
      createdAt: String(workspaceData.created_at),
      updatedAt: String(workspaceData.updated_at),
    },
    revisions: (revisionData || []).map((row) => mapRevision(row as Record<string, unknown>)),
    currentPayload,
  };
}

export async function saveHubDesignDraftRevision(input: {
  actorAdminId: string;
  idempotencyKey: string;
  parentRevisionId: string | null;
  sourcePackage: unknown;
  payload: unknown;
}) {
  const prepared = prepareHubDesignRevision({ sourcePackage: input.sourcePackage, payload: input.payload });
  const { data, error } = await supabaseAdmin.rpc("save_hub_design_draft_revision_v1", {
    p_actor_admin_id: input.actorAdminId,
    p_source_key: prepared.sourceKey,
    p_canonical_url: prepared.canonicalUrl,
    p_hotel_name: prepared.hotelName,
    p_idempotency_key: input.idempotencyKey,
    p_schema_version: prepared.schemaVersion,
    p_source_package_checksum: prepared.sourcePackageChecksum,
    p_payload_checksum: prepared.payloadChecksum,
    p_source_package: prepared.sourcePackageJson,
    p_payload: prepared.payloadJson,
    p_validation: prepared.validation,
    p_parent_revision_id: input.parentRevisionId,
  });
  if (error) throw new Error(`HUB_DESIGN_SAVE_FAILED:${error.message}`);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new Error("HUB_DESIGN_SAVE_EMPTY_RESULT");
  return {
    workspaceId: String(row.workspace_id),
    revisionId: String(row.revision_id),
    revisionNo: Number(row.revision_no),
    parentRevisionId: row.parent_revision_id ? String(row.parent_revision_id) : null,
    replayed: Boolean(row.replayed),
    payloadChecksum: prepared.payloadChecksum,
    sourcePackageChecksum: prepared.sourcePackageChecksum,
  };
}

export async function restoreHubDesignDraftRevision(input: {
  actorAdminId: string;
  workspaceId: string;
  sourceRevisionId: string;
  expectedCurrentRevisionId: string;
  idempotencyKey: string;
}) {
  const { data, error } = await supabaseAdmin.rpc("restore_hub_design_draft_revision_v1", {
    p_actor_admin_id: input.actorAdminId,
    p_workspace_id: input.workspaceId,
    p_source_revision_id: input.sourceRevisionId,
    p_expected_current_revision_id: input.expectedCurrentRevisionId,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw new Error(`HUB_DESIGN_RESTORE_FAILED:${error.message}`);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new Error("HUB_DESIGN_RESTORE_EMPTY_RESULT");

  const { data: revisionData, error: revisionError } = await supabaseAdmin
    .from("hub_design_draft_revisions")
    .select("payload_json")
    .eq("workspace_id", input.workspaceId)
    .eq("id", row.revision_id)
    .single();
  if (revisionError) throw new Error(`HUB_DESIGN_RESTORED_PAYLOAD_READ_FAILED:${revisionError.message}`);
  const payload = asHubDesignDraftPayload(revisionData?.payload_json);
  if (!payload) throw new Error("HUB_DESIGN_RESTORED_PAYLOAD_INVALID");

  return {
    workspaceId: String(row.workspace_id),
    revisionId: String(row.revision_id),
    revisionNo: Number(row.revision_no),
    parentRevisionId: row.parent_revision_id ? String(row.parent_revision_id) : null,
    restoredFromRevisionId: row.restored_from_revision_id ? String(row.restored_from_revision_id) : null,
    replayed: Boolean(row.replayed),
    payload,
  };
}

export async function compareHubDesignDraftRevisions(input: {
  workspaceId: string;
  leftRevisionId: string;
  rightRevisionId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("hub_design_draft_revisions")
    .select("id,payload_json")
    .eq("workspace_id", input.workspaceId)
    .in("id", [input.leftRevisionId, input.rightRevisionId]);
  if (error) throw new Error(`HUB_DESIGN_COMPARE_READ_FAILED:${error.message}`);
  const rows = data || [];
  const left = rows.find((row) => row.id === input.leftRevisionId)?.payload_json;
  const right = rows.find((row) => row.id === input.rightRevisionId)?.payload_json;
  if (!left || !right) throw new Error("HUB_DESIGN_COMPARE_REVISION_NOT_FOUND");
  return diffHubDesignDraftPayloads(left, right);
}
