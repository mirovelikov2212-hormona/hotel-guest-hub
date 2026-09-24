import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";

const baseUrl = String(
  process.env.STAYHUB_SYSTEM_TEST_BASE_URL ||
  "https://hotel-guest-hub-git-feat-hote-5f757d-miroslav-velikovs-projects.vercel.app",
).replace(/\/$/, "");
const prefix = String(process.env.STAYHUB_SYSTEM_TEST_PREFIX || "factory-heavy-20260901");
const timeoutMs = Number(process.env.STAYHUB_SYSTEM_TEST_TIMEOUT_MS || 30_000);
const generalP95Limit = Number(process.env.STAYHUB_SYSTEM_LOAD_P95_MS || 8_000);
const controlP95Limit = Number(process.env.STAYHUB_SYSTEM_CONTROL_P95_MS || 5_000);
const runId = String(process.env.STAYHUB_SYSTEM_TEST_RUN_ID || `system-wave1-${Date.now()}`);

const roomNumbers = ["201", "202", "203"];
const hotelSlug = (hotel) => `${prefix}-${String(hotel).padStart(3, "0")}-sandbox`;

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

async function runPool(taskFns, workers) {
  const queue = [...taskFns];
  const rows = [];
  const workerCount = Math.max(1, Math.min(workers, queue.length || 1));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length) {
        const task = queue.shift();
        if (!task) return;
        rows.push(await task());
      }
    }),
  );
  return rows;
}

async function confirmStay(hotel, room, profile) {
  const slug = hotelSlug(hotel);
  if (!slug.endsWith("-sandbox")) {
    throw new Error(`Refusing non-sandbox stay bootstrap: ${slug}`);
  }
  const result = await fetchJson(`${baseUrl}/api/guest/stay/confirm`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-stayhub-load-run": runId,
      "x-stayhub-load-profile": profile,
    },
    body: JSON.stringify({
      hotelSlug: slug,
      room,
      checkInDate: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
      checkOutDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
      deviceToken: `${runId}:${profile}:h${hotel}:r${room}`,
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
      `${profile}: stay bootstrap failed for ${slug} room ${room}: HTTP ${result.status} ${result.body?.error || result.transportError || "unknown"}`,
    );
  }

  return {
    hotel,
    hotelSlug: slug,
    room,
    stayId: stay.id,
    stayDeviceId: stay.stayDeviceId,
    bootstrapLatencyMs: result.latencyMs,
  };
}

async function bootstrapIdentities(specs, profile, workers = 12) {
  const unique = new Map();
  for (const spec of specs) {
    unique.set(`${spec.hotel}:${spec.room}`, spec);
  }
  const rows = await runPool(
    [...unique.values()].map((spec) => () => confirmStay(spec.hotel, spec.room, profile)),
    workers,
  );
  return new Map(rows.map((row) => [`${row.hotel}:${row.room}`, row]));
}

async function postRequest(identity, profile, sequence, tenantClass = "standard") {
  const marker = `${runId}:${profile}:${tenantClass}:h${identity.hotel}:r${identity.room}:q${sequence}`;
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
      typeLabel: marker,
      sourceRequestDef: "extra-towel",
      serviceTime: "now",
      guestLanguage: "en",
      stayId: identity.stayId,
      stayDeviceId: identity.stayDeviceId,
    }),
  });
  return {
    profile,
    kind: "request",
    tenantClass,
    hotel: identity.hotel,
    hotelSlug: identity.hotelSlug,
    room: identity.room,
    sequence,
    marker,
    status: result.status,
    accepted: result.status >= 200 && result.status < 300 && result.body?.ok === true,
    code: result.body?.code || null,
    latencyMs: result.latencyMs,
    transportError: result.transportError,
  };
}

async function postSurvey(identity, profile, tenantClass = "standard") {
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
    profile,
    kind: "survey",
    tenantClass,
    hotel: identity.hotel,
    hotelSlug: identity.hotelSlug,
    room: identity.room,
    status: result.status,
    accepted: result.status >= 200 && result.status < 300 && result.body?.ok === true,
    code: result.body?.code || null,
    latencyMs: result.latencyMs,
    transportError: result.transportError,
  };
}

function profileAccepted(rows, p95Limit = generalP95Limit) {
  const summary = summarize(rows);
  return {
    ...summary,
    p95Limit,
    accepted:
      summary.failed === 0 &&
      summary.status5xx === 0 &&
      summary.transportErrors === 0 &&
      summary.p95 !== null &&
      summary.p95 <= p95Limit,
  };
}

async function runBalancedProfile() {
  const profile = "balanced-10-hotels";
  const hotels = Array.from({ length: 10 }, (_, index) => index + 1);
  const specs = hotels.flatMap((hotel) => [
    { hotel, room: "201" },
    { hotel, room: "202" },
  ]);
  const identities = await bootstrapIdentities(specs, profile, 10);
  const tasks = [];

  for (const hotel of hotels) {
    const room201 = identities.get(`${hotel}:201`);
    const room202 = identities.get(`${hotel}:202`);
    tasks.push(() => postRequest(room201, profile, 1));
    tasks.push(() => postRequest(room202, profile, 1));
    tasks.push(() => postSurvey(room202, profile));
  }

  const started = performance.now();
  const rows = await runPool(tasks, 12);
  const wallMs = Number((performance.now() - started).toFixed(1));
  return {
    profile,
    description: "10 hotels with simultaneous mixed request + survey traffic",
    wallMs,
    rows,
    summary: profileAccepted(rows),
  };
}

