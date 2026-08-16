import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import type { StaffRole } from "@/lib/staff-auth/cookie-name";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { hotelMatchesRequestedSlug } from "@/lib/server/hotel-scope";
import { getDepartmentForRequestType } from "@/lib/staff/routing/request-routing";
import { normalizeStaffRequestType } from "@/lib/staff/request-type-utils";
import { isDepartmentWorkingHoursForConfig } from "@/lib/staff/operations-hours";
import { getHotelConfig } from "@/lib/config";
import {
  getOperationalRequestDebugKey,
  getOperationalRequestNoteBg,
  getOperationalRequestTitleBg,
} from "@/lib/staff/ops-request-copy";
import { translateGuestText } from "@/lib/server/staff-translation";
import type {
  StaffDepartment,
  StaffRequest,
  StaffRequestStatus,
  StaffRequestType,
  StaffServiceTime,
} from "@/lib/staff/types";

type GuestRequestRow = {
  id: string;
  room_number_snapshot: string | null;
  request_type: string;
  title: string;
  message: string | null;
  title_original?: string | null;
  message_original?: string | null;
  title_bg?: string | null;
  title_en?: string | null;
  title_de?: string | null;
  message_bg?: string | null;
  message_en?: string | null;
  message_de?: string | null;
  status: StaffRequestStatus;
  created_at: string;
  is_test?: boolean | null;
  test_expires_at?: string | null;
  metadata_json: {
    department?: StaffDepartment;
    serviceTime?: StaffServiceTime;
    typeLabel?: string;
    note?: string;
    rawType?: string | null;
    sourceRequestDef?: string | null;
    requiresBilling?: boolean;
    price?: string | null;
    currency?: string | null;
    notifyDepartments?: string[];
    guestLanguage?: string;
    staffTitleBg?: string | null;
    staffNoteBg?: string | null;
    staffTitleEn?: string | null;
    staffTitleDe?: string | null;
    staffNoteEn?: string | null;
    staffNoteDe?: string | null;
    billingStatus?: "pending" | "charged" | "waived" | "cancelled" | null;
    billingChargedAt?: string | null;
    billingChargedByRole?: string | null;
    billingWaivedAt?: string | null;
    billingWaivedByRole?: string | null;
    billingCancelledAt?: string | null;
    billingCancelledByRole?: string | null;
    billingUpdatedAt?: string | null;
    billingUpdatedByRole?: string | null;
    staff_report_translation_attempted_at?: string | null;
    [key: string]: unknown;
  } | null;
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function requestNeedsReportTranslationBackfill(row: GuestRequestRow) {
  const metadata = row.metadata_json ?? {};
  if (metadata.staff_report_translation_attempted_at) return false;

  const copyInput = {
    requestType: row.request_type,
    title: row.title,
    message: row.message,
    metadata,
  };
  const titleBg = normalizeText(row.title_bg || metadata.staffTitleBg || getOperationalRequestTitleBg(copyInput));
  const noteBg = normalizeText(row.message_bg || metadata.staffNoteBg || getOperationalRequestNoteBg(copyInput) || "");

  if (!normalizeText(row.title_original)) return true;
  if (row.message && !normalizeText(row.message_original)) return true;
  if (titleBg && !normalizeText(row.title_bg)) return true;
  if (titleBg && (!normalizeText(row.title_en) || !normalizeText(row.title_de))) return true;
  if (noteBg && !normalizeText(row.message_bg)) return true;
  if (noteBg && (!normalizeText(row.message_en) || !normalizeText(row.message_de))) return true;

  return false;
}

async function backfillMissingRequestReportTranslations(rows: GuestRequestRow[]) {
  const candidates = rows.filter(requestNeedsReportTranslationBackfill).slice(0, 6);
  if (!candidates.length) return rows;

  const updatedById = new Map<string, GuestRequestRow>();

  await Promise.all(candidates.map(async (row) => {
    const metadata = row.metadata_json ?? {};
    const copyInput = {
      requestType: row.request_type,
      title: row.title,
      message: row.message,
      metadata,
    };
    const titleBg = normalizeText(row.title_bg || metadata.staffTitleBg || getOperationalRequestTitleBg(copyInput));
    const noteBg = normalizeText(row.message_bg || metadata.staffNoteBg || getOperationalRequestNoteBg(copyInput) || "");

    const [titleEn, titleDe, noteEn, noteDe] = await Promise.all([
      titleBg && !normalizeText(row.title_en)
        ? translateGuestText(titleBg, {
            sourceLanguage: "bg",
            targetLanguage: "en",
            context: "Backfill StayHub operational request title for hotel reports.",
            maxLength: 500,
          })
        : Promise.resolve(normalizeText(row.title_en)),
      titleBg && !normalizeText(row.title_de)
        ? translateGuestText(titleBg, {
            sourceLanguage: "bg",
            targetLanguage: "de",
            context: "Backfill StayHub operational request title for hotel reports.",
            maxLength: 500,
          })
        : Promise.resolve(normalizeText(row.title_de)),
      noteBg && !normalizeText(row.message_en)
        ? translateGuestText(noteBg, {
            sourceLanguage: "bg",
            targetLanguage: "en",
            context: "Backfill StayHub operational request note for hotel reports.",
            maxLength: 1200,
          })
        : Promise.resolve(normalizeText(row.message_en)),
      noteBg && !normalizeText(row.message_de)
        ? translateGuestText(noteBg, {
            sourceLanguage: "bg",
            targetLanguage: "de",
            context: "Backfill StayHub operational request note for hotel reports.",
            maxLength: 1200,
          })
        : Promise.resolve(normalizeText(row.message_de)),
    ]);

    const nextMetadata = {
      ...metadata,
      staffTitleBg: metadata.staffTitleBg || titleBg || null,
      staffTitleEn: metadata.staffTitleEn || titleEn || null,
      staffTitleDe: metadata.staffTitleDe || titleDe || null,
      staffNoteBg: metadata.staffNoteBg || noteBg || null,
      staffNoteEn: metadata.staffNoteEn || noteEn || null,
      staffNoteDe: metadata.staffNoteDe || noteDe || null,
      staff_report_translation_attempted_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("guest_requests")
      .update({
        title_original: row.title_original || row.title || null,
        message_original: row.message_original || row.message || null,
        title_bg: titleBg || null,
        title_en: titleEn || titleBg || null,
        title_de: titleDe || titleBg || null,
        message_bg: noteBg || null,
        message_en: noteEn || noteBg || null,
        message_de: noteDe || noteBg || null,
        metadata_json: nextMetadata,
      })
      .eq("id", row.id)
      .select("id, room_number_snapshot, request_type, title, message, title_original, message_original, title_bg, title_en, title_de, message_bg, message_en, message_de, status, created_at, is_test, test_expires_at, metadata_json")
      .single();

    if (error || !data) {
      console.error("guest request report translation backfill failed", { requestId: row.id, error });
      return;
    }

    updatedById.set(row.id, data as GuestRequestRow);
  }));

  return rows.map((row) => updatedById.get(row.id) || row);
}

function isExpiredTestRow(row: Pick<GuestRequestRow, "is_test" | "test_expires_at">) {
  if (!row.is_test || !row.test_expires_at) return false;
  const expiresAt = Date.parse(row.test_expires_at);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function isValidRole(value: string): value is StaffRole {
  return (
    value === "reception" ||
    value === "housekeeping" ||
    value === "maintenance" ||
    value === "manager"
  );
}

function mapRowToStaffRequest(row: GuestRequestRow): StaffRequest {
  const metadata = row.metadata_json ?? {};
  const created = new Date(row.created_at);
  const normalizedType = normalizeStaffRequestType(row.request_type, metadata.department);
  const copyInput = {
    requestType: row.request_type,
    title: row.title,
    message: row.message,
    metadata,
  };
  const detectedKey = getOperationalRequestDebugKey(copyInput);
  const resolvedType: StaffRequestType =
    detectedKey === "massage_booking" ? "massage_booking" : normalizedType;

  const titleBg = row.title_bg || metadata.staffTitleBg || getOperationalRequestTitleBg(copyInput);
  const noteBg = row.message_bg || metadata.staffNoteBg || getOperationalRequestNoteBg(copyInput);

  return {
    id: row.id,
    room: row.room_number_snapshot ?? "Unknown",
    department: metadata.department ?? getDepartmentForRequestType(resolvedType),
    type: resolvedType,
    typeLabel: titleBg,
    typeLabelOriginal: row.title_original || row.title || null,
    typeLabelBg: titleBg || null,
    typeLabelEn: row.title_en || metadata.staffTitleEn || null,
    typeLabelDe: row.title_de || metadata.staffTitleDe || null,
    status: row.status,
    serviceTime: metadata.serviceTime ?? "now",
    createdAt: created.toLocaleString([], {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
    createdAtIso: row.created_at,
    createdDateKey: created.toLocaleDateString("sv-SE"),
    note: noteBg || undefined,
    noteOriginal: row.message_original || row.message || null,
    noteBg: noteBg || null,
    noteEn: row.message_en || metadata.staffNoteEn || null,
    noteDe: row.message_de || metadata.staffNoteDe || null,
    requiresBilling: Boolean(metadata.requiresBilling),
    price: metadata.price ?? null,
    currency: metadata.currency ?? null,
    billingStatus: metadata.billingStatus ?? (metadata.requiresBilling ? "pending" : null),
    billingChargedAt: metadata.billingChargedAt ?? null,
    billingChargedByRole: metadata.billingChargedByRole ?? null,
    billingWaivedAt: metadata.billingWaivedAt ?? null,
    billingWaivedByRole: metadata.billingWaivedByRole ?? null,
    billingCancelledAt: metadata.billingCancelledAt ?? null,
    billingCancelledByRole: metadata.billingCancelledByRole ?? null,
    billingUpdatedAt: metadata.billingUpdatedAt ?? null,
    billingUpdatedByRole: metadata.billingUpdatedByRole ?? null,
    sourceRequestDef: metadata.sourceRequestDef ?? null,
    notifyDepartments: metadata.notifyDepartments ?? [],
    guestLanguage: metadata.guestLanguage ?? null,
    isTest: Boolean(row.is_test || metadata.isTest),
    testExpiresAt: row.test_expires_at ?? (typeof metadata.testExpiresAt === "string" ? metadata.testExpiresAt : null),
  };
}

async function resolveAuthorizedScope(hotelSlug: string, role: StaffRole) {
  const session = await getCurrentStaffSession(hotelSlug, role);
  if (!session) {
    return { error: NextResponse.json({ ok: false, error: "No active staff session" }, { status: 401, headers: NO_STORE_HEADERS }) };
  }

  const { data: hotel, error: hotelError } = await supabaseAdmin
    .from("hotels")
    .select("id, slug, public_slug, active, is_sandbox")
    .eq("id", session.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (hotelError || !hotel) {
    return { error: NextResponse.json({ ok: false, error: "Hotel not found for session" }, { status: 401, headers: NO_STORE_HEADERS }) };
  }

  if (!hotelMatchesRequestedSlug(hotel, hotelSlug) || session.role !== role) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Session does not match requested hotel/role" },
        { status: 403, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return {
    hotelId: hotel.id,
    role,
    hotelSlug: hotel.slug,
    environment: hotel.is_sandbox ? "sandbox" : "production",
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hotelSlug = String(searchParams.get("hotelSlug") || "").trim().toLowerCase();
    const role = String(searchParams.get("role") || "").trim().toLowerCase();

    if (!hotelSlug || !isValidRole(role)) {
      return NextResponse.json(
        { ok: false, error: "Missing hotelSlug or role" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const scope = await resolveAuthorizedScope(hotelSlug, role);
    if ("error" in scope) return scope.error;

    const needsOperationalConfig = role === "housekeeping" || role === "maintenance";
    const operationalConfig = needsOperationalConfig
      ? await getHotelConfig(scope.hotelSlug).catch((error) => {
          console.error("Staff operational-hours config load failed", {
            hotelId: scope.hotelId,
            hotelSlug: scope.hotelSlug,
            error,
          });
          return null;
        })
      : null;

    if (needsOperationalConfig && !operationalConfig) {
      return NextResponse.json(
        { ok: false, error: "Hotel operational configuration unavailable" },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    let query = supabaseAdmin
      .from("guest_requests")
      .select(
        "id, room_number_snapshot, request_type, title, message, title_original, message_original, title_bg, title_en, title_de, message_bg, message_en, message_de, status, created_at, is_test, test_expires_at, metadata_json"
      )
      .eq("hotel_id", scope.hotelId)
      .order("created_at", { ascending: false });

    if (role === "housekeeping" || role === "maintenance") {
      query = query.contains("metadata_json", { department: role });
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch requests: ${error.message}` },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    const visibleRows = ((data || []) as GuestRequestRow[]).filter((row) => !isExpiredTestRow(row));
    const hydratedRows = await backfillMissingRequestReportTranslations(visibleRows);
    let requests = hydratedRows.map(mapRowToStaffRequest);

    if (role === "housekeeping" || role === "maintenance") {
      const afterHours = !isDepartmentWorkingHoursForConfig({
        hotelConfig: operationalConfig,
        department: role,
      });
      if (afterHours) {
        requests = requests.filter((request) => request.status === "completed");
      }
    }

    return NextResponse.json(
      {
        ok: true,
        requests,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("staff requests GET error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
