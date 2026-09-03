import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { POST as createGuestRequest } from "@/app/api/guest/request-create/route";
import { POST as submitGuestSurvey } from "@/app/api/guest/day3-survey/route";
import { POST as readGuestCommunications } from "@/app/api/guest/communications/route";

export const dynamic = "force-dynamic";

const TARGETS = [
  { cellKey: "sandbox-standard-01", hotel: 6 },
  { cellKey: "sandbox-standard-02", hotel: 5 },
  { cellKey: "sandbox-standard-03", hotel: 15 },
  { cellKey: "sandbox-standard-04", hotel: 7 },
  { cellKey: "sandbox-standard-05", hotel: 1 },
  { cellKey: "sandbox-standard-06", hotel: 2 },
] as const;

function deterministicUuid(label: string, hotel: number, roomIndex: number) {
  const hash = createHash("md5").update(`${label}-${hotel}-${roomIndex}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20)}`;
}

function hotelSlug(hotel: number) {
  return `factory-heavy-20260901-${String(hotel).padStart(3, "0")}-sandbox`;
}

function roomNumber(roomIndex: number) {
  return String(200 + roomIndex);
}

function deviceToken(hotel: number, roomIndex: number) {
  return `factory-heavy-device-${hotel}-${roomIndex}`;
}

async function invoke(
  handler: (req: NextRequest) => Promise<Response>,
  origin: string,
  path: string,
  payload: Record<string, unknown>,
  runId: string,
) {
  const started = performance.now();
  try {
    const response = await handler(new NextRequest(new URL(path, origin), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-stayhub-load-run": runId,
      },
      body: JSON.stringify(payload),
    }));
    const body = await response.json().catch(() => null);
    return {
      status: response.status,
      ok: body?.ok === true,
      duplicate: body?.duplicate === true,
      id: body?.request?.id || body?.survey?.id || null,
      code: body?.code || null,
      error: body?.error || null,
      latencyMs: Number((performance.now() - started).toFixed(1)),
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      duplicate: false,
      id: null,
      code: "PROBE_HANDLER_EXCEPTION",
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Number((performance.now() - started).toFixed(1)),
    };
  }
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil((sorted.length * p) / 100) - 1)].toFixed(1));
}

export async function GET(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ ok: false, code: "PREVIEW_ONLY" }, { status: 404 });
  }

  const round = req.nextUrl.searchParams.get("round") === "warm" ? "warm" : "cold";
  const roundRoomIndexes = round === "cold"
    ? { request: 1, survey: 2, communications: 3 }
    : { request: 2, survey: 3, communications: 1 };
  const runId = `runtime-cell-${round}-${Date.now()}`;
  const origin = req.nextUrl.origin;
  const startedAt = new Date().toISOString();
  const wallStarted = performance.now();

  const operations = TARGETS.flatMap((target) => {
    const slug = hotelSlug(target.hotel);
    const makeIdentity = (roomIndex: number) => ({
      room: roomNumber(roomIndex),
      stayId: deterministicUuid("factory-heavy-stay", target.hotel, roomIndex),
      stayDeviceId: deterministicUuid("factory-heavy-device", target.hotel, roomIndex),
    });
    const requestIdentity = makeIdentity(roundRoomIndexes.request);
    const surveyIdentity = makeIdentity(roundRoomIndexes.survey);
    const communicationsIdentity = makeIdentity(roundRoomIndexes.communications);

    return [
      invoke(createGuestRequest, origin, "/api/guest/request-create", {
        hotelSlug: slug,
        room: requestIdentity.room,
        type: "extra-towel",
        typeLabel: `${runId}:request:${target.cellKey}`,
        sourceRequestDef: "extra-towel",
        serviceTime: "now",
        guestLanguage: "en",
        stayId: requestIdentity.stayId,
        stayDeviceId: requestIdentity.stayDeviceId,
      }, runId).then((result) => ({ ...result, kind: "request", ...target, hotelSlug: slug, room: requestIdentity.room })),
      invoke(submitGuestSurvey, origin, "/api/guest/day3-survey", {
        hotelSlug: slug,
        room: surveyIdentity.room,
        stayId: surveyIdentity.stayId,
        stayDeviceId: surveyIdentity.stayDeviceId,
        launchSource: "manual_force",
        rating: 5,
        language: "en",
        surveyVersion: "day3-v1",
      }, runId).then((result) => ({ ...result, kind: "survey", ...target, hotelSlug: slug, room: surveyIdentity.room })),
      invoke(readGuestCommunications, origin, "/api/guest/communications", {
        hotelSlug: slug,
        stayId: communicationsIdentity.stayId,
        stayDeviceId: communicationsIdentity.stayDeviceId,
        deviceToken: deviceToken(target.hotel, roundRoomIndexes.communications),
        language: "en",
      }, runId).then((result) => ({ ...result, kind: "communications", ...target, hotelSlug: slug, room: communicationsIdentity.room })),
    ];
  });

  const results = await Promise.all(operations);
  const wallMs = Number((performance.now() - wallStarted).toFixed(1));
  const summarize = (rows: typeof results) => {
    const successful = rows.filter((row) => row.ok);
    const latencies = successful.map((row) => row.latencyMs);
    return {
      total: rows.length,
      successful: successful.length,
      failed: rows.length - successful.length,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.length ? Number(Math.max(...latencies).toFixed(1)) : null,
    };
  };

  return NextResponse.json({
    ok: results.every((row) => row.ok) && results.filter((row) => row.kind === "survey").every((row) => !row.duplicate),
    schemaVersion: "stayhub-runtime-cell-probe-v3-preview-internal",
    round,
    runId,
    startedAt,
    completedAt: new Date().toISOString(),
    wallMs,
    totalOperations: results.length,
    byKind: {
      request: summarize(results.filter((row) => row.kind === "request")),
      survey: summarize(results.filter((row) => row.kind === "survey")),
      communications: summarize(results.filter((row) => row.kind === "communications")),
    },
    byCell: Object.fromEntries(TARGETS.map((target) => [target.cellKey, summarize(results.filter((row) => row.cellKey === target.cellKey))])),
    results,
  });
}
