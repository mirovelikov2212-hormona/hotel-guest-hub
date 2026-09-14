import "server-only";

import crypto from "node:crypto";

import type { HotelIntelligencePackage } from "@/lib/product-factory/hotel-intelligence-package";
import {
  asHubDesignDraftPayload,
  getHubDesignApprovedIntelligenceLineage,
  normalizeCanonicalHotelSourceUrl,
  stableDesignDraftStringify,
  type HubDesignApprovedIntelligenceLineage,
} from "@/lib/product-factory/hub-design-draft";
import {
  hashFactoryBlueprint,
  prepareFactoryOnboarding,
  type PreparedFactoryOnboarding,
} from "@/lib/product-factory/factory-onboarding-model.mjs";
import { loadApprovedHotelIntelligenceEnvelope } from "@/lib/server/hotel-intelligence-revisions";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

type JsonObject = Record<string, unknown>;

type VerifiedDesignHandoff = {
  schemaVersion: "hub-design-factory-handoff-v1";
  authority: "exact_immutable_design_revision";
  workspaceId: string;
  revisionId: string;
  revisionNo: number;
  revisionStatus: string;
  revisionSchemaVersion: string;
  payloadChecksum: string;
  sourcePackageChecksum: string;
  canonicalUrl: string;
  hotelName: string;
  isCurrentRevision: boolean;
  createdAt: string;
  approvedIntelligence: HubDesignApprovedIntelligenceLineage;
  sourcePackage: HotelIntelligencePackage;
  designDraft: NonNullable<ReturnType<typeof asHubDesignDraftPayload>>;
  policies: {
    sandboxFirst: true;
    keepProductionInactive: true;
    keepSandboxInactive: true;
    publishRevision: false;
    activateLive: false;
  };
};

function asRecord(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function sha256(value: unknown) {
  return crypto.createHash("sha256").update(stableDesignDraftStringify(value)).digest("hex");
}

function requireUuid(value: unknown, code: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new Error(code);
  return normalized;
}

function requireChecksum(value: unknown, code: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) throw new Error(code);
  return normalized;
}

function approvedLineageMatches(
  designLineage: HubDesignApprovedIntelligenceLineage,
  approved: Awaited<ReturnType<typeof loadApprovedHotelIntelligenceEnvelope>>,
) {
  return designLineage.schemaVersion === approved.schemaVersion
    && designLineage.authority === approved.authority
    && designLineage.workspaceId === approved.lineage.workspaceId
    && designLineage.revisionId === approved.lineage.revisionId
    && designLineage.revisionNo === approved.lineage.revisionNo
    && designLineage.scanRunId === approved.lineage.scanRunId
    && designLineage.scanEvidenceChecksum === approved.lineage.scanEvidenceChecksum
    && designLineage.contentChecksum === approved.lineage.contentChecksum;
}

