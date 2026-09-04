import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";

const baseUrl = String(process.env.STAYHUB_620_BASE_URL || "https://www.stayhub.app").replace(/\/$/, "");
const prefix = String(process.env.STAYHUB_620_PREFIX || "factory-heavy-20260901");
const timeoutMs = Number(process.env.STAYHUB_620_TIMEOUT_MS || 60_000);
const runId = String(process.env.STAYHUB_620_RUN_ID || `${prefix}-final-620-grouped-${Date.now()}`);
const availabilityFromDate = String(process.env.STAYHUB_620_FROM_DATE || new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
const serviceId = String(process.env.STAYHUB_620_MASSAGE_SERVICE || "load_massage");
const requestP95Limit = Number(process.env.STAYHUB_620_REQUEST_P95_MS || 3_000);
const surveyP95Limit = Number(process.env.STAYHUB_620_SURVEY_P95_MS || 3_000);
const massageP95Limit = Number(process.env.STAYHUB_620_MASSAGE_P95_MS || 4_500);
const groupCooldownMs = Number(process.env.STAYHUB_620_GROUP_COOLDOWN_MS || 2_000);
const slotPreflightWorkers = Number(process.env.STAYHUB_620_SLOT_PREFLIGHT_WORKERS || 4);
const identityPreflightWorkers = Number(process.env.STAYHUB_620_IDENTITY_PREFLIGHT_WORKERS || 8);

function dateKeyOffset(days) {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

const stayCheckInDate = String(process.env.STAYHUB_620_STAY_CHECK_IN_DATE || dateKeyOffset(-1));
const stayCheckOutDate = String(process.env.STAYHUB_620_STAY_CHECK_OUT_DATE || dateKeyOffset(2));

// Exact live Sandbox cell membership captured immediately before the final acceptance.
// The harness validates that these groups contain every synthetic factory-heavy hotel 1..100 exactly once.
const cellGroups = [
  {
    cellKey: "sandbox-standard-01",
    hotels: [6, 16, 20, 21, 23, 28, 31, 44, 64, 72, 75, 77, 78, 86, 89, 91],
  },
  {
    cellKey: "sandbox-standard-02",
    hotels: [5, 8, 14, 17, 18, 27, 47, 50, 56, 60, 63, 70, 79, 94, 95, 96, 98],
  },
  {
    cellKey: "sandbox-standard-03",
    hotels: [15, 26, 33, 34, 35, 36, 39, 45, 46, 54, 59, 65, 66, 74, 82, 93, 99],
  },
  {
    cellKey: "sandbox-standard-04",
    hotels: [7, 10, 30, 32, 37, 41, 43, 48, 49, 53, 55, 62, 68, 73, 80, 87, 88],
  },
  {
    cellKey: "sandbox-standard-05",
    hotels: [1, 3, 11, 24, 25, 38, 40, 52, 57, 61, 67, 69, 81, 83, 90, 92, 100],
  },
  {
    cellKey: "sandbox-standard-06",
    hotels: [2, 4, 9, 12, 13, 19, 22, 29, 42, 51, 58, 71, 76, 84, 85, 97],
  },
];

function validateCellGroups() {
  const hotels = cellGroups.flatMap((group) => group.hotels);
  const unique = new Set(hotels);
  const expected = Array.from({ length: 100 }, (_, index) => index + 1);
  const actual = [...unique].sort((a, b) => a - b);
  if (cellGroups.length !== 6) throw new Error(`Expected 6 Sandbox cell groups, got ${cellGroups.length}`);
  if (hotels.length !== 100 || unique.size !== 100) {
    throw new Error(`Expected exactly 100 unique synthetic hotels, got ${hotels.length} entries / ${unique.size} unique`);
  }
  if (actual.some((hotel, index) => hotel !== expected[index])) {
    throw new Error("Cell manifest must cover synthetic hotels 1..100 exactly once");
  }
  const hotelOneGroups = cellGroups.filter((group) => group.hotels.includes(1));
  if (hotelOneGroups.length !== 1 || hotelOneGroups[0].cellKey !== "sandbox-standard-05") {
    throw new Error("Hotel 1 must belong to sandbox-standard-05 for the contention phase");
  }
}

validateCellGroups();

const slug = (hotel) => `${prefix}-${String(hotel).padStart(3, "0")}-sandbox`;
const roomNumber = (roomIndex) => String(200 + roomIndex);
const identityKey = (hotel, roomIndex) => `${hotel}:${roomIndex}`;

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil((sorted.length * p) / 100) - 1)].toFixed(1));
}

