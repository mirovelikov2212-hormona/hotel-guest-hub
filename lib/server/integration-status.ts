import "server-only";

import {
  getHotelIntegrationConnections,
} from "@/lib/server/integration-connections";
import {
  hotelMatchesRequestedSlug,
} from "@/lib/server/hotel-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function getManagerIntegrationStatus(
  hotelSlugInput: unknown,
) {
  const hotelSlug = clean(hotelSlugInput).toLowerCase();
  if (!hotelSlug) throw new Error("INTEGRATION_STATUS_HOTEL_REQUIRED");

  const session = await getCurrentStaffSession(hotelSlug, "manager");
  if (!session || session.role !== "manager") {
    throw new Error("INTEGRATION_STATUS_MANAGER_SESSION_REQUIRED");
  }

  const { data: hotel, error } = await supabaseAdmin
    .from("hotels")
    .select("id,slug,public_slug,name,active,is_sandbox")
    .eq("id", session.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new Error(
      `INTEGRATION_STATUS_HOTEL_READ_FAILED:${error.message}`,
    );
  }
  if (!hotel || !hotelMatchesRequestedSlug(hotel, hotelSlug)) {
    throw new Error("INTEGRATION_STATUS_HOTEL_SCOPE_MISMATCH");
  }

  const config = await getHotelIntegrationConnections(String(hotel.id));

  return {
    hotel: {
      id: String(hotel.id),
      slug: String(hotel.slug),
      publicSlug: String(hotel.public_slug || hotel.slug),
      name: String(hotel.name || hotel.slug),
    },
    revision: config.revision,
    configuredConnections: config.connections.length,
    activeConnections: config.connections.filter(
      (connection) => connection.active,
    ).length,
    connections: config.connections.map((connection) => ({
      connectionId: connection.connectionId,
      providerKey: connection.providerKey,
      systemType: connection.systemType,
      displayName: connection.displayName,
      mode: connection.mode,
      active: connection.active,
      capabilities: connection.capabilities,
      credentialConfigured: Boolean(connection.credentialRef),
      providerRuntimeVerified: false,
      state: !connection.active
        ? "inactive"
        : connection.credentialRef
          ? "configured_unverified"
          : "configuration_only",
    })),
    authority: {
      hotelManagerCanEdit: false,
      platformAdminOwnsConfiguration: true,
      directProviderDatabaseWritesAllowed: false,
      directAiExecutionAllowed: false,
    },
  };
}
