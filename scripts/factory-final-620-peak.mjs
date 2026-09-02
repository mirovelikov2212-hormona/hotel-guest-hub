import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";

const baseUrl = String(process.env.STAYHUB_620_BASE_URL || "https://www.stayhub.app").replace(/\/$/, "");
const prefix = String(process.env.STAYHUB_620_PREFIX || "factory-heavy-20260901");
const timeoutMs = Number(process.env.STAYHUB_620_TIMEOUT_MS || 60_000);
const hotelCount = 100;
const runId = String(process.env.STAYHUB_620_RUN_ID || `${prefix}-final-620-${Date.now()}`);
const availabilityFromDate = String(process.env.STAYHUB_620_FROM_DATE || new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
const serviceId = String(process.env.STAYHUB_620_MASSAGE_SERVICE || "load_massage");
const requestP95Limit = Number(process.env.STAYHUB_620_REQUEST_P95_MS || 3_000);
const surveyP95Limit = Number(process.env.STAYHUB_620_SURVEY_P95_MS || 3_000);
const massageP95Limit = Number(process.env.STAYHUB_620_MASSAGE_P95_MS || 4_500);

function deterministicUuid(label, hotel, room) {
  const hash = createHash("md5").update(`${label}-${hotel}-${room}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20)}`;
}

const slug = (hotel) => `${prefix}-${String(hotel).padStart(3, "0")}-sandbox`;
const roomNumber = (room) => String(200 + room);

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

async function discoverAllMassageSlots() {
  const hotels = Array.from({ length: hotelCount }, (_, index) => index + 1);
  const results = [];
  const workers = Array.from({ length: 10 }, async () => {
    while (hotels.length) {
      const hotel = hotels.shift();
      if (!hotel) return;
      results.push(await discoverMassageSlots(hotel));
    }
  });
  await Promise.all(workers);
  results.sort((a, b) => a.hotel - b.hotel);
  const firstHotel = results[0];
  if (!firstHotel || firstHotel.slots.length < 2) {
    throw new Error("Hotel 1 needs at least two currently unused massage slots for unique + contention phases");
  }
  return results;
}

async function postOperation(kind, hotel, room, slot = null) {
  const started = performance.now();
  const hotelSlug = slug(hotel);
  const room = roomNumber(room);
  const stayId = deterministicUuid("factory-heavy-stay", hotel, Number(room) - 200);
  const stayDeviceId = deterministicUuid("factory-heavy-device", hotel, Number(room) - 200);
  const marker = `${runId}:${kind}:h${hotel}:r${room}`;
  let status = 0;
  let body = null;
  let transportError = null;
  try {
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
      headers: { "content-type": "application/json", "x-stayhub-load-run": runId },
      body: JSON.stringify(payload),
    });
    status = result.response.status;
    body = result.body;
  } catch (error) {
    transportError = error instanceof Error ? error.message : String(error);
  }
  return {
    kind,
    hotel,
    hotelSlug,
    room,
    marker,
    slot,
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

const preflightStartedAt = new Date().toISOString();
const slotPlans = await discoverAllMassageSlots();
const slotByHotel = new Map(slotPlans.map((row) => [row.hotel, row.slots[0]]));
const contentionSlot = slotPlans[0].slots.find((slot) =>
  slot.date !== slotPlans[0].slots[0].date || slot.time !== slotPlans[0].slots[0].time,
);
if (!contentionSlot) throw new Error("Could not select a second unused contention slot for hotel 1");

const operations = [];
for (let hotel = 1; hotel <= hotelCount; hotel += 1) {
  for (let room = 1; room <= 3; room += 1) operations.push(postOperation("request", hotel, room));
  for (let room = 1; room <= 2; room += 1) operations.push(postOperation("survey", hotel, room));
  operations.push(postOperation("massage_unique", hotel, 1, slotByHotel.get(hotel)));
}
for (let room = 1; room <= 20; room += 1) {
  operations.push(postOperation("massage_contention", 1, room, contentionSlot));
}

if (operations.length !== 620) throw new Error(`Expected exactly 620 operations, got ${operations.length}`);

const startedAt = new Date().toISOString();
const wallStarted = performance.now();
const results = await Promise.all(operations);
const wallMs = Number((performance.now() - wallStarted).toFixed(1));

const requestRows = results.filter((row) => row.kind === "request");
const surveyRows = results.filter((row) => row.kind === "survey");
const massageUniqueRows = results.filter((row) => row.kind === "massage_unique");
const contentionRows = results.filter((row) => row.kind === "massage_contention");
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
  contentionWinners.length === 1 &&
  contentionRejected.length === 19 &&
  contentionUnexpected.length === 0;
const performanceAccepted =
  request.p95 <= requestP95Limit &&
  survey.p95 <= surveyP95Limit &&
  massageUnique.p95 <= massageP95Limit;

const output = {
  schemaVersion: "stayhub-factory-final-620-v2",
  runId,
  baseUrl,
  preflightStartedAt,
  startedAt,
  availabilityFromDate,
  totalOperations: results.length,
  wallMs,
  request,
  survey,
  massageUnique,
  massageContention: {
    ...massageContention,
    winners: contentionWinners.length,
    expectedRejected: contentionRejected.length,
    unexpected: contentionUnexpected.length,
  },
  thresholdsMs: { requestP95Limit, surveyP95Limit, massageP95Limit },
  correctnessAccepted,
  performanceAccepted,
  accepted: correctnessAccepted && performanceAccepted,
  selectedMassageSlots: slotPlans.map((row) => ({ hotel: row.hotel, slot: row.slots[0] })),
  contentionSlot,
  failures: results.filter((row) => !row.ok && row.kind !== "massage_contention"),
  contentionUnexpected,
  results,
};

await writeFile("factory-final-620-results.json", `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ ...output, results: undefined, selectedMassageSlots: undefined }, null, 2));
if (!output.accepted) process.exitCode = 1;
