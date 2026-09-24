import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";

const baseUrl = String(
  process.env.STAYHUB_SYSTEM_TEST_BASE_URL ||
  "https://hotel-guest-hub-git-feat-hote-5f757d-miroslav-velikovs-projects.vercel.app",
).replace(/\/$/, "");
const prefix = String(process.env.STAYHUB_SYSTEM_TEST_PREFIX || "factory-heavy-20260901");
const timeoutMs = Number(process.env.STAYHUB_SYSTEM_TEST_TIMEOUT_MS || 30_000);
const runId = String(process.env.STAYHUB_SYSTEM_TEST_RUN_ID || `system-wave3-${Date.now()}`);
const serviceId = String(process.env.STAYHUB_SYSTEM_MASSAGE_SERVICE || "load_massage");

const slug = (hotel) => `${prefix}-${String(hotel).padStart(3, "0")}-sandbox`;

async function fetchJson(url, init = {}) {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.json().catch(() => null);
    return {
      status: response.status,
      body,
      latencyMs: Number((performance.now() - started).toFixed(1)),
      transportError: null,
    };
  } catch (error) {
    return {
      status: 0,
      body: null,
      latencyMs: Number((performance.now() - started).toFixed(1)),
      transportError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function confirmStay(hotel, room, suffix) {
  const hotelSlug = slug(hotel);
  if (!hotelSlug.endsWith("-sandbox")) {
    throw new Error(`Refusing non-sandbox identity: ${hotelSlug}`);
  }
  const result = await fetchJson(`${baseUrl}/api/guest/stay/confirm`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-stayhub-load-run": runId,
    },
    body: JSON.stringify({
      hotelSlug,
      room,
      checkInDate: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
      checkOutDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
      deviceToken: `${runId}:${suffix}`,
      language: "en",
    }),
  });
  const stay = result.body?.stay || {};
  if (
    result.status < 200 ||
    result.status >= 300 ||
    result.body?.ok !== true ||
    typeof stay.id !== "string" ||
    typeof stay.stayDeviceId !== "string"
  ) {
    throw new Error(
      `stay bootstrap failed for ${hotelSlug}/${room}: HTTP ${result.status} ${result.body?.error || result.transportError || "unknown"}`,
    );
  }
  return {
    hotel,
    hotelSlug,
    room,
    stayId: stay.id,
    stayDeviceId: stay.stayDeviceId,
  };
}

async function postRequest(identity, label, overrides = {}) {
  const result = await fetchJson(`${baseUrl}/api/guest/request-create`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-stayhub-load-run": runId,
    },
    body: JSON.stringify({
      hotelSlug: identity.hotelSlug,
      room: identity.room,
      type: "extra-towel",
      typeLabel: label,
      sourceRequestDef: "extra-towel",
      serviceTime: "now",
      guestLanguage: "en",
      stayId: identity.stayId,
      stayDeviceId: identity.stayDeviceId,
      ...overrides,
    }),
  });
  return {
    status: result.status,
    ok: result.body?.ok === true,
    id: result.body?.request?.id || null,
    code: result.body?.code || null,
    latencyMs: result.latencyMs,
    transportError: result.transportError,
  };
}

async function postSurvey(identity) {
  const result = await fetchJson(`${baseUrl}/api/guest/day3-survey`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-stayhub-load-run": runId,
    },
    body: JSON.stringify({
      hotelSlug: identity.hotelSlug,
      room: identity.room,
      stayId: identity.stayId,
      stayDeviceId: identity.stayDeviceId,
      launchSource: "manual_force",
      rating: 5,
      language: "en",
      surveyVersion: "day3-v1",
      loadRunId: runId,
    }),
  });
  return {
    status: result.status,
    ok: result.body?.ok === true,
    id: result.body?.survey?.id || null,
    duplicate: result.body?.duplicate === true,
    code: result.body?.code || null,
    latencyMs: result.latencyMs,
    transportError: result.transportError,
  };
}

async function discoverMassageSlot(hotel) {
  const hotelSlug = slug(hotel);
  const fromDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    hotelSlug,
    action: "bookable_dates",
    serviceId,
    fromDate,
    daysAhead: "30",
  });
  const result = await fetchJson(`${baseUrl}/api/guest/massages?${params}`);
  const dates = Array.isArray(result.body?.result?.dates) ? result.body.result.dates : [];
  const slots = dates.flatMap((entry) =>
    Array.isArray(entry?.availableTimes)
      ? entry.availableTimes.map((time) => ({ date: String(entry.date), time: String(time) }))
      : [],
  );
  if (result.status < 200 || result.status >= 300 || result.body?.ok !== true || slots.length === 0) {
    throw new Error(
      `massage slot discovery failed for ${hotelSlug}: HTTP ${result.status} ${result.body?.code || result.transportError || "no_slots"}`,
    );
  }
  return slots[0];
}

