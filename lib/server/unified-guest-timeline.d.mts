export type UnifiedGuestTimelineCategory =
  | "stay"
  | "service"
  | "billing"
  | "communication"
  | "feedback"
  | "booking"
  | "ai";

export type UnifiedGuestTimelineSource =
  | "guest_stays"
  | "guest_requests"
  | "guest_communications"
  | "guest_surveys"
  | "massage_runtime_bookings"
  | "hub_events";

export type UnifiedGuestTimelineItem = {
  id: string;
  occurredAt: string;
  source: UnifiedGuestTimelineSource;
  sourceId: string;
  category: UnifiedGuestTimelineCategory;
  eventType: string;
  requestId: string | null;
  communicationId: string | null;
  surveyId: string | null;
  bookingId: string | null;
  actorType: string | null;
  actorRole: string | null;
  status: string | null;
  label: string | null;
  metadata: Record<string, unknown>;
};

export type UnifiedGuestTimeline = {
  version: 1;
  stayId: string | null;
  items: UnifiedGuestTimelineItem[];
  firstActivityAt: string | null;
  lastActivityAt: string | null;
};

export function buildUnifiedGuestTimeline(input?: Record<string, unknown>): UnifiedGuestTimeline;
export const UNIFIED_GUEST_TIMELINE_SAFE_HUB_EVENTS: readonly string[];
