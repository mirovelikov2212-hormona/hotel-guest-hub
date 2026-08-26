import "server-only";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { prepareFactoryCommunications } from "@/lib/product-factory/factory-communications-model.mjs";
import { prepareFactoryOperationalResources } from "@/lib/product-factory/factory-operational-resources-model.mjs";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FactoryCommunicationsRpcRow = {
  projection_run_id: string;
  production_hotel_id: string;
  sandbox_hotel_id: string;
  replayed: boolean;
};

export type FactoryCommunicationsProjectionResult = {
  projectionRunId: string;
  productionHotelId: string;
  sandboxHotelId: string;
  replayed: boolean;
  blueprintHash: string;
  operationalResourcesHash: string;
  communicationsHash: string;
  counts: {
    departments: number;
    configuredDepartments: number;
    phoneChannels: number;
    whatsappChannels: number;
    emailChannels: number;
  };
};

function normalizeUuid(value: unknown) {
  const normalized = String(value || "").trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error("P2D_COMMUNICATION_OPERATIONAL_PROJECTION_RUN_ID_INVALID");
  }
  return normalized;
}

export async function projectFactoryCommunications(input: {
  authority: PlatformAdminAuthority;
  operationalProjectionRunId: unknown;
  blueprint: Record<string, unknown>;
}): Promise<FactoryCommunicationsProjectionResult> {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("P2D_COMMUNICATION_FACTORY_ADMIN_FORBIDDEN");
  }

  const operationalProjectionRunId = normalizeUuid(input.operationalProjectionRunId);
  const operationalPrepared = prepareFactoryOperationalResources({ blueprint: input.blueprint });
  const communicationsPrepared = prepareFactoryCommunications({
    blueprint: operationalPrepared.blueprint,
  });

  if (communicationsPrepared.blueprintHash !== operationalPrepared.blueprintHash) {
    throw new Error("P2D_COMMUNICATION_BLUEPRINT_HASH_DRIFT");
  }

  // Reviewed platform-authority mutation: the guided RPC rechecks the active
  // Platform Admin, exact completed P2.4 + STEP 2C lineage, fail-closed hotel
  // state, department authority, idempotency, and contact ownership atomically.
  const { data, error } = await supabaseAdmin.rpc("project_factory_guided_communications_v1", {
    p_actor_admin_id: input.authority.adminId,
    p_operational_projection_run_id: operationalProjectionRunId,
    p_blueprint_hash: operationalPrepared.blueprintHash,
    p_operational_resources_hash: operationalPrepared.operationalResourcesHash,
    p_communications_hash: communicationsPrepared.communicationsHash,
    p_communications: communicationsPrepared.communications,
  });

  if (error) {
    throw new Error(`P2D_COMMUNICATION_PROJECTION_FAILED:${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as FactoryCommunicationsRpcRow | null;
  if (!row) {
    throw new Error("P2D_COMMUNICATION_PROJECTION_EMPTY_RESULT");
  }

  return {
    projectionRunId: row.projection_run_id,
    productionHotelId: row.production_hotel_id,
    sandboxHotelId: row.sandbox_hotel_id,
    replayed: Boolean(row.replayed),
    blueprintHash: operationalPrepared.blueprintHash,
    operationalResourcesHash: operationalPrepared.operationalResourcesHash,
    communicationsHash: communicationsPrepared.communicationsHash,
    counts: communicationsPrepared.counts,
  };
}
