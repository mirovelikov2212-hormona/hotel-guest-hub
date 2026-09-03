import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { POST as requestCreatePost } from "@/app/api/guest/request-create/route";
import { POST as surveyPost } from "@/app/api/guest/day3-survey/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const EXPECTED_CHALLENGE_HASH = "ffce312675638ab209d3ed46c1b4ea1e60fa389794c563d919bc25b2d8351065";
const ACCEPTANCE_DATE = "2026-09-03";
const PREFIX = "factory-heavy-20260901";
const HOTEL_COUNT = 100;
const REQUEST_P95_LIMIT = 3_000;
const SURVEY_P95_LIMIT = 3_000;
const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };

type JsonResult = {
  status: number;
  body: Record<string, unknown>;
};

type OperationResult = {
  kind: "request" | "survey";
  hotel: number;
  room: string;
  variant: number;
  marker: string;
  status: number;
  ok: boolean;
  duplicate: boolean;
  id: string | null;
  code: string | null;
  error: string | null;
  latencyMs: number;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function deterministicUuid(label: string, hotel: number, roomIndex: number) {
  const hash = createHash("md5").update(`${label}-${hotel}-${roomIndex}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20)}`;
}

function sofiaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((sorted.length * p) / 100) - 1);
  return Number(sorted[index].toFixed(1));
}