export async function loadVerifiedHubDesignFactoryHandoff(input: {
  workspaceId: unknown;
  revisionId: unknown;
}): Promise<VerifiedDesignHandoff> {
  const workspaceId = requireUuid(input.workspaceId, "FACTORY_RELEASE_DESIGN_WORKSPACE_INVALID");
  const revisionId = requireUuid(input.revisionId, "FACTORY_RELEASE_DESIGN_REVISION_INVALID");

  const { data, error } = await supabaseAdmin
    .from("hub_design_draft_revisions")
    .select("id,workspace_id,revision_no,status,schema_version,payload_checksum,source_package_checksum,source_package_json,payload_json,created_at,hub_design_workspaces!inner(id,canonical_url,hotel_name,current_revision_id)")
    .eq("workspace_id", workspaceId)
    .eq("id", revisionId)
    .maybeSingle();

  if (error) throw new Error(`FACTORY_RELEASE_DESIGN_READ_FAILED:${error.message}`);
  if (!data) throw new Error("FACTORY_RELEASE_DESIGN_REVISION_NOT_FOUND");

  const row = data as unknown as Record<string, unknown>;
  const payload = asHubDesignDraftPayload(row.payload_json);
  const sourcePackage = row.source_package_json as HotelIntelligencePackage | null;
  if (!payload || sourcePackage?.schemaVersion !== "hotel-intelligence-v1") {
    throw new Error("FACTORY_RELEASE_DESIGN_PAYLOAD_INVALID");
  }

  const payloadChecksum = sha256(payload);
  const sourcePackageChecksum = sha256(sourcePackage);
  if (
    payloadChecksum !== requireChecksum(row.payload_checksum, "FACTORY_RELEASE_DESIGN_PAYLOAD_CHECKSUM_INVALID")
    || sourcePackageChecksum !== requireChecksum(row.source_package_checksum, "FACTORY_RELEASE_DESIGN_SOURCE_CHECKSUM_INVALID")
  ) {
    throw new Error("FACTORY_RELEASE_DESIGN_CHECKSUM_MISMATCH");
  }

  const designLineage = getHubDesignApprovedIntelligenceLineage(payload);
  if (!designLineage) throw new Error("FACTORY_RELEASE_APPROVED_INTELLIGENCE_LINEAGE_REQUIRED");

  const approved = await loadApprovedHotelIntelligenceEnvelope(designLineage.revisionId);
  if (!approvedLineageMatches(designLineage, approved)) {
    throw new Error("FACTORY_RELEASE_APPROVED_INTELLIGENCE_LINEAGE_MISMATCH");
  }
  if (sha256(approved.intelligencePackage) !== sourcePackageChecksum) {
    throw new Error("FACTORY_RELEASE_APPROVED_INTELLIGENCE_SOURCE_MISMATCH");
  }

  const workspaceValue = row.hub_design_workspaces;
  const workspace = Array.isArray(workspaceValue) ? workspaceValue[0] : workspaceValue;
  const workspaceRecord = asRecord(workspace);
  if (!workspaceRecord) throw new Error("FACTORY_RELEASE_DESIGN_WORKSPACE_NOT_FOUND");

  const approvedCanonicalUrl = normalizeCanonicalHotelSourceUrl(approved.intelligencePackage.source.canonicalUrl);
  const payloadCanonicalUrl = normalizeCanonicalHotelSourceUrl(payload.source.canonicalUrl);
  const workspaceCanonicalUrl = normalizeCanonicalHotelSourceUrl(String(workspaceRecord.canonical_url || ""));
  if (approvedCanonicalUrl !== payloadCanonicalUrl || approvedCanonicalUrl !== workspaceCanonicalUrl) {
    throw new Error("FACTORY_RELEASE_APPROVED_INTELLIGENCE_SOURCE_MISMATCH");
  }

  return {
    schemaVersion: "hub-design-factory-handoff-v1",
    authority: "exact_immutable_design_revision",
    workspaceId,
    revisionId,
    revisionNo: Number(row.revision_no),
    revisionStatus: String(row.status || ""),
    revisionSchemaVersion: String(row.schema_version || ""),
    payloadChecksum,
    sourcePackageChecksum,
    canonicalUrl: workspaceCanonicalUrl,
    hotelName: String(workspaceRecord.hotel_name || ""),
    isCurrentRevision: String(workspaceRecord.current_revision_id || "").toLowerCase() === revisionId,
    createdAt: String(row.created_at || ""),
    approvedIntelligence: designLineage,
    sourcePackage,
    designDraft: payload,
    policies: {
      sandboxFirst: true,
      keepProductionInactive: true,
      keepSandboxInactive: true,
      publishRevision: false,
      activateLive: false,
    },
  };
}

function canonicalDesignHandoff(verified: VerifiedDesignHandoff) {
  return {
    schemaVersion: verified.schemaVersion,
    authority: verified.authority,
    workspaceId: verified.workspaceId,
    revisionId: verified.revisionId,
    revisionNo: verified.revisionNo,
    revisionSchemaVersion: verified.revisionSchemaVersion,
    payloadChecksum: verified.payloadChecksum,
    sourcePackageChecksum: verified.sourcePackageChecksum,
    canonicalUrl: verified.canonicalUrl,
    approvedIntelligence: verified.approvedIntelligence,
    sourceDesignRevisionId: verified.revisionId,
    sourceDesignRevisionVersion: verified.revisionNo,
    sourceDesignRevisionChecksum: verified.payloadChecksum,
    reviewedAtFactory: true,
    materializationPolicy: "sandbox_first_explicit_review",
    liveActivation: false,
  } as const;
}

