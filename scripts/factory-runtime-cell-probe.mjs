import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";

const rawBaseUrl = String(process.env.STAYHUB_CELL_PROBE_BASE_URL || "").trim();
if (!rawBaseUrl) throw new Error("STAYHUB_CELL_PROBE_BASE_URL is required.");
const parsedBaseUrl = new URL(rawBaseUrl);
const hostname = parsedBaseUrl.hostname.toLowerCase();
if (hostname === "stayhub.app" || hostname.endsWith(".stayhub.app")) {
  throw new Error(`Production StayHub domains are forbidden for runtime-cell probes: ${hostname}`);
}

const baseUrl = rawBaseUrl.replace(/\/$/, "");
const prefix = String(process.env.STAYHUB_CELL_PROBE_PREFIX || "factory-heavy-20260901").trim();
const timeoutMs = Number(process.env.STAYHUB_CELL_PROBE_TIMEOUT_MS || 70_000);
const p95LimitMs = Number(process.env.STAYHUB_CELL_PROBE_P95_MS || 3_000);
const runId = String(process.env.STAYHUB_CELL_PROBE_RUN_ID || `${prefix}-cell-probe-${Date.now()}`);
const defaultTargets = [
  { cellKey: "sandbox-standard-01", hotel: 6 },
  { cellKey: "sandbox-standard-02", hotel: 5 },
  { cellKey: "sandbox-standard-03", hotel: 15 },
  { cellKey: "sandbox-standard-04", hotel: 7 },
  { cellKey: "sandbox-standard-05", hotel: 1 },
  { cellKey: "sandbox-standard-06", hotel: 2 },
];

function parseTargets() {
  const raw = String(process.env.STAYHUB_CELL_PROBE_TARGETS || "").trim();
  if (!raw) return defaultTargets;
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > 12) {
    throw new Error("STAYHUB_CELL_PROBE_TARGETS must be a non-empty JSON array with at most 12 entries.");
  }
  const seenCells = new Set();
  return parsed.map((entry) => {
    const cellKey = String(entry?.cellKey || "").trim().toLowerCase();
    const hotel = Number(entry?.hotel);
    if (!/^sandbox-[a-z0-9-]{1,50}$/.test(cellKey)) throw new Error(`Invalid Sandbox cell key: ${cellKey}`);
    if (!Number.isSafeInteger(hotel) || hotel < 1 || hotel > 9999) throw new Error(`Invalid probe hotel number for ${cellKey}`);
    if (seenCells.has(cellKey)) throw new Error(`Duplicate probe cell key: ${cellKey}`);
    seenCells.add(cellKey);
    return { cellKey, hotel };
  });
}

const targets = parseTargets();

function deterministicUuid(label, hotel, roomIndex) {
  const hash = createHash("md5").update(`${label}-${hotel}-${roomIndex}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20)}`;
}

const slug = (hotel) => `${prefix}-${String(hotel).padStart(3, "0")}-sandbox`;
const roomNumber = (roomIndex) => String(200 + roomIndex);
const deviceToken = (hotel, roomIndex) => `factory-heavy-device-${hotel}-${roomIndex}`;

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

async function postOperation(kind, target, roomIndex) {
  const started = performance.now();
  const hotelSlug = slug(target.hotel);
  const room = roomNumber(roomIndex);
  const stayId = deterministicUuid("factory-heavy-stay", target.hotel, roomIndex);
  const stayDeviceId = deterministicUuid("factory-heavy-device", target.hotel, roomIndex);
  const marker = `${runId}:${kind}:${target.cellKey}:h${String(target.hotel).padStart(3, "0")}:r${room}`;
  let status = 0;
  let body = null;
  let transportError = null;

  try {
    const route = kind === "request"
      ? "/api/guest/request-create"
      : kind === "survey"
        ? "/api/guest/day3-survey"
        : "/api/guest/communications";
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
      : kind === "survey"
        ? {
            hotelSlug,
            room,
            stayId,
            stayDeviceId,
            launchSource: "manual_force",
            rating: 5,
            language: "en",
            surveyVersion: "day3-v1",
          }
        : {
            hotelSlug,
            stayId,
            stayDeviceId,
            deviceToken: deviceToken(target.hotel, roomIndex),
            language: "en",
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
    cellKey: target.cellKey,
    hotel: target.hotel,
    hotelSlug,
    room,
    stayId,
    stayDeviceId,
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
for (const target of targets) {
  for (let roomIndex = 1; roomIndex <= 3; roomIndex += 1) operations.push(postOperation("request", target, roomIndex));
  for (let roomIndex = 1; roomIndex <= 2; roomIndex += 1) operations.push(postOperation("survey", target, roomIndex));
  operations.push(postOperation("communications", target, 1));
}

const expectedOperations = targets.length * 6;
if (operations.length !== expectedOperations) throw new Error(`Expected ${expectedOperations} probe operations, got ${operations.length}`);

const startedAt = new Date().toISOString();
const wallStarted = performance.now();
const results = await Promise.all(operations);
const wallMs = Number((performance.now() - wallStarted).toFixed(1));
const byKind = Object.fromEntries(["request", "survey", "communications"].map((kind) => [kind, summarize(results.filter((row) => row.kind === kind))]));
const byCell = Object.fromEntries(targets.map((target) => [target.cellKey, {
  hotel: target.hotel,
  hotelSlug: slug(target.hotel),
  all: summarize(results.filter((row) => row.cellKey === target.cellKey)),
  request: summarize(results.filter((row) => row.cellKey === target.cellKey && row.kind === "request")),
  survey: summarize(results.filter((row) => row.cellKey === target.cellKey && row.kind === "survey")),
  communications: summarize(results.filter((row) => row.cellKey === target.cellKey && row.kind === "communications")),
}]));
const duplicateSurveys = results.filter((row) => row.kind === "survey" && row.duplicate).length;
const correctnessAccepted = results.every((row) => row.ok) && duplicateSurveys === 0;
const performanceSignal = {
  targetP95Ms: p95LimitMs,
  requestUnderTarget: byKind.request.p95 !== null && byKind.request.p95 <= p95LimitMs,
  surveyUnderTarget: byKind.survey.p95 !== null && byKind.survey.p95 <= p95LimitMs,
  communicationsUnderTarget: byKind.communications.p95 !== null && byKind.communications.p95 <= p95LimitMs,
};
performanceSignal.allUnderTarget = performanceSignal.requestUnderTarget && performanceSignal.surveyUnderTarget && performanceSignal.communicationsUnderTarget;

const output = {
  schemaVersion: "stayhub-runtime-cell-probe-v1",
  runId,
  baseUrl,
  startedAt,
  completedAt: new Date().toISOString(),
  targetCount: targets.length,
  totalOperations: results.length,
  wallMs,
  targets,
  byKind,
  byCell,
  duplicateSurveys,
  correctnessAccepted,
  performanceSignal,
  failures: results.filter((row) => !row.ok),
  results,
};

await writeFile("factory-runtime-cell-probe-results.json", `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ ...output, results: undefined }, null, 2));
if (!correctnessAccepted) process.exitCode = 1;
