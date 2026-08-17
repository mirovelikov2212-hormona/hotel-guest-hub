import "server-only";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { prepareFactoryOnboardingEnvelope } from "@/lib/product-factory/factory-onboarding-envelope-model.mjs";

type EnvelopeProjectionRpcRow = {
  projection_run_id: string;
  production_revision_id: string;
  sandbox_revision_id: string;
  replayed: boolean;
};

export async function projectFactoryOnboardingEnvelope(input: {
  authority: PlatformAdminAuthority;
  operationalProjectionRunId: string;
  blueprint: Record<string, unknown>;
}) {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("P2_4_FACTORY_ADMIN_FORBIDDEN");
  }

  const operationalProjectionRunId = String(input.operationalProjectionRunId || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationalProjectionRunId)) {
    throw new Error("P2_4_OPERATIONAL_PROJECTION_RUN_ID_INVALID");
  }

  const prepared = prepareFactoryOnboardingEnvelope({ blueprint: input.blueprint });

  // Reviewed platform-authority write: the RPC rechecks the active Platform Admin
  // and exact P2.3 lineage, then reserves only fail-closed onboarding envelope
  // configuration. It creates no credentials and activates no runtime authority.
  const { data, error } = await supabaseAdmin.rpc(
    "project_factory_onboarding_envelope_v1",
    {
      p_actor_admin_id: input.authority.adminId,
      p_operational_projection_run_id: operationalProjectionRunId,
      p_blueprint_hash: prepared.blueprintHash,
      p_core_resources_hash: prepared.coreResourcesHash,
      p_operational_resources_hash: prepared.operationalResourcesHash,
      p_envelope_hash: prepared.envelopeHash,
      p_envelope: prepared.envelope,
    },
  );

  if (error) throw new Error(`P2_4_ENVELOPE_PROJECTION_FAILED:${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as EnvelopeProjectionRpcRow | null;
  if (!row) throw new Error("P2_4_ENVELOPE_PROJECTION_EMPTY_RESULT");

  return {
    projectionRunId: row.projection_run_id,
    productionRevisionId: row.production_revision_id,
    sandboxRevisionId: row.sandbox_revision_id,
    replayed: Boolean(row.replayed),
    blueprintHash: prepared.blueprintHash,
    coreResourcesHash: prepared.coreResourcesHash,
    operationalResourcesHash: prepared.operationalResourcesHash,
    envelopeHash: prepared.envelopeHash,
    counts: prepared.counts,
  };
}