function summarize(rows) {
  const latencies = rows.map((row) => row.latencyMs);
  return {
    total: rows.length,
    successful: rows.filter((row) => row.ok).length,
    failed: rows.filter((row) => !row.ok).length,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    max: latencies.length ? Number(Math.max(...latencies).toFixed(1)) : null,
  };
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  const body = await response.json().catch(() => null);
  return { response, body };
}

function buildIdentitySpecs(group) {
  const specs = [];
  const seen = new Set();
  const add = (hotel, roomIndex) => {
    const key = identityKey(hotel, roomIndex);
    if (seen.has(key)) return;
    seen.add(key);
    specs.push({ hotel, roomIndex });
  };

  for (const hotel of group.hotels) {
    for (let roomIndex = 1; roomIndex <= 3; roomIndex += 1) add(hotel, roomIndex);
  }
  if (group.hotels.includes(1)) {
    for (let roomIndex = 1; roomIndex <= 20; roomIndex += 1) add(1, roomIndex);
  }
  return specs;
}

async function confirmStayIdentity(hotel, roomIndex, cellKey) {
  const started = performance.now();
  const hotelSlug = slug(hotel);
  const room = roomNumber(roomIndex);
  if (!hotelSlug.endsWith("-sandbox")) {
    throw new Error(`Refusing identity preflight outside Sandbox: ${hotelSlug}`);
  }

  const deviceToken = `${runId}:identity:h${hotel}:r${room}`;
  const { response, body } = await fetchJson(`${baseUrl}/api/guest/stay/confirm`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-stayhub-load-run": runId,
      "x-stayhub-load-cell": cellKey,
    },
    body: JSON.stringify({
      hotelSlug,
      room,
      checkInDate: stayCheckInDate,
      checkOutDate: stayCheckOutDate,
      deviceToken,
      language: "en",
    }),
  });

  const stay = body?.stay || {};
  const stayId = typeof stay.id === "string" ? stay.id : null;
  const stayDeviceId = typeof stay.stayDeviceId === "string" ? stay.stayDeviceId : null;
  if (!response.ok || body?.ok !== true || !stayId || !stayDeviceId) {
    throw new Error(
      `${cellKey}: stay bootstrap failed for ${hotelSlug} room ${room}: HTTP ${response.status} ${body?.error || "invalid_stay_identity"}`,
    );
  }

  return {
    cellKey,
    hotel,
    hotelSlug,
    roomIndex,
    room,
    deviceToken,
    stayId,
    stayDeviceId,
    status: response.status,
    latencyMs: Number((performance.now() - started).toFixed(1)),
  };
}

async function bootstrapGroupStayIdentities(group) {
  const pending = buildIdentitySpecs(group);
  const rows = [];
  const workers = Array.from(
    { length: Math.max(1, Math.min(identityPreflightWorkers, pending.length)) },
    async () => {
      while (pending.length) {
        const spec = pending.shift();
        if (!spec) return;
        rows.push(await confirmStayIdentity(spec.hotel, spec.roomIndex, group.cellKey));
      }
    },
  );
  await Promise.all(workers);
  rows.sort((a, b) => a.hotel - b.hotel || a.roomIndex - b.roomIndex);
  return rows;
}

function parseClockMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function slotsDoNotOverlap(uniqueSlot, candidateSlot, occupancyMinutes) {
  if (!uniqueSlot || !candidateSlot) return false;
  if (candidateSlot.date !== uniqueSlot.date) return true;
  const uniqueStart = parseClockMinutes(uniqueSlot.time);
  const candidateStart = parseClockMinutes(candidateSlot.time);
  if (uniqueStart == null || candidateStart == null) return false;
  return candidateStart >= uniqueStart + occupancyMinutes;
}

async function discoverMassageServiceOccupancy(hotel) {
  const hotelSlug = slug(hotel);
  const params = new URLSearchParams({ hotelSlug, action: "services" });
  const { response, body } = await fetchJson(`${baseUrl}/api/guest/massages?${params}`);
  const services = Array.isArray(body?.result?.services) ? body.result.services : [];
  const service = services.find((candidate) => String(candidate?.serviceId || "") === serviceId);
  const durationMinutes = Number(service?.durationMinutes);
  const bufferMinutes = Number(service?.bufferMinutes || 0);
  if (
    !response.ok ||
    body?.ok !== true ||
    !service ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    !Number.isInteger(bufferMinutes) ||
    bufferMinutes < 0
  ) {
    throw new Error(`Service preflight failed for ${hotelSlug}: HTTP ${response.status} ${body?.code || "invalid_service_runtime"}`);
  }
  return {
    durationMinutes,
    bufferMinutes,
    occupancyMinutes: durationMinutes + bufferMinutes,
  };
}

