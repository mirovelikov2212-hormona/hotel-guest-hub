import "server-only";

import {
  buildCommercialModuleConfig,
  normalizeCommercialModuleConfig,
} from "@/lib/commercial/product-module-entitlements.mjs";
import {
  canMutateControlPlane,
  type PlatformAdminAuthority,
} from "@/lib/server/control-plane-auth";
import { logControlPlaneAudit } from "@/lib/server/control-plane-audit";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const MODULE_SETTING_KEY = "commercial_module_entitlements";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(value: unknown, code: string) {
  const id = String(value || "").trim().toLowerCase();
  if (!UUID_RE.test(id)) throw new Error(code);
  return id;
}

function expectedRevision(value: unknown) {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("COMMERCIAL_MODULE_EXPECTED_REVISION_INVALID");
  }
  return revision;
}

async function resolvePropertyTarget(propertyId: string) {
  const [propertyResult, environmentResult] = await Promise.all([
    supabaseAdmin
      .from("properties")
      .select("id,organization_id")
      .eq("id", propertyId)
      .maybeSingle(),
    supabaseAdmin
      .from("property_environments")
      .select("hotel_id")
      .eq("property_id", propertyId)
      .eq("environment", "production")
      .maybeSingle(),
  ]);

  if (propertyResult.error || !propertyResult.data) {
    throw new Error("COMMERCIAL_MODULE_PROPERTY_NOT_FOUND");
  }
  if (environmentResult.error || !environmentResult.data?.hotel_id) {
    throw new Error("COMMERCIAL_MODULE_PRODUCTION_HOTEL_REQUIRED");
  }

  return {
    propertyId: String(propertyResult.data.id),
    organizationId: String(propertyResult.data.organization_id),
    hotelId: String(environmentResult.data.hotel_id),
  };
}

async function readSetting(hotelId: string) {
  const { data, error } = await supabaseAdmin
    .from("hotel_settings")
    .select("id,value_json,updated_at")
    .eq("hotel_id", hotelId)
    .eq("key", MODULE_SETTING_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(`COMMERCIAL_MODULE_CONFIG_READ_FAILED:${error.message}`);
  }
  return data || null;
}

export async function getPropertyCommercialModuleConfig(propertyIdInput: unknown) {
  const propertyId = uuid(
    propertyIdInput,
    "COMMERCIAL_MODULE_PROPERTY_ID_INVALID",
  );
  const target = await resolvePropertyTarget(propertyId);
  const row = await readSetting(target.hotelId);

  if (!row) {
    return {
      ...target,
      stored: false,
      revision: 0,
      enabledModules: [],
    };
  }

  const config = normalizeCommercialModuleConfig(row.value_json);
  return {
    ...target,
    stored: true,
    revision: config.revision,
    enabledModules: config.enabledModules,
  };
}

export async function updatePropertyCommercialModuleConfig(input: {
  authority: PlatformAdminAuthority;
  propertyId: unknown;
  expectedRevision: unknown;
  enabledModules: unknown;
}) {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("COMMERCIAL_MODULE_FACTORY_ADMIN_FORBIDDEN");
  }

  const propertyId = uuid(
    input.propertyId,
    "COMMERCIAL_MODULE_PROPERTY_ID_INVALID",
  );
  const revision = expectedRevision(input.expectedRevision);
  const target = await resolvePropertyTarget(propertyId);
  const currentRow = await readSetting(target.hotelId);

  let currentConfig: ReturnType<typeof normalizeCommercialModuleConfig> | null =
    null;
  if (currentRow) {
    currentConfig = normalizeCommercialModuleConfig(currentRow.value_json);
  }

  const currentRevision = currentConfig?.revision ?? 0;
  if (currentRevision !== revision) {
    throw new Error("COMMERCIAL_MODULE_REVISION_CONFLICT");
  }

  const nextConfig = buildCommercialModuleConfig({
    currentRevision,
    enabledModules: input.enabledModules,
  });

  let writtenRow: { id: string; updated_at: string } | null = null;

  if (currentRow) {
    const { data, error } = await supabaseAdmin
      .from("hotel_settings")
      .update({
        value_json: nextConfig,
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentRow.id)
      .eq("hotel_id", target.hotelId)
      .eq("key", MODULE_SETTING_KEY)
      .eq("updated_at", currentRow.updated_at)
      .select("id,updated_at")
      .maybeSingle();

    if (error) {
      throw new Error(`COMMERCIAL_MODULE_CONFIG_WRITE_FAILED:${error.message}`);
    }
    if (!data) {
      throw new Error("COMMERCIAL_MODULE_REVISION_CONFLICT");
    }
    writtenRow = {
      id: String(data.id),
      updated_at: String(data.updated_at),
    };
  } else {
    const { data, error } = await supabaseAdmin
      .from("hotel_settings")
      .insert({
        hotel_id: target.hotelId,
        key: MODULE_SETTING_KEY,
        value_json: nextConfig,
      })
      .select("id,updated_at")
      .single();

    if (error || !data) {
      if (String(error?.code || "") === "23505") {
        throw new Error("COMMERCIAL_MODULE_REVISION_CONFLICT");
      }
      throw new Error(
        `COMMERCIAL_MODULE_CONFIG_WRITE_FAILED:${error?.message || "empty"}`,
      );
    }
    writtenRow = {
      id: String(data.id),
      updated_at: String(data.updated_at),
    };
  }

  try {
    await logControlPlaneAudit({
      actorAdminId: input.authority.adminId,
      organizationId: target.organizationId,
      propertyId: target.propertyId,
      hotelId: target.hotelId,
      action: "commercial_module_entitlements_updated",
      resourceType: "hotel_setting",
      resourceId: writtenRow.id,
      metadata: {
        schemaVersion: nextConfig.schemaVersion,
        previousRevision: currentRevision,
        revision: nextConfig.revision,
        previousEnabledModules: currentConfig?.enabledModules || [],
        enabledModules: nextConfig.enabledModules,
      },
    });
  } catch (auditError) {
    if (currentRow) {
      await supabaseAdmin
        .from("hotel_settings")
        .update({
          value_json: currentRow.value_json,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentRow.id)
        .eq("hotel_id", target.hotelId)
        .eq("key", MODULE_SETTING_KEY)
        .eq("updated_at", writtenRow.updated_at);
    } else {
      await supabaseAdmin
        .from("hotel_settings")
        .delete()
        .eq("id", writtenRow.id)
        .eq("hotel_id", target.hotelId)
        .eq("key", MODULE_SETTING_KEY);
    }
    throw auditError;
  }

  return {
    ...target,
    stored: true,
    revision: nextConfig.revision,
    enabledModules: nextConfig.enabledModules,
  };
}
