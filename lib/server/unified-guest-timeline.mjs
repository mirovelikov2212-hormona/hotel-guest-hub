const SAFE_HUB_EVENT_TYPES = new Set([
  "room_confirmed",
  "room_changed",
  "request_seen_by_staff",
  "request_returned",
  "returned_to_pending",
  "request_billing_charged",
  "request_billing_waived",
  "request_billing_cancelled",
  "ai_question_sent",
  "ai_action_clicked",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function cleanOptional(value) {
  const result = clean(value);
  return result || null;
}

function validIso(value) {
  const candidate = clean(value);
  if (!candidate) return null;
  const time = Date.parse(candidate);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function finiteInteger(value) {
  if (value === null || value === undefined || clean(value) === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function opaqueId(value) {
  return cleanOptional(value);
}

function pushItem(items, item) {
  const occurredAt = validIso(item.occurredAt);
  const sourceId = opaqueId(item.sourceId);
  if (!occurredAt || !sourceId || !item.eventType || !item.source || !item.category) return;

  items.push({
    id: `${item.source}:${sourceId}:${item.eventType}:${occurredAt}`,
    occurredAt,
    source: item.source,
    sourceId,
    category: item.category,
    eventType: item.eventType,
    requestId: opaqueId(item.requestId),
    communicationId: opaqueId(item.communicationId),
    surveyId: opaqueId(item.surveyId),
    bookingId: opaqueId(item.bookingId),
    actorType: cleanOptional(item.actorType),
    actorRole: cleanOptional(item.actorRole),
    status: cleanOptional(item.status),
    label: cleanOptional(item.label),
    metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {},
  });
}

function requestMetadata(row) {
  return row?.metadata_json && typeof row.metadata_json === "object" && !Array.isArray(row.metadata_json)
    ? row.metadata_json
    : {};
}

function requestLifecycleItems(items, request) {
  const requestId = opaqueId(request?.id);
  if (!requestId) return;
  const metadata = requestMetadata(request);
  const requestType = cleanOptional(request?.request_type);
  const sourceRequestDef = cleanOptional(metadata.sourceRequestDef);
  const department = cleanOptional(metadata.department);
  const sla = metadata.operationalSla && typeof metadata.operationalSla === "object" && !Array.isArray(metadata.operationalSla)
    ? metadata.operationalSla
    : {};

  const safeRequestMetadata = {
    requestType,
    sourceRequestDef,
    department,
    slaMinutes: finiteInteger(sla.firstResponseMinutes),
    requiresBilling: metadata.requiresBilling === true,
    billingStatus: cleanOptional(metadata.billingStatus),
    price: metadata.price == null ? null : String(metadata.price),
    currency: cleanOptional(metadata.currency),
  };

  pushItem(items, {
    source: "guest_requests",
    sourceId: requestId,
    category: "service",
    eventType: "request_created",
    occurredAt: request?.created_at,
    requestId,
    status: "new",
    label: sourceRequestDef || requestType,
    metadata: safeRequestMetadata,
  });

  if (request?.started_at) {
    pushItem(items, {
      source: "guest_requests",
      sourceId: requestId,
      category: "service",
      eventType: "request_in_progress",
      occurredAt: request.started_at,
      requestId,
      status: "in_progress",
      label: sourceRequestDef || requestType,
      metadata: safeRequestMetadata,
    });
  }

  if (request?.resolved_at) {
    pushItem(items, {
      source: "guest_requests",
      sourceId: requestId,
      category: "service",
      eventType: "request_completed",
      occurredAt: request.resolved_at,
      requestId,
      status: "completed",
      label: sourceRequestDef || requestType,
      metadata: safeRequestMetadata,
    });
  }

  const billingUpdatedAt = validIso(metadata.billingUpdatedAt) || validIso(metadata.billingChargedAt);
  const billingStatus = clean(metadata.billingStatus).toLowerCase();
  if (billingUpdatedAt && ["charged", "waived", "cancelled"].includes(billingStatus)) {
    pushItem(items, {
      source: "guest_requests",
      sourceId: requestId,
      category: "billing",
      eventType: `request_billing_${billingStatus}`,
      occurredAt: billingUpdatedAt,
      requestId,
      actorRole: cleanOptional(metadata.billingUpdatedByRole || metadata.billingChargedByRole),
      status: billingStatus,
      label: sourceRequestDef || requestType,
      metadata: safeRequestMetadata,
    });
  }
}

function communicationItem(items, row) {
  if (clean(row?.audience_type).toLowerCase() !== "direct_guest") return;
  const id = opaqueId(row?.id);
  if (!id) return;
  pushItem(items, {
    source: "guest_communications",
    sourceId: id,
    category: "communication",
    eventType: "direct_communication",
    occurredAt: row?.sent_at || row?.created_at,
    communicationId: id,
    actorType: cleanOptional(row?.sender_type),
    actorRole: cleanOptional(row?.actor_role),
    status: cleanOptional(row?.status),
    label: cleanOptional(row?.category),
    metadata: {
      sourceLanguage: cleanOptional(row?.source_language),
      departmentId: opaqueId(row?.department_id),
      requestId: opaqueId(row?.request_id),
    },
  });
}

function surveyItem(items, row) {
  const id = opaqueId(row?.id);
  if (!id) return;
  pushItem(items, {
    source: "guest_surveys",
    sourceId: id,
    category: "feedback",
    eventType: "survey_submitted",
    occurredAt: row?.guest_submitted_at || row?.created_at,
    surveyId: id,
    status: cleanOptional(row?.resolution_status),
    label: cleanOptional(row?.survey_type),
    metadata: {
      rating: finiteInteger(row?.rating),
      language: cleanOptional(row?.language),
      selectedCategories: Array.isArray(row?.selected_categories)
        ? row.selected_categories.map(clean).filter(Boolean).slice(0, 20)
        : [],
    },
  });
}

function massageItems(items, row) {
  const id = opaqueId(row?.id);
  if (!id) return;
  const safeMetadata = {
    serviceId: cleanOptional(row?.service_id),
    resourceKey: cleanOptional(row?.resource_key),
    guestLanguage: cleanOptional(row?.guest_language),
    price: row?.price == null ? null : String(row.price),
    currency: cleanOptional(row?.currency),
    startsAt: validIso(row?.starts_at),
    durationMinutes: finiteInteger(row?.duration_minutes),
  };
  pushItem(items, {
    source: "massage_runtime_bookings",
    sourceId: id,
    category: "booking",
    eventType: "massage_booking_created",
    occurredAt: row?.created_at,
    bookingId: id,
    status: cleanOptional(row?.status),
    label: cleanOptional(row?.service_id),
    metadata: safeMetadata,
  });
  if (row?.cancelled_at) {
    pushItem(items, {
      source: "massage_runtime_bookings",
      sourceId: id,
      category: "booking",
      eventType: "massage_booking_cancelled",
      occurredAt: row.cancelled_at,
      bookingId: id,
      status: "cancelled",
      label: cleanOptional(row?.service_id),
      metadata: safeMetadata,
    });
  }
}

function hubEventItem(items, row) {
  const sourceEventType = clean(row?.event_name);
  if (!SAFE_HUB_EVENT_TYPES.has(sourceEventType)) return;
  const id = opaqueId(row?.id);
  if (!id) return;
  const extra = row?.extra && typeof row.extra === "object" && !Array.isArray(row.extra) ? row.extra : {};
  const requestId = opaqueId(row?.request_id || extra.requestId);
  const eventType = sourceEventType === "returned_to_pending" ? "request_returned" : sourceEventType;
  const category = eventType.startsWith("ai_")
    ? "ai"
    : eventType.startsWith("room_")
      ? "stay"
      : eventType.startsWith("request_billing_")
        ? "billing"
        : "service";

  pushItem(items, {
    source: "hub_events",
    sourceId: id,
    category,
    eventType,
    occurredAt: row?.created_at,
    requestId,
    actorRole: cleanOptional(extra.role),
    status: cleanOptional(extra.nextStatus),
    label: eventType.startsWith("ai_") ? null : cleanOptional(row?.label),
    metadata: {
      section: cleanOptional(row?.section),
      requestId,
      previousStatus: cleanOptional(extra.previousStatus),
      nextStatus: cleanOptional(extra.nextStatus),
      serviceTime: cleanOptional(extra.serviceTime),
    },
  });
}

export function buildUnifiedGuestTimeline(input = {}) {
  const items = [];
  const stay = input.stay && typeof input.stay === "object" ? input.stay : null;
  const stayId = opaqueId(stay?.id);

  if (stayId) {
    pushItem(items, {
      source: "guest_stays",
      sourceId: stayId,
      category: "stay",
      eventType: "stay_started",
      occurredAt: stay?.check_in_at || stay?.created_at,
      status: cleanOptional(stay?.lifecycle_state || stay?.status),
      label: cleanOptional(stay?.room_number),
      metadata: {
        roomNumber: cleanOptional(stay?.room_number),
        checkInDate: cleanOptional(stay?.check_in_date),
        checkOutDate: cleanOptional(stay?.check_out_date),
      },
    });
  }

  for (const request of Array.isArray(input.requests) ? input.requests : []) requestLifecycleItems(items, request);
  for (const row of Array.isArray(input.communications) ? input.communications : []) communicationItem(items, row);
  for (const row of Array.isArray(input.surveys) ? input.surveys : []) surveyItem(items, row);
  for (const row of Array.isArray(input.massageBookings) ? input.massageBookings : []) massageItems(items, row);
  for (const row of Array.isArray(input.hubEvents) ? input.hubEvents : []) hubEventItem(items, row);

  const deduped = new Map();
  for (const item of items) deduped.set(item.id, item);

  const timeline = [...deduped.values()].sort((a, b) => {
    const byTime = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });

  return {
    version: 1,
    stayId,
    items: timeline,
    firstActivityAt: timeline[0]?.occurredAt ?? null,
    lastActivityAt: timeline.at(-1)?.occurredAt ?? null,
  };
}

export const UNIFIED_GUEST_TIMELINE_SAFE_HUB_EVENTS = Object.freeze([...SAFE_HUB_EVENT_TYPES]);
