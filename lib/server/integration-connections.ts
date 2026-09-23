import "server-only";

import {
  buildIntegrationConnectionsConfig,
  normalizeIntegrationConnectionsConfig,
} from "@/lib/integrations/integration-contract.mjs";
import {
  canMutateControlPlane,
  type PlatformAdminAuthority,
} from "@/lib/server/control-plane-auth";
import { logControlPlaneAudit } from "@/lib/server/control-plane-audit";
import {
  requireHotelProductModuleAccess,
} from "@/lib/server/product-module-entitlements";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const SETTING_KEY = "integration_connections_v1";
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
    throw new Error("INTEGRATION_EXPECTED_REVISION_INVALID");
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
    throw new Error("INTEGRATION_PROPERTY_NOT_FOUND");
  }
  if (environmentResult.error || !environmentResult.data?.hotel_id) {
    throw new Error("INTEGRATION_PRODUCTION_HOTEL_REQUIRED");
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
    .eq("key", SETTING_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(`INTEGRATION_CONFIG_READ_FAILED:${error.message}`);
  }

  return data || null;
}

export async function getHotelIntegrationConnections(hotelIdInput: unknown) {
  const hotelId = uuid(hotelIdInput, "INTEGRATION_HOTEL_ID_INVALID");
  await requireHotelProductModuleAccess(hotelId, "integration_layer");
  const row = await readSetting(hotelId);

  if (!row) {
    return {
      hotelId,
      stored: false,
      revision: 0,
      connections: [],
    };
  }

  const config = normalizeIntegrationConnectionsConfig(row.value_json);
  return {
    hotelId,
    stored: true,
    revision: config.revision,
    connections: config.connections,
  };
}

export async function getPropertyIntegrationConnections(
  propertyIdInput: unknown,
) {
  const propertyId = uuid(
    propertyIdInput,
    "INTEGRATION_PROPERTY_ID_INVALID",
  );
  const target = await resolvePropertyTarget(propertyId);
  const row = await readSetting(target.hotelId);

  if (!row) {
    return {
      ...target,
      stored: false,
      revision: 0,
      connections: [],
    };
  }

  const config = normalizeIntegrationConnectionsConfig(row.value_json);
  return {
    ...target,
    stored: true,
    revision: config.revision,
    connections: config.connections,
  };
}

export async function updatePropertyIntegrationConnections(input: {
  authority: PlatformAdminAuthority;
  propertyId: unknown;
  expectedRevision: unknown;
  connections: unknown;
}) {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("INTEGRATION_FACTORY_ADMIN_FORBIDDEN");
  }

  const propertyId = uuid(
    input.propertyId,
    "INTEGRATION_PROPERTY_ID_INVALID",
  );
  const revision = expectedRevision(input.expectedRevision);
  const target = await resolvePropertyTarget(propertyId);
  await requireHotelProductModuleAccess(
    target.hotelId,
    "integration_layer",
  );

  const currentRow = await readSetting(target.hotelId);
  let currentConfig:
    | ReturnType<typeof normalizeIntegrationConnectionsConfig>
    | null = null;

  if (currentRow) {
    currentConfig = normalizeIntegrationConnectionsConfig(
      currentRow.value_json,
    );
  }

  const currentRevision = currentConfig?.revision ?? 0;
  if (currentRevision !== revision) {
    throw new Error("INTEGRATION_REVISION_CONFLICT");
  }

  const nextConfig = buildIntegrationConnectionsConfig({
    currentRevision,
    connections: Array.isArray(input.connections)
      ? input.connections
      : [],
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
      .eq("key", SETTING_KEY)
      .eq("updated_at", currentRow.updated_at)
      .select("id,updated_at")
      .maybeSingle();

    if (error) {
      throw new Error(
        `INTEGRATION_CONFIG_WRITE_FAILED:${error.message}`,
      );
    }
    if (!data) throw new Error("INTEGRATION_REVISION_CONFLICT");

    writtenRow = {
      id: String(data.id),
      updated_at: String(data.updated_at),
    };
  } else {
    const { data, error } = await supabaseAdmin
      .from("hotel_settings")
      .insert({
        hotel_id: target.hotelId,
        key: SETTING_KEY,
        value_json: nextConfig,
      })
      .select("id,updated_at")
      .single();

    if (error || !data) {
      if (String(error?.code || "") === "23505") {
        throw new Error("INTEGRATION_REVISION_CONFLICT");
      }
      throw new Error(
        `INTEGRATION_CONFIG_WRITE_FAILED:${error?.message || "empty"}`,
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
      action: "integration_connections_updated",
      resourceType: "hotel_setting",
      resourceId: writtenRow.id,
      metadata: {
        schemaVersion: nextConfig.schemaVersion,
        previousRevision: currentRevision,
        revision: nextConfig.revision,
        previousConnections:
          currentConfig?.connections.map((connection) => ({
            connectionId: connection.connectionId,
            providerKey: connection.providerKey,
            systemType: connection.systemType,
            active: connection.active,
            mode: connection.mode,
          })) || [],
        connections: nextConfig.connections.map((connection) => ({
          connectionId: connection.connectionId,
          providerKey: connection.providerKey,
          systemType: connection.systemType,
          active: connection.active,
          mode: connection.mode,
        })),
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
        .eq("key", SETTING_KEY)
        .eq("updated_at", writtenRow.updated_at);
    } else {
      await supabaseAdmin
        .from("hotel_settings")
        .delete()
        .eq("id", writtenRow.id)
        .eq("hotel_id", target.hotelId)
        .eq("key", SETTING_KEY);
    }

    throw auditError;
  }

  return {
    ...target,
    stored: true,
    revision: nextConfig.revision,
    connections: nextConfig.connections,
  };
}
