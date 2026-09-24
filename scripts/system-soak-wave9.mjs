import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";

const baseUrl = String(
  process.env.STAYHUB_SYSTEM_TEST_BASE_URL ||
  "https://hotel-guest-hub-git-feat-hote-5f757d-miroslav-velikovs-projects.vercel.app",
).replace(/\/$/, "");
const prefix = String(process.env.STAYHUB_SYSTEM_TEST_PREFIX || "factory-heavy-20260901");
const timeoutMs = Number(process.env.STAYHUB_SYSTEM_TEST_TIMEOUT_MS || 30_000);
const p95LimitMs = Number(process.env.STAYHUB_SOAK_P95_MS || 8_000);
const recoveryP95LimitMs = Number(process.env.STAYHUB_SOAK_RECOVERY_P95_MS || 5_000);
const cooldownMs = Number(process.env.STAYHUB_SOAK_COOLDOWN_MS || 2_000);
const runId = String(process.env.STAYHUB_SYSTEM_TEST_RUN_ID || `system-wave9-${Date.now()}`);

const slug = (hotel) => `${prefix}-${String(hotel).padStart(3, "0")}-sandbox`;

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((sorted.length * p) / 100) - 1);
  return Number(sorted[index].toFixed(1));
}

function summarize(rows) {
  const latencies = rows.map((row) => row.latencyMs);
  return {
    total: rows.length,
    successful: rows.filter((row) => row.accepted).length,
    failed: rows.filter((row) => !row.accepted).length,
    status5xx: rows.filter((row) => row.status >= 500).length,
    transportErrors: rows.filter((row) => Boolean(row.transportError)).length,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    max: latencies.length ? Number(Math.max(...latencies).toFixed(1)) : null,
  };
}

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

async function runPool(tasks, workers) {
  const queue = [...tasks];
  const rows = [];
  const count = Math.max(1, Math.min(workers, queue.length || 1));
  await Promise.all(
    Array.from({ length: count }, async () => {
      while (queue.length) {
        const task = queue.shift();
        if (!task) return;
        rows.push(await task());
      }
    }),
  );
  return rows;
}

async function confirmIdentity(hotel, profile, room = "201") {
  const hotelSlug = slug(hotel);
  if (!hotelSlug.endsWith("-sandbox")) throw new Error(`Refusing non-sandbox hotel ${hotelSlug}`);
  const result = await fetchJson(`${baseUrl}/api/guest/stay/confirm`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-stayhub-load-run": runId,
      "x-stayhub-load-profile": profile,
    },
    body: JSON.stringify({
      hotelSlug,
      room,
      checkInDate: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
      checkOutDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
      deviceToken: `${runId}:${profile}:h${hotel}:r${room}`,
      language: "en",
    }),
  });
  const stay = result.body?.stay || {};
  return {
    kind: "stay-confirm",
    profile,
    hotel,
    hotelSlug,
    room,
    stayId: stay.id || null,
    stayDeviceId: stay.stayDeviceId || null,
    status: result.status,
    accepted:
      result.status >= 200 &&
      result.status < 300 &&
      result.body?.ok === true &&
      typeof stay.id === "string" &&
      typeof stay.stayDeviceId === "string",
    latencyMs: result.latencyMs,
    transportError: result.transportError,
  };
}

async function postRequest(identity, profile, sequence = 1) {
  const result = await fetchJson(`${baseUrl}/api/guest/request-create`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-stayhub-load-run": runId,
      "x-stayhub-load-profile": profile,
    },
    body: JSON.stringify({
      hotelSlug: identity.hotelSlug,
      room: identity.room,
      type: "extra-towel",
      typeLabel: `${runId}:${profile}:h${identity.hotel}:q${sequence}`,
      sourceRequestDef: "extra-towel",
      serviceTime: "now",
      guestLanguage: "en",
      stayId: identity.stayId,
      stayDeviceId: identity.stayDeviceId,
    }),
  });
  return {
    kind: "request",
    profile,
    hotel: identity.hotel,
    hotelSlug: identity.hotelSlug,
    status: result.status,
    accepted: result.status >= 200 && result.status < 300 && result.body?.ok === true,
    latencyMs: result.latencyMs,
    transportError: result.transportError,
  };
}

