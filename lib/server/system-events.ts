import "server-only";

import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { sendCriticalSystemEventAlert } from "@/lib/server/critical-email-alerts";

export type SystemEventSeverity = "info" | "warning" | "error" | "critical";

export type SystemEventSource =
  | "guest_hub"
  | "staff_hub"
  | "api"
  | "apps_script"
  | "push"
  | "translation"
  | "survey"
  | "massage"
  | "supabase"
  | "cron";

type SystemEventMetadata = Record<string, unknown>;

export type LogSystemEventInput = {
  hotelId?: string | null;
  severity: SystemEventSeverity;
  source: SystemEventSource;
  eventType: string;
  message: string;
  roomNumber?: string | number | null;
  departmentId?: string | null;
  requestId?: string | null;
  surveyId?: string | null;
  metadata?: SystemEventMetadata | null;
};

export type LogSystemErrorInput = Omit<LogSystemEventInput, "severity" | "metadata"> & {
  severity?: SystemEventSeverity;
  error: unknown;
  metadata?: SystemEventMetadata | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SENSITIVE_KEY_RE = /(authorization|cookie|set-cookie|endpoint|p256dh|auth|token|secret|password|api[_-]?key|service[_-]?role|email|phone|raw[_-]?user[_-]?agent)/i;
const MAX_STRING_LENGTH = 1500;
const MAX_ARRAY_LENGTH = 30;
const MAX_OBJECT_KEYS = 60;
const MAX_DEPTH = 5;

function normalizeText(value: unknown, maxLength: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.slice(0, maxLength);
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  const text = normalizeText(value, maxLength);
  return text || null;
}

function normalizeUuid(value: unknown) {
  const text = String(value ?? "").trim();
  return UUID_RE.test(text) ? text : null;
}

function serializeError(error: unknown) {
  if (!error) return null;

  if (error instanceof Error) {
    const maybeWithCode = error as Error & { code?: unknown; statusCode?: unknown; status?: unknown };
    return {
      name: error.name,
      message: normalizeText(error.message, 1000),
      code: normalizeOptionalText(maybeWithCode.code, 120),
      statusCode: typeof maybeWithCode.statusCode === "number" ? maybeWithCode.statusCode : null,
      status: normalizeOptionalText(maybeWithCode.status, 120),
    };
  }

  if (typeof error === "object") {
    return sanitizeMetadata(error as Record<string, unknown>);
  }

  return { message: normalizeText(error, 1000) };
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return "[truncated]";

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);

    for (const [key, nestedValue] of entries) {
      if (SENSITIVE_KEY_RE.test(key)) {
        output[key] = "[redacted]";
        continue;
      }
      output[key] = sanitizeValue(nestedValue, depth + 1);
    }

    return output;
  }

  return normalizeText(value, MAX_STRING_LENGTH);
}

export function sanitizeMetadata(value: unknown): SystemEventMetadata {
  const sanitized = sanitizeValue(value, 0);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    return { value: sanitized ?? null };
  }
  return sanitized as SystemEventMetadata;
}

function normalizeSeverity(value: SystemEventSeverity): SystemEventSeverity {
  if (value === "critical" || value === "error" || value === "warning" || value === "info") return value;
  return "error";
}

function normalizeSource(value: SystemEventSource): SystemEventSource {
  return value || "api";
}

export async function logSystemEvent(input: LogSystemEventInput) {
  const payload = {
    hotel_id: normalizeUuid(input.hotelId),
    severity: normalizeSeverity(input.severity),
    source: normalizeSource(input.source),
    event_type: normalizeText(input.eventType, 120) || "unknown_event",
    message: normalizeText(input.message, 500) || "System event",
    room_number: normalizeOptionalText(input.roomNumber, 40),
    department_id: normalizeOptionalText(input.departmentId, 80),
    request_id: normalizeUuid(input.requestId),
    survey_id: normalizeUuid(input.surveyId),
    metadata_json: sanitizeMetadata(input.metadata || {}),
  };

  try {
    const { data, error } = await supabaseAdmin
      .from("system_events")
      .insert(payload)
      .select("id, created_at")
      .single();

    if (error) {
      console.error("system_events insert failed", {
        eventType: payload.event_type,
        severity: payload.severity,
        source: payload.source,
        error,
      });

      if (payload.severity === "critical") {
        await sendCriticalSystemEventAlert({
          createdAt: new Date().toISOString(),
          hotelId: payload.hotel_id,
          severity: payload.severity,
          source: payload.source,
          eventType: payload.event_type,
          message: payload.message,
          roomNumber: payload.room_number,
          departmentId: payload.department_id,
          requestId: payload.request_id,
          surveyId: payload.survey_id,
          metadata: {
            ...payload.metadata_json,
            systemEventsInsertFailed: true,
          },
        });
      }
      return;
    }

    if (payload.severity === "critical") {
      await sendCriticalSystemEventAlert({
        eventId: data?.id ? String(data.id) : null,
        createdAt: data?.created_at ? String(data.created_at) : new Date().toISOString(),
        hotelId: payload.hotel_id,
        severity: payload.severity,
        source: payload.source,
        eventType: payload.event_type,
        message: payload.message,
        roomNumber: payload.room_number,
        departmentId: payload.department_id,
        requestId: payload.request_id,
        surveyId: payload.survey_id,
        metadata: payload.metadata_json,
      });
    }
  } catch (error) {
    console.error("system_events logging failed", {
      eventType: payload.event_type,
      severity: payload.severity,
      source: payload.source,
      error,
    });

    if (payload.severity === "critical") {
      await sendCriticalSystemEventAlert({
        createdAt: new Date().toISOString(),
        hotelId: payload.hotel_id,
        severity: payload.severity,
        source: payload.source,
        eventType: payload.event_type,
        message: payload.message,
        roomNumber: payload.room_number,
        departmentId: payload.department_id,
        requestId: payload.request_id,
        surveyId: payload.survey_id,
        metadata: {
          ...payload.metadata_json,
          systemEventsLoggingFailed: true,
        },
      });
    }
  }
}

export async function logSystemError(input: LogSystemErrorInput) {
  return logSystemEvent({
    ...input,
    severity: input.severity || "error",
    metadata: {
      ...(input.metadata || {}),
      error: serializeError(input.error),
    },
  });
}
