import "server-only";

import {
  buildUnifiedGuestTimeline,
  UNIFIED_GUEST_TIMELINE_SAFE_HUB_EVENTS,
  type UnifiedGuestTimeline,
} from "@/lib/server/unified-guest-timeline.mjs";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type UnifiedGuestTimelineStaySnapshot = {
  id: string;
  roomNumber: string;
  lifecycleState: string;
  status: string;
  checkInDate: string | null;
  checkOutDate: string | null;
  checkInAt: string | null;
  effectiveCheckOutAt: string | null;
  lastSeenAt: string | null;
  isTest: boolean;
};

export type UnifiedGuestTimelineReadModel = {
  authority: "canonical_stay_sources";
  stay: UnifiedGuestTimelineStaySnapshot;
  timeline: UnifiedGuestTimeline;
  sourceCounts: {
    requests: number;
    communications: number;
    surveys: number;
    massageBookings: number;
    hubEvents: number;
  };
};

type LoadUnifiedGuestTimelineInput = {
  hotelId: string;
  stayId: string;
  includeTest?: boolean;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  const result = clean(value);
  return result || null;
}

function isUnexpiredTestRow(row: Record<string, unknown>) {
  if (row.is_test !== true) return true;
  const expiresAt = nullableText(row.test_expires_at);
  if (!expiresAt) return true;
  const expiresAtMs = Date.parse(expiresAt);
  return !Number.isFinite(expiresAtMs) || expiresAtMs > Date.now();
}

export async function loadUnifiedGuestTimelineForStay(
  input: LoadUnifiedGuestTimelineInput,
): Promise<UnifiedGuestTimelineReadModel | null> {
  const hotelId = clean(input.hotelId);
  const stayId = clean(input.stayId);
  if (!hotelId || !stayId) return null;

  const { data: stayRow, error: stayError } = await supabaseAdmin
    .from("guest_stays")
    .select(
      "id,hotel_id,room_number,check_in_date,check_out_date,check_in_at,effective_check_out_at,status,lifecycle_state,last_seen_at,is_test,test_expires_at,created_at",
    )
    .eq("hotel_id", hotelId)
    .eq("id", stayId)
    .maybeSingle();

  if (stayError) throw stayError;
  if (!stayRow) return null;

  const stayIsTest = Boolean(stayRow.is_test);
  if (stayIsTest && !input.includeTest) return null;
  if (stayIsTest && !isUnexpiredTestRow(stayRow as Record<string, unknown>)) return null;

  let requestsQuery = supabaseAdmin
    .from("guest_requests")
    .select(
      "id,request_type,status,created_at,started_at,resolved_at,closed_at,metadata_json,is_test,test_expires_at",
    )
    .eq("hotel_id", hotelId)
    .eq("stay_id", stayId)
    .order("created_at", { ascending: true })
    .limit(500);

  let surveysQuery = supabaseAdmin
    .from("guest_surveys")
    .select(
      "id,survey_type,rating,selected_categories,resolution_status,language,guest_submitted_at,created_at,is_test,test_expires_at",
    )
    .eq("hotel_id", hotelId)
    .eq("stay_id", stayId)
    .order("created_at", { ascending: true })
    .limit(100);

  let massageQuery = supabaseAdmin
    .from("massage_runtime_bookings")
    .select(
      "id,resource_key,service_id,starts_at,duration_minutes,guest_language,price,currency,status,cancelled_at,created_at,is_test",
    )
    .eq("hotel_id", hotelId)
    .eq("stay_id", stayId)
    .order("created_at", { ascending: true })
    .limit(100);

  let eventsQuery = supabaseAdmin
    .from("hub_events")
    .select("id,event_name,section,label,request_id,extra,created_at,is_test,test_expires_at")
    .eq("hotel_id", hotelId)
    .eq("stay_id", stayId)
    .in("event_name", [...UNIFIED_GUEST_TIMELINE_SAFE_HUB_EVENTS])
    .order("created_at", { ascending: true })
    .limit(1000);

  if (stayIsTest) {
    requestsQuery = requestsQuery.eq("is_test", true);
    surveysQuery = surveysQuery.eq("is_test", true);
    massageQuery = massageQuery.eq("is_test", true);
    eventsQuery = eventsQuery.eq("is_test", true);
  } else {
    requestsQuery = requestsQuery.or("is_test.is.null,is_test.eq.false");
    surveysQuery = surveysQuery.or("is_test.is.null,is_test.eq.false");
    massageQuery = massageQuery.or("is_test.is.null,is_test.eq.false");
    eventsQuery = eventsQuery.or("is_test.is.null,is_test.eq.false");
  }

  const [requestsResult, communicationsResult, surveysResult, massageResult, eventsResult] = await Promise.all([
    requestsQuery,
    supabaseAdmin
      .from("guest_communications")
      .select(
        "id,department_id,actor_role,category,source_language,audience_type,status,sent_at,created_at,request_id,sender_type",
      )
      .eq("hotel_id", hotelId)
      .eq("stay_id", stayId)
      .eq("audience_type", "direct_guest")
      .order("created_at", { ascending: true })
      .limit(500),
    surveysQuery,
    massageQuery,
    eventsQuery,
  ]);

  if (requestsResult.error) throw requestsResult.error;
  if (communicationsResult.error) throw communicationsResult.error;
  if (surveysResult.error) throw surveysResult.error;
  if (massageResult.error) throw massageResult.error;
  if (eventsResult.error) throw eventsResult.error;

  const requests = ((requestsResult.data ?? []) as Record<string, unknown>[]).filter(isUnexpiredTestRow);
  const communications = (communicationsResult.data ?? []) as Record<string, unknown>[];
  const surveys = ((surveysResult.data ?? []) as Record<string, unknown>[]).filter(isUnexpiredTestRow);
  const massageBookings = (massageResult.data ?? []) as Record<string, unknown>[];
  const hubEvents = ((eventsResult.data ?? []) as Record<string, unknown>[]).filter(isUnexpiredTestRow);

  const timeline = buildUnifiedGuestTimeline({
    stay: stayRow,
    requests,
    communications,
    surveys,
    massageBookings,
    hubEvents,
  });

  return {
    authority: "canonical_stay_sources",
    stay: {
      id: clean(stayRow.id),
      roomNumber: clean(stayRow.room_number),
      lifecycleState: clean(stayRow.lifecycle_state || stayRow.status),
      status: clean(stayRow.status),
      checkInDate: nullableText(stayRow.check_in_date),
      checkOutDate: nullableText(stayRow.check_out_date),
      checkInAt: nullableText(stayRow.check_in_at),
      effectiveCheckOutAt: nullableText(stayRow.effective_check_out_at),
      lastSeenAt: nullableText(stayRow.last_seen_at),
      isTest: stayIsTest,
    },
    timeline,
    sourceCounts: {
      requests: requests.length,
      communications: communications.length,
      surveys: surveys.length,
      massageBookings: massageBookings.length,
      hubEvents: hubEvents.length,
    },
  };
}
