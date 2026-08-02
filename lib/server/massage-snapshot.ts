import "server-only";

import { createHash } from "node:crypto";
import {
  getMassageSnapshotSourceBundle,
  MassageApiError,
  type MassageAvailabilityResult,
  type MassageBookableDatesResult,
  type MassageBootstrapResult,
  type MassageCalendarSnapshotBooking,
  type MassageCalendarSnapshotResult,
  type MassageServicesResult,
} from "@/lib/server/massage-api";
import {
  isSandboxHotel,
  resolveHotelByAnySlugAdmin,
  type HotelScope,
} from "@/lib/server/hotel-scope";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type MassageSnapshotRefreshReason =
  | "webhook"
  | "cron"
  | "manual"
  | "booking"
  | "reconciliation";

type MassageSnapshotRow = {
  id: string;
  hotel_id: string;
  source_hotel_slug: string;
  source_revision: string;
  expected_revision: string | null;
  source_runtime_version: string | null;
  source_contract: string | null;
  range_start: string;
  range_end: string;
  days_ahead: number;
  service_count: number;
  booking_count: number;
  services_json: MassageBootstrapResult["services"];
  availability_json: MassageBootstrapResult["availabilityByService"];
  bookings_json: MassageCalendarSnapshotBooking[];
  source_request_ids: Record<string, unknown>;
  source_metrics_json: Record<string, unknown>;
  refresh_reason: MassageSnapshotRefreshReason;
  payload_sha256: string;
  refreshed_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

type MassageSyncStateRow = {
  hotel_id: string;
  current_snapshot_id: string | null;
  status: "never_synced" | "refreshing" | "ready" | "stale" | "error";
  source_revision: string | null;
  expected_revision: string | null;
  last_reason: MassageSnapshotRefreshReason | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_webhook_at: string | null;
  last_cron_at: string | null;
  stale_after: string | null;
  consecutive_failures: number;
  last_error_code: string | null;
  last_error_message: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const DEFAULT_SNAPSHOT_TTL_SECONDS = 10 * 60;
const MIN_SNAPSHOT_TTL_SECONDS = 60;
const MAX_SNAPSHOT_TTL_SECONDS = 60 * 60;
const DEFAULT_SNAPSHOT_MAX_STALE_SECONDS = 6 * 60 * 60;
const MIN_SNAPSHOT_MAX_STALE_SECONDS = 10 * 60;
const MAX_SNAPSHOT_MAX_STALE_SECONDS = 24 * 60 * 60;

export type MassageSnapshotReadAction =
  | "services"
  | "bootstrap"
  | "bookable_dates"
  | "bookable_dates_summary"
  | "availability";

function normalizeSlug(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function envSuffix(value: unknown) {
  return normalizeSlug(value).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function parseEnabledFlag(value: unknown) {
  return ["1", "true", "yes", "on"].includes(
    String(value || "").trim().toLowerCase()
  );
}

function getConfiguredSnapshotHotels() {
  return new Set(
    String(process.env.STAYHUB_MASSAGE_SNAPSHOT_HOTELS || "")
      .split(",")
      .map(normalizeSlug)
      .filter(Boolean)
  );
}

export function isMassageSnapshotEnabled(hotelSlug: unknown) {
  const slug = normalizeSlug(hotelSlug);
  if (!slug) return false;

  const hotelSpecificKey = `STAYHUB_MASSAGE_SNAPSHOT_ENABLED_${envSuffix(slug)}`;
  if (process.env[hotelSpecificKey] !== undefined) {
    return parseEnabledFlag(process.env[hotelSpecificKey]);
  }

  return getConfiguredSnapshotHotels().has(slug);
}

function getSnapshotTtlSeconds() {
  const configured = Number(process.env.STAYHUB_MASSAGE_SNAPSHOT_TTL_SECONDS);
  if (!Number.isInteger(configured)) return DEFAULT_SNAPSHOT_TTL_SECONDS;
  return Math.min(
    MAX_SNAPSHOT_TTL_SECONDS,
    Math.max(MIN_SNAPSHOT_TTL_SECONDS, configured)
  );
}

function getSnapshotMaxStaleSeconds() {
  const configured = Number(
    process.env.STAYHUB_MASSAGE_SNAPSHOT_MAX_STALE_SECONDS
  );
  if (!Number.isInteger(configured)) {
    return DEFAULT_SNAPSHOT_MAX_STALE_SECONDS;
  }
  return Math.min(
    MAX_SNAPSHOT_MAX_STALE_SECONDS,
    Math.max(MIN_SNAPSHOT_MAX_STALE_SECONDS, configured)
  );
}

function parseIsoDate(value: unknown) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error("Invalid snapshot start date.");
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new Error("Invalid snapshot start date.");
  }
  return raw;
}

function requireDaysAhead(value: unknown) {
  const daysAhead = Number(value);
  if (!Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > 60) {
    throw new Error("Snapshot daysAhead must be between 1 and 60.");
  }
  return daysAhead;
}

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function stableSnapshotPayload(input: {
  revision: string;
  rangeStart: string;
  rangeEnd: string;
  services: MassageBootstrapResult["services"];
  availability: MassageBootstrapResult["availabilityByService"];
  bookings: MassageCalendarSnapshotBooking[];
}) {
  return JSON.stringify({
    revision: input.revision,
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeEnd,
    services: input.services,
    availability: input.availability,
    bookings: input.bookings,
  });
}

function snapshotHash(payload: string) {
  return createHash("sha256").update(payload).digest("hex");
}

function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code || "").trim();
    if (code) return code.slice(0, 120);
  }
  return "MASSAGE_SNAPSHOT_REFRESH_FAILED";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 1000);
  return String(error || "Unknown massage snapshot error").slice(0, 1000);
}

