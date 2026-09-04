import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";

const baseUrl = String(process.env.STAYHUB_PROBE_BASE_URL || "").replace(/\/$/, "");
const expectedAppSha = String(process.env.STAYHUB_PROBE_EXPECTED_APP_SHA || "").trim();
const previewCookie = String(process.env.STAYHUB_PROBE_COOKIE || "").trim();
const prefix = "factory-heavy-20260901";
const hotels = [6, 16, 20, 21, 23, 28, 31, 44, 64, 72];
const room = "203";
const serviceId = "load_massage";
const timeoutMs = 30_000;
const runId = `${prefix}-hot-path-probe-${Date.now()}`;

if (!baseUrl) throw new Error("STAYHUB_PROBE_BASE_URL is required");
if (!expectedAppSha) throw new Error("STAYHUB_PROBE_EXPECTED_APP_SHA is required");
if (!previewCookie) throw new Error("STAYHUB_PROBE_COOKIE is required for protected Preview");
if (/^https:\/\/(www\.)?stayhub\.app(?:\/|$)/i.test(baseUrl)) {
  throw new Error("Production StayHub domains are forbidden for the hot-path probe");
}

function dateKeyOffset(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

const stayCheckInDate = dateKeyOffset(-1);
const stayCheckOutDate = dateKeyOffset(2);

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil((sorted.length * p) / 100) - 1)].toFixed(1));
}

function summarize(rows) {
  const values = rows.map((row) => row.latencyMs);
  return {
    total: rows.length,
    successful: rows.filter((row) => row.ok).length,
    failed: rows.filter((row) => !row.ok).length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: values.length ? Number(Math.max(...values).toFixed(1)) : null,
  };
}

async function fetchJson(url, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("cookie", previewCookie);
  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

function slug(hotel) {
  return `${prefix}-${String(hotel).padStart(3, "0")}-sandbox`;
}

async function confirmIdentity(hotel) {
  const hotelSlug = slug(hotel);
  const deviceToken = `${runId}:h${hotel}:r${room}`;
  const { response, body } = await fetchJson(`${baseUrl}/api/guest/stay/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-stayhub-load-run": runId },
    body: JSON.stringify({
      hotelSlug,
      room,
      checkInDate: stayCheckInDate,
      checkOutDate: stayCheckOutDate,
      deviceToken,
      language: "en",
    }),
  });
  if (!response.ok || body?.ok !== true || !body?.stay?.id || !body?.stay?.stayDeviceId) {
    throw new Error(`Stay bootstrap failed for ${hotelSlug}: HTTP ${response.status} ${body?.error || "invalid identity"}`);
  }
  return {
    hotel,
    hotelSlug,
    stayId: String(body.stay.id),
    stayDeviceId: String(body.stay.stayDeviceId),
  };
}

async function discoverMassageSlot(identity) {
  const fromDate = dateKeyOffset(1);
  const params = new URLSearchParams({
    hotelSlug: identity.hotelSlug,
    action: "bookable_dates",
    serviceId,
    fromDate,
    daysAhead: "14",
  });
  const { response, body } = await fetchJson(`${baseUrl}/api/guest/massages?${params}`);
  const dates = Array.isArray(body?.result?.dates) ? body.result.dates : [];
  const candidate = dates.flatMap((entry) =>
    Array.isArray(entry?.availableTimes)
      ? entry.availableTimes.map((time) => ({ date: String(entry.date), time: String(time) }))
      : [],
  )[0];
  if (!response.ok || body?.ok !== true || !candidate) {
    throw new Error(`Massage slot preflight failed for ${identity.hotelSlug}: HTTP ${response.status}`);
  }
  return candidate;
}

async function postOperation(kind, identity, slot = null) {
  const started = performance.now();
  let status = 0;
  let body = null;
  let transportError = null;
  try {
    const route = kind === "request"
      ? "/api/guest/request-create"
      : kind === "survey"
        ? "/api/guest/day3-survey"
        : "/api/guest/massages";
    const payload = kind === "request"
      ? {
          hotelSlug: identity.hotelSlug,
          room,
          type: "extra-towel",
          typeLabel: `${runId}:request:h${identity.hotel}`,
          sourceRequestDef: "extra-towel",
          serviceTime: "now",
          guestLanguage: "en",
          stayId: identity.stayId,
          stayDeviceId: identity.stayDeviceId,
        }
      : kind === "survey"
        ? {
            hotelSlug: identity.hotelSlug,
            room,
            stayId: identity.stayId,
            stayDeviceId: identity.stayDeviceId,
            launchSource: "manual_force",
            rating: 5,
            language: "en",
            surveyVersion: "day3-v1",
          }
        : {
            hotelSlug: identity.hotelSlug,
            room,
            roomConfirmed: true,
            serviceId,
            date: slot.date,
            time: slot.time,
            stayId: identity.stayId,
            stayDeviceId: identity.stayDeviceId,
            guestLanguage: "en",
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
    hotel: identity.hotel,
    hotelSlug: identity.hotelSlug,
    status,
    ok: body?.ok === true,
    code: body?.code || null,
    error: transportError || body?.error || null,
    latencyMs: Number((performance.now() - started).toFixed(1)),
  };
}

const startedAt = new Date().toISOString();
const identities = await Promise.all(hotels.map(confirmIdentity));
const slots = await Promise.all(identities.map(discoverMassageSlot));
const wallStarted = performance.now();
const rows = await Promise.all(
  identities.flatMap((identity, index) => [
    postOperation("request", identity),
    postOperation("survey", identity),
    postOperation("massage", identity, slots[index]),
  ]),
);
const wallMs = Number((performance.now() - wallStarted).toFixed(1));
const request = summarize(rows.filter((row) => row.kind === "request"));
const survey = summarize(rows.filter((row) => row.kind === "survey"));
const massage = summarize(rows.filter((row) => row.kind === "massage"));
const accepted =
  rows.length === 30 &&
  request.failed === 0 && survey.failed === 0 && massage.failed === 0 &&
  request.p95 <= 3000 && survey.p95 <= 3000 && massage.p95 <= 4500;
const output = {
  schemaVersion: "stayhub-factory-hot-path-probe-v2",
  runId,
  targetAppSha: expectedAppSha,
  baseUrl,
  startedAt,
  completedAt: new Date().toISOString(),
  stayCheckInDate,
  stayCheckOutDate,
  room,
  hotels,
  totalOperations: rows.length,
  wallMs,
  request,
  survey,
  massage,
  thresholdsMs: { request: 3000, survey: 3000, massage: 4500 },
  accepted,
  failures: rows.filter((row) => !row.ok),
  results: rows,
};
await writeFile("factory-hot-path-probe-results.json", JSON.stringify(output, null, 2));
console.log(JSON.stringify({ ...output, results: undefined }, null, 2));
if (!accepted) process.exitCode = 1;
