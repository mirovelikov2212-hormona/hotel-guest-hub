import "server-only";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { prepareFactoryOperationalResources } from "@/lib/product-factory/factory-operational-resources-model.mjs";

type FactoryOperationalProjectionRpcRow = {
  projection_run_id: string;
  production_revision_id: string;
  sandbox_revision_id: string;
  replayed: boolean;
};

export type FactoryOperationalProjectionResult = {
  projectionRunId: string;
  productionRevisionId: string;
  sandboxRevisionId: string;
  replayed: boolean;
  blueprintHash: string;
  coreResourcesHash: string;
  operationalResourcesHash: string;
  counts: {
    services: number;
    workflows: number;
    integrations: number;
    routingRules: number;
    runtimeEnabledServices: number;
    runtimeEnabledWorkflows: number;
    activeRoutingRules: number;
    configuredIntegrations: number;
  };
};

export async function projectFactoryOperationalResources(input: {
  authority: PlatformAdminAuthority;
  coreProjectionRunId: string;
  blueprint: Record<string, unknown>;
}): Promise<FactoryOperationalProjectionResult> {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("P2_3_FACTORY_ADMIN_FORBIDDEN");
  }

  const coreProjectionRunId = String(input.coreProjectionRunId || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(coreProjectionRunId)) {
    throw new Error("P2_3_CORE_PROJECTION_RUN_ID_INVALID");
  }

  const prepared = prepareFactoryOperationalResources({ blueprint: input.blueprint });

  // Reviewed platform-authority write: the SECURITY DEFINER RPC rechecks the
  // active Platform Admin, locks the exact P2.2 projection lineage and inserts
  // disabled services/workflows/routing plus placeholder-only integrations into
  // the exact Production/Sandbox tenant pair.
  const { data, error } = await supabaseAdmin.rpc(
    "project_factory_operational_resources_v1",
    {
      p_actor_admin_id: input.authority.adminId,
      p_core_projection_run_id: coreProjectionRunId,
      p_blueprint_hash: prepared.blueprintHash,
      p_core_resources_hash: prepared.coreResourcesHash,
      p_operational_resources_hash: prepared.operationalResourcesHash,
      p_operational_resources: prepared.operationalResources,
    },
  );

  if (error) {
    throw new Error(`P2_3_OPERATIONAL_PROJECTION_FAILED:${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | FactoryOperationalProjectionRpcRow
    | null;
  if (!row) {
    throw new Error("P2_3_OPERATIONAL_PROJECTION_EMPTY_RESULT");
  }

  return {
    projectionRunId: row.projection_run_id,
    productionRevisionId: row.production_revision_id,
    sandboxRevisionId: row.sandbox_revision_id,
    replayed: Boolean(row.replayed),
    blueprintHash: prepared.blueprintHash,
    coreResourcesHash: prepared.coreResourcesHash,
    operationalResourcesHash: prepared.operationalResourcesHash,
    counts: prepared.counts,
  };
}