export async function canonicalizeFactoryReleaseDesignBlueprint(
  blueprint: Record<string, unknown>,
  options: { requireDesign?: boolean } = {},
) {
  const handoff = asRecord(blueprint.designHandoff);
  if (!handoff) {
    if (options.requireDesign) throw new Error("FACTORY_RELEASE_DESIGN_LINEAGE_REQUIRED");
    return blueprint;
  }

  const workspaceId = handoff.workspaceId;
  const revisionId = handoff.revisionId || handoff.sourceDesignRevisionId;
  const verified = await loadVerifiedHubDesignFactoryHandoff({ workspaceId, revisionId });
  return {
    ...blueprint,
    designHandoff: canonicalDesignHandoff(verified),
  };
}

export async function prepareAuthoritativeFactoryOnboarding(input: {
  blueprint: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<PreparedFactoryOnboarding> {
  const authoritativeBlueprint = await canonicalizeFactoryReleaseDesignBlueprint(input.blueprint);
  return prepareFactoryOnboarding({
    blueprint: authoritativeBlueprint,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function verifyPersistedFactoryReleaseDesignBlueprint(blueprint: Record<string, unknown>) {
  const authoritativeBlueprint = await canonicalizeFactoryReleaseDesignBlueprint(blueprint, { requireDesign: true });
  const storedHash = hashFactoryBlueprint(blueprint);
  const authoritativeHash = hashFactoryBlueprint(authoritativeBlueprint);
  if (storedHash !== authoritativeHash) throw new Error("FACTORY_RELEASE_DESIGN_PROVENANCE_MISMATCH");
  const handoff = asRecord(authoritativeBlueprint.designHandoff);
  if (!handoff || handoff.authority !== "exact_immutable_design_revision") {
    throw new Error("FACTORY_RELEASE_DESIGN_LINEAGE_REQUIRED");
  }
  return handoff;
}

export async function verifyFactoryReleaseDesignRevision(input: {
  hotelId: unknown;
  revisionId: unknown;
}) {
  const hotelId = requireUuid(input.hotelId, "FACTORY_RELEASE_HOTEL_ID_INVALID");
  const revisionId = requireUuid(input.revisionId, "FACTORY_RELEASE_CONFIG_REVISION_ID_INVALID");
  const { data, error } = await supabaseAdmin
    .from("hotel_config_revisions")
    .select("id,hotel_id,source_type,source_checksum,config_json")
    .eq("hotel_id", hotelId)
    .eq("id", revisionId)
    .maybeSingle();
  if (error) throw new Error(`FACTORY_RELEASE_CONFIG_READ_FAILED:${error.message}`);
  if (!data || data.source_type !== "factory_blueprint") {
    throw new Error("FACTORY_RELEASE_CONFIG_REVISION_INVALID");
  }

  const config = asRecord(data.config_json);
  const blueprint = config ? asRecord(config.factoryBlueprint) : null;
  if (!blueprint) throw new Error("FACTORY_RELEASE_BLUEPRINT_MISSING");
  const sourceChecksum = requireChecksum(data.source_checksum, "FACTORY_RELEASE_BLUEPRINT_CHECKSUM_INVALID");
  if (hashFactoryBlueprint(blueprint) !== sourceChecksum) {
    throw new Error("FACTORY_RELEASE_BLUEPRINT_CHECKSUM_MISMATCH");
  }

  const design = await verifyPersistedFactoryReleaseDesignBlueprint(blueprint);
  return {
    hotelId,
    revisionId,
    blueprintHash: sourceChecksum,
    design,
  };
}