async function discoverMassageSlots(hotel) {
  const hotelSlug = slug(hotel);
  const params = new URLSearchParams({
    hotelSlug,
    action: "bookable_dates",
    serviceId,
    fromDate: availabilityFromDate,
    daysAhead: "14",
  });
  const { response, body } = await fetchJson(`${baseUrl}/api/guest/massages?${params}`);
  if (!response.ok || body?.ok !== true || !Array.isArray(body?.result?.dates)) {
    throw new Error(`Availability preflight failed for ${hotelSlug}: HTTP ${response.status} ${body?.code || "unknown"}`);
  }
  const slots = body.result.dates.flatMap((entry) =>
    Array.isArray(entry?.availableTimes)
      ? entry.availableTimes.map((time) => ({ date: String(entry.date), time: String(time) }))
      : [],
  );
  if (!slots.length) throw new Error(`No unused massage slot available for ${hotelSlug}`);
  return { hotel, hotelSlug, slots };
}

async function discoverMassageSlotsForGroup(hotels) {
  const pending = [...hotels];
  const results = [];
  const workers = Array.from({ length: Math.max(1, Math.min(slotPreflightWorkers, hotels.length)) }, async () => {
    while (pending.length) {
      const hotel = pending.shift();
      if (!hotel) return;
      results.push(await discoverMassageSlots(hotel));
    }
  });
  await Promise.all(workers);
  results.sort((a, b) => a.hotel - b.hotel);
  return results;
}

