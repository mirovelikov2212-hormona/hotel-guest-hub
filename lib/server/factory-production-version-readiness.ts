import "server-only";

import { createHash } from "node:crypto";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { verifyFactoryReleaseDesignRevision } from "@/lib/server/factory-release-design-authority";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const VERSION_READINESS_APPROVAL = {
  assessVersionReadiness: true,
  preserveCurrentLive: true,
  requireImmutableCandidate: true,
  requireRuntimeCertification: true,
  activateImmediately: false,
} as const;

type JsonObject = Record<string, unknown>;

type ReadinessRpcRow = {
  readiness_run_id: string;
  production_hotel_id: string;
  production_revision_id: string;
  expected_current_live_revision_id: string;
  expected_public_slug: string;
  replayed: boolean;
};

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? "null" : serialized;
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  const record = value as JsonObject;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

function sha256(value: unknown) {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function normalizeUuid(value: unknown, code: string) {
  const id = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(id)) throw new Error(code);
  return id;
}

function normalizeSlug(value: unknown, code: string) {
  const slug = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) throw new Error(code);
  return slug;
}

function normalizeReason(value: unknown) {
  const reason = String(value || "").trim();
  if (reason.length < 3) throw new Error("CM1_READINESS_REASON_REQUIRED");
  if (reason.length > 500) throw new Error("CM1_READINESS_REASON_TOO_LONG");
  return reason;
}

function normalizeApproval(value: unknown) {
  if (!isRecord(value)) throw new Error("CM1_READINESS_APPROVAL_INVALID");
  for (const [key, expected] of Object.entries(VERSION_READINESS_APPROVAL)) {
    if (value[key] !== expected) throw new Error(`CM1_READINESS_APPROVAL_MISMATCH:${key}`);
  }
  return { ...VERSION_READINESS_APPROVAL };
}

export async function assessFactoryProductionVersionReadiness(input: {
  authority: PlatformAdminAuthority;
  sourceCandidateRevisionId: unknown;
  approval: unknown;
  reason: unknown;
}) {
  if (!canMutateControlPlane(input.authority.role)) throw new Error("CM1_FACTORY_ADMIN_FORBIDDEN");

  const sourceCandidateRevisionId = normalizeUuid(
    input.sourceCandidateRevisionId,
    "CM1_READINESS_SOURCE_REVISION_ID_INVALID",
  );
  const approval = normalizeApproval(input.approval);
  const reason = normalizeReason(input.reason);

  const { data: source, error: sourceError } = await supabaseAdmin
    .from("hotel_config_revisions")
    .select("id,hotel_id,status,source_type,source_checksum,validation_json")
    .eq("id", sourceCandidateRevisionId)
    .maybeSingle();
  if (sourceError) throw new Error(`CM1_READINESS_SOURCE_READ_FAILED:${sourceError.message}`);
  if (
    !source
    || source.status !== "draft"
    || source.source_type !== "factory_blueprint"
    || !SHA256_PATTERN.test(String(source.source_checksum || "").toLowerCase())
    || !isRecord(source.validation_json)
    || source.validation_json.ok !== true
  ) {
    throw new Error("CM1_READINESS_SOURCE_CANDIDATE_INVALID");
  }

  const productionHotelId = normalizeUuid(source.hotel_id, "CM1_READINESS_HOTEL_ID_INVALID");
  const releaseDesign = await verifyFactoryReleaseDesignRevision({
    hotelId: productionHotelId,
    revisionId: sourceCandidateRevisionId,
  });

  const checks = {
    immutable_candidate_validated: true,
    release_design_verified: true,
    current_live_preserved: true,
    public_identity_preserved: true,
    runtime_certification_required: true,
    no_activation: true,
    releaseDesign,
    approval,
  };
  const evidenceHash = sha256({
    schemaVersion: "cm1-version-readiness-v1",
    sourceCandidateRevisionId,
    productionHotelId,
    reason,
    checks,
  });

  const { data, error } = await supabaseAdmin.rpc("assess_factory_production_readiness_v2", {
    p_actor_admin_id: input.authority.adminId,
    p_source_candidate_revision_id: sourceCandidateRevisionId,
    p_evidence_hash: evidenceHash,
    p_checks: checks,
    p_reason: reason,
  });
  if (error) throw new Error(`CM1_PRODUCTION_VERSION_READINESS_FAILED:${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as ReadinessRpcRow | null;
  if (!row) throw new Error("CM1_PRODUCTION_VERSION_READINESS_EMPTY_RESULT");

  const rowHotelId = normalizeUuid(row.production_hotel_id, "CM1_READINESS_RESULT_HOTEL_INVALID");
  const rowRevisionId = normalizeUuid(row.production_revision_id, "CM1_READINESS_RESULT_REVISION_INVALID");
  if (rowHotelId !== productionHotelId || rowRevisionId !== sourceCandidateRevisionId) {
    throw new Error("CM1_PRODUCTION_VERSION_READINESS_RESULT_MISMATCH");
  }

  return {
    readinessRunId: normalizeUuid(row.readiness_run_id, "CM1_READINESS_RUN_ID_INVALID"),
    productionHotelId,
    sourceCandidateRevisionId,
    expectedCurrentLiveRevisionId: normalizeUuid(
      row.expected_current_live_revision_id,
      "CM1_READINESS_CURRENT_LIVE_REVISION_ID_INVALID",
    ),
    publicSlug: normalizeSlug(row.expected_public_slug, "CM1_READINESS_PUBLIC_SLUG_INVALID"),
    evidenceHash,
    releaseDesign,
    reason,
    status: "version_candidate_ready_for_publication" as const,
    productionActive: true as const,
    publicIdentityStatus: "active" as const,
    replayed: Boolean(row.replayed),
  };
}
