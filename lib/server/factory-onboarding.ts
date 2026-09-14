import "server-only";

import { canMutateControlPlane, type PlatformAdminAuthority } from "@/lib/server/control-plane-auth";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { PreparedFactoryOnboarding } from "@/lib/product-factory/factory-onboarding-model.mjs";
import { prepareFactoryNativeContentVenues } from "@/lib/product-factory/factory-native-content-venues-model.mjs";
import { prepareFactoryCommunications } from "@/lib/product-factory/factory-communications-model.mjs";
import { prepareAuthoritativeFactoryOnboarding } from "@/lib/server/factory-release-design-authority";

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
  expectedBlueprintHash?: string;
}): Promise<FactoryOnboardingResult> {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("P2_FACTORY_ADMIN_FORBIDDEN");
  }

  const prepared = await prepareAuthoritativeFactoryOnboarding({
    blueprint: input.blueprint,
    idempotencyKey: input.idempotencyKey,
  });
  if (
    input.expectedBlueprintHash
    && prepared.blueprintHash !== String(input.expectedBlueprintHash).trim().toLowerCase()
  ) {
    throw new Error("P2_FACTORY_STALE_PREFLIGHT");
  }

  const nativePrepared = prepareFactoryNativeContentVenues({ blueprint: prepared.blueprint });
  if (nativePrepared.blueprintHash !== prepared.blueprintHash) {
    throw new Error("P2_FACTORY_NATIVE_BLUEPRINT_HASH_DRIFT");
  }
  const communicationsPrepared = prepareFactoryCommunications({ blueprint: prepared.blueprint });
  if (communicationsPrepared.blueprintHash !== prepared.blueprintHash) {
    throw new Error("P2D_COMMUNICATION_BLUEPRINT_HASH_DRIFT");
  }

  // Reviewed platform-authority write: the SECURITY DEFINER RPC rechecks the exact
  // active Platform Admin, owns the transaction, and enforces idempotency itself.
  // Exact Design provenance has already been reconstructed and checksum-verified
  // server-side; the browser-supplied handoff metadata is never persisted as authority.
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
