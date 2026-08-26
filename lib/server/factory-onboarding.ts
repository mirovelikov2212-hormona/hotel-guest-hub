import "server-only";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import {
  prepareFactoryOnboarding,
  type PreparedFactoryOnboarding,
} from "@/lib/product-factory/factory-onboarding-model.mjs";
import { prepareFactoryNativeContentVenues } from "@/lib/product-factory/factory-native-content-venues-model.mjs";

type FactoryOnboardingRpcRow = {
  onboarding_run_id: string;
  organization_id: string;
  property_id: string;
  production_hotel_id: string;
  sandbox_hotel_id: string;
  production_revision_id: string;
  sandbox_revision_id: string;
  replayed: boolean;
};

export type FactoryOnboardingResult = {
  onboardingRunId: string;
  organizationId: string;
  propertyId: string;
  productionHotelId: string;
  sandboxHotelId: string;
  productionRevisionId: string;
  sandboxRevisionId: string;
  replayed: boolean;
  blueprintHash: string;
  identities: PreparedFactoryOnboarding["identities"];
};

export async function beginFactoryOnboarding(input: {
  authority: PlatformAdminAuthority;
  idempotencyKey: string;
  blueprint: Record<string, unknown>;
}): Promise<FactoryOnboardingResult> {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("P2_FACTORY_ADMIN_FORBIDDEN");
  }

  const prepared = prepareFactoryOnboarding({
    blueprint: input.blueprint,
    idempotencyKey: input.idempotencyKey,
  });
  const nativePrepared = prepareFactoryNativeContentVenues({ blueprint: prepared.blueprint });
  if (nativePrepared.blueprintHash !== prepared.blueprintHash) {
    throw new Error("P2_FACTORY_NATIVE_BLUEPRINT_HASH_DRIFT");
  }

  // Reviewed platform-authority write: the SECURITY DEFINER RPC rechecks the exact
  // active Platform Admin, owns the transaction, and enforces idempotency itself.
  const { data, error } = await supabaseAdmin.rpc("begin_factory_onboarding_v1", {
    p_actor_admin_id: input.authority.adminId,
    p_idempotency_key: prepared.idempotencyKey,
    p_blueprint_hash: prepared.blueprintHash,
    p_blueprint: prepared.blueprint,
  });

  if (error) {
    throw new Error(`P2_FACTORY_ONBOARDING_FAILED:${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as FactoryOnboardingRpcRow | null;
  if (!row) {
    throw new Error("P2_FACTORY_ONBOARDING_EMPTY_RESULT");
  }

  return {
    onboardingRunId: row.onboarding_run_id,
    organizationId: row.organization_id,
    propertyId: row.property_id,
    productionHotelId: row.production_hotel_id,
    sandboxHotelId: row.sandbox_hotel_id,
    productionRevisionId: row.production_revision_id,
    sandboxRevisionId: row.sandbox_revision_id,
    replayed: Boolean(row.replayed),
    blueprintHash: prepared.blueprintHash,
    identities: prepared.identities,
  };
}
