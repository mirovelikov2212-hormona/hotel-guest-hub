import "server-only";

import {
  INCIDENT_SCHEMA_VERSION,
  assertIncidentTransition,
  buildHumanIncidentEnvelope,
  deriveIncidentProjections,
} from "@/lib/incidents/incident-model.mjs";
import {
  canMutateControlPlane,
  type PlatformAdminAuthority,
} from "@/lib/server/control-plane-auth";
import { logControlPlaneAudit } from "@/lib/server/control-plane-audit";
import {
  resolveHotelByAnySlugAdmin,
} from "@/lib/server/hotel-scope";
import {
  logSystemEvent,
  sanitizeMetadata,
  type SystemEventSeverity,
} from "@/lib/server/system-events";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";

const MAX_INCIDENT_EVENTS = 1_000;

function clean(value: unknown, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function severity(value: unknown): SystemEventSeverity {
  const normalized = clean(value, 20).toLowerCase();
  if (normalized === "critical" || normalized === "error" || normalized === "warning") {
    return normalized;
  }
  return "warning";
}

async function readIncidentEvents(input?: {
  hotelId?: string | null;
  incidentId?: string | null;
}) {
  let query = supabaseAdmin
    .from("system_events")
    .select(
      "id,hotel_id,severity,source,event_type,message,room_number,department_id,request_id,metadata_json,created_at,resolved_at",
    )
    .contains("metadata_json", {
      incident: { schemaVersion: INCIDENT_SCHEMA_VERSION },
    })
    .order("created_at", { ascending: false })
    .limit(MAX_INCIDENT_EVENTS);

  if (input?.hotelId) {
    query = query.eq("hotel_id", input.hotelId);
  }
  if (input?.incidentId) {
    query = query.contains("metadata_json", {
      incident: { incidentId: input.incidentId },
    });
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`INCIDENT_READ_FAILED:${error.message}`);
  }
  if ((data || []).length >= MAX_INCIDENT_EVENTS) {
    throw new Error("INCIDENT_DATASET_CAP_EXCEEDED");
  }

  return data || [];
}