async function markSnapshotRefreshStarted(input: {
  hotel: HotelScope;
  reason: MassageSnapshotRefreshReason;
  expectedRevision: string | null;
  startedAt: string;
}) {
  const payload: Record<string, unknown> = {
    hotel_id: input.hotel.id,
    status: "refreshing",
    expected_revision: input.expectedRevision,
    last_reason: input.reason,
    last_attempt_at: input.startedAt,
    last_error_code: null,
    last_error_message: null,
  };

  if (input.reason === "webhook") payload.last_webhook_at = input.startedAt;
  if (input.reason === "cron") payload.last_cron_at = input.startedAt;

  const { error } = await supabaseAdmin
    .from("massage_calendar_sync_state")
    .upsert(payload, { onConflict: "hotel_id" });

  if (error) throw error;
}

async function markSnapshotRefreshFailed(input: {
  hotel: HotelScope;
  reason: MassageSnapshotRefreshReason;
  expectedRevision: string | null;
  startedAt: string;
  error: unknown;
}) {
  const { data: current } = await supabaseAdmin
    .from("massage_calendar_sync_state")
    .select("consecutive_failures")
    .eq("hotel_id", input.hotel.id)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("massage_calendar_sync_state")
    .upsert(
      {
        hotel_id: input.hotel.id,
        status: "error",
        expected_revision: input.expectedRevision,
        last_reason: input.reason,
        last_attempt_at: input.startedAt,
        consecutive_failures: Number(current?.consecutive_failures || 0) + 1,
        last_error_code: errorCode(input.error),
        last_error_message: errorMessage(input.error),
      },
      { onConflict: "hotel_id" }
    );

  if (error) {
    console.error("Failed to persist massage snapshot refresh failure", {
      hotelId: input.hotel.id,
      error,
    });
  }
}

