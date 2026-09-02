import "server-only";

import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import { hotelMatchesRequestedSlug } from "@/lib/server/hotel-scope";
import { resolveStaffRuntimeRoleForHotelId } from "@/lib/server/staff-runtime-role";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { STAFF_MANAGER_ROLE, normalizeStaffRoleCode } from "@/lib/staff/role-code";

export const GUEST_COMMUNICATION_CAPABILITIES = [
  "guest_communications.view_own",
  "guest_communications.view_all",
  "guest_communications.create",
  "guest_communications.send",
  "guest_communications.schedule",
  "guest_communications.approve",
  "guest_communications.emergency_send",
  "guest_request_conversations.view_own",
  "guest_request_conversations.view_all",
  "guest_request_conversations.reply",
] as const;

export type GuestCommunicationCapability = typeof GUEST_COMMUNICATION_CAPABILITIES[number];

type CapabilityRow = {
  capability: GuestCommunicationCapability;
  enabled: boolean;
};

function defaultCapabilities(role: string) {
  const manager = role === STAFF_MANAGER_ROLE;
  const reception = role === "reception";
  const conversationViewAll = manager || reception;
  return new Map<GuestCommunicationCapability, boolean>([
    ["guest_communications.view_own", !manager],
    ["guest_communications.view_all", manager],
    ["guest_communications.create", true],
    ["guest_communications.send", true],
    ["guest_communications.schedule", true],
    ["guest_communications.approve", manager],
    ["guest_communications.emergency_send", manager],
    ["guest_request_conversations.view_own", !conversationViewAll],
    ["guest_request_conversations.view_all", conversationViewAll],
    ["guest_request_conversations.reply", true],
  ]);
}

export async function resolveGuestCommunicationsAccess(hotelSlugInput: string, roleInput: unknown) {
  const hotelSlug = String(hotelSlugInput || "").trim().toLowerCase();
  const role = normalizeStaffRoleCode(roleInput);
  if (!hotelSlug || !role) return null;

  const session = await getCurrentStaffSession(hotelSlug, role);
  if (!session || session.role !== role) return null;

  const { data: hotel, error: hotelError } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, public_slug, name, active, is_sandbox, timezone")
    .eq("id", session.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (hotelError || !hotel || !hotelMatchesRequestedSlug(hotel, hotelSlug)) return null;

  const runtimeRole = await resolveStaffRuntimeRoleForHotelId(String(hotel.id), role);
  if (!runtimeRole) return null;

  const capabilities = defaultCapabilities(role);
  const { data: overrides, error: overridesError } = await supabaseAdmin
    .from("hotel_staff_role_capabilities")
    .select("capability, enabled")
    .eq("hotel_id", hotel.id)
    .eq("role_code", role);

  if (overridesError) throw overridesError;
  for (const row of (overrides || []) as CapabilityRow[]) {
    if (GUEST_COMMUNICATION_CAPABILITIES.includes(row.capability)) {
      capabilities.set(row.capability, Boolean(row.enabled));
    }
  }

  return {
    hotel: {
      id: String(hotel.id),
      slug: String(hotel.slug),
      publicSlug: String(hotel.public_slug || hotel.slug),
      name: String(hotel.name || hotel.slug),
      timezone: String(hotel.timezone || "UTC"),
      isSandbox: Boolean(hotel.is_sandbox),
    },
    role,
    sessionId: String(session.id),
    runtimeRole,
    capabilities: Object.fromEntries(capabilities) as Record<GuestCommunicationCapability, boolean>,
  };
}

export function hasGuestCommunicationCapability(
  access: Awaited<ReturnType<typeof resolveGuestCommunicationsAccess>>,
  capability: GuestCommunicationCapability,
) {
  return Boolean(access?.capabilities[capability]);
}
