import { NextRequest, NextResponse } from "next/server";
import {
  getMassageCalendarSnapshot,
  MassageApiError,
  type MassageCalendarSnapshotBooking,
} from "@/lib/server/massage-api";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const DEFAULT_HOTEL_SLUG = "aquamarin";
const DEFAULT_DAYS_AHEAD = 21;
const MAX_DAYS_AHEAD = 60;
const MAX_ROWS_PER_RUN = 300;

type GuestRequestRow = {
  id: string;
  hotel_id: string;
  room_number_snapshot: string | null;
  request_type: string;
  title: string | null;
  message: string | null;
  status: string | null;
  created_at: string;
  is_test: boolean | null;
  metadata_json: Record<string, unknown> | null;
};

type MassageBookingMetadata = {
  serviceId?: unknown;
  serviceName?: unknown;
  serviceNameBg?: unknown;
  sheetValue?: unknown;
  date?: unknown;
  startTime?: unknown;
  durationMinutes?: unknown;
  price?: unknown;
  currency?: unknown;
  roomNumber?: unknown;
  stayhubHotelCode?: unknown;
  stayhubRoomMarker?: unknown;
};

type MatchResult = {
  booking: MassageCalendarSnapshotBooking;
  quality: "exact_room_date_time" | "unique_room_date";
};

function isAuthorizedCronRequest(req: NextRequest) {
  const configuredSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = req.headers.get("authorization") || "";

  if (configuredSecret) {
    return authorization === `Bearer ${configuredSecret}`;
  }

  return req.headers.get("x-vercel-cron") === "1";
}

function getSofiaDateIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function normalizeDateIso(value: unknown) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return raw;
}

function normalizeTime(value: unknown) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

function normalizeRoom(value: unknown) {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";

  // Google Sheet room/source cells may contain operational markers such as:
  // "207 AM SH", "207 AM", "214 CK" or occasionally "CK 101".
  // For matching StayHub bookings we need the actual room number, not the
  // full room/source marker.
  const roomThenSource = raw.match(/^([A-Za-z0-9][A-Za-z0-9._-]{0,19})\s+(AM|SC|CK)(?:\s+SH)?$/i);
  if (roomThenSource) return roomThenSource[1];

  const sourceThenRoom = raw.match(/^(AM|SC|CK)\s+([A-Za-z0-9][A-Za-z0-9._-]{0,19})$/i);
  if (sourceThenRoom) return sourceThenRoom[2];

  return raw.replace(/\s+/g, "");
}

