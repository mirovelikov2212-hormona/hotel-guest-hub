import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_BRANCH = "fix/current-stay-push-reach";
const EXPECTED_SUPABASE_REF = "zbpwxifcsyknorpsrzbo";
const PREFIX = "factory-heavy-20260901";
const HOTEL_COUNT = 100;
const PORT = 3300;
const nextBin = new URL("../node_modules/next/dist/bin/next", import.meta.url).pathname;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

function deterministicUuid(label, hotel, roomIndex) {
  const hash = createHash("md5").update(`${label}-${hotel}-${roomIndex}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20)}`;
}

const slug = (hotel) => `${PREFIX}-${String(hotel).padStart(3, "0")}-sandbox`;
const roomNumber = (roomIndex) => String(200 + roomIndex);

async function chunked(values, size, fn) {
  const out = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(...(await fn(values.slice(index, index + size))));
  }
  return out;
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000), redirect: "manual" });
      if (response.status > 0) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError || new Error("LOCAL_NEXT_START_TIMEOUT");
}

async function cleanupIds(client, table, ids) {
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    if (!chunk.length) continue;
    const { error } = await client.from(table).delete().in("id", chunk);
    if (error) throw error;
  }
}

console.log("[core620-build] running exact Next build");
const build = await run(process.execPath, [nextBin, "build"], { env: process.env });
if (build.code !== 0) process.exit(build.code);

const isPreviewAcceptance =
  process.env.VERCEL_ENV === "preview" &&
  process.env.VERCEL_GIT_COMMIT_REF === EXPECTED_BRANCH;

if (!isPreviewAcceptance) {
  console.log("[core620-build] load acceptance skipped outside guarded Preview branch");
  process.exit(0);
}

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
if (!supabaseUrl.includes(EXPECTED_SUPABASE_REF) || !serviceRoleKey) {
  throw new Error("CORE620_PREVIEW_SUPABASE_ENV_MISMATCH");
}

const commitSha = String(process.env.VERCEL_GIT_COMMIT_SHA || "unknown");
const deploymentSeed = String(process.env.VERCEL_URL || Date.now());
const runSuffix = createHash("sha256").update(`${commitSha}:${deploymentSeed}`).digest("hex").slice(0, 10);
const runId = `core620-${commitSha.slice(0, 8)}-${runSuffix}`;
const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const hotelSlugs = Array.from({ length: HOTEL_COUNT }, (_, index) => slug(index + 1));
const { data: hotels, error: hotelError } = await client
  .from("hotels")
  .select("id, slug, is_sandbox")
  .in("slug", hotelSlugs);
if (hotelError) throw hotelError;
if ((hotels || []).length !== HOTEL_COUNT || (hotels || []).some((hotel) => !hotel.is_sandbox)) {
  throw new Error(`CORE620_HOTEL_PREFLIGHT_FAILED_${(hotels || []).length}`);
}
const hotelIdBySlug = new Map((hotels || []).map((hotel) => [String(hotel.slug), String(hotel.id)]));

const expectedStays = [];
const expectedDevices = [];
for (let hotel = 1; hotel <= HOTEL_COUNT; hotel += 1) {
  for (let roomIndex = 1; roomIndex <= 3; roomIndex += 1) {
    expectedStays.push({
      hotel,
      hotelSlug: slug(hotel),
      hotelId: hotelIdBySlug.get(slug(hotel)),
      roomIndex,
      room: roomNumber(roomIndex),
      stayId: deterministicUuid("factory-heavy-stay", hotel, roomIndex),
      deviceId: deterministicUuid("factory-heavy-device", hotel, roomIndex),
    });
  }
}

const stayRows = await chunked(expectedStays.map((row) => row.stayId), 100, async (ids) => {
  const { data, error } = await client
    .from("guest_stays")
    .select("id, hotel_id, room_number, status, lifecycle_state")
    .in("id", ids);
  if (error) throw error;
  return data || [];
});
const deviceRows = await chunked(expectedStays.map((row) => row.deviceId), 100, async (ids) => {
  const { data, error } = await client
    .from("guest_stay_devices")
    .select("id, hotel_id, stay_id, room_number, device_token")
    .in("id", ids);
  if (error) throw error;
  return data || [];
});
if (stayRows.length !== 300 || deviceRows.length !== 300) {
  throw new Error(`CORE620_IDENTITY_PREFLIGHT_FAILED_${stayRows.length}_${deviceRows.length}`);
}
const stayById = new Map(stayRows.map((row) => [String(row.id), row]));
const deviceById = new Map(deviceRows.map((row) => [String(row.id), row]));
for (const expected of expectedStays) {
  const stay = stayById.get(expected.stayId);
  const device = deviceById.get(expected.deviceId);
  if (
    !stay ||
    !device ||
    String(stay.hotel_id) !== expected.hotelId ||
    String(device.hotel_id) !== expected.hotelId ||
    String(device.stay_id) !== expected.stayId ||
    String(stay.room_number) !== expected.room ||
    String(device.room_number) !== expected.room ||
    stay.status !== "active" ||
    stay.lifecycle_state !== "active"
  ) {
    throw new Error(`CORE620_IDENTITY_SCOPE_FAILED_${expected.hotelSlug}_${expected.room}`);
  }
  expectedDevices.push(String(device.device_token || ""));
}