export async function refreshMassageCalendarSnapshot(input: {
  hotelSlug: string;
  fromDate: string;
  daysAhead: number;
  reason: MassageSnapshotRefreshReason;
  expectedRevision?: string | null;
  allowProduction?: boolean;
}) {
  const hotel = await resolveHotelByAnySlugAdmin(input.hotelSlug);
  const rangeStart = parseIsoDate(input.fromDate);
  const daysAhead = requireDaysAhead(input.daysAhead);
  const rangeEnd = addDays(rangeStart, daysAhead - 1);
  const expectedRevision = String(input.expectedRevision || "").trim() || null;
  const startedAt = new Date().toISOString();

  if (!isMassageSnapshotEnabled(hotel.slug)) {
    throw new Error(`Massage snapshot is not enabled for hotel: ${hotel.slug}`);
  }

  if (!isSandboxHotel(hotel) && input.allowProduction !== true) {
    throw new Error("Production massage snapshot refresh is disabled in this patch.");
  }

  await markSnapshotRefreshStarted({
    hotel,
    reason: input.reason,
    expectedRevision,
    startedAt,
  });

  try {
    const bundle = await getMassageSnapshotSourceBundle({
      hotelSlug: hotel.slug,
      fromDate: rangeStart,
      daysAhead,
    });
    const refreshedAt = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + getSnapshotTtlSeconds() * 1000
    ).toISOString();
    const services = bundle.bootstrap.services;
    const availability = bundle.bootstrap.availabilityByService || {};
    const bookings = bundle.calendar.bookings || [];
    const serializedPayload = stableSnapshotPayload({
      revision: bundle.source.revision,
      rangeStart,
      rangeEnd,
      services,
      availability,
      bookings,
    });
    const sourceMetrics = {
      bootstrapElapsedMs: bundle.bootstrap.elapsedMs ?? null,
      bootstrapCacheHit: bundle.bootstrap.cacheHit === true,
      bootstrapReadMode: bundle.bootstrap.readMode ?? null,
      bootstrapReadStats: bundle.bootstrap.readStats ?? null,
      calendarElapsedMs: bundle.calendar.elapsedMs ?? null,
      calendarReadMode: bundle.calendar.readMode ?? null,
      revisionMatchedExpected: expectedRevision
        ? bundle.source.revision === expectedRevision
        : null,
    };
    const snapshotPayload = {
      hotel_id: hotel.id,
      source_hotel_slug: hotel.slug,
      source_revision: bundle.source.revision,
      expected_revision: expectedRevision,
      source_runtime_version: bundle.source.runtimeVersion,
      source_contract: bundle.source.liveContract,
      range_start: rangeStart,
      range_end: rangeEnd,
      days_ahead: daysAhead,
      service_count: Number(services?.count || services?.services?.length || 0),
      booking_count: Number(bundle.calendar.count || bookings.length),
      services_json: services,
      availability_json: availability,
      bookings_json: bookings,
      source_request_ids: bundle.source.requestIds,
      source_metrics_json: sourceMetrics,
      refresh_reason: input.reason,
      payload_sha256: snapshotHash(serializedPayload),
      refreshed_at: refreshedAt,
      expires_at: expiresAt,
    };

    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .from("massage_calendar_snapshots")
      .upsert(snapshotPayload, {
        onConflict: "hotel_id,source_revision,range_start,range_end",
      })
      .select("id, source_revision, refreshed_at, expires_at")
      .single();

    if (snapshotError || !snapshot) {
      throw snapshotError || new Error("Snapshot row was not returned.");
    }

    const { error: stateError } = await supabaseAdmin
      .from("massage_calendar_sync_state")
      .upsert(
        {
          hotel_id: hotel.id,
          current_snapshot_id: snapshot.id,
          status: "ready",
          source_revision: bundle.source.revision,
          expected_revision: expectedRevision,
          last_reason: input.reason,
          last_attempt_at: startedAt,
          last_success_at: refreshedAt,
          stale_after: expiresAt,
          consecutive_failures: 0,
          last_error_code: null,
          last_error_message: null,
          metadata_json: {
            publicSlug: hotel.public_slug || null,
            sandbox: Boolean(hotel.is_sandbox),
            productionHotelId: hotel.production_hotel_id || null,
            sourceStatuses: bundle.source.statuses,
          },
        },
        { onConflict: "hotel_id" }
      );

    if (stateError) throw stateError;

    await logSystemEvent({
      hotelId: hotel.id,
      severity: "info",
      source: "massage",
      eventType: "massage_calendar_snapshot_refreshed",
      message: "Massage calendar snapshot was refreshed successfully.",
      metadata: {
        hotelSlug: hotel.slug,
        reason: input.reason,
        sourceRevision: bundle.source.revision,
        expectedRevision,
        serviceCount: snapshotPayload.service_count,
        bookingCount: snapshotPayload.booking_count,
        rangeStart,
        rangeEnd,
      },
    });

    return {
      ok: true,
      hotelId: hotel.id,
      hotelSlug: hotel.slug,
      publicSlug: hotel.public_slug || null,
      sandbox: Boolean(hotel.is_sandbox),
      snapshotId: String(snapshot.id),
      sourceRevision: bundle.source.revision,
      expectedRevision,
      revisionMatchedExpected: expectedRevision
        ? bundle.source.revision === expectedRevision
        : null,
      rangeStart,
      rangeEnd,
      daysAhead,
      serviceCount: snapshotPayload.service_count,
      bookingCount: snapshotPayload.booking_count,
      refreshedAt,
      expiresAt,
      sourceMetrics,
    };
  } catch (error) {
    await markSnapshotRefreshFailed({
      hotel,
      reason: input.reason,
      expectedRevision,
      startedAt,
      error,
    });
    await logSystemError({
      hotelId: hotel.id,
      severity: "error",
      source: "massage",
      eventType: "massage_calendar_snapshot_refresh_failed",
      message: "Massage calendar snapshot refresh failed.",
      error,
      metadata: {
        hotelSlug: hotel.slug,
        reason: input.reason,
        expectedRevision,
        rangeStart,
        rangeEnd,
      },
    });
    throw error;
  }
}