function normalizeServiceId(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeAmount(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return String(numeric);
  return String(value).trim();
}

function formatDateBg(dateIso: string) {
  const [year, month, day] = dateIso.split("-");
  if (!year || !month || !day) return dateIso;
  return `${day}.${month}.${year}`;
}

function buildCurrentMassageBookingKey(input: {
  hotelSlug: string;
  serviceId: string;
  date: string;
  startTime: string;
  roomNumber: string;
}) {
  return [
    input.hotelSlug,
    normalizeServiceId(input.serviceId),
    input.date,
    normalizeTime(input.startTime),
    normalizeRoom(input.roomNumber),
  ].join("|");
}

function getBookingMetadata(row: GuestRequestRow): MassageBookingMetadata | null {
  const metadata = row.metadata_json ?? {};
  const booking = metadata.massageBooking;
  if (!booking || typeof booking !== "object" || Array.isArray(booking)) return null;
  return booking as MassageBookingMetadata;
}

function buildSnapshotIndexes(bookings: MassageCalendarSnapshotBooking[]) {
  const byRoomDateTime = new Map<string, MassageCalendarSnapshotBooking[]>();
  const byRoomDate = new Map<string, MassageCalendarSnapshotBooking[]>();

  for (const booking of bookings) {
    const room = normalizeRoom(booking.roomNumber);
    const date = normalizeDateIso(booking.date);
    const time = normalizeTime(booking.startTime);
    if (!room || !date) continue;

    const roomDateKey = `${room}|${date}`;
    byRoomDate.set(roomDateKey, [...(byRoomDate.get(roomDateKey) || []), booking]);

    if (time) {
      const roomDateTimeKey = `${room}|${date}|${time}`;
      byRoomDateTime.set(roomDateTimeKey, [...(byRoomDateTime.get(roomDateTimeKey) || []), booking]);
    }
  }

  return { byRoomDateTime, byRoomDate };
}

function findSheetMatch(input: {
  row: GuestRequestRow;
  booking: MassageBookingMetadata;
  byRoomDateTime: Map<string, MassageCalendarSnapshotBooking[]>;
  byRoomDate: Map<string, MassageCalendarSnapshotBooking[]>;
}): MatchResult | null {
  const room = normalizeRoom(input.booking.roomNumber || input.row.room_number_snapshot);
  const date = normalizeDateIso(input.booking.date);
  const time = normalizeTime(input.booking.startTime);
  if (!room || !date) return null;

  if (time) {
    const exactMatches = input.byRoomDateTime.get(`${room}|${date}|${time}`) || [];
    if (exactMatches.length === 1) {
      return { booking: exactMatches[0], quality: "exact_room_date_time" };
    }
  }

  const roomDateMatches = input.byRoomDate.get(`${room}|${date}`) || [];
  if (roomDateMatches.length === 1) {
    return { booking: roomDateMatches[0], quality: "unique_room_date" };
  }

  return null;
}

function buildStaffNote(input: {
  currentServiceName: string;
  currentDate: string;
  currentTime: string;
  currentDuration: number | null;
  currentPrice: string;
  currentCurrency: string;
  originalServiceName: string;
  originalPrice: string;
  changed: boolean;
  marker: string;
  stayHubMarkerMissing: boolean;
}) {
  const durationLine = input.currentDuration && input.currentDuration > 0
    ? `Продължителност: ${input.currentDuration} мин.`
    : "";
  const priceLine = input.currentPrice ? `Цена: ${input.currentPrice} ${input.currentCurrency}` : "";

  if (!input.changed) {
    return [
      `Избрана услуга: ${input.currentServiceName}`,
      `Дата: ${formatDateBg(input.currentDate)}`,
      `Час: ${input.currentTime}`,
      durationLine,
      priceLine,
      "Източник: StayHub",
      "График: Google Sheet е актуализиран.",
    ].filter(Boolean).join("\n");
  }

  return [
    `Избрана услуга: ${input.currentServiceName}`,
    "Резервацията е променена ръчно в Google Sheet.",
    `Оригинална заявка: ${input.originalServiceName}${input.originalPrice ? ` · ${input.originalPrice} ${input.currentCurrency}` : ""}.`,
    `Текуща резервация: ${input.currentServiceName} · ${formatDateBg(input.currentDate)} · ${input.currentTime}${input.currentPrice ? ` · ${input.currentPrice} ${input.currentCurrency}` : ""}.`,
    input.stayHubMarkerMissing
      ? `Внимание: записът в Sheet е с маркер "${input.marker}". За StayHub резервация трябва да бъде AM SH.`
      : "",
    "Рецепцията трябва да начисли текущата услуга към сметката на стаята.",
  ].filter(Boolean).join("\n");
}

function buildStaffTitleBg(serviceName: string) {
  const name = normalizeText(serviceName) || "Масаж";
  return `Масаж / ${name}`;
}

function buildStaffTitleEn(serviceName: string) {
  const name = normalizeText(serviceName) || "massage";
  return `Massage / ${name}`;
}

function buildStaffTitleDe(serviceName: string) {
  const name = normalizeText(serviceName) || "Massage";
  return `Massage / ${name}`;
}

function buildEnglishNote(input: {
  currentServiceName: string;
  currentDate: string;
  currentTime: string;
  currentPrice: string;
  currentCurrency: string;
  originalServiceName: string;
  originalPrice: string;
  changed: boolean;
}) {
  if (!input.changed) {
    return `Selected service: ${input.currentServiceName}. Date: ${input.currentDate}. Time: ${input.currentTime}. Price: ${input.currentPrice} ${input.currentCurrency}.`;
  }
  return `Selected service: ${input.currentServiceName}. The booking was manually changed in Google Sheet. Original request: ${input.originalServiceName}${input.originalPrice ? ` · ${input.originalPrice} ${input.currentCurrency}` : ""}. Current booking: ${input.currentServiceName} · ${input.currentDate} · ${input.currentTime}${input.currentPrice ? ` · ${input.currentPrice} ${input.currentCurrency}` : ""}. Reception must charge the current service to the room account.`;
}

function buildGermanNote(input: {
  currentServiceName: string;
  currentDate: string;
  currentTime: string;
  currentPrice: string;
  currentCurrency: string;
  originalServiceName: string;
  originalPrice: string;
  changed: boolean;
}) {
  if (!input.changed) {
    return `Ausgewählte Dienstleistung: ${input.currentServiceName}. Datum: ${input.currentDate}. Uhrzeit: ${input.currentTime}. Preis: ${input.currentPrice} ${input.currentCurrency}.`;
  }
  return `Ausgewählte Dienstleistung: ${input.currentServiceName}. Die Buchung wurde manuell in Google Sheet geändert. Ursprüngliche Anfrage: ${input.originalServiceName}${input.originalPrice ? ` · ${input.originalPrice} ${input.currentCurrency}` : ""}. Aktuelle Buchung: ${input.currentServiceName} · ${input.currentDate} · ${input.currentTime}${input.currentPrice ? ` · ${input.currentPrice} ${input.currentCurrency}` : ""}. Die Rezeption muss die aktuelle Leistung auf das Zimmerkonto buchen.`;
}

function hasBookingChanged(input: {
  booking: MassageBookingMetadata;
  sheet: MassageCalendarSnapshotBooking;
}) {
  const currentServiceId = normalizeServiceId(input.booking.serviceId);
  const sheetServiceId = normalizeServiceId(input.sheet.serviceId);
  const currentServiceName = normalizeText(input.booking.serviceName || input.booking.serviceNameBg || input.booking.sheetValue);
  const sheetServiceName = normalizeText(input.sheet.serviceNameBg || input.sheet.sheetValue);
  const currentTime = normalizeTime(input.booking.startTime);
  const sheetTime = normalizeTime(input.sheet.startTime);
  const currentDate = normalizeDateIso(input.booking.date);
  const sheetDate = normalizeDateIso(input.sheet.date);
  const currentPrice = normalizeAmount(input.booking.price);
  const sheetPrice = normalizeAmount(input.sheet.price);
  const currentMarker = normalizeText(input.booking.stayhubRoomMarker);
  const sheetMarker = normalizeText(input.sheet.roomMarker);

  return (
    Boolean(sheetServiceId && currentServiceId && sheetServiceId !== currentServiceId) ||
    Boolean(sheetServiceName && currentServiceName && sheetServiceName !== currentServiceName) ||
    Boolean(sheetTime && currentTime && sheetTime !== currentTime) ||
    Boolean(sheetDate && currentDate && sheetDate !== currentDate) ||
    Boolean(sheetPrice && currentPrice && sheetPrice !== currentPrice) ||
    Boolean(sheetMarker && currentMarker && sheetMarker !== currentMarker)
  );
}

async function syncRequestFromSheet(input: {
  row: GuestRequestRow;
  sheet: MassageCalendarSnapshotBooking;
  matchQuality: MatchResult["quality"];
  hotelSlug: string;
  dryRun: boolean;
}) {
  const metadata = input.row.metadata_json ?? {};
  const booking = getBookingMetadata(input.row);
  if (!booking) return { action: "skipped_no_booking" as const };

  const changed = hasBookingChanged({ booking, sheet: input.sheet });
  const sheetMarker = normalizeText(input.sheet.roomMarker);
  const stayHubMarkerMissing = !input.sheet.isStayHubMarker;

  if (!changed && !stayHubMarkerMissing) {
    return { action: "unchanged" as const };
  }

  const now = new Date().toISOString();
  const originalBooking =
    metadata.originalMassageBooking && typeof metadata.originalMassageBooking === "object"
      ? metadata.originalMassageBooking
      : booking;

  const currentServiceName = normalizeText(input.sheet.serviceNameBg || input.sheet.sheetValue || booking.serviceName || booking.serviceNameBg || "Масаж");
  const currentTitleBg = buildStaffTitleBg(currentServiceName);
  const currentTitleEn = buildStaffTitleEn(currentServiceName);
  const currentTitleDe = buildStaffTitleDe(currentServiceName);
  const originalServiceName = normalizeText(
    (originalBooking as Record<string, unknown>)?.serviceName ||
      (originalBooking as Record<string, unknown>)?.serviceNameBg ||
      (originalBooking as Record<string, unknown>)?.sheetValue ||
      booking.serviceName ||
      booking.serviceNameBg ||
      "Масаж"
  );
  const currentDate = normalizeDateIso(input.sheet.date) || normalizeDateIso(booking.date);
  const currentTime = normalizeTime(input.sheet.startTime) || normalizeTime(booking.startTime);
  const currentDuration = Number.isFinite(Number(input.sheet.durationMinutes))
    ? Number(input.sheet.durationMinutes)
    : Number.isFinite(Number(booking.durationMinutes))
      ? Number(booking.durationMinutes)
      : null;
  const currentPrice = normalizeAmount(input.sheet.price ?? booking.price);
  const originalPrice = normalizeAmount((originalBooking as Record<string, unknown>)?.price || booking.price);
  const currentCurrency = normalizeText(input.sheet.currency || booking.currency || metadata.currency || "EUR") || "EUR";
  const currentServiceId = normalizeServiceId(input.sheet.serviceId || booking.serviceId || "massage");
  const currentRoomNumber =
    normalizeRoom(booking.roomNumber || input.row.room_number_snapshot || input.sheet.roomNumber) ||
    normalizeRoom(input.sheet.roomNumber);

  const currentBookingKey = buildCurrentMassageBookingKey({
    hotelSlug: input.hotelSlug,
    serviceId: currentServiceId,
    date: currentDate,
    startTime: currentTime,
    roomNumber: currentRoomNumber,
  });

  const staffNoteBg = buildStaffNote({
    currentServiceName,
    currentDate,
    currentTime,
    currentDuration,
    currentPrice,
    currentCurrency,
    originalServiceName,
    originalPrice,
    changed: true,
    marker: sheetMarker,
    stayHubMarkerMissing,
  });
  const staffNoteEn = buildEnglishNote({
    currentServiceName,
    currentDate,
    currentTime,
    currentPrice,
    currentCurrency,
    originalServiceName,
    originalPrice,
    changed: true,
  });
  const staffNoteDe = buildGermanNote({
    currentServiceName,
    currentDate,
    currentTime,
    currentPrice,
    currentCurrency,
    originalServiceName,
    originalPrice,
    changed: true,
  });

  const previousBillingStatus = typeof metadata.billingStatus === "string" ? metadata.billingStatus : "pending";
  const nextMassageBooking = {
    ...(booking as Record<string, unknown>),
    serviceId: currentServiceId,
    serviceName: currentServiceName,
    serviceNameBg: currentServiceName,
    sheetValue: input.sheet.sheetValue || currentServiceName,
    date: currentDate,
    startTime: currentTime,
    durationMinutes: currentDuration,
    price: currentPrice || null,
    currency: currentCurrency,
    roomNumber: currentRoomNumber,
    stayhubHotelCode: input.sheet.hotelCode || booking.stayhubHotelCode || null,
    stayhubRoomMarker: sheetMarker || booking.stayhubRoomMarker || null,
    currentSheetServiceName: input.sheet.sheetValue || currentServiceName,
    currentSheetRoomMarker: sheetMarker || null,
    manualSheetChanged: true,
    sheetSyncUpdatedAt: now,
  };

  const nextMetadata = {
    ...metadata,
    requiresBilling: true,
    price: currentPrice || null,
    currency: currentCurrency,
    billingStatus: previousBillingStatus,
    originalMassageBooking: originalBooking,
    originalMassageBookingKey: metadata.originalMassageBookingKey || metadata.massageBookingKey || null,
    currentMassageBookingKey: currentBookingKey,
    manualSheetChanged: true,
    manualSheetChangedAt: metadata.manualSheetChangedAt || now,
    manualSheetChangeSource: "google_sheet",
    manualSheetChangeDetectedBy: "massage-sheet-sync",
    manualSheetChangeNote: stayHubMarkerMissing
      ? `Google Sheet booking differs from StayHub and marker is ${sheetMarker}; expected AM SH marker for a StayHub booking.`
      : "Google Sheet booking differs from the original StayHub booking.",
    sheetSyncLastCheckedAt: now,
    sheetSyncLastMatchedAt: now,
    sheetSyncMatchQuality: input.matchQuality,
    sheetSyncSource: "google_sheet_snapshot",
    sheetSyncStayHubMarkerMissing: stayHubMarkerMissing,
    currentSheetServiceName: input.sheet.sheetValue || currentServiceName,
    currentSheetRoomMarker: sheetMarker || null,
    currentSheetName: input.sheet.sheetName || null,
    currentSheetRowNumber: input.sheet.rowNumber || null,
    note: staffNoteBg,
    staffTitleBg: currentTitleBg,
    staffTitleEn: currentTitleEn,
    staffTitleDe: currentTitleDe,
    staffNoteBg,
    staffNoteEn,
    staffNoteDe,
    massageBooking: nextMassageBooking,
    changedAfterBilling: previousBillingStatus !== "pending",
  };

  if (input.dryRun) {
    return {
      action: "would_update" as const,
      requestId: input.row.id,
      room: input.row.room_number_snapshot,
      from: booking,
      to: nextMassageBooking,
      stayHubMarkerMissing,
      matchQuality: input.matchQuality,
    };
  }

  const { error } = await supabaseAdmin
    .from("guest_requests")
    .update({
      title_bg: currentTitleBg,
      title_en: currentTitleEn,
      title_de: currentTitleDe,
      message: staffNoteBg,
      message_bg: staffNoteBg,
      message_en: staffNoteEn,
      message_de: staffNoteDe,
      metadata_json: nextMetadata,
      updated_at: now,
    })
    .eq("id", input.row.id)
    .eq("hotel_id", input.row.hotel_id);

  if (error) throw error;

  await logSystemEvent({
    hotelId: input.row.hotel_id,
    severity: "warning",
    source: "massage",
    eventType: stayHubMarkerMissing
      ? "massage_sheet_manual_change_synced_marker_missing"
      : "massage_sheet_manual_change_synced",
    message: "A manually changed massage booking in Google Sheet was synchronized back to StayHub.",
    roomNumber: input.row.room_number_snapshot || undefined,
    requestId: input.row.id,
    metadata: {
      requestId: input.row.id,
      matchQuality: input.matchQuality,
      originalServiceName,
      currentServiceName,
      currentDate,
      currentTime,
      currentPrice,
      currentCurrency,
      sheetMarker,
      stayHubMarkerMissing,
    },
  });

  return {
    action: "updated" as const,
    requestId: input.row.id,
    room: input.row.room_number_snapshot,
    currentServiceName,
    currentDate,
    currentTime,
    currentPrice,
    currentCurrency,
    stayHubMarkerMissing,
    matchQuality: input.matchQuality,
  };
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const startedAt = Date.now();
  const results = {
    checked: 0,
    matched: 0,
    unchanged: 0,
    updated: 0,
    wouldUpdate: 0,
    skippedNoBooking: 0,
    skippedNoMatch: 0,
    skippedTest: 0,
    errors: 0,
  };
  const details: unknown[] = [];

  try {
    const { searchParams } = req.nextUrl;
    const hotelSlug = String(searchParams.get("hotelSlug") || DEFAULT_HOTEL_SLUG).trim().toLowerCase();
    const fromDate = normalizeDateIso(searchParams.get("fromDate")) || getSofiaDateIso();
    const daysAheadRaw = Number(searchParams.get("daysAhead") || DEFAULT_DAYS_AHEAD);
    const daysAhead = Number.isInteger(daysAheadRaw) && daysAheadRaw >= 1 && daysAheadRaw <= MAX_DAYS_AHEAD
      ? daysAheadRaw
      : DEFAULT_DAYS_AHEAD;
    const dryRun = ["1", "true", "yes"].includes(String(searchParams.get("dryRun") || "").trim().toLowerCase());

    const hotel = await resolveHotelByAnySlugAdmin(hotelSlug);

    if (hotel.is_sandbox) {
      return NextResponse.json(
        { ok: true, hotelSlug: hotel.slug, sandbox: true, skipped: true, reason: "Sandbox hotel has no live Google Sheet sync." },
        { headers: NO_STORE_HEADERS },
      );
    }

    const snapshot = await getMassageCalendarSnapshot({ hotelSlug: hotel.slug, fromDate, daysAhead });
    const indexes = buildSnapshotIndexes(snapshot.bookings || []);

    const { data, error } = await supabaseAdmin
      .from("guest_requests")
      .select("id, hotel_id, room_number_snapshot, request_type, title, message, status, created_at, is_test, metadata_json")
      .eq("hotel_id", hotel.id)
      .eq("request_type", "massage_booking")
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS_PER_RUN);

    if (error) throw error;

    for (const row of ((data || []) as GuestRequestRow[])) {
      results.checked += 1;

      if (row.is_test || row.metadata_json?.isTest) {
        results.skippedTest += 1;
        continue;
      }

      const booking = getBookingMetadata(row);
      if (!booking) {
        results.skippedNoBooking += 1;
        continue;
      }

      const match = findSheetMatch({
        row,
        booking,
        byRoomDateTime: indexes.byRoomDateTime,
        byRoomDate: indexes.byRoomDate,
      });

      if (!match) {
        results.skippedNoMatch += 1;
        continue;
      }

      results.matched += 1;

      try {
        const syncResult = await syncRequestFromSheet({
          row,
          sheet: match.booking,
          matchQuality: match.quality,
          hotelSlug: hotel.slug,
          dryRun,
        });

        if (syncResult.action === "updated") results.updated += 1;
        else if (syncResult.action === "would_update") results.wouldUpdate += 1;
        else if (syncResult.action === "unchanged") results.unchanged += 1;
        else if (syncResult.action === "skipped_no_booking") results.skippedNoBooking += 1;

        if (syncResult.action !== "unchanged") details.push(syncResult);
      } catch (error) {
        results.errors += 1;
        details.push({ requestId: row.id, action: "error", error: error instanceof Error ? error.message : String(error) });
        await logSystemError({
          hotelId: hotel.id,
          severity: "critical",
          source: "massage",
          eventType: "massage_sheet_sync_request_failed",
          message: "Massage Sheet sync failed for one guest request.",
          error,
          requestId: row.id,
          roomNumber: row.room_number_snapshot || undefined,
          metadata: { hotelSlug: hotel.slug, requestId: row.id },
        });
      }
    }

    return NextResponse.json(
      {
        ok: results.errors === 0,
        hotelSlug: hotel.slug,
        publicSlug: hotel.public_slug || null,
        fromDate,
        daysAhead,
        dryRun,
        snapshotCount: snapshot.count,
        elapsedMs: Date.now() - startedAt,
        results,
        details: details.slice(0, 50),
      },
      { status: results.errors === 0 ? 200 : 207, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const massageError = error instanceof MassageApiError ? error : null;
    const severity = massageError?.monitoringSeverity || "critical";

    if (!massageError?.alreadyLogged || severity === "critical") {
      await logSystemError({
        severity,
        source: "cron",
        eventType: "massage_sheet_sync_failed",
        message: severity === "critical"
          ? "Massage Sheet manual-change sync failed before completing its run."
          : "Massage Sheet manual-change sync skipped because the massage calendar was temporarily unavailable.",
        error,
        metadata: {
          results,
          upstreamCode: massageError?.code || null,
          upstreamAlreadyLogged: massageError?.alreadyLogged === true,
        },
      });
    }

    return NextResponse.json(
      { ok: false, error: "Massage Sheet sync failed", results },
      { status: severity === "critical" ? 500 : 503, headers: NO_STORE_HEADERS },
    );
  }
}
