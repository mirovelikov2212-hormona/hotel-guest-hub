import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const CHALLENGE_HASH = "05f27edb48d56afd02419ef6ae1b2aa2355c8bb4c76257c94fcb09fd89c125d3";
const PREFIX = "factory-heavy-20260901";
const BOOKING_DATE = "2026-09-03";

type Result = {
  kind: "request" | "survey" | "massage_unique" | "massage_contention";
  hotel: number;
  room: number;
  status: number;
  ok: boolean;
  code: string | null;
  id: string | null;
  replay: boolean;
  latencyMs: number;
  error: string | null;
};

type ApiBody = {
  ok?: boolean;
  code?: unknown;
  error?: unknown;
  request?: { id?: unknown };
  survey?: { id?: unknown };
  result?: { nativeBookingId?: unknown; idempotentReplay?: boolean };
};

function deterministicUuid(label: string, hotel: number, room: number) {
  const hash = createHash("md5").update(`${label}-${hotel}-${room}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20)}`;
}

function percentile(values: number[], value: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value / 100) - 1)].toFixed(1));
}

function summarize(rows: Result[]) {
  const latencies = rows.map((row) => row.latencyMs);
  return {
    total: rows.length,
    successful: rows.filter((row) => row.ok).length,
    failed: rows.filter((row) => !row.ok).length,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
  };
}

function safeEqualChallenge(value: string) {
  const actual = createHash("sha256").update(value).digest("hex");
  return actual.length === CHALLENGE_HASH.length &&
    Buffer.from(actual).equals(Buffer.from(CHALLENGE_HASH));
}

export async function GET(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ ok: false, code: "PREVIEW_ONLY" }, { status: 404 });
  }
  if (!safeEqualChallenge(req.nextUrl.searchParams.get("challenge") || "")) {
    return NextResponse.json({ ok: false, code: "INVALID_CHALLENGE" }, { status: 401 });
  }

  const smoke = req.nextUrl.searchParams.get("mode") === "smoke";
  const runId = `factory-mixed-${smoke ? "smoke" : "peak"}-${Date.now()}`;
  const origin = req.nextUrl.origin;
  const forwardedHeaders: Record<string, string> = { "content-type": "application/json", "x-stayhub-load-run": runId };
  const cookie = req.headers.get("cookie");
  const bypass = req.headers.get("x-vercel-protection-bypass");
  if (cookie) forwardedHeaders.cookie = cookie;
  if (bypass) forwardedHeaders["x-vercel-protection-bypass"] = bypass;

  async function post(kind: Result["kind"], hotel: number, room: number, time?: string): Promise<Result> {
    const started = performance.now();
    const hotelSlug = `${PREFIX}-${String(hotel).padStart(3, "0")}-sandbox`;
    const roomNumber = String(200 + room);
    const stayId = deterministicUuid("factory-heavy-stay", hotel, room);
    const stayDeviceId = deterministicUuid("factory-heavy-device", hotel, room);
    let status = 0;
    let body: ApiBody | null = null;
    let error: string | null = null;
    try {
      const massage = kind.startsWith("massage");
      const route = massage ? "/api/guest/massages" : kind === "request" ? "/api/guest/request-create" : "/api/guest/day3-survey";
      const payload = massage
        ? { hotelSlug, room: roomNumber, roomConfirmed: true, serviceId: "load_massage", date: BOOKING_DATE,
            time, stayId, stayDeviceId, guestLanguage: "en" }
        : kind === "request"
          ? { hotelSlug, room: roomNumber, type: "extra-towel", typeLabel: `${runId}:h${hotel}:r${room}`,
              sourceRequestDef: "extra-towel", serviceTime: "now", guestLanguage: "en", stayId, stayDeviceId }
          : { hotelSlug, room: roomNumber, stayId, stayDeviceId, launchSource: "manual_force",
              rating: 5, language: "en", surveyVersion: "day3-v1", loadRunId: runId };
      const response = await fetch(`${origin}${route}`, {
        method: "POST",
        headers: forwardedHeaders,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120_000),
        cache: "no-store",
      });
      status = response.status;
      body = await response.json().catch(() => null) as ApiBody | null;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    return {
      kind, hotel, room, status, ok: body?.ok === true, code: String(body?.code || "") || null,
      id: String(body?.request?.id || body?.survey?.id || body?.result?.nativeBookingId || "") || null,
      replay: body?.result?.idempotentReplay === true,
      latencyMs: Number((performance.now() - started).toFixed(1)),
      error: error || String(body?.error || "") || null,
    };
  }

  const operations: Array<Promise<Result>> = [];
  const hotels = smoke ? 1 : 100;
  for (let hotel = 1; hotel <= hotels; hotel += 1) {
    const requestCount = smoke ? 1 : 3;
    const surveyCount = smoke ? 1 : 2;
    for (let room = 1; room <= requestCount; room += 1) operations.push(post("request", hotel, room));
    for (let room = 1; room <= surveyCount; room += 1) operations.push(post("survey", hotel, room));
    operations.push(post("massage_unique", hotel, 1, "10:00"));
  }
  const contentionCount = smoke ? 2 : 20;
  for (let attempt = 1; attempt <= contentionCount; attempt += 1) {
    const room = ((attempt - 1) % 3) + 1;
    operations.push(post("massage_contention", 1, room, "20:00"));
  }

  const wallStarted = performance.now();
  const results = await Promise.all(operations);
  const wallMs = Number((performance.now() - wallStarted).toFixed(1));
  const requestRows = results.filter((row) => row.kind === "request");
  const surveyRows = results.filter((row) => row.kind === "survey");
  const uniqueRows = results.filter((row) => row.kind === "massage_unique");
  const contentionRows = results.filter((row) => row.kind === "massage_contention");
  const contentionWinners = contentionRows.filter((row) => row.ok && !row.replay);
  const contentionReplays = contentionRows.filter((row) => row.ok && row.replay);
  const accepted = requestRows.every((row) => row.ok) &&
    surveyRows.every((row) => row.ok) &&
    uniqueRows.every((row) => row.ok) &&
    contentionWinners.length === 1 &&
    contentionRows.filter((row) => !row.ok).every((row) => row.status === 409);

  return NextResponse.json({
    ok: accepted,
    schemaVersion: "stayhub-mixed-capacity-v1",
    runId,
    mode: smoke ? "smoke" : "peak",
    hotels,
    totalOperations: results.length,
    wallMs,
    request: summarize(requestRows),
    survey: summarize(surveyRows),
    massageUnique: summarize(uniqueRows),
    massageContention: {
      ...summarize(contentionRows),
      winners: contentionWinners.length,
      idempotentReplays: contentionReplays.length,
      expectedRejected: contentionRows.filter((row) => !row.ok && row.status === 409).length,
    },
    failures: results.filter((row) => !row.ok && row.kind !== "massage_contention"),
    contentionUnexpected: contentionRows.filter((row) => !row.ok && row.status !== 409),
    ids: results.filter((row) => row.id).map((row) => ({ kind: row.kind, hotel: row.hotel, room: row.room, id: row.id })),
  }, { status: accepted ? 200 : 500 });
}
