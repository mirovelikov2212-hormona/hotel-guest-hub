const BILLING_STATUSES = new Set([
  "pending",
  "charged",
  "waived",
  "cancelled",
]);

const BILLING_EVENT_PREFIX = "request_billing_";
const AI_ATTRIBUTION_WINDOW_MS = 30 * 60 * 1000;

function clean(value) {
  return String(value ?? "").trim();
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function validIso(value) {
  const raw = clean(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function withinPeriod(iso, fromMs, toMs) {
  const value = Date.parse(String(iso || ""));
  return Number.isFinite(value) && value >= fromMs && value < toMs;
}

export function parseRevenueMoneyToMinor(value) {
  if (Number.isSafeInteger(value)) return value;

  const raw = clean(value);
  if (!raw) return 0;

  const normalized = raw
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function canonicalRevenueCurrency(value) {
  const raw = clean(value).toUpperCase();
  if (!raw || raw === "€" || raw === "EURO") return "EUR";
  return raw.slice(0, 8);
}

function requestMetadata(row) {
  return record(row?.metadata_json);
}

function requestServiceKey(row) {
  const metadata = requestMetadata(row);
  return clean(metadata.sourceRequestDef || row?.request_type).toLowerCase();
}

function requestAmountMinor(row) {
  const metadata = requestMetadata(row);
  const explicit = Number(metadata.billingAmountMinor);
  if (Number.isSafeInteger(explicit) && explicit >= 0) return explicit;
  return parseRevenueMoneyToMinor(metadata.price);
}

function requestCurrency(row) {
  const metadata = requestMetadata(row);
  return canonicalRevenueCurrency(
    metadata.billingCurrencyCode || metadata.currency,
  );
}

function requestBillingStatus(row) {
  const metadata = requestMetadata(row);
  const status = clean(metadata.billingStatus).toLowerCase();
  return BILLING_STATUSES.has(status) ? status : "pending";
}

function isBillableRequest(row) {
  const metadata = requestMetadata(row);
  return metadata.requiresBilling === true || requestAmountMinor(row) > 0;
}

function requestIdFromEvent(event) {
  const extra = record(event?.extra);
  return clean(event?.request_id || extra.requestId);
}

function billingStatusFromEvent(event) {
  const name = clean(event?.event_name).toLowerCase();
  if (!name.startsWith(BILLING_EVENT_PREFIX)) return null;
  const status = name.slice(BILLING_EVENT_PREFIX.length);
  return BILLING_STATUSES.has(status) ? status : null;
}

function eventAmountMinor(event) {
  const extra = record(event?.extra);
  const explicit = Number(extra.billingAmountMinor);
  if (Number.isSafeInteger(explicit) && explicit >= 0) return explicit;
  return parseRevenueMoneyToMinor(extra.price);
}

function eventCurrency(event) {
  const extra = record(event?.extra);
  return canonicalRevenueCurrency(
    extra.billingCurrencyCode || extra.currency,
  );
}

function addMoney(target, currency, amountMinor) {
  if (!amountMinor) return;
  target[currency] = (target[currency] || 0) + amountMinor;
}

function cloneMoney(target) {
  return Object.fromEntries(
    Object.entries(target)
      .filter(([, amount]) => Number(amount) !== 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function buildBillingLedger(events, fromMs, toMs) {
  const grouped = new Map();

  for (const event of Array.isArray(events) ? events : []) {
    const status = billingStatusFromEvent(event);
    const requestId = requestIdFromEvent(event);
    const occurredAt = validIso(event?.created_at);
    if (!status || !requestId || !occurredAt) continue;

    const rows = grouped.get(requestId) || [];
    rows.push({
      raw: event,
      requestId,
      status,
      occurredAt,
      amountMinor: eventAmountMinor(event),
      currency: eventCurrency(event),
    });
    grouped.set(requestId, rows);
  }

  const ledgerEntries = [];
  let nativeEvents = 0;
  let reconstructedEvents = 0;
  let deltaMismatches = 0;

  for (const rows of grouped.values()) {
    rows.sort(
      (left, right) =>
        Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
        || clean(left.raw?.id).localeCompare(clean(right.raw?.id)),
    );

    let previousStatus = "pending";

    for (const row of rows) {
      const extra = record(row.raw?.extra);
      const reconstructedDelta =
        previousStatus !== "charged" && row.status === "charged"
          ? row.amountMinor
          : previousStatus === "charged" && row.status !== "charged"
            ? -row.amountMinor
            : 0;

      const nativeVersion = Number(extra.revenueLedgerVersion);
      const nativeDelta = Number(extra.revenueDeltaMinor);
      const hasNativeDelta =
        nativeVersion === 1 && Number.isSafeInteger(nativeDelta);

      if (hasNativeDelta) {
        nativeEvents += 1;
        if (nativeDelta !== reconstructedDelta) deltaMismatches += 1;
      } else {
        reconstructedEvents += 1;
      }

      ledgerEntries.push({
        requestId: row.requestId,
        occurredAt: row.occurredAt,
        status: row.status,
        previousStatus,
        amountMinor: row.amountMinor,
        currency: row.currency,
        revenueDeltaMinor: hasNativeDelta
          ? nativeDelta
          : reconstructedDelta,
        ledgerSource: hasNativeDelta
          ? "native_v1"
          : "reconstructed_event_sequence",
        inPeriod: withinPeriod(row.occurredAt, fromMs, toMs),
      });

      previousStatus = row.status;
    }
  }

  return {
    entries: ledgerEntries,
    quality: {
      nativeEvents,
      reconstructedEvents,
      deltaMismatches,
      eventSequenceComplete: true,
    },
  };
}

function eventExtraTargetIds(event) {
  const extra = record(event?.extra);
  const direct = clean(event?.item_key);
  const values = new Set(direct ? [direct.toLowerCase()] : []);

  const actions = Array.isArray(extra.actions) ? extra.actions : [];
  for (const action of actions) {
    const targetId = clean(action?.targetId).toLowerCase();
    if (targetId) values.add(targetId);
  }
  return [...values];
}

function buildAttributionResolver(events, requestRowsById) {
  const requestCreated = new Map();
  const aiClicks = [];

  for (const event of Array.isArray(events) ? events : []) {
    const name = clean(event?.event_name).toLowerCase();
    const occurredAt = validIso(event?.created_at);
    if (!occurredAt) continue;

    if (name === "request_created") {
      const requestId = requestIdFromEvent(event);
      if (!requestId) continue;
      const existing = requestCreated.get(requestId);
      if (
        !existing
        || Date.parse(occurredAt) < Date.parse(existing.occurredAt)
      ) {
        requestCreated.set(requestId, {
          occurredAt,
          sessionId: clean(event?.user_session_id),
          stayId: clean(event?.stay_id),
        });
      }
    }

    if (name === "ai_action_clicked") {
      aiClicks.push({
        id: clean(event?.id),
        occurredAt,
        sessionId: clean(event?.user_session_id),
        stayId: clean(event?.stay_id),
        targets: eventExtraTargetIds(event),
      });
    }
  }

  aiClicks.sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );

  return (requestId) => {
    const request = requestRowsById.get(requestId);
    if (!request) {
      return {
        source: "unattributed",
        confidence: "missing_request",
        aiClickId: null,
      };
    }

    const created = requestCreated.get(requestId);
    const serviceKey = requestServiceKey(request);
    const requestType = clean(request.request_type).toLowerCase();
    const targets = new Set([serviceKey, requestType].filter(Boolean));

    if (created?.sessionId) {
      const requestTime = Date.parse(created.occurredAt);
      const matching = aiClicks
        .filter((click) => {
          const clickTime = Date.parse(click.occurredAt);
          if (
            click.sessionId !== created.sessionId
            || clickTime > requestTime
            || requestTime - clickTime > AI_ATTRIBUTION_WINDOW_MS
          ) {
            return false;
          }
          if (created.stayId && click.stayId && created.stayId !== click.stayId) {
            return false;
          }
          return click.targets.some((target) => targets.has(target));
        })
        .at(-1);

      if (matching) {
        return {
          source: "ai_assisted",
          confidence: "verified_event_chain",
          aiClickId: matching.id || null,
        };
      }
    }

    const source = clean(request.source).toLowerCase();
    const channel = clean(request.channel).toLowerCase();
    if (source === "guest_hub" || channel === "pwa") {
      return {
        source: "guest_hub_direct",
        confidence: "request_source",
        aiClickId: null,
      };
    }

    return {
      source: "unattributed",
      confidence: "request_source_unknown",
      aiClickId: null,
    };
  };
}

function buildAiFunnel(events, billableServiceKeys, fromMs, toMs) {
  const billable = new Set(
    (Array.isArray(billableServiceKeys) ? billableServiceKeys : [])
      .map((value) => clean(value).toLowerCase())
      .filter(Boolean),
  );

  let paidActionsShown = 0;
  let paidActionClicks = 0;

  for (const event of Array.isArray(events) ? events : []) {
    if (!withinPeriod(event?.created_at, fromMs, toMs)) continue;
    const name = clean(event?.event_name).toLowerCase();

    if (name === "ai_action_shown") {
      const extra = record(event?.extra);
      const actions = Array.isArray(extra.actions) ? extra.actions : [];
      paidActionsShown += actions.filter((action) =>
        billable.has(clean(action?.targetId).toLowerCase()),
      ).length;
    } else if (name === "ai_action_clicked") {
      const targets = eventExtraTargetIds(event);
      if (targets.some((target) => billable.has(target))) {
        paidActionClicks += 1;
      }
    }
  }

  return { paidActionsShown, paidActionClicks };
}

export function buildAncillaryRevenueSnapshot(input = {}) {
  const fromIso = validIso(input.from);
  const toIso = validIso(input.to);
  if (!fromIso || !toIso) {
    throw new Error("REVENUE_PERIOD_INVALID");
  }

  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  if (!(fromMs < toMs)) {
    throw new Error("REVENUE_PERIOD_INVALID");
  }

  const requests = (Array.isArray(input.requests) ? input.requests : [])
    .filter((row) => row?.is_test !== true);
  const events = (Array.isArray(input.events) ? input.events : [])
    .filter((row) => row?.is_test !== true);

  const requestRowsById = new Map(
    requests
      .map((row) => [clean(row?.id), row])
      .filter(([id]) => Boolean(id)),
  );

  const periodRequests = requests.filter(
    (row) =>
      isBillableRequest(row)
      && withinPeriod(row?.created_at, fromMs, toMs),
  );

  const requestFunnel = {
    requested: periodRequests.length,
    pending: 0,
    charged: 0,
    waived: 0,
    cancelled: 0,
  };
  const requestedValue = {};
  const pendingValue = {};
  const waivedValue = {};
  const cancelledValue = {};

  for (const row of periodRequests) {
    const status = requestBillingStatus(row);
    const currency = requestCurrency(row);
    const amountMinor = requestAmountMinor(row);

    requestFunnel[status] += 1;
    addMoney(requestedValue, currency, amountMinor);
    if (status === "pending") addMoney(pendingValue, currency, amountMinor);
    if (status === "waived") addMoney(waivedValue, currency, amountMinor);
    if (status === "cancelled") addMoney(cancelledValue, currency, amountMinor);
  }

  const ledger = buildBillingLedger(events, fromMs, toMs);
  const attributionForRequest = buildAttributionResolver(
    events,
    requestRowsById,
  );

  const netRevenue = {};
  const grossRecognized = {};
  const reversals = {};
  const aiAttributedRevenue = {};
  const directRevenue = {};
  const unattributedRevenue = {};
  const serviceMap = new Map();
  const sourceCounts = {
    ai_assisted: 0,
    guest_hub_direct: 0,
    unattributed: 0,
  };
  const recognizedRequestIds = new Set();
  const aiRecognizedRequestIds = new Set();

  let recognitionEvents = 0;
  let reversalEvents = 0;

  for (const entry of ledger.entries.filter((row) => row.inPeriod)) {
    const delta = entry.revenueDeltaMinor;
    const currency = entry.currency;
    const request = requestRowsById.get(entry.requestId);
    const serviceKey = request ? requestServiceKey(request) : "unknown";
    const attribution = attributionForRequest(entry.requestId);

    addMoney(netRevenue, currency, delta);
    if (delta > 0) {
      recognitionEvents += 1;
      recognizedRequestIds.add(entry.requestId);
      addMoney(grossRecognized, currency, delta);
      sourceCounts[attribution.source] += 1;
      if (attribution.source === "ai_assisted") {
        aiRecognizedRequestIds.add(entry.requestId);
        addMoney(aiAttributedRevenue, currency, delta);
      } else if (attribution.source === "guest_hub_direct") {
        addMoney(directRevenue, currency, delta);
      } else {
        addMoney(unattributedRevenue, currency, delta);
      }
    } else if (delta < 0) {
      reversalEvents += 1;
      addMoney(reversals, currency, Math.abs(delta));
      if (attribution.source === "ai_assisted") {
        addMoney(aiAttributedRevenue, currency, delta);
      } else if (attribution.source === "guest_hub_direct") {
        addMoney(directRevenue, currency, delta);
      } else {
        addMoney(unattributedRevenue, currency, delta);
      }
    }

    const existing = serviceMap.get(serviceKey) || {
      serviceKey,
      recognizedRevenue: {},
      recognitionEvents: 0,
      reversalEvents: 0,
    };
    addMoney(existing.recognizedRevenue, currency, delta);
    if (delta > 0) existing.recognitionEvents += 1;
    if (delta < 0) existing.reversalEvents += 1;
    serviceMap.set(serviceKey, existing);
  }

  const aiFunnel = buildAiFunnel(
    events,
    input.billableServiceKeys,
    fromMs,
    toMs,
  );

  const chargeRate =
    requestFunnel.requested > 0
      ? requestFunnel.charged / requestFunnel.requested
      : null;
  const aiClickThroughRate =
    aiFunnel.paidActionsShown > 0
      ? aiFunnel.paidActionClicks / aiFunnel.paidActionsShown
      : null;
  const aiClickToChargeRate =
    aiFunnel.paidActionClicks > 0
      ? aiRecognizedRequestIds.size / aiFunnel.paidActionClicks
      : null;

  return Object.freeze({
    schemaVersion: "ancillary-revenue-v1",
    scope: "stayhub_ancillary_revenue",
    period: Object.freeze({
      from: fromIso,
      to: toIso,
    }),
    generatedAt: validIso(input.generatedAt) || new Date(0).toISOString(),
    definitions: Object.freeze({
      trackedRevenue:
        "Net billing ledger delta recognized inside the reporting period.",
      grossRecognized:
        "Positive charge recognitions inside the reporting period.",
      reversals:
        "Negative ledger deltas caused by reversing a previously charged request.",
      pendingValue:
        "Current face value of paid requests created in the period that still await billing.",
      requestChargeRate:
        "Current charged paid requests divided by paid requests created in the reporting period.",
      aiAttribution:
        "Verified same-session event chain: AI action click -> matching paid request within 30 minutes.",
    }),
    moneyMinorByCurrency: Object.freeze({
      trackedRevenue: Object.freeze(cloneMoney(netRevenue)),
      grossRecognized: Object.freeze(cloneMoney(grossRecognized)),
      reversals: Object.freeze(cloneMoney(reversals)),
      requestedValue: Object.freeze(cloneMoney(requestedValue)),
      pendingValue: Object.freeze(cloneMoney(pendingValue)),
      waivedValue: Object.freeze(cloneMoney(waivedValue)),
      cancelledValue: Object.freeze(cloneMoney(cancelledValue)),
      aiAttributedRevenue: Object.freeze(cloneMoney(aiAttributedRevenue)),
      guestHubDirectRevenue: Object.freeze(cloneMoney(directRevenue)),
      unattributedRevenue: Object.freeze(cloneMoney(unattributedRevenue)),
    }),
    requestFunnel: Object.freeze({
      ...requestFunnel,
      chargeRate,
    }),
    revenueLedger: Object.freeze({
      recognitionEvents,
      reversalEvents,
      recognizedRequestCount: recognizedRequestIds.size,
      ...ledger.quality,
    }),
    attribution: Object.freeze({
      sourceCounts: Object.freeze({ ...sourceCounts }),
      aiPaidActionsShown: aiFunnel.paidActionsShown,
      aiPaidActionClicks: aiFunnel.paidActionClicks,
      aiAttributedChargedRequests: aiRecognizedRequestIds.size,
      aiClickThroughRate,
      aiClickToChargeRate,
      windowMinutes: AI_ATTRIBUTION_WINDOW_MS / 60_000,
    }),
    services: Object.freeze(
      [...serviceMap.values()]
        .map((item) =>
          Object.freeze({
            ...item,
            recognizedRevenue: Object.freeze(
              cloneMoney(item.recognizedRevenue),
            ),
          }),
        )
        .sort(
          (a, b) =>
            b.recognitionEvents - a.recognitionEvents
            || a.serviceKey.localeCompare(b.serviceKey),
        ),
    ),
    dataAuthority: Object.freeze({
      financial: "hub_events.request_billing_*",
      currentPipeline: "guest_requests.metadata_json",
      aiAttribution: "hub_events verified event chain",
      roomRevenueMetrics: "not_computed_without_pms_or_rms_source",
    }),
  });
}