async function postOperation(kind, hotel, roomIndex, identity, slot = null, cellKey = null) {
  const started = performance.now();
  const hotelSlug = slug(hotel);
  const room = roomNumber(roomIndex);
  const stayId = identity?.stayId || null;
  const stayDeviceId = identity?.stayDeviceId || null;
  const marker = `${runId}:${cellKey || "unknown-cell"}:${kind}:h${hotel}:r${room}`;
  let status = 0;
  let body = null;
  let transportError = null;
  try {
    if (!stayId || !stayDeviceId) throw new Error(`Missing preflight stay identity for ${hotelSlug} room ${room}`);
    const massage = kind.startsWith("massage");
    const route = massage ? "/api/guest/massages" : kind === "request" ? "/api/guest/request-create" : "/api/guest/day3-survey";
    const payload = massage
      ? {
          hotelSlug,
          room,
          roomConfirmed: true,
          serviceId,
          date: slot.date,
          time: slot.time,
          stayId,
          stayDeviceId,
          guestLanguage: "en",
        }
      : kind === "request"
        ? {
            hotelSlug,
            room,
            type: "extra-towel",
            typeLabel: marker,
            sourceRequestDef: "extra-towel",
            serviceTime: "now",
            guestLanguage: "en",
            stayId,
            stayDeviceId,
          }
        : {
            hotelSlug,
            room,
            stayId,
            stayDeviceId,
            launchSource: "manual_force",
            rating: 5,
            language: "en",
            surveyVersion: "day3-v1",
            loadRunId: runId,
          };
    const result = await fetchJson(`${baseUrl}${route}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-stayhub-load-run": runId,
        "x-stayhub-load-cell": cellKey || "unknown-cell",
      },
      body: JSON.stringify(payload),
    });
    status = result.response.status;
    body = result.body;
  } catch (error) {
    transportError = error instanceof Error ? error.message : String(error);
  }
  return {
    cellKey,
    kind,
    hotel,
    hotelSlug,
    room,
    marker,
    slot,
    stayId,
    stayDeviceId,
    status,
    ok: body?.ok === true,
    duplicate: body?.duplicate === true,
    replay: body?.result?.idempotentReplay === true,
    id: body?.request?.id || body?.survey?.id || body?.result?.nativeBookingId || null,
    code: body?.code || null,
    error: transportError || body?.error || null,
    latencyMs: Number((performance.now() - started).toFixed(1)),
  };
}

function evaluateGroup(cellKey, hotels, rows, groupWallMs, contentionExpected) {
  const requestRows = rows.filter((row) => row.kind === "request");
  const surveyRows = rows.filter((row) => row.kind === "survey");
  const massageUniqueRows = rows.filter((row) => row.kind === "massage_unique");
  const contentionRows = rows.filter((row) => row.kind === "massage_contention");
  const request = summarize(requestRows);
  const survey = summarize(surveyRows);
  const massageUnique = summarize(massageUniqueRows);
  const massageContention = summarize(contentionRows);
  const contentionWinners = contentionRows.filter((row) => row.ok && !row.replay);
  const contentionRejected = contentionRows.filter((row) => !row.ok && row.status === 409);
  const contentionUnexpected = contentionRows.filter((row) => !row.ok && row.status !== 409);

  const correctnessAccepted =
    request.failed === 0 &&
    survey.failed === 0 &&
    massageUnique.failed === 0 &&
    (!contentionExpected ||
      (contentionWinners.length === 1 && contentionRejected.length === 19 && contentionUnexpected.length === 0));
  const performanceAccepted =
    request.p95 <= requestP95Limit &&
    survey.p95 <= surveyP95Limit &&
    massageUnique.p95 <= massageP95Limit;

  return {
    cellKey,
    hotels,
    hotelCount: hotels.length,
    totalOperations: rows.length,
    wallMs: groupWallMs,
    request,
    survey,
    massageUnique,
    massageContention: {
      ...massageContention,
      winners: contentionWinners.length,
      expectedRejected: contentionRejected.length,
      unexpected: contentionUnexpected.length,
    },
    correctnessAccepted,
    performanceAccepted,
    accepted: correctnessAccepted && performanceAccepted,
    failures: rows.filter((row) => !row.ok && row.kind !== "massage_contention"),
    contentionUnexpected,
  };
}

async function writeEvidence(partial) {
  await writeFile("factory-final-620-results.json", `${JSON.stringify(partial, null, 2)}\n`);
}

const preflightStartedAt = new Date().toISOString();
const startedAt = new Date().toISOString();
const overallWallStarted = performance.now();
const allResults = [];
const groups = [];
const selectedMassageSlots = [];
const identityPreflight = [];
let massageServiceRuntime = null;
let contentionSlot = null;
let failedGroup = null;

for (let groupIndex = 0; groupIndex < cellGroups.length; groupIndex += 1) {
  const group = cellGroups[groupIndex];

  const identityWallStarted = performance.now();
  const identityRows = await bootstrapGroupStayIdentities(group);
  const identityWallMs = Number((performance.now() - identityWallStarted).toFixed(1));
  const identityByKey = new Map(identityRows.map((row) => [identityKey(row.hotel, row.roomIndex), row]));
  identityPreflight.push({
    cellKey: group.cellKey,
    total: identityRows.length,
    successful: identityRows.length,
    wallMs: identityWallMs,
    results: identityRows,
  });

  const slotPlans = await discoverMassageSlotsForGroup(group.hotels);
  const slotByHotel = new Map(slotPlans.map((row) => [row.hotel, row.slots[0]]));
  selectedMassageSlots.push(...slotPlans.map((row) => ({ cellKey: group.cellKey, hotel: row.hotel, slot: row.slots[0] })));

  if (group.hotels.includes(1)) {
    massageServiceRuntime = await discoverMassageServiceOccupancy(1);
    const hotelOnePlan = slotPlans.find((row) => row.hotel === 1);
    const uniqueSlot = hotelOnePlan?.slots?.[0] || null;
    contentionSlot = hotelOnePlan?.slots?.find((slot) =>
      slotsDoNotOverlap(uniqueSlot, slot, massageServiceRuntime.occupancyMinutes),
    );
    if (!uniqueSlot || !contentionSlot) {
      throw new Error(
        `Hotel 1 needs two non-overlapping unused massage slots for unique + contention phases (${massageServiceRuntime.occupancyMinutes} minute occupancy)`,
      );
    }
  }

  const groupWallStarted = performance.now();
  const operations = [];
  for (const hotel of group.hotels) {
    for (let roomIndex = 1; roomIndex <= 3; roomIndex += 1) {
      operations.push(
        postOperation(
          "request",
          hotel,
          roomIndex,
          identityByKey.get(identityKey(hotel, roomIndex)),
          null,
          group.cellKey,
        ),
      );
    }
    for (let roomIndex = 1; roomIndex <= 2; roomIndex += 1) {
      operations.push(
        postOperation(
          "survey",
          hotel,
          roomIndex,
          identityByKey.get(identityKey(hotel, roomIndex)),
          null,
          group.cellKey,
        ),
      );
    }
    operations.push(
      postOperation(
        "massage_unique",
        hotel,
        1,
        identityByKey.get(identityKey(hotel, 1)),
        slotByHotel.get(hotel),
        group.cellKey,
      ),
    );
  }
  if (group.hotels.includes(1)) {
    for (let roomIndex = 1; roomIndex <= 20; roomIndex += 1) {
      operations.push(
        postOperation(
          "massage_contention",
          1,
          roomIndex,
          identityByKey.get(identityKey(1, roomIndex)),
          contentionSlot,
          group.cellKey,
        ),
      );
    }
  }

  const expectedOperations = group.hotels.length * 6 + (group.hotels.includes(1) ? 20 : 0);
  if (operations.length !== expectedOperations) {
    throw new Error(`${group.cellKey}: expected ${expectedOperations} operations, got ${operations.length}`);
  }

  const rows = await Promise.all(operations);
  const groupWallMs = Number((performance.now() - groupWallStarted).toFixed(1));
  allResults.push(...rows);

  const summary = {
    ...evaluateGroup(group.cellKey, group.hotels, rows, groupWallMs, group.hotels.includes(1)),
    identityPreflight: {
      total: identityRows.length,
      successful: identityRows.length,
      wallMs: identityWallMs,
    },
  };
  groups.push(summary);
  console.log(JSON.stringify({ phase: "cell-complete", ...summary }, null, 2));

  if (!summary.accepted) {
    failedGroup = group.cellKey;
    break;
  }
  if (groupIndex < cellGroups.length - 1 && groupCooldownMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, groupCooldownMs));
  }
}

const wallMs = Number((performance.now() - overallWallStarted).toFixed(1));
const requestRows = allResults.filter((row) => row.kind === "request");
const surveyRows = allResults.filter((row) => row.kind === "survey");
const massageUniqueRows = allResults.filter((row) => row.kind === "massage_unique");
const contentionRows = allResults.filter((row) => row.kind === "massage_contention");
const request = summarize(requestRows);
const survey = summarize(surveyRows);
const massageUnique = summarize(massageUniqueRows);
const massageContention = summarize(contentionRows);
const contentionWinners = contentionRows.filter((row) => row.ok && !row.replay);
const contentionRejected = contentionRows.filter((row) => !row.ok && row.status === 409);
const contentionUnexpected = contentionRows.filter((row) => !row.ok && row.status !== 409);

const completedAllGroups = groups.length === cellGroups.length && failedGroup === null;
const correctnessAccepted =
  completedAllGroups &&
  request.total === 300 && request.failed === 0 &&
  survey.total === 200 && survey.failed === 0 &&
  massageUnique.total === 100 && massageUnique.failed === 0 &&
  contentionRows.length === 20 &&
  contentionWinners.length === 1 &&
  contentionRejected.length === 19 &&
  contentionUnexpected.length === 0;
const performanceAccepted =
  completedAllGroups &&
  groups.every((group) => group.performanceAccepted) &&
  request.p95 <= requestP95Limit &&
  survey.p95 <= surveyP95Limit &&
  massageUnique.p95 <= massageP95Limit;

const output = {
  schemaVersion: "stayhub-factory-final-620-grouped-v5",
  runId,
  baseUrl,
  preflightStartedAt,
  startedAt,
  completedAt: new Date().toISOString(),
  availabilityFromDate,
  stayCheckInDate,
  stayCheckOutDate,
  executionMode: "sequential-runtime-cells",
  totalOperations: allResults.length,
  expectedTotalOperations: 620,
  wallMs,
  groupCooldownMs,
  cellManifest: cellGroups,
  groups,
  failedGroup,
  request,
  survey,
  massageUnique,
  massageContention: {
    ...massageContention,
    winners: contentionWinners.length,
    expectedRejected: contentionRejected.length,
    unexpected: contentionUnexpected.length,
  },
  massageServiceRuntime,
  thresholdsMs: { requestP95Limit, surveyP95Limit, massageP95Limit },
  correctnessAccepted,
  performanceAccepted,
  accepted: correctnessAccepted && performanceAccepted,
  identityPreflight,
  selectedMassageSlots,
  contentionSlot,
  failures: allResults.filter((row) => !row.ok && row.kind !== "massage_contention"),
  contentionUnexpected,
  results: allResults,
};

await writeEvidence(output);
console.log(
  JSON.stringify(
    {
      ...output,
      identityPreflight: identityPreflight.map((row) => ({
        cellKey: row.cellKey,
        total: row.total,
        successful: row.successful,
        wallMs: row.wallMs,
      })),
      results: undefined,
      selectedMassageSlots: undefined,
    },
    null,
    2,
  ),
);
if (!output.accepted) process.exitCode = 1;
