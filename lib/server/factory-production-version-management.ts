import "server-only";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { buildHotelConfigVersionDiff, type HotelConfigVersionDiff } from "@/lib/server/factory-production-version-diff.mjs";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;

type RevisionRow = {
  id: string;
  revision_no: number | string;
  status: string;
  source_type: string;
  source_checksum: string;
  config_json: JsonObject;
  provenance_json: JsonObject;
  validation_json: JsonObject;
  created_at: string;
  created_by: string | null;
  published_at: string | null;
  published_by: string | null;
  superseded_at: string | null;
};

type ActivationBaseRow = {
  id: string;
  production_revision_id: string;
  actor_admin_id: string;
  certified_deployment_id: string;
  certified_deployment_sha: string;
  status: string;
  created_at: string;
};

export type FactoryVersionWorkflow = {
  mode: "version_upgrade" | "version_restore";
  stage: "readiness" | "publication" | "certification" | "activation" | "complete";
  readinessRunId: string | null;
  publicationRunId: string | null;
  certificationRunId: string | null;
  activationRunId: string | null;
  reason: string | null;
};

export type FactoryVersionRevisionSummary = {
  id: string;
  revisionNo: number;
  status: "draft" | "published" | "superseded";
  sourceChecksum: string;
  createdAt: string;
  publishedAt: string | null;
  supersededAt: string | null;
  actor: string | null;
  previouslyLive: boolean;
  latestLiveActivationId: string | null;
  latestLiveActivationAt: string | null;
  diffFromCurrent: HotelConfigVersionDiff | null;
  workflow: FactoryVersionWorkflow | null;
};

export type FactoryVersionTimelineEntry = {
  id: string;
  kind: "readiness" | "publication" | "certification" | "activation";
  mode: "version_upgrade" | "version_restore";
  status: string;
  targetRevisionId: string;
  sourceRevisionId: string | null;
  relatedRunId: string | null;
  reason: string | null;
  createdAt: string;
};

export type FactoryProductionVersionManagementSnapshot = {
  capability: "ready" | "migration_required";
  canMutate: boolean;
  productionHotelId: string;
  publicSlug: string;
  currentLive: FactoryVersionRevisionSummary;
  candidates: FactoryVersionRevisionSummary[];
  history: FactoryVersionRevisionSummary[];
  timeline: FactoryVersionTimelineEntry[];
};

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeUuid(value: unknown, code: string) {
  const id = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(id)) throw new Error(code);
  return id;
}

function isMissingCmSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const text = [row.code, row.message, row.details, row.hint].map((value) => String(value || "")).join(" ").toLowerCase();
  return text.includes("42703")
    || text.includes("pgrst204")
    || text.includes("pgrst202")
    || text.includes("release_mode")
    || text.includes("schema cache");
}

