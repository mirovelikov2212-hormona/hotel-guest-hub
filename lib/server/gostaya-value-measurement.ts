import "server-only";

import {
  buildGostayaValueMeasurement,
} from "@/lib/value/gostaya-value-measurement.mjs";
import {
  getHotelActualGoLiveAt,
  getHotelGostayaValueBaseline,
} from "@/lib/server/gostaya-value-baseline";
import {
  requireHotelProductModuleAccess,
} from "@/lib/server/product-module-entitlements";
import {
  getAncillaryRevenueManagerSnapshot,
} from "@/lib/server/revenue-intelligence";
import {
  hotelMatchesRequestedSlug,
} from "@/lib/server/hotel-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";

const MAX_VALUE_REQUESTS = 10_000;
const MAX_VALUE_EVENTS = 20_000;
const VALUE_EVENT_NAMES = [
  "ai_question_sent",
  "ai_answer_shown",
  "ai_error",
  "request_returned",
  "request_completed",
] as const;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function resolveDays(value: unknown) {
  const days = Number(value);
  return [7, 30, 90, 365].includes(days) ? days : 30;
}

async function resolveManagerValueScope(hotelSlugInput: unknown) {
  const hotelSlug = text(hotelSlugInput).toLowerCase();
  if (!hotelSlug) throw new Error("VALUE_HOTEL_SLUG_REQUIRED");

  const session = await getCurrentStaffSession(hotelSlug, "manager");
  if (!session || session.role !== "manager") {
    throw new Error("VALUE_MANAGER_SESSION_REQUIRED");
  }

  const { data: hotel, error } = await supabaseAdmin
    .from("hotels")
    .select("id,slug,public_slug,name,active,is_sandbox,timezone")
    .eq("id", session.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`VALUE_HOTEL_LOOKUP_FAILED:${error.message}`);
  }
  if (!hotel || !hotelMatchesRequestedSlug(hotel, hotelSlug)) {
    throw new Error("VALUE_HOTEL_SCOPE_MISMATCH");
  }

  await requireHotelProductModuleAccess(
    String(hotel.id),
    "manager_intelligence",
  );
  await requireHotelProductModuleAccess(
    String(hotel.id),
    "revenue_intelligence",
  );

  return {
    id: String(hotel.id),
    slug: String(hotel.slug),
    publicSlug: String(hotel.public_slug || hotel.slug),
    name: String(hotel.name || hotel.slug),
    timezone: String(hotel.timezone || "UTC"),
    isSandbox: Boolean(hotel.is_sandbox),
  };
}

export async function getGostayaValueManagerSnapshot(input: {
  hotelSlug: unknown;
  days?: unknown;
  now?: Date;
}) {
  const hotel = await resolveManagerValueScope(input.hotelSlug);
  const [baseline, goLiveAt] = await Promise.all([
    getHotelGostayaValueBaseline(hotel.id),
    getHotelActualGoLiveAt(hotel.id),
  ]);

  if (!baseline) {
    return {
      status: "baseline_missing" as const,
      hotel,
      goLiveAt,
      baseline: null,
      period: null,
      measurement: null,
    };
  }

  if (!goLiveAt) {
    return {
      status: "not_live" as const,
      hotel,
      goLiveAt: null,
      baseline,
      period: null,
      measurement: null,
    };
  }

  const days = resolveDays(input.days);
  const now = input.now || new Date();
  const toMs = now.getTime();
  if (!Number.isFinite(toMs) || toMs <= Date.parse(goLiveAt)) {
    throw new Error("VALUE_REPORTING_TIME_INVALID");
  }

  const requestedFromMs = toMs - days * 86_400_000;
  const fromMs = Math.max(requestedFromMs, Date.parse(goLiveAt));
  const period = {
    requestedDays: days,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    clippedToGoLive: fromMs !== requestedFromMs,
  };

  const [requestsResult, eventsResult, revenue] = await Promise.all([
    supabaseAdmin
      .from("guest_requests")
      .select(
        "id,request_type,source,channel,created_at,resolved_at,is_test,metadata_json",
      )
      .eq("hotel_id", hotel.id)
      .gte("created_at", period.from)
      .lt("created_at", period.to)
      .or("is_test.is.null,is_test.eq.false")
      .order("created_at", { ascending: true })
      .limit(MAX_VALUE_REQUESTS),
    supabaseAdmin
      .from("hub_events")
      .select(
        "id,request_id,user_session_id,event_name,created_at,extra,is_test",
      )
      .eq("hotel_id", hotel.id)
      .in("event_name", [...VALUE_EVENT_NAMES])
      .gte("created_at", period.from)
      .lt("created_at", period.to)
      .or("is_test.is.null,is_test.eq.false")
      .order("created_at", { ascending: true })
      .limit(MAX_VALUE_EVENTS),
    getAncillaryRevenueManagerSnapshot({
      hotelSlug: hotel.slug,
      periodOverride: {
        from: period.from,
        to: period.to,
      },
      now,
    }),
  ]);

  if (requestsResult.error) {
    throw new Error(
      `VALUE_REQUESTS_READ_FAILED:${requestsResult.error.message}`,
    );
  }
  if (eventsResult.error) {
    throw new Error(
      `VALUE_EVENTS_READ_FAILED:${eventsResult.error.message}`,
    );
  }
  if ((requestsResult.data || []).length >= MAX_VALUE_REQUESTS) {
    throw new Error("VALUE_REQUEST_CAP_EXCEEDED");
  }
  if ((eventsResult.data || []).length >= MAX_VALUE_EVENTS) {
    throw new Error("VALUE_EVENT_CAP_EXCEEDED");
  }

  const measurement = buildGostayaValueMeasurement({
    baseline,
    goLiveAt,
    period,
    requests: requestsResult.data || [],
    events: eventsResult.data || [],
    revenueSnapshot: revenue.snapshot,
  });

  return {
    status: "ready" as const,
    hotel,
    goLiveAt,
    baseline,
    period,
    measurement,
    dataQuality: {
      requestRows: (requestsResult.data || []).length,
      eventRows: (eventsResult.data || []).length,
      revenueLedgerNativeEvents:
        revenue.snapshot.revenueLedger.nativeEvents,
      revenueLedgerReconstructedEvents:
        revenue.snapshot.revenueLedger.reconstructedEvents,
      revenueDeltaMismatches:
        revenue.snapshot.revenueLedger.deltaMismatches,
    },
  };
}
