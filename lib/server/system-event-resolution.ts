import "server-only";

import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { SystemEventSource } from "@/lib/server/system-events";

type ResolveOpenCriticalSystemEventsInput = {
  hotelId: string;
  source: SystemEventSource;
  eventType: string;
  resolvedThrough: string;
};

type ResolveOpenCriticalSystemEventsResult = {
  ok: boolean;
  resolvedCount: number;
  resolvedAt: string | null;
  error: string | null;
};

export async function resolveOpenCriticalSystemEvents(
  input: ResolveOpenCriticalSystemEventsInput,
): Promise<ResolveOpenCriticalSystemEventsResult> {
  const hotelId = String(input.hotelId || "").trim();
  const eventType = String(input.eventType || "").trim();
  const resolvedThroughMs = Date.parse(String(input.resolvedThrough || ""));

  if (!hotelId || !eventType || !Number.isFinite(resolvedThroughMs)) {
    return {
      ok: false,
      resolvedCount: 0,
      resolvedAt: null,
      error: "invalid_resolution_scope",
    };
  }

  const resolvedAt = new Date(resolvedThroughMs).toISOString();

  try {
    const { data, error } = await supabaseAdmin
      .from("system_events")
      .update({ resolved_at: resolvedAt })
      .eq("hotel_id", hotelId)
      .eq("severity", "critical")
      .eq("source", input.source)
      .eq("event_type", eventType)
      .is("resolved_at", null)
      .lte("created_at", resolvedAt)
      .select("id");

    if (error) {
      console.error("[system-event-resolution] update failed", {
        hotelId,
        eventType,
        source: input.source,
        error: error.message,
      });
      return {
        ok: false,
        resolvedCount: 0,
        resolvedAt,
        error: error.message,
      };
    }

    return {
      ok: true,
      resolvedCount: Array.isArray(data) ? data.length : 0,
      resolvedAt,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[system-event-resolution] update failed", {
      hotelId,
      eventType,
      source: input.source,
      error: message,
    });
    return {
      ok: false,
      resolvedCount: 0,
      resolvedAt,
      error: message,
    };
  }
}
