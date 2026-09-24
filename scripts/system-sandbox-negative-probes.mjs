import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";

const baseUrl = String(
  process.env.STAYHUB_SYSTEM_TEST_BASE_URL ||
  "https://hotel-guest-hub-git-feat-hote-5f757d-miroslav-velikovs-projects.vercel.app",
).replace(/\/$/, "");
const prefix = String(process.env.STAYHUB_SYSTEM_TEST_PREFIX || "factory-heavy-20260901");
const timeoutMs = Number(process.env.STAYHUB_SYSTEM_TEST_TIMEOUT_MS || 30_000);
const runId = String(process.env.STAYHUB_SYSTEM_TEST_RUN_ID || `system-negative-${Date.now()}`);

const slug = (hotel) => `${prefix}-${String(hotel).padStart(3, "0")}-sandbox`;
const room = "201";

async function fetchJson(url, init = {}) {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    return {
      status: response.status,
      ok: response.ok,
      body,
      latencyMs: Number((performance.now() - started).toFixed(1)),
      transportError: null,
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      body: null,
      latencyMs: Number((performance.now() - started).toFixed(1)),
      transportError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function confirmStay(hotel, tokenSuffix) {
  const hotelSlug = slug(hotel);
  if (!hotelSlug.endsWith("-sandbox")) {
    throw new Error(`Refusing non-sandbox stay bootstrap: ${hotelSlug}`);
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
      deviceToken: `${runId}:${tokenSuffix}`,
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
      `Stay bootstrap failed for ${hotelSlug}: HTTP ${result.status} ${result.body?.error || result.transportError || "unknown"}`,
    );
  }
  return {
    hotelSlug,
    stayId: stay.id,
    stayDeviceId: stay.stayDeviceId,
  };
}

function requestPayload(identity, overrides = {}) {
  return {
    hotelSlug: identity.hotelSlug,
    room,
    type: "extra-towel",
    typeLabel: `${runId}:negative-probe`,
    sourceRequestDef: "extra-towel",
    serviceTime: "now",
    guestLanguage: "en",
    stayId: identity.stayId,
    stayDeviceId: identity.stayDeviceId,
    ...overrides,
  };
}

async function postRequest(payload) {
  return fetchJson(`${baseUrl}/api/guest/request-create`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-stayhub-load-run": runId,
    },
    body: JSON.stringify(payload),
  });
}

function classify(name, result, predicate, detail) {
  const accepted = Boolean(predicate(result));
  return {
    name,
    accepted,
    expected: detail,
    status: result.status,
    code: result.body?.code || null,
    responseOk: result.body?.ok === true,
    latencyMs: result.latencyMs,
    transportError: result.transportError,
  };
}

const hotelOne = await confirmStay(1, "hotel-one");
const hotelTwo = await confirmStay(2, "hotel-two");

const probes = [];

const validControl = await postRequest(requestPayload(hotelOne, {
  typeLabel: `${runId}:valid-control`,
}));
probes.push(
  classify(
    "valid_control_request",
    validControl,
    (r) => r.status >= 200 && r.status < 300 && r.body?.ok === true,
    "valid sandbox identity must be accepted",
  ),
);

const crossTenant = await postRequest(
  requestPayload(hotelOne, {
    hotelSlug: hotelTwo.hotelSlug,
    typeLabel: `${runId}:cross-tenant`,
  }),
);
probes.push(
  classify(
    "cross_tenant_identity_rejected",
    crossTenant,
    (r) => r.status >= 400 && r.status < 500 && r.body?.ok !== true,
    "Hotel A stay/device identity must never authorize a Hotel B write",
  ),
);

const mixedDevice = await postRequest(
  requestPayload(hotelOne, {
    stayDeviceId: hotelTwo.stayDeviceId,
    typeLabel: `${runId}:mixed-device`,
  }),
);
probes.push(
  classify(
    "mixed_stay_device_rejected",
    mixedDevice,
    (r) => r.status >= 400 && r.status < 500 && r.body?.ok !== true,
    "stayId and stayDeviceId from different tenants must be rejected",
  ),
);

const missingIdentity = await postRequest(
  requestPayload(hotelOne, {
    stayId: "",
    stayDeviceId: "",
    typeLabel: `${runId}:missing-identity`,
  }),
);
probes.push(
  classify(
    "missing_stay_identity_rejected",
    missingIdentity,
    (r) => r.status === 401 && r.body?.ok !== true,
    "guest write without a confirmed stay must return 401",
  ),
);

const invalidRoom = await postRequest(
  requestPayload(hotelOne, {
    room: "999999",
    typeLabel: `${runId}:invalid-room`,
  }),
);
probes.push(
  classify(
    "invalid_room_rejected",
    invalidRoom,
    (r) => r.status === 400 && r.body?.code === "INVALID_ROOM",
    "unknown room must be blocked before persistence",
  ),
);

const unknownRequest = await postRequest(
  requestPayload(hotelOne, {
    type: "definitely-not-a-configured-service",
    sourceRequestDef: "definitely-not-a-configured-service",
    typeLabel: `${runId}:unknown-request`,
  }),
);
probes.push(
  classify(
    "unknown_request_definition_rejected",
    unknownRequest,
    (r) => r.status >= 400 && r.status < 500 && r.body?.ok !== true,
    "Factory-managed hotel must reject an unconfigured request definition",
  ),
);

const oversized = await postRequest(
  requestPayload(hotelOne, {
    typeLabel: `${runId}:oversized`,
    note: "x".repeat(20_000),
  }),
);
probes.push(
  classify(
    "oversized_body_rejected",
    oversized,
    (r) => r.status === 413 && r.body?.code === "REQUEST_BODY_TOO_LARGE",
    "oversized guest payload must fail closed with 413",
  ),
);

const accepted = probes.every((probe) => probe.accepted);
const evidence = {
  schemaVersion: "gostaya-system-negative-probes-v1",
  runId,
  baseUrl,
  completedAt: new Date().toISOString(),
  sandboxOnly: [hotelOne.hotelSlug, hotelTwo.hotelSlug].every((value) => value.endsWith("-sandbox")),
  probes,
  accepted,
};

await writeFile(
  "system-sandbox-negative-probes-results.json",
  `${JSON.stringify(evidence, null, 2)}\n`,
);

console.log(JSON.stringify(evidence, null, 2));
if (!accepted) process.exitCode = 1;