const surveyDeviceIds = expectedStays
  .filter((row) => row.roomIndex <= 2)
  .map((row) => row.deviceId);
const existingSurveyRows = await chunked(surveyDeviceIds, 100, async (ids) => {
  const { data, error } = await client
    .from("guest_surveys")
    .select("id, stay_device_id")
    .eq("survey_type", "day3_guest_survey")
    .in("stay_device_id", ids);
  if (error) throw error;
  return data || [];
});
if (existingSurveyRows.length !== 0) {
  throw new Error(`CORE620_SURVEY_PREFLIGHT_NOT_CLEAN_${existingSurveyRows.length}`);
}

const now = Date.now();
const validUntil = new Date(now + 30 * 60_000).toISOString();
const expiredUntil = new Date(now - 60_000).toISOString();
const displayFrom = new Date(now - 5 * 60_000).toISOString();
const communicationSeeds = [];
for (let hotel = 1; hotel <= HOTEL_COUNT; hotel += 1) {
  const hotelSlug = slug(hotel);
  const hotelId = hotelIdBySlug.get(hotelSlug);
  const validTitle = `${runId}:valid:h${String(hotel).padStart(3, "0")}`;
  const expiredTitle = `${runId}:expired:h${String(hotel).padStart(3, "0")}`;
  for (const [title, displayUntil, state] of [
    [validTitle, validUntil, "valid"],
    [expiredTitle, expiredUntil, "expired"],
  ]) {
    communicationSeeds.push({
      hotel_id: hotelId,
      actor_role: "reception",
      category: "event",
      source_language: "en",
      title,
      body: `StayHub core 620 ${state} communication`,
      title_i18n: { en: title },
      body_i18n: { en: `StayHub core 620 ${state} communication` },
      translation_status: "ready",
      translated_at: new Date(now).toISOString(),
      audience_type: "all_active_guests",
      status: "sent",
      sent_at: new Date(now).toISOString(),
      display_from: displayFrom,
      display_until: displayUntil,
      sender_type: "staff",
      metadata_json: { factoryAcceptance: true, runId, state },
    });
  }
}
const { data: insertedSeeds, error: seedError } = await client
  .from("guest_communications")
  .insert(communicationSeeds)
  .select("id, hotel_id, title");
if (seedError) throw seedError;
if ((insertedSeeds || []).length !== 200) {
  throw new Error(`CORE620_COMMUNICATION_SEED_FAILED_${(insertedSeeds || []).length}`);
}
const seedIds = (insertedSeeds || []).map((row) => String(row.id));

const resultFile = "factory-core-620-results.json";
await rm(resultFile, { force: true });
const server = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(PORT)], {
  stdio: "inherit",
  env: { ...process.env, PORT: String(PORT) },
});

let result = null;
let runnerExit = 1;
const acceptanceStartedAt = new Date().toISOString();
try {
  await waitForServer(`http://127.0.0.1:${PORT}/`);
  console.log(`[core620-build] starting run ${runId}`);
  const runner = await run(process.execPath, [new URL("./factory-final-620-core.mjs", import.meta.url).pathname], {
    env: {
      ...process.env,
      STAYHUB_620_BASE_URL: `http://127.0.0.1:${PORT}`,
      STAYHUB_620_RUN_ID: runId,
      STAYHUB_620_PREFIX: PREFIX,
      STAYHUB_620_TIMEOUT_MS: "70000",
    },
  });
  runnerExit = runner.code;
  result = JSON.parse(await readFile(resultFile, "utf8"));
} finally {
  server.kill("SIGTERM");
}