function toRevisionNo(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isValidatedRevision(row: RevisionRow) {
  return row.source_type === "factory_blueprint"
    && /^[a-f0-9]{64}$/i.test(String(row.source_checksum || ""))
    && isRecord(row.config_json)
    && isRecord(row.validation_json)
    && row.validation_json.ok === true;
}

function isPublicationDerivative(row: RevisionRow) {
  return isRecord(row.provenance_json)
    && row.provenance_json.stage === "production_version_candidate_publication";
}

function latestActivationFor(revisionId: string, activations: ActivationBaseRow[]) {
  return activations
    .filter((row) => String(row.production_revision_id).toLowerCase() === revisionId && row.status === "live")
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null;
}

function createSummary(input: {
  row: RevisionRow;
  currentConfig: JsonObject;
  activations: ActivationBaseRow[];
  workflow?: FactoryVersionWorkflow | null;
  current?: boolean;
}): FactoryVersionRevisionSummary {
  const id = normalizeUuid(input.row.id, "CM4_REVISION_ID_INVALID");
  const activation = latestActivationFor(id, input.activations);
  const status = input.row.status as "draft" | "published" | "superseded";
  return {
    id,
    revisionNo: toRevisionNo(input.row.revision_no),
    status,
    sourceChecksum: String(input.row.source_checksum || "").toLowerCase(),
    createdAt: input.row.created_at,
    publishedAt: input.row.published_at,
    supersededAt: input.row.superseded_at,
    actor: input.row.published_by || input.row.created_by || null,
    previouslyLive: Boolean(activation),
    latestLiveActivationId: activation?.id ?? null,
    latestLiveActivationAt: activation?.created_at ?? null,
    diffFromCurrent: input.current ? null : buildHotelConfigVersionDiff(input.currentConfig, input.row.config_json),
    workflow: input.workflow ?? null,
  };
}

function deriveWorkflow(input: {
  mode: "version_upgrade" | "version_restore";
  sourceRevisionId: string;
  currentLiveRevisionId: string;
  readiness: Array<Record<string, unknown>>;
  publications: Array<Record<string, unknown>>;
  certifications: Array<Record<string, unknown>>;
  activations: Array<Record<string, unknown>>;
}): FactoryVersionWorkflow {
  const readiness = input.readiness.find((row) =>
    row.release_mode === input.mode
    && String(row.expected_current_live_revision_id || "").toLowerCase() === input.currentLiveRevisionId
    && String(row.production_revision_id || "").toLowerCase() === input.sourceRevisionId
    && row.status === "ready",
  );
  if (!readiness) return { mode: input.mode, stage: "readiness", readinessRunId: null, publicationRunId: null, certificationRunId: null, activationRunId: null, reason: null };

  const readinessRunId = String(readiness.id || "").toLowerCase();
  const publication = input.publications.find((row) =>
    row.release_mode === input.mode
    && String(row.readiness_run_id || "").toLowerCase() === readinessRunId
    && row.status === "published_pending_certification",
  );
  if (!publication) return { mode: input.mode, stage: "publication", readinessRunId, publicationRunId: null, certificationRunId: null, activationRunId: null, reason: String(readiness.release_reason || "") || null };

  const publicationRunId = String(publication.id || "").toLowerCase();
  const certification = input.certifications.find((row) =>
    row.release_mode === input.mode
    && String(row.publication_run_id || "").toLowerCase() === publicationRunId
    && row.status === "passed",
  );
  if (!certification) return { mode: input.mode, stage: "certification", readinessRunId, publicationRunId, certificationRunId: null, activationRunId: null, reason: String(readiness.release_reason || "") || null };

  const certificationRunId = String(certification.id || "").toLowerCase();
  const activation = input.activations.find((row) =>
    row.release_mode === input.mode
    && String(row.runtime_certification_run_id || "").toLowerCase() === certificationRunId
    && row.status === "live",
  );
  if (!activation) return { mode: input.mode, stage: "activation", readinessRunId, publicationRunId, certificationRunId, activationRunId: null, reason: String(readiness.release_reason || "") || null };

  return {
    mode: input.mode,
    stage: "complete",
    readinessRunId,
    publicationRunId,
    certificationRunId,
    activationRunId: String(activation.id || "").toLowerCase(),
    reason: String(readiness.release_reason || "") || null,
  };
}

export async function getFactoryProductionVersionManagementSnapshot(input: {
  authority: PlatformAdminAuthority;
  productionHotelId: unknown;
}): Promise<FactoryProductionVersionManagementSnapshot> {
  const productionHotelId = normalizeUuid(input.productionHotelId, "CM4_PRODUCTION_HOTEL_ID_INVALID");

  const [hotelResult, identityResult, stateResult, revisionsResult, activationsResult] = await Promise.all([
    supabaseAdmin.from("hotels").select("id,active,is_sandbox,is_demo").eq("id", productionHotelId).maybeSingle(),
    supabaseAdmin.from("hotel_public_identity_configs").select("hotel_id,public_slug,status").eq("hotel_id", productionHotelId).maybeSingle(),
    supabaseAdmin.from("hotel_config_publication_state").select("published_revision_id,last_known_good_revision_id").eq("hotel_id", productionHotelId).maybeSingle(),
    supabaseAdmin.from("hotel_config_revisions").select("id,revision_no,status,source_type,source_checksum,config_json,provenance_json,validation_json,created_at,created_by,published_at,published_by,superseded_at").eq("hotel_id", productionHotelId).order("revision_no", { ascending: false }).limit(100),
    supabaseAdmin.from("factory_production_live_activation_runs").select("id,production_revision_id,actor_admin_id,certified_deployment_id,certified_deployment_sha,status,created_at").eq("production_hotel_id", productionHotelId).order("created_at", { ascending: false }).limit(100),
  ]);

  if (hotelResult.error || identityResult.error || stateResult.error || revisionsResult.error || activationsResult.error) {
    throw new Error("CM4_VERSION_MANAGEMENT_BASE_READ_FAILED");
  }
  const hotel = hotelResult.data;
  const identity = identityResult.data;
  const state = stateResult.data;
  if (!hotel || hotel.active !== true || hotel.is_sandbox === true || hotel.is_demo === true) {
    throw new Error("CM4_LIVE_PRODUCTION_HOTEL_REQUIRED");
  }
  if (!identity || identity.status !== "active") throw new Error("CM4_ACTIVE_PUBLIC_IDENTITY_REQUIRED");

  const currentLiveRevisionId = normalizeUuid(state?.published_revision_id, "CM4_CURRENT_LIVE_REVISION_INVALID");
  if (String(state?.last_known_good_revision_id || "").toLowerCase() !== currentLiveRevisionId) {
    throw new Error("CM4_CURRENT_LIVE_LKG_MISMATCH");
  }

  const revisions = ((revisionsResult.data || []) as RevisionRow[]).filter(isValidatedRevision);
  const activations = (activationsResult.data || []) as ActivationBaseRow[];
  const currentRow = revisions.find((row) => String(row.id).toLowerCase() === currentLiveRevisionId && row.status === "published");
  if (!currentRow) throw new Error("CM4_CURRENT_LIVE_REVISION_MISSING");

  const capabilityProbe = await supabaseAdmin
    .from("factory_production_readiness_runs")
    .select("id,release_mode")
    .eq("production_hotel_id", productionHotelId)
    .limit(1);

  let capability: "ready" | "migration_required" = "ready";
  if (capabilityProbe.error) {
    if (isMissingCmSchema(capabilityProbe.error)) capability = "migration_required";
    else throw new Error(`CM4_VERSION_CAPABILITY_PROBE_FAILED:${capabilityProbe.error.message}`);
  }

  let readiness: Array<Record<string, unknown>> = [];
  let publications: Array<Record<string, unknown>> = [];
  let certifications: Array<Record<string, unknown>> = [];
  let extendedActivations: Array<Record<string, unknown>> = [];

  if (capability === "ready") {
    const [readinessResult, publicationResult, certificationResult, activationResult] = await Promise.all([
      supabaseAdmin.from("factory_production_readiness_runs").select("id,production_revision_id,status,created_at,release_mode,expected_current_live_revision_id,source_live_activation_run_id,release_reason,restore_target_activation_run_id").eq("production_hotel_id", productionHotelId).in("release_mode", ["version_upgrade", "version_restore"]).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("factory_production_publication_runs").select("id,readiness_run_id,production_revision_id,status,created_at,release_mode,expected_current_live_revision_id,source_revision_id,source_live_activation_run_id,release_reason,restore_target_activation_run_id").eq("production_hotel_id", productionHotelId).in("release_mode", ["version_upgrade", "version_restore"]).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("factory_production_runtime_certification_runs").select("id,publication_run_id,production_revision_id,status,created_at,release_mode,expected_current_live_revision_id,candidate_projection_hash").eq("production_hotel_id", productionHotelId).in("release_mode", ["version_upgrade", "version_restore"]).order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("factory_production_live_activation_runs").select("id,runtime_certification_run_id,production_revision_id,status,created_at,release_mode,expected_current_live_revision_id,release_reason").eq("production_hotel_id", productionHotelId).in("release_mode", ["version_upgrade", "version_restore"]).order("created_at", { ascending: false }).limit(100),
    ]);
    const cmError = readinessResult.error || publicationResult.error || certificationResult.error || activationResult.error;
    if (cmError) {
      if (isMissingCmSchema(cmError)) capability = "migration_required";
      else throw new Error(`CM4_VERSION_LEDGER_READ_FAILED:${cmError.message}`);
    } else {
      readiness = (readinessResult.data || []) as Array<Record<string, unknown>>;
      publications = (publicationResult.data || []) as Array<Record<string, unknown>>;
      certifications = (certificationResult.data || []) as Array<Record<string, unknown>>;
      extendedActivations = (activationResult.data || []) as Array<Record<string, unknown>>;
    }
  }

  const currentConfig = currentRow.config_json;
  const workflowFor = (mode: "version_upgrade" | "version_restore", revisionId: string) => capability === "ready"
    ? deriveWorkflow({ mode, sourceRevisionId: revisionId, currentLiveRevisionId, readiness, publications, certifications, activations: extendedActivations })
    : null;

  const candidates = revisions
    .filter((row) => row.status === "draft" && !isPublicationDerivative(row))
    .map((row) => createSummary({ row, currentConfig, activations, workflow: workflowFor("version_upgrade", String(row.id).toLowerCase()) }));

  const history = revisions
    .filter((row) => row.status === "superseded")
    .map((row) => createSummary({ row, currentConfig, activations, workflow: workflowFor("version_restore", String(row.id).toLowerCase()) }));

  const timeline: FactoryVersionTimelineEntry[] = capability === "ready"
    ? [
        ...readiness.map((row) => ({ id: String(row.id), kind: "readiness" as const, mode: row.release_mode as "version_upgrade" | "version_restore", status: String(row.status), targetRevisionId: String(row.production_revision_id), sourceRevisionId: null, relatedRunId: null, reason: String(row.release_reason || "") || null, createdAt: String(row.created_at) })),
        ...publications.map((row) => ({ id: String(row.id), kind: "publication" as const, mode: row.release_mode as "version_upgrade" | "version_restore", status: String(row.status), targetRevisionId: String(row.production_revision_id), sourceRevisionId: String(row.source_revision_id || "") || null, relatedRunId: String(row.readiness_run_id || "") || null, reason: String(row.release_reason || "") || null, createdAt: String(row.created_at) })),
        ...certifications.map((row) => ({ id: String(row.id), kind: "certification" as const, mode: row.release_mode as "version_upgrade" | "version_restore", status: String(row.status), targetRevisionId: String(row.production_revision_id), sourceRevisionId: null, relatedRunId: String(row.publication_run_id || "") || null, reason: null, createdAt: String(row.created_at) })),
        ...extendedActivations.map((row) => ({ id: String(row.id), kind: "activation" as const, mode: row.release_mode as "version_upgrade" | "version_restore", status: String(row.status), targetRevisionId: String(row.production_revision_id), sourceRevisionId: null, relatedRunId: String(row.runtime_certification_run_id || "") || null, reason: String(row.release_reason || "") || null, createdAt: String(row.created_at) })),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50)
    : [];

  return {
    capability,
    canMutate: capability === "ready" && canMutateControlPlane(input.authority.role),
    productionHotelId,
    publicSlug: String(identity.public_slug || ""),
    currentLive: createSummary({ row: currentRow, currentConfig, activations, current: true }),
    candidates,
    history,
    timeline,
  };
}
