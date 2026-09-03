import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";

const rawBaseUrl = String(process.env.STAYHUB_620_BASE_URL || "").trim();
if (!rawBaseUrl) {
  throw new Error("STAYHUB_620_BASE_URL is required. Core heavy acceptance must target an exact Preview URL.");
}

const parsedBaseUrl = new URL(rawBaseUrl);
const hostname = parsedBaseUrl.hostname.toLowerCase();
if (hostname === "stayhub.app" || hostname.endsWith(".stayhub.app")) {
  throw new Error(`Production StayHub domains are forbidden for core heavy acceptance: ${hostname}`);
}

const baseUrl = rawBaseUrl.replace(/\/$/, "");
const prefix = String(process.env.STAYHUB_620_PREFIX || "factory-heavy-20260901");
const timeoutMs = Number(process.env.STAYHUB_620_TIMEOUT_MS || 60_000);
const hotelCount = 100;
const runId = String(process.env.STAYHUB_620_RUN_ID || `${prefix}-core-620-${Date.now()}`);
const requestP95Limit = Number(process.env.STAYHUB_620_REQUEST_P95_MS || 3_000);
const surveyP95Limit = Number(process.env.STAYHUB_620_SURVEY_P95_MS || 3_000);

function deterministicUuid(label, hotel, roomIndex) {
  const hash = createHash("md5").update(`${label}-${hotel}-${roomIndex}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20)}`;
}

const slug = (hotel) => `${prefix}-${String(hotel).padStart(3, "0")}-sandbox`;
const roomNumber = (roomIndex) => String(200 + roomIndex);

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
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function postOperation(kind, hotel, roomIndex) {
  const started = performance.now();
  const hotelSlug = slug(hotel);
  const room = roomNumber(roomIndex);
  const stayId = deterministicUuid("factory-heavy-stay", hotel, roomIndex);
  const stayDeviceId = deterministicUuid("factory-heavy-device", hotel, roomIndex);
  const marker = `${runId}:${kind}:h${hotel}:r${room}`;
  let status = 0;
  let body = null;
  let transportError = null;

  try {
    const route = kind === "request" ? "/api/guest/request-create" : "/api/guest/day3-survey";
    const payload = kind === "request"
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
      },
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
    status,
    ok: body?.ok === true,
    duplicate: body?.duplicate === true,
    id: body?.request?.id || body?.survey?.id || null,
    code: body?.code || null,
    error: transportError || body?.error || null,
    latencyMs: Number((performance.now() - started).toFixed(1)),
  };
}

const operations = [];
for (let hotel = 1; hotel <= hotelCount; hotel += 1) {
  for (let roomIndex = 1; roomIndex <= 4; roomIndex += 1) {
    operations.push(postOperation("request", hotel, roomIndex));
  }
  for (let roomIndex = 1; roomIndex <= 2; roomIndex += 1) {
    operations.push(postOperation("survey", hotel, roomIndex));
  }
}
for (let hotel = 1; hotel <= 20; hotel += 1) {
  operations.push(postOperation("request", hotel, 5));
}

if (operations.length !== 620) {
  throw new Error(`Expected exactly 620 core operations, got ${operations.length}`);
}

const startedAt = new Date().toISOString();
const wallStarted = performance.now();
const results = await Promise.all(operations);
const wallMs = Number((performance.now() - wallStarted).toFixed(1));

const requestRows = results.filter((row) => row.kind === "request");
const surveyRows = results.filter((row) => row.kind === "survey");
const request = summarize(requestRows);
const survey = summarize(surveyRows);
const surveyDuplicates = surveyRows.filter((row) => row.duplicate).length;

const correctnessAccepted =
  request.total === 420 &&
  survey.total === 200 &&
  request.failed === 0 &&
  survey.failed === 0 &&
  surveyDuplicates === 0;
const performanceAccepted =
  request.p95 <= requestP95Limit &&
  survey.p95 <= surveyP95Limit;

const output = {
  schemaVersion: "stayhub-factory-core-620-v1",
  runId,
  baseUrl,
  startedAt,
  totalOperations: results.length,
  wallMs,
  request,
  survey,
  surveyDuplicates,
  thresholdsMs: { requestP95Limit, surveyP95Limit },
  correctnessAccepted,
  performanceAccepted,
  accepted: correctnessAccepted && performanceAccepted,
  failures: results.filter((row) => !row.ok),
  results,
};

await writeFile("factory-core-620-results.json", `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ ...output, results: undefined }, null, 2));
if (!output.accepted) process.exitCode = 1;
