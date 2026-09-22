import { NextRequest, NextResponse } from "next/server";

import { getHotelConfig } from "@/lib/config";
import {
  DEPARTMENT_COVERAGE_FALLBACK_EVENT,
  DEPARTMENT_COVERAGE_RESUMED_EVENT,
  decideRequestCoverageTransition,
} from "@/lib/server/department-coverage-transition.mjs";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import {
  sendManagerPushNotification,
  sendStaffPushNotification,
} from "@/lib/staff-push/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const OPEN_REQUEST_STATUSES = [
  "new",
  "acknowledged",
  "assigned",
  "in_progress",
  "waiting",
  "returned",
] as const;

type OpenRequestRow = {
  id: string;
  hotel_id: string;
  room_number_snapshot: string | null;
  request_type: string;
  title: string;
  title_bg: string | null;
  created_at: string;
  status: string;
  metadata_json: Record<string, unknown> | null;
};

type HotelRow = {
  id: string;
  slug: string;
  name: string | null;
};

type TransitionEventRow = {
  request_id: string | null;
  event_type: string;
  created_at: string;
  metadata_json: Record<string, unknown> | null;
};

type LastTransitionState = {
  eventType: string;
  effectiveDepartment: string | null;
};

function isAuthorizedCronRequest(req: NextRequest) {
  const configuredSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = req.headers.get("authorization") || "";

  if (configuredSecret) {
    return authorization === `Bearer ${configuredSecret}`;
  }

  return req.headers.get("x-vercel-cron") === "1";
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function groupRequestsByHotel(rows: OpenRequestRow[]) {
  const result = new Map<string, OpenRequestRow[]>();
  for (const row of rows) {
    const list = result.get(row.hotel_id) || [];
    list.push(row);
    result.set(row.hotel_id, list);
  }
  return result;
}

async function loadLastTransitionEvents(
  hotelId: string,
  requestIds: string[],
) {
  const latestByRequest = new Map<string, LastTransitionState>();
  if (!requestIds.length) return latestByRequest;

  const { data, error } = await supabaseAdmin
    .from("system_events")
    .select("request_id,event_type,created_at,metadata_json")
    .eq("hotel_id", hotelId)
    .in("request_id", requestIds)
    .in("event_type", [
      DEPARTMENT_COVERAGE_FALLBACK_EVENT,
      DEPARTMENT_COVERAGE_RESUMED_EVENT,
    ])
    .order("created_at", { ascending: false });

  if (error) throw error;

  for (const row of (data || []) as TransitionEventRow[]) {
    const requestId = clean(row.request_id);
    if (requestId && !latestByRequest.has(requestId)) {
      latestByRequest.set(requestId, {
        eventType: clean(row.event_type),
        effectiveDepartment: clean(row.metadata_json?.effectiveDepartment) || null,
      });
    }
  }

  return latestByRequest;
}

async function alertManagerAboutProcessorFailure(input: {
  hotel: HotelRow;
  error: unknown;
}) {
  const alertId = `routing-system-${Date.now()}`;

  await Promise.allSettled([
    logSystemError({
      hotelId: input.hotel.id,
      severity: "critical",
      source: "cron",
      eventType: "department_coverage_transition_processor_failed",
      message: "Automatic department coverage transition processing failed for this hotel.",
      error: input.error,
      metadata: {
        hotelSlug: input.hotel.slug,
        protection: "Requests remain visible to Reception and Manager; primary department identity is unchanged.",
      },
    }),
    sendManagerPushNotification({
      hotelId: input.hotel.id,
      hotelSlug: input.hotel.slug,
      requestId: alertId,
      room: "SYSTEM",
      requestTitle: "Проблем с автоматичното пренасочване на заявки",
      notificationTitle: "GOSTAYA — системен проблем",
      notificationUrl: `/staff/${input.hotel.slug}/manager`,
    }),
  ]);
}

async function recordTransition(input: {
  hotel: HotelRow;
  request: OpenRequestRow;
  eventType: string;
  primaryDepartment: string;
  effectiveDepartment: string;
  reason: string;
  pushResult?: Record<string, unknown> | null;
}) {
  await logSystemEvent({
    hotelId: input.hotel.id,
    severity: "info",
    source: "cron",
    eventType: input.eventType,
    message:
      input.eventType === DEPARTMENT_COVERAGE_FALLBACK_EVENT
        ? "An unresolved request moved to its configured after-hours operational coverage."
        : "Primary department coverage resumed for an unresolved request.",
    roomNumber: input.request.room_number_snapshot,
    departmentId: input.primaryDepartment,
    requestId: input.request.id,
    metadata: {
      hotelSlug: input.hotel.slug,
      requestType: input.request.request_type,
      primaryDepartment: input.primaryDepartment,
      effectiveDepartment: input.effectiveDepartment,
      reason: input.reason,
      pushResult: input.pushResult || null,
    },
  });
}

async function processHotelTransitions(input: {
  hotel: HotelRow;
  requests: OpenRequestRow[];
  now: Date;
}) {
  const config = await getHotelConfig(input.hotel.slug);
  if (!config) throw new Error("DEPARTMENT_COVERAGE_CONFIG_UNAVAILABLE");

  const lastEvents = await loadLastTransitionEvents(
    input.hotel.id,
    input.requests.map((request) => request.id),
  );

  const result = {
    checked: input.requests.length,
    fallbackStarted: 0,
    fallbackBaselineRecorded: 0,
    primaryResumed: 0,
    unchanged: 0,
    skipped: 0,
  };

  for (const request of input.requests) {
    const lastTransition = lastEvents.get(request.id) || null;
    const decision = decideRequestCoverageTransition({
      request,
      hotelConfig: config,
      now: input.now,
      lastEventType: lastTransition?.eventType || null,
      lastEffectiveDepartment: lastTransition?.effectiveDepartment || null,
    });

    if (!decision.ok || decision.action === "skip") {
      result.skipped += 1;
      continue;
    }

    if (decision.action === "none") {
      result.unchanged += 1;
      continue;
    }

    const primaryDepartment = clean(decision.primaryDepartment);
    const effectiveDepartment = clean(decision.effectiveDepartment) || primaryDepartment;
    const reason = clean(decision.reason) || "coverage_transition";

    if (decision.action === "start_fallback") {
      const pushResult = await sendStaffPushNotification({
        hotelId: input.hotel.id,
        hotelSlug: input.hotel.slug,
        requestId: request.id,
        room: clean(request.room_number_snapshot) || "—",
        requestTitle: clean(request.title_bg || request.title || request.request_type),
        targetRoles: [effectiveDepartment],
        notificationTitle: "GOSTAYA — заявка за поемане",
        notificationUrl: `/staff/${input.hotel.slug}/${effectiveDepartment}?source=coverage-transition&request=${encodeURIComponent(request.id)}`,
      });

      await recordTransition({
        hotel: input.hotel,
        request,
        eventType: DEPARTMENT_COVERAGE_FALLBACK_EVENT,
        primaryDepartment,
        effectiveDepartment,
        reason,
        pushResult: pushResult as Record<string, unknown>,
      });
      result.fallbackStarted += 1;
      continue;
    }

    if (decision.action === "record_fallback_without_push") {
      await recordTransition({
        hotel: input.hotel,
        request,
        eventType: DEPARTMENT_COVERAGE_FALLBACK_EVENT,
        primaryDepartment,
        effectiveDepartment,
        reason,
      });
      result.fallbackBaselineRecorded += 1;
      continue;
    }

    if (decision.action === "resume_primary") {
      await recordTransition({
        hotel: input.hotel,
        request,
        eventType: DEPARTMENT_COVERAGE_RESUMED_EVENT,
        primaryDepartment,
        effectiveDepartment,
        reason,
      });
      result.primaryResumed += 1;
    }
  }

  return result;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const now = new Date();
  const totals = {
    hotels: 0,
    checked: 0,
    fallbackStarted: 0,
    fallbackBaselineRecorded: 0,
    primaryResumed: 0,
    unchanged: 0,
    skipped: 0,
    failedHotels: 0,
  };

  try {
    // Platform directory is the trusted source for which tenant IDs this
    // system-level cron is allowed to inspect. Operational rows are then
    // explicitly constrained to that proven hotel_id set.
    const { data: hotelData, error: hotelError } = await supabaseAdmin
      .from("hotels")
      .select("id,slug,name")
      .eq("active", true)
      .eq("is_sandbox", false);

    if (hotelError) throw hotelError;

    const hotels = (hotelData || []) as HotelRow[];
    totals.hotels = hotels.length;
    if (!hotels.length) {
      return NextResponse.json({ ok: true, totals }, { headers: NO_STORE_HEADERS });
    }

    const activeHotelIds = hotels.map((hotel) => hotel.id);
    const { data: requestData, error: requestError } = await supabaseAdmin
      .from("guest_requests")
      .select("id,hotel_id,room_number_snapshot,request_type,title,title_bg,created_at,status,metadata_json")
      .in("hotel_id", activeHotelIds)
      .in("status", [...OPEN_REQUEST_STATUSES])
      .or("is_test.is.null,is_test.eq.false")
      .order("created_at", { ascending: true });

    if (requestError) throw requestError;

    const requests = (requestData || []) as OpenRequestRow[];
    if (!requests.length) {
      return NextResponse.json({ ok: true, totals }, { headers: NO_STORE_HEADERS });
    }

    const requestsByHotel = groupRequestsByHotel(requests);

    for (const hotel of hotels) {
      const hotelRequests = requestsByHotel.get(hotel.id) || [];
      if (!hotelRequests.length) continue;

      try {
        const result = await processHotelTransitions({
          hotel,
          requests: hotelRequests,
          now,
        });

        totals.checked += result.checked;
        totals.fallbackStarted += result.fallbackStarted;
        totals.fallbackBaselineRecorded += result.fallbackBaselineRecorded;
        totals.primaryResumed += result.primaryResumed;
        totals.unchanged += result.unchanged;
        totals.skipped += result.skipped;
      } catch (error) {
        totals.failedHotels += 1;
        await alertManagerAboutProcessorFailure({ hotel, error });
      }
    }

    const ok = totals.failedHotels === 0;
    return NextResponse.json(
      { ok, totals, checkedAt: now.toISOString() },
      { status: ok ? 200 : 500, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    await logSystemError({
      severity: "critical",
      source: "cron",
      eventType: "department_coverage_transition_cron_failed",
      message: "Department coverage transition cron failed before hotel processing completed.",
      error,
      metadata: { totals },
    });

    return NextResponse.json(
      { ok: false, error: "Department coverage transition processing failed", totals },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
