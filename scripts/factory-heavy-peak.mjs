import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";

const baseUrl = String(process.env.STAYHUB_HEAVY_BASE_URL || "https://www.stayhub.app").replace(/\/$/, "");
const timeoutMs = Number(process.env.STAYHUB_HEAVY_TIMEOUT_MS || 45_000);
const prefix = String(process.env.STAYHUB_HEAVY_PREFIX || "factory-heavy-20260901");
// Cache-capacity rerun: keep the runner path explicit so a push schedules GitHub Actions.\nconst runId = String(process.env.STAYHUB_HEAVY_RUN_ID || `${prefix}-peak-${Date.now()}`);
const hotelCount = Number(process.env.STAYHUB_HEAVY_HOTELS || 100);
const requestsPerHotel = Number(process.env.STAYHUB_HEAVY_REQUESTS_PER_HOTEL || 3);
const surveysPerHotel = Number(process.env.STAYHUB_HEAVY_SURVEYS_PER_HOTEL || 2);

if (!Number.isInteger(hotelCount) || hotelCount < 1 || hotelCount > 100) throw new Error("Invalid hotel count");
if (!Number.isInteger(requestsPerHotel) || requestsPerHotel < 0 || requestsPerHotel > 3) throw new Error("Invalid request count");
if (!Number.isInteger(surveysPerHotel) || surveysPerHotel < 0 || surveysPerHotel > 2) throw new Error("Invalid survey count");

function deterministicUuid(label, hotelIndex, roomIndex) {
  const hash = createHash("md5").update(`${label}-${hotelIndex}-${roomIndex}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)].toFixed(1));
}

async function post(kind, hotelIndex, roomIndex) {
  const slug = `${prefix}-${String(hotelIndex).padStart(3, "0")}-sandbox`;
  const room = String(200 + roomIndex);
  const stayId = deterministicUuid("factory-heavy-stay", hotelIndex, roomIndex);
  const stayDeviceId = deterministicUuid("factory-heavy-device", hotelIndex, roomIndex);
  const marker = `${runId}:${kind}:h${hotelIndex}:room${room}`;
  const started = performance.now();
  let status = 0;
  let body = null;
  let transportError = null;
  try {
    const route = kind === "request" ? "/api/guest/request-create" : "/api/guest/day3-survey";
    const payload = kind === "request"
      ? { hotelSlug: slug, room, type: "extra-towel", typeLabel: marker, sourceRequestDef: "extra-towel", serviceTime: "now", guestLanguage: "en", stayId, stayDeviceId }
      : { hotelSlug: slug, room, stayId, stayDeviceId, launchSource: "manual_force", rating: 5, language: "en", surveyVersion: "day3-v1", loadRunId: runId };
    const response = await fetch(`${baseUrl}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-stayhub-load-run": runId },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    status = response.status;
    body = await response.json().catch(() => null);
  } catch (error) {
    transportError = error instanceof Error ? error.message : String(error);
  }
  return {
    kind, hotelIndex, slug, room, marker, status,
    ok: status >= 200 && status < 300 && body?.ok === true,
    duplicate: body?.duplicate === true,
    id: body?.request?.id || body?.survey?.id || null,
    code: body?.code || null,
    error: transportError || body?.error || null,
    latencyMs: Number((performance.now() - started).toFixed(1)),
  };
}

const operations = [];
for (let hotelIndex = 1; hotelIndex <= hotelCount; hotelIndex += 1) {
  for (let roomIndex = 1; roomIndex <= requestsPerHotel; roomIndex += 1) operations.push(post("request", hotelIndex, roomIndex));
  for (let roomIndex = 1; roomIndex <= surveysPerHotel; roomIndex += 1) operations.push(post("survey", hotelIndex, roomIndex));
}

const startedAt = new Date().toISOString();
const wallStart = performance.now();
const results = await Promise.all(operations);
const wallDurationMs = Number((performance.now() - wallStart).toFixed(1));
const summarize = (kind) => {
  const rows = results.filter((row) => row.kind === kind);
  const latencies = rows.map((row) => row.latencyMs);
  return { total: rows.length, successful: rows.filter((row) => row.ok).length, failed: rows.filter((row) => !row.ok).length,
    duplicates: rows.filter((row) => row.duplicate).length, p50: percentile(latencies, 50), p95: percentile(latencies, 95), p99: percentile(latencies, 99) };
};
const output = { schemaVersion: "stayhub-factory-heavy-peak-v1", runId, baseUrl, startedAt, hotelCount, wallDurationMs,
  request: summarize("request"), survey: summarize("survey"), failures: results.filter((row) => !row.ok), results };
await writeFile("factory-heavy-peak-results.json", `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ ...output, results: undefined }));
if (output.request.failed || output.survey.failed) process.exitCode = 1;
