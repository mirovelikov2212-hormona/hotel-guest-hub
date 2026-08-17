import "server-only";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { prepareFactoryCoreResources } from "@/lib/product-factory/factory-core-resources-model.mjs";

type FactoryCoreProjectionRpcRow = {
  projection_run_id: string;
  production_revision_id: string;
  sandbox_revision_id: string;
  replayed: boolean;
};

export type FactoryCoreProjectionResult = {
  projectionRunId: string;
  productionRevisionId: string;
  sandboxRevisionId: string;
  replayed: boolean;
  blueprintHash: string;
  coreResourcesHash: string;
  counts: {
    rooms: number;
    activeRooms: number;
    departments: number;
    activeDepartments: number;
  };
};

export async function projectFactoryCoreResources(input: {
  authority: PlatformAdminAuthority;
  onboardingRunId: string;
  blueprint: Record<string, unknown>;
}): Promise<FactoryCoreProjectionResult> {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("P2_2_FACTORY_ADMIN_FORBIDDEN");
  }

  const onboardingRunId = String(input.onboardingRunId || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(onboardingRunId)) {
    throw new Error("P2_2_ONBOARDING_RUN_ID_INVALID");
  }

  const prepared = prepareFactoryCoreResources({ blueprint: input.blueprint });

  // Reviewed platform-authority write: the SECURITY DEFINER RPC rechecks the
  // active Platform Admin, locks the P2.1 run, and keeps both environments
  // inactive while projecting identical core resources into their own tenants.
  const { data, error } = await supabaseAdmin.rpc("project_factory_core_resources_v1", {
    p_actor_admin_id: input.authority.adminId,
    p_onboarding_run_id: onboardingRunId,
    p_blueprint_hash: prepared.blueprintHash,
    p_core_resources_hash: prepared.coreResourcesHash,
    p_core_resources: prepared.coreResources,
  });

  if (error) {
    throw new Error(`P2_2_CORE_PROJECTION_FAILED:${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as FactoryCoreProjectionRpcRow | null;
  if (!row) {
    throw new Error("P2_2_CORE_PROJECTION_EMPTY_RESULT");
  }

  return {
    projectionRunId: row.projection_run_id,
    productionRevisionId: row.production_revision_id,
    sandboxRevisionId: row.sandbox_revision_id,
    replayed: Boolean(row.replayed),
    blueprintHash: prepared.blueprintHash,
    coreResourcesHash: prepared.coreResourcesHash,
    counts: prepared.counts,
  };
}
