import "server-only";

import { createHash } from "node:crypto";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const REQUIRED_APPROVAL = {
  publishConfiguration: true,
  keepProductionDark: true,
  requireRuntimeCertification: true,
  activateHotel: false,
  activatePublicIdentity: false,
} as const;

type PublicationRpcRow = {
  publication_run_id: string;
  production_hotel_id: string;
  production_revision_id: string;
  replayed: boolean;
};

function normalizeUuid(value: unknown, code: string) {
  const id = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(code);
  }
  return id;
}

function normalizePublicSlug(value: unknown) {
  const slug = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) {
    throw new Error("P2_6_2_PUBLIC_SLUG_INVALID");
  }
  return slug;
}

function normalizeApproval(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("P2_6_2_APPROVAL_INVALID");
  }
  const input = value as Record<string, unknown>;
  for (const [key, expected] of Object.entries(REQUIRED_APPROVAL)) {
    if (input[key] !== expected) throw new Error(`P2_6_2_APPROVAL_MISMATCH:${key}`);
  }
  return { ...REQUIRED_APPROVAL };
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? "null" : serialized;
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

export async function publishFactoryProductionConfiguration(input: {
  authority: PlatformAdminAuthority;
  readinessRunId: unknown;
  expectedProductionHotelId: unknown;
  expectedProductionRevisionId: unknown;
  expectedPublicSlug: unknown;
  approval: unknown;
}) {
  if (!canMutateControlPlane(input.authority.role)) throw new Error("P2_6_2_FACTORY_ADMIN_FORBIDDEN");

  const readinessRunId = normalizeUuid(input.readinessRunId, "P2_6_2_READINESS_RUN_ID_INVALID");
  const expectedProductionHotelId = normalizeUuid(
    input.expectedProductionHotelId,
    "P2_6_2_PRODUCTION_HOTEL_ID_INVALID",
  );
  const expectedProductionRevisionId = normalizeUuid(
    input.expectedProductionRevisionId,
    "P2_6_2_PRODUCTION_REVISION_ID_INVALID",
  );
  const expectedPublicSlug = normalizePublicSlug(input.expectedPublicSlug);
  const approval = normalizeApproval(input.approval);
  const approvalHash = createHash("sha256")
    .update(canonicalize({
      schemaVersion: "p2.6.2",
      readinessRunId,
      expectedProductionHotelId,
      expectedProductionRevisionId,
      expectedPublicSlug,
      approval,
    }))
    .digest("hex");

  // Reviewed platform-authority mutation: the service-role-only RPC treats the P2.6.1-ready
  // revision as immutable source/CAS and publishes an exact derivative. It rechecks lineage
  // while keeping Production inactive, public identity reserved, runtime disabled and certification pending.
  const { data, error } = await supabaseAdmin.rpc("publish_factory_production_revision_v1", {
    p_actor_admin_id: input.authority.adminId,
    p_readiness_run_id: readinessRunId,
    p_expected_production_hotel_id: expectedProductionHotelId,
    p_expected_production_revision_id: expectedProductionRevisionId,
    p_expected_public_slug: expectedPublicSlug,
    p_approval_hash: approvalHash,
  });

  if (error) throw new Error(`P2_6_2_PRODUCTION_PUBLICATION_FAILED:${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as PublicationRpcRow | null;
  if (!row) throw new Error("P2_6_2_PRODUCTION_PUBLICATION_EMPTY_RESULT");

  const publishedRevisionId = normalizeUuid(
    row.production_revision_id,
    "P2_6_2_PUBLISHED_REVISION_ID_INVALID",
  );
  if (
    String(row.production_hotel_id) !== expectedProductionHotelId
    || publishedRevisionId === expectedProductionRevisionId
  ) {
    throw new Error("P2_6_2_PRODUCTION_PUBLICATION_RESULT_MISMATCH");
  }

  return {
    publicationRunId: row.publication_run_id,
    productionHotelId: row.production_hotel_id,
    productionRevisionId: publishedRevisionId,
    sourceProductionRevisionId: expectedProductionRevisionId,
    expectedPublicSlug,
    approvalHash,
    status: "published_pending_certification" as const,
    productionActive: false as const,
    publicIdentityActive: false as const,
    replayed: Boolean(row.replayed),
  };
}