const requestRows = await chunked((result?.results || []).filter((row) => row.kind === "request" && row.id).map((row) => row.id), 100, async (ids) => {
  const { data, error } = await client
    .from("guest_requests")
    .select("id, hotel_id, stay_id, stay_device_id, room_number_snapshot, title, is_test")
    .in("id", ids);
  if (error) throw error;
  return data || [];
});
const surveyRows = await chunked((result?.results || []).filter((row) => row.kind === "survey" && row.id).map((row) => row.id), 100, async (ids) => {
  const { data, error } = await client
    .from("guest_surveys")
    .select("id, hotel_id, stay_id, stay_device_id, room_number, is_test")
    .in("id", ids);
  if (error) throw error;
  return data || [];
});

const resultById = new Map((result?.results || []).filter((row) => row.id).map((row) => [String(row.id), row]));
let crossHotelLeakage = 0;
let identityMismatch = 0;
let productionPollution = 0;
for (const row of [...requestRows, ...surveyRows]) {
  const expected = resultById.get(String(row.id));
  if (!expected) continue;
  const expectedHotelId = hotelIdBySlug.get(String(expected.hotelSlug));
  if (String(row.hotel_id) !== expectedHotelId) crossHotelLeakage += 1;
  if (
    String(row.stay_id) !== String(expected.stayId) ||
    String(row.stay_device_id) !== String(expected.stayDeviceId)
  ) identityMismatch += 1;
  if (!row.is_test || !expectedHotelId) productionPollution += 1;
}
const requestIds = requestRows.map((row) => String(row.id));
const surveyIds = surveyRows.map((row) => String(row.id));
const duplicateWrites =
  requestIds.length - new Set(requestIds).size +
  surveyIds.length - new Set(surveyIds).size;

const forensic = {
  schemaVersion: "stayhub-core620-build-forensic-v1",
  runId,
  exactCommitSha: commitSha,
  environment: process.env.VERCEL_ENV,
  branch: process.env.VERCEL_GIT_COMMIT_REF,
  acceptanceStartedAt,
  hotels: (hotels || []).length,
  identityFixture: { stays: stayRows.length, devices: deviceRows.length },
  communicationSeeds: seedIds.length,
  requestRows: requestRows.length,
  surveyRows: surveyRows.length,
  duplicateWrites,
  crossHotelLeakage,
  identityMismatch,
  productionPollution,
  runnerExit,
  accepted: Boolean(result?.accepted) && runnerExit === 0 && duplicateWrites === 0 && crossHotelLeakage === 0 && identityMismatch === 0 && productionPollution === 0,
  load: result ? {
    totalOperations: result.totalOperations,
    wallMs: result.wallMs,
    request: result.request,
    survey: result.survey,
    communications: result.communications,
    thresholdsMs: result.thresholdsMs,
    correctnessAccepted: result.correctnessAccepted,
    performanceAccepted: result.performanceAccepted,
  } : null,
};
console.log(`[core620-forensic] ${JSON.stringify(forensic)}`);

const cleanupRequestIds = new Set(requestIds);
const cleanupSurveyIds = new Set(surveyIds);
const { data: markerRequests, error: markerRequestError } = await client
  .from("guest_requests")
  .select("id")
  .like("title", `${runId}:%`);
if (markerRequestError) throw markerRequestError;
for (const row of markerRequests || []) cleanupRequestIds.add(String(row.id));
const recentSurveyRows = await chunked(surveyDeviceIds, 100, async (ids) => {
  const { data, error } = await client
    .from("guest_surveys")
    .select("id")
    .eq("survey_type", "day3_guest_survey")
    .gte("created_at", acceptanceStartedAt)
    .in("stay_device_id", ids);
  if (error) throw error;
  return data || [];
});
for (const row of recentSurveyRows) cleanupSurveyIds.add(String(row.id));

await cleanupIds(client, "guest_requests", [...cleanupRequestIds]);
await cleanupIds(client, "guest_surveys", [...cleanupSurveyIds]);
await cleanupIds(client, "guest_communications", seedIds);

const [requestResidue, surveyResidue, commResidue] = await Promise.all([
  client.from("guest_requests").select("id", { count: "exact", head: true }).like("title", `${runId}:%`),
  client.from("guest_surveys").select("id", { count: "exact", head: true }).gte("created_at", acceptanceStartedAt).in("stay_device_id", surveyDeviceIds.slice(0, 100)),
  client.from("guest_communications").select("id", { count: "exact", head: true }).in("id", seedIds),
]);
const cleanupProof = {
  requestResidue: requestResidue.count || 0,
  surveyResidueFirst100Devices: surveyResidue.count || 0,
  communicationResidue: commResidue.count || 0,
};
console.log(`[core620-cleanup] ${JSON.stringify(cleanupProof)}`);

if (!forensic.accepted) process.exit(1);