export async function getCurrentMassageCalendarSnapshot(input: {
  hotelSlug: string;
}) {
  const hotel = await resolveHotelByAnySlugAdmin(input.hotelSlug);
  const { data: state, error: stateError } = await supabaseAdmin
    .from("massage_calendar_sync_state")
    .select(
      "hotel_id, current_snapshot_id, status, source_revision, expected_revision, last_reason, last_attempt_at, last_success_at, last_webhook_at, last_cron_at, stale_after, consecutive_failures, last_error_code, last_error_message, metadata_json, created_at, updated_at"
    )
    .eq("hotel_id", hotel.id)
    .maybeSingle();

  if (stateError) throw stateError;
  if (!state?.current_snapshot_id) {
    return {
      hotel,
      state: (state || null) as MassageSyncStateRow | null,
      snapshot: null,
      fresh: false,
    };
  }

  const { data: snapshot, error: snapshotError } = await supabaseAdmin
    .from("massage_calendar_snapshots")
    .select("*")
    .eq("id", state.current_snapshot_id)
    .eq("hotel_id", hotel.id)
    .maybeSingle();

  if (snapshotError) throw snapshotError;

  const fresh = Boolean(
    snapshot?.expires_at &&
      new Date(String(snapshot.expires_at)).getTime() > Date.now() &&
      state.status === "ready"
  );

  return {
    hotel,
    state: state as MassageSyncStateRow,
    snapshot: (snapshot || null) as MassageSnapshotRow | null,
    fresh,
  };
}

function snapshotUnavailable(code: string, message: string) {
  return new MassageApiError(message, {
    statusCode: 503,
    code,
    monitoringSeverity: "warning",
    alreadyLogged: true,
  });
}

function requireSnapshotRange(input: {
  snapshot: MassageSnapshotRow;
  fromDate: string;
  daysAhead: number;
}) {
  const fromDate = parseIsoDate(input.fromDate);
  const daysAhead = requireDaysAhead(input.daysAhead);
  const rangeEnd = addDays(fromDate, daysAhead - 1);

  if (
    fromDate < input.snapshot.range_start ||
    rangeEnd > input.snapshot.range_end
  ) {
    throw snapshotUnavailable(
      "MASSAGE_SNAPSHOT_RANGE_MISS",
      "Massage availability is being refreshed. Please try again shortly."
    );
  }

  return { fromDate, daysAhead, rangeEnd };
}

function filterBookableDates(input: {
  result: MassageBookableDatesResult;
  fromDate: string;
  daysAhead: number;
  includeTimes: boolean;
}) {
  const rangeEnd = addDays(input.fromDate, input.daysAhead - 1);
  const dates = (input.result.dates || [])
    .filter((item) => item.date >= input.fromDate && item.date <= rangeEnd)
    .map((item) =>
      input.includeTimes
        ? { ...item }
        : {
            date: item.date,
            availableCount: item.availableCount,
            firstAvailableTime: item.firstAvailableTime,
            lastAvailableTime: item.lastAvailableTime,
          }
    );

  return {
    ...input.result,
    fromDate: input.fromDate,
    daysChecked: input.daysAhead,
    count: dates.length,
    dates,
    readMode: "SUPABASE_SNAPSHOT",
    elapsedMs: 0,
  };
}

async function requireUsableMassageSnapshot(hotelSlug: string) {
  const current = await getCurrentMassageCalendarSnapshot({ hotelSlug });
  const snapshot = current.snapshot;

  if (!snapshot) {
    throw snapshotUnavailable(
      "MASSAGE_SNAPSHOT_UNAVAILABLE",
      "Massage availability is being refreshed. Please try again shortly."
    );
  }

  const refreshedAtMs = new Date(snapshot.refreshed_at).getTime();
  if (!Number.isFinite(refreshedAtMs)) {
    throw snapshotUnavailable(
      "MASSAGE_SNAPSHOT_INVALID",
      "Massage availability is temporarily unavailable."
    );
  }

  const ageSeconds = Math.max(0, Math.floor((Date.now() - refreshedAtMs) / 1000));
  if (ageSeconds > getSnapshotMaxStaleSeconds()) {
    throw snapshotUnavailable(
      "MASSAGE_SNAPSHOT_TOO_OLD",
      "Massage availability is being refreshed. Please try again shortly."
    );
  }

  return {
    current,
    snapshot,
    source: {
      snapshotId: snapshot.id,
      sourceRevision: snapshot.source_revision,
      refreshedAt: snapshot.refreshed_at,
      expiresAt: snapshot.expires_at,
      fresh: current.fresh,
      stale: !current.fresh,
      ageSeconds,
      stateStatus: current.state?.status || null,
    },
  };
}

