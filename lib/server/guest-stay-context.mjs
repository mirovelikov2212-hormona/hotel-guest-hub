import { evaluateOperationalRequestSla } from "./operational-request-sla.mjs";

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
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function finiteInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function safeMetadata(item) {
  return item?.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
    ? item.metadata
    : {};
}

function increment(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function normalizeNow(now) {
  const candidate = now instanceof Date ? now : new Date(now ?? Date.now());
  return Number.isFinite(candidate.getTime()) ? candidate : new Date(0);
}

function buildRequestFacts(items, now) {
  const requests = new Map();
  const usage = new Map();

  for (const item of items) {
    const requestId = cleanOptional(item?.requestId);
    if (!requestId) continue;
    if (!String(item?.eventType || "").startsWith("request_")) continue;

    let facts = requests.get(requestId);
    if (!facts) {
      facts = {
        requestId,
        createdAtIso: null,
        startedAtIso: null,
        resolvedAtIso: null,
        returnedAtIso: null,
        status: "new",
        serviceKey: null,
        requestType: null,
        slaMinutes: null,
      };
      requests.set(requestId, facts);
    }

    const metadata = safeMetadata(item);
    const occurredAt = validIso(item?.occurredAt);

    if (item.eventType === "request_created") {
      facts.createdAtIso = occurredAt;
      facts.serviceKey = cleanOptional(metadata.sourceRequestDef || item?.label);
      facts.requestType = cleanOptional(metadata.requestType);
      facts.slaMinutes = finiteInteger(metadata.slaMinutes);
      facts.status = "new";
      increment(usage, facts.serviceKey || facts.requestType);
    } else if (item.eventType === "request_in_progress") {
      facts.startedAtIso = occurredAt || facts.startedAtIso;
      facts.status = "in_progress";
    } else if (item.eventType === "request_completed") {
      facts.resolvedAtIso = occurredAt || facts.resolvedAtIso;
      facts.status = "completed";
    } else if (item.eventType === "request_returned") {
      facts.returnedAtIso = occurredAt || facts.returnedAtIso;
      facts.status = "returned";
    }
  }

  const attention = [];
  let active = 0;
  let completed = 0;
  let returned = 0;
  let firstResponseBreaches = 0;
  let activeSlaBreaches = 0;

  for (const facts of requests.values()) {
    const policy = facts.slaMinutes
      ? { firstResponseMinutes: facts.slaMinutes }
      : undefined;
    const sla = evaluateOperationalRequestSla({
      status: facts.status,
      createdAtIso: facts.createdAtIso,
      startedAtIso: facts.startedAtIso,
      resolvedAtIso: facts.resolvedAtIso,
      now,
      policy,
    });

    if (facts.status === "completed") completed += 1;
    else active += 1;
    if (facts.status === "returned") returned += 1;
    if (sla.breached) firstResponseBreaches += 1;
    if (sla.escalationRequired) activeSlaBreaches += 1;

    if (sla.escalationRequired) {
      attention.push({
        type: "sla_breach",
        requestId: facts.requestId,
        occurredAt: sla.deadlineAtIso,
        serviceKey: facts.serviceKey || facts.requestType,
      });
    }
    if (facts.status === "returned") {
      attention.push({
        type: "returned_request",
        requestId: facts.requestId,
        occurredAt: facts.returnedAtIso,
        serviceKey: facts.serviceKey || facts.requestType,
      });
    }
  }

  const observedServiceUsage = [...usage.entries()]
    .map(([serviceKey, count]) => ({ serviceKey, count }))
    .sort((a, b) => b.count - a.count || a.serviceKey.localeCompare(b.serviceKey));

  return {
    summary: {
      total: requests.size,
      active,
      completed,
      returned,
      firstResponseBreaches,
      activeSlaBreaches,
    },
    observedServiceUsage,
    attention,
  };
}

function buildCommunicationFacts(items) {
  let total = 0;
  let fromGuest = 0;
  let fromStaff = 0;
  let lastActivityAt = null;

  for (const item of items) {
    if (item?.eventType !== "direct_communication") continue;
    total += 1;
    const actorType = clean(item?.actorType).toLowerCase();
    if (actorType === "guest") fromGuest += 1;
    if (actorType === "staff") fromStaff += 1;
    const occurredAt = validIso(item?.occurredAt);
    if (occurredAt && (!lastActivityAt || Date.parse(occurredAt) > Date.parse(lastActivityAt))) {
      lastActivityAt = occurredAt;
    }
  }

  return { total, fromGuest, fromStaff, lastActivityAt };
}

function buildFeedbackFacts(items) {
  const surveys = [];
  const categories = new Map();
  const attention = [];

  for (const item of items) {
    if (item?.eventType !== "survey_submitted") continue;
    const metadata = safeMetadata(item);
    const rating = finiteInteger(metadata.rating);
    const occurredAt = validIso(item?.occurredAt);
    const status = cleanOptional(item?.status);
    surveys.push({ surveyId: cleanOptional(item?.surveyId), rating, occurredAt, status });

    for (const category of Array.isArray(metadata.selectedCategories) ? metadata.selectedCategories : []) {
      increment(categories, cleanOptional(category));
    }

    if (rating !== null && rating <= 3 && clean(status).toLowerCase() !== "resolved") {
      attention.push({
        type: "critical_feedback",
        surveyId: cleanOptional(item?.surveyId),
        occurredAt,
        rating,
      });
    }
  }

  const ratings = surveys.map((survey) => survey.rating).filter((rating) => rating !== null);
  const latest = surveys
    .filter((survey) => survey.occurredAt)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0] || null;

  return {
    summary: {
      total: surveys.length,
      latestRating: latest?.rating ?? null,
      averageRating: ratings.length
        ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
        : null,
      needsAttention: attention.length > 0,
      selectedCategories: [...categories.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    },
    attention,
  };
}

function buildBookingFacts(items, now) {
  const bookings = new Map();

  for (const item of items) {
    const bookingId = cleanOptional(item?.bookingId);
    if (!bookingId) continue;
    if (!String(item?.eventType || "").startsWith("massage_booking_")) continue;

    const metadata = safeMetadata(item);
    let booking = bookings.get(bookingId);
    if (!booking) {
      booking = {
        bookingId,
        serviceId: cleanOptional(metadata.serviceId || item?.label),
        startsAt: validIso(metadata.startsAt),
        status: cleanOptional(item?.status) || "confirmed",
      };
      bookings.set(bookingId, booking);
    }

    if (item.eventType === "massage_booking_cancelled") booking.status = "cancelled";
  }

  const nowMs = now.getTime();
  const values = [...bookings.values()];
  return {
    total: values.length,
    active: values.filter((booking) => booking.status !== "cancelled").length,
    cancelled: values.filter((booking) => booking.status === "cancelled").length,
    upcoming: values.filter((booking) =>
      booking.status !== "cancelled" && booking.startsAt && Date.parse(booking.startsAt) >= nowMs,
    ).length,
  };
}

function latestObservedLanguage(items) {
  const signals = [];
  for (const item of items) {
    const metadata = safeMetadata(item);
    const language = cleanOptional(
      metadata.sourceLanguage || metadata.language || metadata.guestLanguage,
    );
    const occurredAt = validIso(item?.occurredAt);
    if (language && occurredAt) signals.push({ language, occurredAt });
  }
  signals.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  return signals[0]?.language ?? null;
}

export function buildGuestStayContext(input = {}) {
  const now = normalizeNow(input.now);
  const stay = input.stay && typeof input.stay === "object" ? input.stay : {};
  const timeline = input.timeline && typeof input.timeline === "object" ? input.timeline : {};
  const items = Array.isArray(timeline.items) ? timeline.items : [];

  const requestFacts = buildRequestFacts(items, now);
  const communicationFacts = buildCommunicationFacts(items);
  const feedbackFacts = buildFeedbackFacts(items);
  const bookingFacts = buildBookingFacts(items, now);

  const attention = [...requestFacts.attention, ...feedbackFacts.attention]
    .filter((item) => item.occurredAt)
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));

  return Object.freeze({
    version: 1,
    scope: "current_stay",
    generatedAt: now.toISOString(),
    stay: Object.freeze({
      id: cleanOptional(stay.id),
      roomNumber: cleanOptional(stay.roomNumber),
      lifecycleState: cleanOptional(stay.lifecycleState || stay.status),
      checkInDate: cleanOptional(stay.checkInDate),
      checkOutDate: cleanOptional(stay.checkOutDate),
      effectiveCheckOutAt: validIso(stay.effectiveCheckOutAt),
      lastSeenAt: validIso(stay.lastSeenAt),
      isTest: stay.isTest === true,
    }),
    observedLanguage: latestObservedLanguage(items),
    requests: Object.freeze(requestFacts.summary),
    communications: Object.freeze(communicationFacts),
    feedback: Object.freeze(feedbackFacts.summary),
    bookings: Object.freeze(bookingFacts),
    observedServiceUsage: Object.freeze(requestFacts.observedServiceUsage),
    attention: Object.freeze(attention),
    preferences: Object.freeze({
      scope: "current_stay",
      explicit: Object.freeze([]),
      inferred: false,
    }),
    privacy: Object.freeze({
      personalIdentityStored: false,
      crossStayProfile: false,
      freeTextIncluded: false,
    }),
  });
}
