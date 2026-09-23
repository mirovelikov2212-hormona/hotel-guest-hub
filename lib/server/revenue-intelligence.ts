import "server-only";

import { getHotelConfig } from "@/lib/config";
import {
  buildAncillaryRevenueSnapshot,
} from "@/lib/revenue/ancillary-revenue-model.mjs";
import {
  requireHotelProductModuleAccess,
} from "@/lib/server/product-module-entitlements";
import {
  hotelMatchesRequestedSlug,
} from "@/lib/server/hotel-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";

const MAX_LEDGER_EVENTS = 10_000;
const MAX_REQUEST_ROWS = 5_000;
const MAX_ANALYTICS_EVENTS = 10_000;
const BILLING_EVENTS = [
  "request_billing_pending",
  "request_billing_charged",
  "request_billing_waived",
  "request_billing_cancelled",
] as const;

type RevenuePeriod = {
  days: number;
  from: string;
  to: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function chunks<T>(values: T[], size = 250) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function resolveDays(value: unknown) {
  const days = Number(value);
  return [7, 30, 90, 365].includes(days) ? days : 30;
}

function resolvePeriod(daysInput: unknown, now = new Date()): RevenuePeriod {
  const days = resolveDays(daysInput);
  const toMs = now.getTime();
  const fromMs = toMs - days * 24 * 60 * 60 * 1000;
  return {
    days,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
  };
}

async function resolveRevenueManagerAccess(hotelSlugInput: unknown) {
  const hotelSlug = clean(hotelSlugInput).toLowerCase();
  if (!hotelSlug) throw new Error("REVENUE_HOTEL_SLUG_REQUIRED");

  const session = await getCurrentStaffSession(hotelSlug, "manager");
  if (!session || session.role !== "manager") {
    throw new Error("REVENUE_MANAGER_SESSION_REQUIRED");
  }

  const { data: hotel, error } = await supabaseAdmin
    .from("hotels")
    .select("id,slug,public_slug,name,active,is_sandbox,timezone")
    .eq("id", session.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error(`REVENUE_HOTEL_LOOKUP_FAILED:${error.message}`);
  if (!hotel || !hotelMatchesRequestedSlug(hotel, hotelSlug)) {
    throw new Error("REVENUE_HOTEL_SCOPE_MISMATCH");
  }

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

function billableServiceKeysFromConfig(config: Awaited<ReturnType<typeof getHotelConfig>>) {
  const defs = Array.isArray(config?.requestDefs) ? config.requestDefs : [];
  return defs
    .filter((def) => {
      if (!def || def.enabled !== true) return false;
      const price = clean(def.price);
      return def.requiresBilling === true || Boolean(price);
    })
    .flatMap((def) => [
      clean(def.id).toLowerCase(),
      clean(def.requestType).toLowerCase(),
    ])
    .filter(Boolean);
}

async function loadRequestsByIds(hotelId: string, requestIds: string[]) {
  const rows: Record<string, unknown>[] = [];
  for (const ids of chunks(requestIds)) {
    const { data, error } = await supabaseAdmin
      .from("guest_requests")
      .select(
        "id,hotel_id,stay_id,request_type,room_number_snapshot,source,channel,created_at,is_test,metadata_json",
      )
      .eq("hotel_id", hotelId)
      .in("id", ids)
      .or("is_test.is.null,is_test.eq.false")
      .limit(ids.length);

    if (error) throw error;
    rows.push(...((data || []) as Record<string, unknown>[]));
  }
  return rows;
}

async function loadRequestCreatedEvents(hotelId: string, requestIds: string[]) {
  const rows: Record<string, unknown>[] = [];
  for (const ids of chunks(requestIds)) {
    const { data, error } = await supabaseAdmin
      .from("hub_events")
      .select(
        "id,request_id,stay_id,user_session_id,event_name,item_key,created_at,extra,is_test",
      )
      .eq("hotel_id", hotelId)
      .eq("event_name", "request_created")
      .in("request_id", ids)
      .or("is_test.is.null,is_test.eq.false")
      .limit(Math.min(MAX_ANALYTICS_EVENTS, ids.length * 3));

    if (error) throw error;
    rows.push(...((data || []) as Record<string, unknown>[]));
  }
  return rows;
}

async function loadAttributionClicks(
  hotelId: string,
  sessionIds: string[],
  to: string,
) {
  const rows: Record<string, unknown>[] = [];
  for (const ids of chunks(sessionIds)) {
    const { data, error } = await supabaseAdmin
      .from("hub_events")
      .select(
        "id,request_id,stay_id,user_session_id,event_name,item_key,created_at,extra,is_test",
      )
      .eq("hotel_id", hotelId)
      .eq("event_name", "ai_action_clicked")
      .in("user_session_id", ids)
      .lt("created_at", to)
      .or("is_test.is.null,is_test.eq.false")
      .order("created_at", { ascending: true })
      .limit(MAX_ANALYTICS_EVENTS);

    if (error) throw error;
    if ((data || []).length >= MAX_ANALYTICS_EVENTS) {
      throw new Error("REVENUE_AI_ATTRIBUTION_EVENT_CAP_EXCEEDED");
    }
    rows.push(...((data || []) as Record<string, unknown>[]));
  }
  return rows;
}

function mergeUniqueRows(...groups: Record<string, unknown>[][]) {
  const map = new Map<string, Record<string, unknown>>();
  for (const group of groups) {
    for (const row of group) {
      const id = clean(row.id);
      if (id) map.set(id, row);
    }
  }
  return [...map.values()];
}

export async function getAncillaryRevenueManagerSnapshot(input: {
  hotelSlug: unknown;
  days?: unknown;
  now?: Date;
}) {
  const hotel = await resolveRevenueManagerAccess(input.hotelSlug);
  const period = resolvePeriod(input.days, input.now);
  const config = await getHotelConfig(hotel.slug);
  const billableServiceKeys = billableServiceKeysFromConfig(config);

  const [
    billingResult,
    periodRequestsResult,
    periodAiEventsResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("hub_events")
      .select(
        "id,request_id,stay_id,user_session_id,event_name,item_key,created_at,extra,is_test",
      )
      .eq("hotel_id", hotel.id)
      .in("event_name", [...BILLING_EVENTS])
      .lt("created_at", period.to)
      .or("is_test.is.null,is_test.eq.false")
      .order("created_at", { ascending: true })
      .limit(MAX_LEDGER_EVENTS),
    supabaseAdmin
      .from("guest_requests")
      .select(
        "id,hotel_id,stay_id,request_type,room_number_snapshot,source,channel,created_at,is_test,metadata_json",
      )
      .eq("hotel_id", hotel.id)
      .gte("created_at", period.from)
      .lt("created_at", period.to)
      .or("is_test.is.null,is_test.eq.false")
      .order("created_at", { ascending: true })
      .limit(MAX_REQUEST_ROWS),
    supabaseAdmin
      .from("hub_events")
      .select(
        "id,request_id,stay_id,user_session_id,event_name,item_key,created_at,extra,is_test",
      )
      .eq("hotel_id", hotel.id)
      .in("event_name", ["ai_action_shown", "ai_action_clicked"])
      .gte("created_at", period.from)
      .lt("created_at", period.to)
      .or("is_test.is.null,is_test.eq.false")
      .order("created_at", { ascending: true })
      .limit(MAX_ANALYTICS_EVENTS),
  ]);

  if (billingResult.error) throw billingResult.error;
  if (periodRequestsResult.error) throw periodRequestsResult.error;
  if (periodAiEventsResult.error) throw periodAiEventsResult.error;

  if ((billingResult.data || []).length >= MAX_LEDGER_EVENTS) {
    throw new Error("REVENUE_LEDGER_EVENT_CAP_EXCEEDED");
  }
  if ((periodRequestsResult.data || []).length >= MAX_REQUEST_ROWS) {
    throw new Error("REVENUE_REQUEST_CAP_EXCEEDED");
  }
  if ((periodAiEventsResult.data || []).length >= MAX_ANALYTICS_EVENTS) {
    throw new Error("REVENUE_AI_EVENT_CAP_EXCEEDED");
  }

  const billingEvents = (billingResult.data || []) as Record<string, unknown>[];
  const periodRequests = (periodRequestsResult.data || []) as Record<string, unknown>[];
  const requestIds = [
    ...new Set(
      [
        ...periodRequests.map((row) => clean(row.id)),
        ...billingEvents.map((row) => {
          const extra =
            row.extra && typeof row.extra === "object" && !Array.isArray(row.extra)
              ? (row.extra as Record<string, unknown>)
              : {};
          return clean(row.request_id || extra.requestId);
        }),
      ].filter(Boolean),
    ),
  ];

  const referencedRequests = requestIds.length
    ? await loadRequestsByIds(hotel.id, requestIds)
    : [];
  const requests = mergeUniqueRows(periodRequests, referencedRequests);

  const requestCreatedEvents = requestIds.length
    ? await loadRequestCreatedEvents(hotel.id, requestIds)
    : [];
  const sessionIds = [
    ...new Set(
      requestCreatedEvents
        .map((row) => clean(row.user_session_id))
        .filter(Boolean),
    ),
  ];
  const attributionClicks = sessionIds.length
    ? await loadAttributionClicks(hotel.id, sessionIds, period.to)
    : [];

  const analyticsEvents = mergeUniqueRows(
    billingEvents,
    requestCreatedEvents,
    periodAiEventsResult.data as Record<string, unknown>[],
    attributionClicks,
  );

  const snapshot = buildAncillaryRevenueSnapshot({
    from: period.from,
    to: period.to,
    generatedAt: new Date().toISOString(),
    requests,
    events: analyticsEvents,
    billableServiceKeys,
  });

  return {
    hotel,
    period,
    snapshot,
  };
}
