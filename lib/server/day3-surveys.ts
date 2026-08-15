import "server-only";

import { getHotelConfig } from "@/lib/config";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { StaffRole } from "@/lib/staff-auth/cookie-name";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import type { Day3Survey, Day3SurveyResolutionStatus } from "@/lib/staff/survey-types";
import {
  hotelMatchesRequestedSlug,
  resolveHotelByAnySlugAdmin,
  type HotelScope,
} from "@/lib/server/hotel-scope";

export const DAY3_SURVEY_VERSION = "day3-v1";
export const DEFAULT_SURVEY_TIMEZONE = "UTC";

export type GuestSurveyRow = {
  id: string;
  hotel_id: string;
  room_number: string;
  survey_type: string;
  rating: number;
  selected_categories: unknown;
  improvement_text: string | null;
  improvement_text_original?: string | null;
  improvement_text_bg?: string | null;
  improvement_text_en?: string | null;
  improvement_text_de?: string | null;
  problem_text: string | null;
  problem_text_original?: string | null;
  problem_text_bg?: string | null;
  problem_text_en?: string | null;
  problem_text_de?: string | null;
  resolution_status: Day3SurveyResolutionStatus | null;
  resolution_note: string | null;
  resolution_note_original?: string | null;
  resolution_note_bg?: string | null;
  resolution_note_en?: string | null;
  resolution_note_de?: string | null;
  language: string | null;
  survey_version: string | null;
  hotel_date_key: string | null;
  target_date_key: string | null;
  first_confirmed_date_key: string | null;
  guest_submitted_at: string;
  active_until: string;
  manager_read_at: string | null;
  is_test?: boolean | null;
  test_expires_at?: string | null;
  metadata_json?: {
    reception_read_at?: string | null;
    reception_read_by?: string | null;
    improvement_text_bg?: string | null;
    improvement_text_en?: string | null;
    improvement_text_de?: string | null;
    problem_text_bg?: string | null;
    problem_text_en?: string | null;
    problem_text_de?: string | null;
    resolution_note_bg?: string | null;
    resolution_note_en?: string | null;
    resolution_note_de?: string | null;
    [key: string]: unknown;
  } | null;
  created_at: string;
};

export function normalizeRoomNumber(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, "");
}

export function normalizeSurveyText(value: unknown, maxLength = 1000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function normalizeSurveyCategories(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[|,]/)
        .map((item) => item.trim());

  return Array.from(
    new Set(
      raw
        .map((item) => String(item || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"))
        .filter(Boolean)
        .slice(0, 12),
    ),
  );
}

export function normalizeResolutionStatus(value: unknown): Day3SurveyResolutionStatus | null {
  const status = String(value || "").trim().toLowerCase();
  if (
    status === "fully_resolved" ||
    status === "partially_resolved" ||
    status === "not_resolved" ||
    status === "not_informed"
  ) {
    return status;
  }

  return null;
}

export async function getHotelByAnySlugAdmin(inputSlug: string) {
  return resolveHotelByAnySlugAdmin(inputSlug) as Promise<HotelScope>;
}

export async function validateHotelRoom(hotelSlug: string, room: string) {
  const hotelConfig = await getHotelConfig(hotelSlug).catch((error) => {
    console.error("Failed to load hotel config for survey room validation", { hotelSlug, error });
    return null;
  });

  const validRoomNumbers = Array.isArray(hotelConfig?.validRoomNumbers)
    ? hotelConfig.validRoomNumbers.map((item) => normalizeRoomNumber(item)).filter(Boolean)
    : [];

  if (validRoomNumbers.length > 0 && !validRoomNumbers.includes(room)) {
    return { ok: false as const, error: "Invalid room number" };
  }

  return {
    ok: true as const,
    timezone: String(hotelConfig?.hotelTimezone || DEFAULT_SURVEY_TIMEZONE).trim() || DEFAULT_SURVEY_TIMEZONE,
  };
}

export function getDateKeyInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || DEFAULT_SURVEY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

function getTimezoneOffsetMinutes(timezone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || DEFAULT_SURVEY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = map.hour === "24" ? "00" : map.hour || "00";
  const localAsUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(hour),
    Number(map.minute || "0"),
    Number(map.second || "0"),
  );

  return Math.round((localAsUtc - date.getTime()) / 60000);
}

export function localMidnightToUtcIso(dateKey: string, timezone: string) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date().toISOString();

  const baseUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0);
  let offset = getTimezoneOffsetMinutes(timezone, new Date(baseUtc));
  let utcMs = baseUtc - offset * 60_000;

  const adjustedOffset = getTimezoneOffsetMinutes(timezone, new Date(utcMs));
  if (adjustedOffset !== offset) {
    offset = adjustedOffset;
    utcMs = baseUtc - offset * 60_000;
  }

  return new Date(utcMs).toISOString();
}

