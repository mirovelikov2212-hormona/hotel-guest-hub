import "server-only";

import {
  PRODUCT_MODULE_KEYS,
  requireProductModuleKey,
  resolveProductModuleAccess,
} from "@/lib/commercial/product-module-entitlements.mjs";
import {
  getHotelCommercialRuntimeEntitlement,
  type CommercialRuntimeEntitlement,
} from "@/lib/server/commercial-runtime-entitlement";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const MODULE_SETTING_KEY = "commercial_module_entitlements";

export type ProductModuleKey = (typeof PRODUCT_MODULE_KEYS)[number];

export type HotelProductModuleEntitlement = {
  commercial: CommercialRuntimeEntitlement;
  source: string;
  enabledModules: ProductModuleKey[];
  moduleAccess: Record<ProductModuleKey, boolean>;
  configRevision: number | null;
};

export class ProductModuleAccessDeniedError extends Error {
  code = "PRODUCT_MODULE_ACCESS_BLOCKED";
  statusCode = 403;
  hotelId: string;
  moduleKey: ProductModuleKey;
  source: string;

  constructor(input: {
    hotelId: string;
    moduleKey: ProductModuleKey;
    source: string;
  }) {
    super(`PRODUCT_MODULE_ACCESS_BLOCKED:${input.moduleKey}`);
    this.name = "ProductModuleAccessDeniedError";
    this.hotelId = input.hotelId;
    this.moduleKey = input.moduleKey;
    this.source = input.source;
  }
}

async function readCommercialModuleConfig(hotelId: string) {
  const { data, error } = await supabaseAdmin
    .from("hotel_settings")
    .select("value_json")
    .eq("hotel_id", hotelId)
    .eq("key", MODULE_SETTING_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(
      `COMMERCIAL_MODULE_CONFIG_READ_FAILED:${error.message}`,
    );
  }

  return data?.value_json ?? null;
}

export async function getHotelProductModuleEntitlement(
  hotelIdInput: string,
): Promise<HotelProductModuleEntitlement> {
  const hotelId = String(hotelIdInput || "").trim();
  if (!hotelId) {
    throw new Error("COMMERCIAL_MODULE_HOTEL_ID_REQUIRED");
  }

  const commercial = await getHotelCommercialRuntimeEntitlement(hotelId);

  let config: unknown = null;
  const needsExplicitConfig =
    commercial.accessAllowed
    && ![
      "legacy_unmanaged",
      "non_production_bypass",
    ].includes(commercial.effectiveStatus)
    && !(
      commercial.effectiveStatus === "trial_active"
      && commercial.planCode === "full_trial"
    );

  if (needsExplicitConfig) {
    config = await readCommercialModuleConfig(hotelId);
  }

  const resolved = resolveProductModuleAccess({
    commercial,
    config,
  });

  return {
    commercial,
    source: String(resolved.source),
    enabledModules: resolved.enabledModules as ProductModuleKey[],
    moduleAccess: resolved.moduleAccess as Record<ProductModuleKey, boolean>,
    configRevision: resolved.configRevision,
  };
}

export async function requireHotelProductModuleAccess(
  hotelId: string,
  moduleInput: ProductModuleKey | string,
) {
  const moduleKey = requireProductModuleKey(moduleInput) as ProductModuleKey;
  const entitlement = await getHotelProductModuleEntitlement(hotelId);

  if (!entitlement.moduleAccess[moduleKey]) {
    throw new ProductModuleAccessDeniedError({
      hotelId,
      moduleKey,
      source: entitlement.source,
    });
  }

  return entitlement;
}

export function isProductModuleAccessDeniedError(
  error: unknown,
): error is ProductModuleAccessDeniedError {
  return error instanceof ProductModuleAccessDeniedError;
}
