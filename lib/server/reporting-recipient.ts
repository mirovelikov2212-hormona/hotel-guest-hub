import "server-only";

import { getWeeklyReportRecipient } from "@/lib/server/report-email-smtp";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const REPORTING_SETTING_KEY = "reporting_email_delivery";

type ReportingSetting = {
  enabled?: unknown;
  email?: unknown;
  legacyEnvironmentRecipient?: unknown;
};

function normalizeEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || email.length > 320) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

export async function getHotelReportRecipient(hotelId: string) {
  const { data, error } = await supabaseAdmin
    .from("hotel_settings")
    .select("value_json")
    .eq("hotel_id", hotelId)
    .eq("key", REPORTING_SETTING_KEY)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const setting = (data.value_json || {}) as ReportingSetting;
  if (setting.enabled === false) return null;

  if (setting.legacyEnvironmentRecipient === true) {
    return normalizeEmail(getWeeklyReportRecipient()) || null;
  }

  return normalizeEmail(setting.email) || null;
}

export { REPORTING_SETTING_KEY };
