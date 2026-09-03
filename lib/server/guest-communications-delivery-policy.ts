import "server-only";

import { supabaseAdmin } from "@/lib/server/supabase-admin";

const DELIVERY_SETTING = "guest_communications_delivery_enabled";

function enabledValue(value: unknown) {
  if (value === true) return true;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return (value as { enabled?: unknown }).enabled === true;
  }
  return false;
}

export async function guestCommunicationsDeliveryEnabledForHotel(hotelId: string) {
  if (!hotelId) return false;
  const { data, error } = await supabaseAdmin
    .from("hotel_settings")
    .select("value_json")
    .eq("hotel_id", hotelId)
    .eq("key", DELIVERY_SETTING)
    .maybeSingle();
  if (error) throw error;
  return enabledValue(data?.value_json);
}