export async function readMassageSnapshotAction(input: {
  hotelSlug: string;
  action: MassageSnapshotReadAction;
  serviceId?: string;
  fromDate?: string;
  daysAhead?: number;
  date?: string;
}) {
  const { snapshot, source } = await requireUsableMassageSnapshot(
    input.hotelSlug
  );

  if (input.action === "services") {
    return {
      result: snapshot.services_json as MassageServicesResult,
      source,
    };
  }

  const serviceId = String(input.serviceId || "").trim().toLowerCase();
  const service = (snapshot.services_json?.services || []).find(
    (item) => item.serviceId === serviceId
  );

  if (input.action === "bootstrap") {
    const range = requireSnapshotRange({
      snapshot,
      fromDate: input.fromDate || "",
      daysAhead: input.daysAhead || 0,
    });
    const availabilityByService = Object.fromEntries(
      Object.entries(snapshot.availability_json || {}).map(
        ([currentServiceId, result]) => [
          currentServiceId,
          filterBookableDates({
            result,
            fromDate: range.fromDate,
            daysAhead: range.daysAhead,
            includeTimes: true,
          }),
        ]
      )
    );
    const result: MassageBootstrapResult = {
      revision: snapshot.source_revision,
      runtimeVersion: snapshot.source_runtime_version || undefined,
      liveContract: snapshot.source_contract || undefined,
      cacheHit: true,
      fromDate: range.fromDate,
      daysChecked: range.daysAhead,
      services: snapshot.services_json,
      availabilityByService,
      readMode: "SUPABASE_SNAPSHOT",
      readStats: {
        snapshotId: snapshot.id,
        snapshotFresh: source.fresh,
        snapshotAgeSeconds: source.ageSeconds,
      },
      elapsedMs: 0,
    };
    return { result, source };
  }

  if (!service) {
    throw new MassageApiError("Invalid massage service.", {
      statusCode: 400,
      code: "INVALID_SERVICE_ID",
      alreadyLogged: true,
    });
  }

  const storedDates = snapshot.availability_json?.[serviceId];
  if (!storedDates) {
    throw snapshotUnavailable(
      "MASSAGE_SNAPSHOT_SERVICE_MISSING",
      "Massage availability is being refreshed. Please try again shortly."
    );
  }

  if (
    input.action === "bookable_dates" ||
    input.action === "bookable_dates_summary"
  ) {
    const range = requireSnapshotRange({
      snapshot,
      fromDate: input.fromDate || "",
      daysAhead: input.daysAhead || 0,
    });
    return {
      result: filterBookableDates({
        result: storedDates,
        fromDate: range.fromDate,
        daysAhead: range.daysAhead,
        includeTimes: input.action === "bookable_dates",
      }),
      source,
    };
  }

  const date = parseIsoDate(input.date || "");
  requireSnapshotRange({ snapshot, fromDate: date, daysAhead: 1 });
  const dateEntry = (storedDates.dates || []).find(
    (item) => item.date === date
  );
  const result: MassageAvailabilityResult = {
    serviceId,
    serviceNameBg: service.nameBg,
    date,
    durationMinutes: service.durationMinutes,
    bufferMinutes: service.bufferMinutes,
    availableTimes: Array.isArray(dateEntry?.availableTimes)
      ? dateEntry.availableTimes
      : [],
  };
  return { result, source };
}

export async function getMassageSnapshotBookings(input: {
  hotelSlug: string;
  fromDate: string;
  daysAhead: number;
}) {
  const { snapshot, source } = await requireUsableMassageSnapshot(
    input.hotelSlug
  );
  const range = requireSnapshotRange({
    snapshot,
    fromDate: input.fromDate,
    daysAhead: input.daysAhead,
  });
  const bookings = (snapshot.bookings_json || []).filter(
    (booking) =>
      booking.date >= range.fromDate && booking.date <= range.rangeEnd
  );
  const result: MassageCalendarSnapshotResult = {
    fromDate: range.fromDate,
    daysChecked: range.daysAhead,
    count: bookings.length,
    bookings,
    readMode: "SUPABASE_SNAPSHOT",
    elapsedMs: 0,
  };
  return { result, source };
}