export async function listPlatformIncidents(input: {
  authority: PlatformAdminAuthority;
}) {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("INCIDENT_PLATFORM_ADMIN_FORBIDDEN");
  }

  const events = await readIncidentEvents();
  const incidents = deriveIncidentProjections(events);

  const hotelIds = [
    ...new Set(
      incidents
        .map((incident) => incident.hotelId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const hotelMap = new Map<string, { name: string; slug: string }>();
  if (hotelIds.length) {
    const { data, error } = await supabaseAdmin
      .from("hotels")
      .select("id,name,slug")
      .in("id", hotelIds);

    if (error) {
      throw new Error(`INCIDENT_HOTEL_READ_FAILED:${error.message}`);
    }

    for (const hotel of data || []) {
      hotelMap.set(String(hotel.id), {
        name: String(hotel.name || hotel.slug || hotel.id),
        slug: String(hotel.slug || ""),
      });
    }
  }

  return {
    incidents: incidents.map((incident) => ({
      ...incident,
      hotel: incident.hotelId
        ? hotelMap.get(incident.hotelId) || null
        : null,
    })),
    summary: {
      total: incidents.length,
      open: incidents.filter((incident) => incident.status !== "closed").length,
      criticalOpen: incidents.filter(
        (incident) =>
          incident.status !== "closed" && incident.severity === "critical",
      ).length,
      recurringAcrossHotels: incidents.filter(
        (incident) => incident.hotelsWithSameFingerprint > 1,
      ).length,
    },
  };
}

export async function reportManagerIncident(input: {
  hotelSlug: unknown;
  kind: unknown;
  module: unknown;
  summary: unknown;
  details?: unknown;
  severity?: unknown;
  roomNumber?: unknown;
  departmentId?: unknown;
  requestId?: unknown;
  errorCode?: unknown;
}) {
  const hotelSlug = clean(input.hotelSlug, 120).toLowerCase();
  if (!hotelSlug) throw new Error("INCIDENT_HOTEL_SLUG_REQUIRED");

  const session = await getCurrentStaffSession(hotelSlug, "manager");
  if (!session || session.role !== "manager") {
    throw new Error("INCIDENT_MANAGER_SESSION_REQUIRED");
  }

  const hotel = await resolveHotelByAnySlugAdmin(hotelSlug);
  if (!hotel?.id || String(hotel.id) !== String(session.hotel_id)) {
    throw new Error("INCIDENT_MANAGER_SCOPE_MISMATCH");
  }

  const summary = clean(input.summary, 500);
  const details = clean(input.details, 3_000);
  if (summary.length < 5) throw new Error("INCIDENT_SUMMARY_TOO_SHORT");

  const incident = buildHumanIncidentEnvelope({
    hotelId: String(hotel.id),
    kind: input.kind,
    module: input.module,
    summary,
    reporterRole: "manager",
    environment:
      process.env.VERCEL_ENV
      || (hotel.is_sandbox ? "sandbox" : process.env.NODE_ENV),
    releaseSha: process.env.VERCEL_GIT_COMMIT_SHA,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
    errorCode: input.errorCode,
  });

  const logged = await logSystemEvent({
    hotelId: String(hotel.id),
    severity: severity(input.severity),
    source: "staff_hub",
    eventType: "incident_human_reported",
    message: summary,
    roomNumber: clean(input.roomNumber, 40) || null,
    departmentId: clean(input.departmentId, 80) || null,
    requestId: clean(input.requestId, 80) || null,
    metadata: {
      incident,
      details,
      reportedFrom: "manager_hub",
    },
  });

  if (!logged?.ok) {
    throw new Error("INCIDENT_REPORT_WRITE_FAILED");
  }

  return {
    incidentId: incident.incidentId,
    fingerprint: incident.fingerprint,
    eventId: logged.id,
    status: incident.status,
    createdAt: logged.createdAt,
  };
}

export async function transitionPlatformIncident(input: {
  authority: PlatformAdminAuthority;
  hotelId: unknown;
  incidentId: unknown;
  status: unknown;
  note?: unknown;
}) {
  if (!canMutateControlPlane(input.authority.role)) {
    throw new Error("INCIDENT_PLATFORM_ADMIN_FORBIDDEN");
  }

  const hotelId = clean(input.hotelId, 80);
  const incidentId = clean(input.incidentId, 80);
  if (!hotelId || !incidentId) {
    throw new Error("INCIDENT_TRANSITION_SCOPE_INVALID");
  }

  const events = await readIncidentEvents({ hotelId, incidentId });
  const projection = deriveIncidentProjections(events).find(
    (incident) => incident.incidentId === incidentId,
  );
  if (!projection) throw new Error("INCIDENT_NOT_FOUND");

  const transition = assertIncidentTransition(
    projection.status,
    input.status,
  );
  if (transition.noop) {
    return {
      incidentId,
      status: projection.status,
      noop: true,
    };
  }

  const incident = {
    schemaVersion: INCIDENT_SCHEMA_VERSION,
    incidentId: projection.incidentId,
    fingerprint: projection.fingerprint,
    kind: projection.kind,
    status: transition.to,
    reporterKind: "platform_admin",
    module: projection.module,
    environment: projection.environment,
    releaseSha: projection.releaseSha,
    deploymentId: projection.deploymentId,
    errorCode: null,
  };

  const logged = await logSystemEvent({
    hotelId,
    severity:
      transition.to === "closed" || transition.to === "verified"
        ? "info"
        : "warning",
    source: "api",
    eventType: "incident_status_changed",
    message: `Incident status ${transition.from} → ${transition.to}`,
    metadata: {
      incident,
      transition: {
        from: transition.from,
        to: transition.to,
        note: clean(input.note, 2_000) || null,
      },
    },
  });

  if (!logged?.ok) {
    throw new Error("INCIDENT_TRANSITION_WRITE_FAILED");
  }

  await logControlPlaneAudit({
    actorAdminId: input.authority.adminId,
    hotelId,
    action: "incident_status_changed",
    resourceType: "system_incident",
    resourceId: incidentId,
    metadata: sanitizeMetadata({
      from: transition.from,
      to: transition.to,
      note: clean(input.note, 2_000) || null,
      fingerprint: projection.fingerprint,
    }),
  });

  return {
    incidentId,
    status: transition.to,
    eventId: logged.id,
    noop: false,
  };
}