function summarize(rows: OperationResult[]) {
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

async function callJsonPost(
  handler: (request: NextRequest) => Promise<Response>,
  path: string,
  body: Record<string, unknown>,
  runId: string,
): Promise<JsonResult> {
  const request = new NextRequest(`https://acceptance.local${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-stayhub-load-run": runId,
    },
    body: JSON.stringify(body),
  });
  const response = await handler(request);
  const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, body: parsed };
}

const hotelSlug = (hotel: number) => `${PREFIX}-${String(hotel).padStart(3, "0")}-sandbox`;
const roomNumber = (roomIndex: number) => String(200 + roomIndex);

async function postOperation(
  kind: "request" | "survey",
  hotel: number,
  roomIndex: number,
  variant: number,
  runId: string,
): Promise<OperationResult> {
  const started = performance.now();
  const slug = hotelSlug(hotel);
  const room = roomNumber(roomIndex);
  const stayId = deterministicUuid("factory-heavy-stay", hotel, roomIndex);
  const stayDeviceId = deterministicUuid("factory-heavy-device", hotel, roomIndex);
  const marker = `${runId}:${kind}:h${hotel}:r${room}:v${variant}`;
  let status = 0;
  let body: Record<string, unknown> = {};
  let transportError: string | null = null;

  try {
    const result = kind === "request"
      ? await callJsonPost(requestCreatePost, "/api/guest/request-create", {
          hotelSlug: slug,
          room,
          type: "extra-towel",
          typeLabel: marker,
          note: marker,
          sourceRequestDef: "extra-towel",
          serviceTime: "now",
          guestLanguage: "en",
          stayId,
          stayDeviceId,
        }, runId)
      : await callJsonPost(surveyPost, "/api/guest/day3-survey", {
          hotelSlug: slug,
          room,
          stayId,
          stayDeviceId,
          launchSource: "manual_force",
          rating: 5,
          language: "en",
          surveyVersion: "day3-v1",
          improvementText: marker,
        }, runId);
    status = result.status;
    body = result.body;
  } catch (error) {
    transportError = error instanceof Error ? error.message : String(error);
  }

  const requestBody = body.request as Record<string, unknown> | undefined;
  const surveyBody = body.survey as Record<string, unknown> | undefined;
  return {
    kind,
    hotel,
    room,
    variant,
    marker,
    status,
    ok: body.ok === true,
    duplicate: body.duplicate === true,
    id: String(requestBody?.id || surveyBody?.id || "") || null,
    code: String(body.code || "") || null,
    error: transportError || (String(body.error || "") || null),
    latencyMs: Number((performance.now() - started).toFixed(1)),
  };
}

export async function GET(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const challenge = req.nextUrl.searchParams.get("challenge") || "";
  if (sha256(challenge) !== EXPECTED_CHALLENGE_HASH) {
    return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  if (sofiaDateKey() !== ACCEPTANCE_DATE) {
    return NextResponse.json({ ok: false, code: "ACCEPTANCE_WINDOW_CLOSED" }, { status: 410, headers: NO_STORE_HEADERS });
  }

  if (req.nextUrl.searchParams.get("mode") !== "core620") {
    return NextResponse.json({ ok: false, code: "MODE_REQUIRED" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const requestedRunId = String(req.nextUrl.searchParams.get("runId") || "").trim();
  if (!/^factory-heavy-20260901-core-620-[a-z0-9-]{8,80}$/.test(requestedRunId)) {
    return NextResponse.json({ ok: false, code: "RUN_ID_REQUIRED" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const operations: Array<Promise<OperationResult>> = [];
  for (let hotel = 1; hotel <= HOTEL_COUNT; hotel += 1) {
    operations.push(postOperation("request", hotel, 1, 1, requestedRunId));
    operations.push(postOperation("request", hotel, 2, 2, requestedRunId));
    operations.push(postOperation("request", hotel, 3, 3, requestedRunId));
    operations.push(postOperation("request", hotel, 1, 4, requestedRunId));
    operations.push(postOperation("survey", hotel, 1, 1, requestedRunId));
    operations.push(postOperation("survey", hotel, 2, 1, requestedRunId));
    if (hotel <= 20) operations.push(postOperation("request", hotel, 2, 5, requestedRunId));
  }

  if (operations.length !== 620) {
    return NextResponse.json(
      { ok: false, code: "EXPECTED_620_OPERATIONS", actual: operations.length },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const startedAt = new Date().toISOString();
  const wallStarted = performance.now();
  const results = await Promise.all(operations);
  const wallMs = Number((performance.now() - wallStarted).toFixed(1));
  const requests = results.filter((row) => row.kind === "request");
  const surveys = results.filter((row) => row.kind === "survey");
  const requestSummary = summarize(requests);
  const surveySummary = summarize(surveys);
  const surveyDuplicates = surveys.filter((row) => row.duplicate).length;
  const correctnessAccepted =
    requestSummary.total === 420 &&
    surveySummary.total === 200 &&
    requestSummary.failed === 0 &&
    surveySummary.failed === 0 &&
    surveyDuplicates === 0;
  const performanceAccepted =
    Number(requestSummary.p95) <= REQUEST_P95_LIMIT &&
    Number(surveySummary.p95) <= SURVEY_P95_LIMIT;
  const statusCounts = results.reduce<Record<string, number>>((acc, row) => {
    acc[String(row.status)] = (acc[String(row.status)] || 0) + 1;
    return acc;
  }, {});
  const result = {
    ok: correctnessAccepted && performanceAccepted,
    schemaVersion: "stayhub-factory-core-620-in-process-v1",
    executionModel: "exact-preview-in-process-route-handlers",
    previewSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    runId: requestedRunId,
    startedAt,
    completedAt: new Date().toISOString(),
    totalOperations: results.length,
    wallMs,
    request: requestSummary,
    survey: surveySummary,
    surveyDuplicates,
    statusCounts,
    thresholdsMs: { request: REQUEST_P95_LIMIT, survey: SURVEY_P95_LIMIT },
    correctnessAccepted,
    performanceAccepted,
    failures: results.filter((row) => !row.ok).slice(0, 30),
    previewOnly: true,
    productionLiveActivation: false,
  };

  console.info("FACTORY_CORE_620_IN_PROCESS_RESULT", result);
  return NextResponse.json(result, { status: result.ok ? 200 : 502, headers: NO_STORE_HEADERS });
}