export function calculateSurveyActiveUntil(submittedAt: Date, timezone: string) {
  const hotelDateKey = getDateKeyInTimezone(submittedAt, timezone);
  const activeUntilDateKey = addDaysToDateKey(hotelDateKey, 2);

  return {
    hotelDateKey,
    activeUntil: localMidnightToUtcIso(activeUntilDateKey, timezone),
  };
}

export function mapSurveyRow(row: GuestSurveyRow): Day3Survey {
  const categories = Array.isArray(row.selected_categories)
    ? row.selected_categories.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  return {
    id: row.id,
    room: row.room_number,
    rating: Number(row.rating || 0),
    selectedCategories: categories,
    improvementText: String(row.improvement_text_bg || row.metadata_json?.improvement_text_bg || row.improvement_text || ""),
    improvementTextOriginal: String(row.improvement_text_original || row.improvement_text || ""),
    improvementTextBg: String(row.improvement_text_bg || row.metadata_json?.improvement_text_bg || row.improvement_text || ""),
    improvementTextEn: String(row.improvement_text_en || row.metadata_json?.improvement_text_en || row.improvement_text || ""),
    improvementTextDe: String(row.improvement_text_de || row.metadata_json?.improvement_text_de || row.improvement_text || ""),
    problemText: String(row.problem_text_bg || row.metadata_json?.problem_text_bg || row.problem_text || ""),
    problemTextOriginal: String(row.problem_text_original || row.problem_text || ""),
    problemTextBg: String(row.problem_text_bg || row.metadata_json?.problem_text_bg || row.problem_text || ""),
    problemTextEn: String(row.problem_text_en || row.metadata_json?.problem_text_en || row.problem_text || ""),
    problemTextDe: String(row.problem_text_de || row.metadata_json?.problem_text_de || row.problem_text || ""),
    resolutionStatus: row.resolution_status || null,
    resolutionNote: String(row.resolution_note_bg || row.metadata_json?.resolution_note_bg || row.resolution_note || ""),
    resolutionNoteOriginal: String(row.resolution_note_original || row.resolution_note || ""),
    resolutionNoteBg: String(row.resolution_note_bg || row.metadata_json?.resolution_note_bg || row.resolution_note || ""),
    resolutionNoteEn: String(row.resolution_note_en || row.metadata_json?.resolution_note_en || row.resolution_note || ""),
    resolutionNoteDe: String(row.resolution_note_de || row.metadata_json?.resolution_note_de || row.resolution_note || ""),
    language: row.language || "bg",
    surveyVersion: row.survey_version || DAY3_SURVEY_VERSION,
    hotelDateKey: row.hotel_date_key || row.guest_submitted_at.slice(0, 10),
    targetDateKey: row.target_date_key || null,
    firstConfirmedDateKey: row.first_confirmed_date_key || null,
    guestSubmittedAt: row.guest_submitted_at,
    activeUntil: row.active_until,
    managerReadAt: row.manager_read_at || null,
    isTest: Boolean(row.is_test || row.metadata_json?.isTest),
    testExpiresAt: row.test_expires_at || (row.metadata_json?.testExpiresAt ? String(row.metadata_json.testExpiresAt) : null),
    receptionReadAt: row.metadata_json?.reception_read_at ? String(row.metadata_json.reception_read_at) : null,
    createdAt: row.created_at,
  };
}

export async function resolveAuthorizedSurveyScope(hotelSlug: string, role: StaffRole) {
  const session = await getCurrentStaffSession(hotelSlug, role);
  if (!session) return { ok: false as const, status: 401, error: "No active staff session" };

  const { data: hotel, error: hotelError } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, public_slug, active")
    .eq("id", session.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (hotelError || !hotel) {
    return { ok: false as const, status: 401, error: "Hotel not found for session" };
  }

  if (!hotelMatchesRequestedSlug(hotel, hotelSlug) || session.role !== role) {
    return { ok: false as const, status: 403, error: "Session does not match requested hotel/role" };
  }

  return { ok: true as const, hotelId: hotel.id as string, hotelSlug: hotel.slug as string, role };
}