async function postMassage(identity, slot) {
  const result = await fetchJson(`${baseUrl}/api/guest/massages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-stayhub-load-run": runId,
    },
    body: JSON.stringify({
      hotelSlug: identity.hotelSlug,
      room: identity.room,
      roomConfirmed: true,
      serviceId,
      date: slot.date,
      time: slot.time,
      stayId: identity.stayId,
      stayDeviceId: identity.stayDeviceId,
      guestLanguage: "en",
    }),
  });
  return {
    status: result.status,
    ok: result.body?.ok === true,
    code: result.body?.code || null,
    bookingStatus: result.body?.result?.status || null,
    id: result.body?.result?.nativeBookingId || result.body?.staffRequest?.id || null,
    latencyMs: result.latencyMs,
    transportError: result.transportError,
  };
}

async function runSurveyRetryRace() {
  const identity = await confirmStay(80, "201", "survey-race");
  const results = await Promise.all(Array.from({ length: 10 }, () => postSurvey(identity)));
  const ids = results.map((row) => row.id).filter(Boolean);
  const uniqueIds = new Set(ids);
  const primary = results.filter((row) => row.ok && !row.duplicate);
  const duplicates = results.filter((row) => row.ok && row.duplicate);
  const accepted =
    results.every((row) => row.ok && row.status >= 200 && row.status < 300) &&
    primary.length === 1 &&
    duplicates.length === 9 &&
    uniqueIds.size === 1;

  return {
    scenario: "survey-concurrent-retry",
    total: results.length,
    primaryWrites: primary.length,
    duplicateRecoveries: duplicates.length,
    uniqueSurveyIds: uniqueIds.size,
    accepted,
    results,
  };
}

async function runMassageSlotRace() {
  const hotel = 63;
  const slot = await discoverMassageSlot(hotel);
  const identities = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      confirmStay(hotel, "201", `massage-race-${index + 1}`),
    ),
  );
  const results = await Promise.all(identities.map((identity) => postMassage(identity, slot)));
  const winners = results.filter((row) => row.ok && row.status >= 200 && row.status < 300);
  const conflicts = results.filter(
    (row) =>
      !row.ok &&
      row.status === 409 &&
      (row.code === "MASSAGE_SLOT_UNAVAILABLE" || row.code === "MASSAGE_IDEMPOTENCY_KEY_REUSED"),
  );
  const unexpected = results.filter(
    (row) => !winners.includes(row) && !conflicts.includes(row),
  );
  const accepted = winners.length === 1 && conflicts.length === 2 && unexpected.length === 0;

  return {
    scenario: "massage-same-slot-3-way-race",
    hotelSlug: slug(hotel),
    slot,
    total: results.length,
    winners: winners.length,
    expectedConflicts: conflicts.length,
    unexpected: unexpected.length,
    accepted,
    results,
  };
}

async function runUniqueRequestBurst() {
  const hotel = 82;
  const rooms = ["201", "202", "203"];
  const identities = await Promise.all(
    rooms.map((room) => confirmStay(hotel, room, `request-burst-${room}`)),
  );
  const byRoom = new Map(identities.map((identity) => [identity.room, identity]));
  const tasks = Array.from({ length: 50 }, (_, index) => {
    const room = rooms[index % rooms.length];
    return postRequest(
      byRoom.get(room),
      `${runId}:unique-request-burst:${String(index + 1).padStart(3, "0")}`,
    );
  });
  const results = await Promise.all(tasks);
  const ids = results.map((row) => row.id).filter(Boolean);
  const accepted =
    results.every((row) => row.ok && row.status >= 200 && row.status < 300) &&
    ids.length === 50 &&
    new Set(ids).size === 50;

  return {
    scenario: "unique-request-burst-50",
    total: results.length,
    successful: results.filter((row) => row.ok).length,
    uniqueIds: new Set(ids).size,
    accepted,
    results,
  };
}

async function runConcurrentTenantAttack() {
  const attacker = await confirmStay(65, "201", "tenant-attack-a");
  const validTarget = await confirmStay(66, "201", "tenant-attack-b");

  const foreignTasks = Array.from({ length: 20 }, (_, index) =>
    postRequest(attacker, `${runId}:foreign:${index + 1}`, {
      hotelSlug: validTarget.hotelSlug,
    }),
  );
  const validTasks = Array.from({ length: 20 }, (_, index) =>
    postRequest(validTarget, `${runId}:valid-target:${index + 1}`),
  );

  const [foreign, valid] = await Promise.all([
    Promise.all(foreignTasks),
    Promise.all(validTasks),
  ]);

  const foreignRejected = foreign.filter(
    (row) => !row.ok && row.status >= 400 && row.status < 500,
  );
  const validAccepted = valid.filter(
    (row) => row.ok && row.status >= 200 && row.status < 300,
  );
  const accepted =
    foreignRejected.length === foreign.length &&
    validAccepted.length === valid.length &&
    foreign.every((row) => row.status < 500) &&
    valid.every((row) => row.status < 500);

  return {
    scenario: "concurrent-cross-tenant-attack-with-valid-traffic",
    foreignAttempts: foreign.length,
    foreignRejected: foreignRejected.length,
    validAttempts: valid.length,
    validAccepted: validAccepted.length,
    accepted,
    foreign,
    valid,
  };
}

const startedAt = new Date().toISOString();
const scenarios = [];

for (const [name, runner] of [
  ["survey-concurrent-retry", runSurveyRetryRace],
  ["massage-same-slot-3-way-race", runMassageSlotRace],
  ["unique-request-burst-50", runUniqueRequestBurst],
  ["concurrent-cross-tenant-attack-with-valid-traffic", runConcurrentTenantAttack],
]) {
  try {
    scenarios.push(await runner());
  } catch (error) {
    scenarios.push({
      scenario: name,
      accepted: false,
      harnessError: error instanceof Error ? error.message : String(error),
    });
  }
}

const accepted = scenarios.every((scenario) => scenario.accepted);
const evidence = {
  schemaVersion: "gostaya-system-concurrency-wave3-v2",
  runId,
  baseUrl,
  startedAt,
  completedAt: new Date().toISOString(),
  sandboxOnly: true,
  scenarioSummaries: scenarios.map((scenario) => {
    const { results, foreign, valid, ...summary } = scenario;
    return summary;
  }),
  accepted,
  scenarios,
};

await writeFile(
  "system-concurrency-wave3-results.json",
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(JSON.stringify({
  ...evidence,
  scenarios: undefined,
}, null, 2));

if (!accepted) process.exitCode = 1;