async function runBurstProfile() {
  const profile = "request-burst-25-hotels";
  const hotels = Array.from({ length: 25 }, (_, index) => index + 11);
  const specs = hotels.flatMap((hotel) => roomNumbers.map((room) => ({ hotel, room })));
  const identities = await bootstrapIdentities(specs, profile, 20);
  const tasks = [];

  for (const hotel of hotels) {
    for (const room of roomNumbers) {
      const identity = identities.get(`${hotel}:${room}`);
      tasks.push(() => postRequest(identity, profile, 1, "burst"));
      tasks.push(() => postRequest(identity, profile, 2, "burst"));
    }
    tasks.push(() => postSurvey(identities.get(`${hotel}:201`), profile, "burst"));
  }

  const started = performance.now();
  const rows = await runPool(tasks, 50);
  const wallMs = Number((performance.now() - started).toFixed(1));
  return {
    profile,
    description: "25 hotels burst simultaneously across three rooms per hotel",
    wallMs,
    rows,
    summary: profileAccepted(rows),
  };
}

async function runNoisyNeighborProfile() {
  const profile = "noisy-neighbor";
  const hotHotel = 36;
  const lightHotels = Array.from({ length: 20 }, (_, index) => index + 37);
  const controlHotels = Array.from({ length: 5 }, (_, index) => index + 57);
  const specs = [
    ...roomNumbers.map((room) => ({ hotel: hotHotel, room })),
    ...lightHotels.map((hotel) => ({ hotel, room: "201" })),
    ...controlHotels.map((hotel) => ({ hotel, room: "201" })),
  ];
  const identities = await bootstrapIdentities(specs, profile, 20);
  const pressureTasks = [];

  for (const room of roomNumbers) {
    const identity = identities.get(`${hotHotel}:${room}`);
    for (let sequence = 1; sequence <= 20; sequence += 1) {
      pressureTasks.push(() => postRequest(identity, profile, sequence, "hot-tenant"));
    }
  }
  for (const hotel of lightHotels) {
    const identity = identities.get(`${hotel}:201`);
    pressureTasks.push(() => postRequest(identity, profile, 1, "light-tenant"));
    pressureTasks.push(() => postRequest(identity, profile, 2, "light-tenant"));
  }

  const pressureStarted = performance.now();
  const pressureRows = await runPool(pressureTasks, 80);
  const pressureWallMs = Number((performance.now() - pressureStarted).toFixed(1));

  const controlStarted = performance.now();
  const controlRows = await runPool(
    controlHotels.map((hotel) => () =>
      postRequest(identities.get(`${hotel}:201`), profile, 1, "post-burst-control"),
    ),
    5,
  );
  const controlWallMs = Number((performance.now() - controlStarted).toFixed(1));

  const hotRows = pressureRows.filter((row) => row.tenantClass === "hot-tenant");
  const lightRows = pressureRows.filter((row) => row.tenantClass === "light-tenant");

  const hotSummary = profileAccepted(hotRows);
  const lightSummary = profileAccepted(lightRows);
  const controlSummary = profileAccepted(controlRows, controlP95Limit);

  return {
    profile,
    description: "one hot tenant under heavy pressure while 20 light tenants and 5 post-burst controls must remain healthy",
    wallMs: Number((pressureWallMs + controlWallMs).toFixed(1)),
    pressureWallMs,
    controlWallMs,
    rows: [...pressureRows, ...controlRows],
    hotTenant: hotSummary,
    lightTenants: lightSummary,
    postBurstControl: controlSummary,
    summary: {
      total: pressureRows.length + controlRows.length,
      accepted: hotSummary.accepted && lightSummary.accepted && controlSummary.accepted,
    },
  };
}

const startedAt = new Date().toISOString();
const balanced = await runBalancedProfile();
const burst = await runBurstProfile();
const noisyNeighbor = await runNoisyNeighborProfile();

const profiles = [balanced, burst, noisyNeighbor];
const allRows = profiles.flatMap((profile) => profile.rows);
const overall = summarize(allRows);
const accepted =
  profiles.every((profile) => profile.summary.accepted) &&
  overall.failed === 0 &&
  overall.status5xx === 0 &&
  overall.transportErrors === 0;

const evidence = {
  schemaVersion: "gostaya-system-multi-hotel-load-wave1-v1",
  runId,
  baseUrl,
  startedAt,
  completedAt: new Date().toISOString(),
  sandboxOnly: allRows.every((row) => row.hotelSlug.endsWith("-sandbox")),
  guardrailsMs: {
    generalP95Limit,
    postBurstControlP95Limit: controlP95Limit,
  },
  profileSummaries: profiles.map((profile) => ({
    profile: profile.profile,
    description: profile.description,
    wallMs: profile.wallMs,
    summary: profile.summary,
    hotTenant: profile.hotTenant,
    lightTenants: profile.lightTenants,
    postBurstControl: profile.postBurstControl,
  })),
  overall,
  totalOperations: allRows.length,
  accepted,
  failures: allRows.filter((row) => !row.accepted),
};

await writeFile(
  "system-multi-hotel-load-wave1-results.json",
  `${JSON.stringify(evidence, null, 2)}\n`,
);

console.log(JSON.stringify(evidence, null, 2));
if (!accepted) process.exitCode = 1;
