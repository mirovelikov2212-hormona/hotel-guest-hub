import "server-only";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { prepareFactoryNativeContentVenues } from "@/lib/product-factory/factory-native-content-venues-model.mjs";
import { prepareFactoryOperationalResources } from "@/lib/product-factory/factory-operational-resources-model.mjs";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

type FactoryNativeContentProjectionRpcRow = {
  projection_run_id: string;
  production_hotel_id: string;
  sandbox_hotel_id: string;
  replayed: boolean;
};

export type FactoryNativeContentProjectionResult = {
  projectionRunId: string;
  productionHotelId: string;
  sandboxHotelId: string;
  replayed: boolean;
  blueprintHash: string;
  operationalResourcesHash: string;
  nativeResourcesHash: string;
  counts: {
    hotelInfoItems: number;
    activeHotelInfoItems: number;
    venues: number;
    activeVenues: number;
    venueTypes: number;
  };
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function projectFactoryNativeContentVenues(input: {
  authority: PlatformAdminAuthority;
  operationalProjectionRunId: string;
  blueprint: Record<string, unknown>;
}): Promise<FactoryNativeContentProjectionResult> {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("P2C_NATIVE_FACTORY_ADMIN_FORBIDDEN");
  }

  const operationalProjectionRunId = String(input.operationalProjectionRunId || "").trim();
  if (!UUID_PATTERN.test(operationalProjectionRunId)) {
    throw new Error("P2C_NATIVE_OPERATIONAL_PROJECTION_RUN_ID_INVALID");
  }

  const operational = prepareFactoryOperationalResources({ blueprint: input.blueprint });
  const native = prepareFactoryNativeContentVenues({ blueprint: operational.blueprint });

  // Reviewed platform-authority write: the SECURITY DEFINER RPC rechecks the
  // active Platform Admin, locks the exact P2.3 lineage, verifies both tenant
  // environments remain fail-closed, and mutates only Factory-owned native
  // knowledge/venue rows. Legacy/manual rows are never overwritten.
  const { data, error } = await supabaseAdmin.rpc(
    "project_factory_native_content_venues_v1",
    {
      p_actor_admin_id: input.authority.adminId,
      p_operational_projection_run_id: operationalProjectionRunId,
      p_blueprint_hash: native.blueprintHash,
      p_operational_resources_hash: operational.operationalResourcesHash,
      p_native_resources_hash: native.nativeResourcesHash,
      p_native_resources: native.nativeResources,
    },
  );

  if (error) {
    throw new Error(`P2C_NATIVE_PROJECTION_FAILED:${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | FactoryNativeContentProjectionRpcRow
    | null;
  if (!row) {
    throw new Error("P2C_NATIVE_PROJECTION_EMPTY_RESULT");
  }

  return {
    projectionRunId: row.projection_run_id,
    productionHotelId: row.production_hotel_id,
    sandboxHotelId: row.sandbox_hotel_id,
    replayed: Boolean(row.replayed),
    blueprintHash: native.blueprintHash,
    operationalResourcesHash: operational.operationalResourcesHash,
    nativeResourcesHash: native.nativeResourcesHash,
    counts: native.counts,
  };
}