async function postSurvey(identity, profile) {
  const result = await fetchJson(`${baseUrl}/api/guest/day3-survey`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-stayhub-load-run": runId,
      "x-stayhub-load-profile": profile,
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
      loadRunId: `${runId}:${profile}:h${identity.hotel}`,
    }),
  });
  return {
    kind: "survey",
    profile,
    hotel: identity.hotel,
    hotelSlug: identity.hotelSlug,
    status: result.status,
    accepted: result.status >= 200 && result.status < 300 && result.body?.ok === true,
    latencyMs: result.latencyMs,
    transportError: result.transportError,
  };
}

async function runProfile({ name, hotels, workers, requestsPerHotel = 1, surveys = false, p95Limit = p95LimitMs }) {
  const bootstrapRows = await runPool(
    hotels.map((hotel) => () => confirmIdentity(hotel, name)),
    workers,
  );
  const identities = bootstrapRows.filter((row) => row.accepted);
  if (identities.length !== hotels.length) {
    return {
      name,
      accepted: false,
      bootstrap: summarize(bootstrapRows),
      operations: { total: 0, successful: 0, failed: 0, status5xx: 0, transportErrors: 0, p50: null, p95: null, p99: null, max: null },
      p95Limit,
      wallMs: 0,
      rows: bootstrapRows,
    };
  }

  const tasks = [];
  for (const identity of identities) {
    for (let sequence = 1; sequence <= requestsPerHotel; sequence += 1) {
      tasks.push(() => postRequest(identity, name, sequence));
    }
    if (surveys) tasks.push(() => postSurvey(identity, name));
  }

  const started = performance.now();
  const operationRows = await runPool(tasks, workers);
  const wallMs = Number((performance.now() - started).toFixed(1));
  const bootstrap = summarize(bootstrapRows);
  const operations = summarize(operationRows);
  const accepted =
    bootstrap.failed === 0 &&
    bootstrap.status5xx === 0 &&
    bootstrap.transportErrors === 0 &&
    operations.failed === 0 &&
    operations.status5xx === 0 &&
    operations.transportErrors === 0 &&
    operations.p95 !== null &&
    operations.p95 <= p95Limit;

  return {
    name,
    accepted,
    bootstrap,
    operations,
    p95Limit,
    wallMs,
    rows: [...bootstrapRows, ...operationRows],
  };
}

const profiles = [
  { name: "light-steady", hotels: Array.from({ length: 10 }, (_, i) => i + 1), workers: 5, requestsPerHotel: 1 },
  { name: "medium-operations", hotels: Array.from({ length: 25 }, (_, i) => i + 11), workers: 15, requestsPerHotel: 2 },
  { name: "checkin-pressure", hotels: Array.from({ length: 50 }, (_, i) => i + 1), workers: 25, requestsPerHotel: 1 },
  { name: "full-estate-burst", hotels: Array.from({ length: 100 }, (_, i) => i + 1), workers: 50, requestsPerHotel: 1 },
  { name: "survey-heavy", hotels: Array.from({ length: 50 }, (_, i) => i + 51), workers: 25, requestsPerHotel: 1, surveys: true },
  { name: "post-load-recovery", hotels: Array.from({ length: 10 }, (_, i) => i + 41), workers: 5, requestsPerHotel: 1, p95Limit: recoveryP95LimitMs },
];

const results = [];
const allRows = [];
for (let index = 0; index < profiles.length; index += 1) {
  const result = await runProfile(profiles[index]);
  results.push(result);
  allRows.push(...result.rows);
  console.log(JSON.stringify({
    phase: "profile-complete",
    name: result.name,
    accepted: result.accepted,
    bootstrap: result.bootstrap,
    operations: result.operations,
    p95Limit: result.p95Limit,
    wallMs: result.wallMs,
  }, null, 2));
  if (!result.accepted) break;
  if (index < profiles.length - 1 && cooldownMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, cooldownMs));
  }
}

const completedAllProfiles = results.length === profiles.length;
const overall = summarize(allRows);
const accepted =
  completedAllProfiles &&
  results.every((result) => result.accepted) &&
  overall.failed === 0 &&
  overall.status5xx === 0 &&
  overall.transportErrors === 0;

const evidence = {
  schemaVersion: "gostaya-system-soak-wave9-v1",
  runId,
  baseUrl,
  completedAt: new Date().toISOString(),
  cooldownMs,
  p95LimitMs,
  recoveryP95LimitMs,
  completedAllProfiles,
  profiles: results.map(({ rows, ...result }) => result),
  overall,
  totalObservedOperations: allRows.length,
  accepted,
};

await writeFile("system-soak-wave9-results.json", `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
if (!accepted) process.exitCode = 1;
