import { performance } from "node:perf_hooks";

const baseUrl = String(process.env.STAYHUB_LOAD_BASE_URL || "https://stayhub.app").replace(/\/$/, "");
const waveDelayMs = Number(process.env.STAYHUB_LOAD_WAVE_DELAY_MS || 60_000);
const perHotel = Number(process.env.STAYHUB_LOAD_REQUESTS_PER_HOTEL || 20);
const hotelCount = Number(process.env.STAYHUB_LOAD_HOTEL_COUNT || 15);
const prefix = String(process.env.STAYHUB_LOAD_PREFIX || "factory-load-20260901");
const runId = String(process.env.STAYHUB_LOAD_RUN_ID || `staggered-${Date.now()}`);

if (!Number.isInteger(perHotel) || perHotel < 1 || perHotel > 100) throw new Error("Invalid per-hotel concurrency");
if (!Number.isInteger(hotelCount) || hotelCount < 1 || hotelCount > 15) throw new Error("Invalid hotel count");
if (!Number.isFinite(waveDelayMs) || waveDelayMs < 0) throw new Error("Invalid wave delay");

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(1));
}

function fixture(index) {
  const suffix = String(index).padStart(2, "0");
  const uuidSuffix = String(index).padStart(12, "0");
  return {
    index,
    slug: `${prefix}-${suffix}-sandbox`,
    room: "901",
    stayId: `f10b0000-0000-4000-8000-${uuidSuffix}`,
    stayDeviceId: `f10c0000-0000-4000-8000-${uuidSuffix}`,
  };
}

async function sendOne(hotel, requestIndex) {
  const marker = `${runId}:h${String(hotel.index).padStart(2, "0")}:r${String(requestIndex).padStart(2, "0")}`;
  const started = performance.now();
  let status = 0;
  let body = null;
  let error = null;
  try {
    const response = await fetch(`${baseUrl}/api/guest/request-create`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-stayhub-load-run": runId },
      body: JSON.stringify({
        hotelSlug: hotel.slug,
        room: hotel.room,
        type: "load-test-request",
        typeLabel: "Load test request",
        note: marker,
        serviceTime: "now",
        sourceRequestDef: "load-test-request",
        guestLanguage: "en",
        stayId: hotel.stayId,
        stayDeviceId: hotel.stayDeviceId,
      }),
    });
    status = response.status;
    body = await response.json().catch(() => null);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  const latencyMs = performance.now() - started;
  return {
    hotel: hotel.slug,
    marker,
    requestIndex,
    ok: status >= 200 && status < 300 && body?.ok === true,
    status,
    latencyMs: Number(latencyMs.toFixed(1)),
    requestId: body?.request?.id || null,
    department: body?.request?.department || null,
    code: body?.code || null,
    error: error || body?.error || null,
  };
}

const waves = [];
const all = [];
for (let hotelIndex = 1; hotelIndex <= hotelCount; hotelIndex += 1) {
  const hotel = fixture(hotelIndex);
  const waveStartedAt = new Date().toISOString();
  const waveStart = performance.now();
  const results = await Promise.all(Array.from({ length: perHotel }, (_, i) => sendOne(hotel, i + 1)));
  const waveDurationMs = performance.now() - waveStart;
  all.push(...results);
  const latencies = results.map((row) => row.latencyMs);
  const summary = {
    hotel: hotel.slug,
    startedAt: waveStartedAt,
    total: results.length,
    successful: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    waveDurationMs: Number(waveDurationMs.toFixed(1)),
    failures: results.filter((row) => !row.ok).slice(0, 10),
  };
  waves.push(summary);
  console.log(JSON.stringify({ type: "wave", runId, ...summary }));
  if (hotelIndex < hotelCount && waveDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waveDelayMs));
  }
}

const latencies = all.map((row) => row.latencyMs);
const output = {
  schemaVersion: "stayhub-factory-staggered-load-v1",
  runId,
  baseUrl,
  hotelCount,
  concurrentPerHotel: perHotel,
  waveDelayMs,
  total: all.length,
  successful: all.filter((row) => row.ok).length,
  failed: all.filter((row) => !row.ok).length,
  p50: percentile(latencies, 50),
  p95: percentile(latencies, 95),
  p99: percentile(latencies, 99),
  waves,
  failures: all.filter((row) => !row.ok),
  results: all,
};

await import("node:fs/promises").then(({ writeFile }) => writeFile("factory-sandbox-load-results.json", `${JSON.stringify(output, null, 2)}\n`));
console.log(JSON.stringify({ type: "summary", ...output, results: undefined, waves }));

if (output.failed > 0) process.exitCode = 1;
