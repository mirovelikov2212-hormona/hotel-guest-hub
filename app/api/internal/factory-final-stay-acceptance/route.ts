import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { POST as confirmStayPost } from "@/app/api/guest/stay/confirm/route";
import { POST as requestCreatePost } from "@/app/api/guest/request-create/route";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_CHALLENGE_HASH = "eadacb15abbea9fd26636ebba898eb0b5102d102a34edb932263a962b4db5da6";
const HOTEL_SLUG = "aquamarin-test";
const ACCEPTANCE_DATE = "2026-09-02";
const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };

type JsonResult = {
  status: number;
  body: Record<string, unknown>;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
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

async function callJsonPost(
  handler: (request: NextRequest) => Promise<Response>,
  path: string,
  body: Record<string, unknown>,
): Promise<JsonResult> {
  const request = new NextRequest(`https://acceptance.local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await handler(request);
  const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, body: parsed };
}

async function cleanupByPrefix(hotelId: string, prefix: string) {
  const { data: devices } = await supabaseAdmin
    .from("guest_stay_devices")
    .select("id, stay_id")
    .eq("hotel_id", hotelId)
    .like("device_token", `${prefix}%`);

  const stayIds = Array.from(new Set((devices || []).map((row) => String(row.stay_id || "")).filter(Boolean)));

  if (stayIds.length) {
    await supabaseAdmin.from("guest_requests").delete().eq("hotel_id", hotelId).in("stay_id", stayIds);
    await supabaseAdmin.from("guest_stay_devices").delete().eq("hotel_id", hotelId).in("stay_id", stayIds);
    await supabaseAdmin.from("guest_stays").delete().eq("hotel_id", hotelId).in("id", stayIds);
  }

  const { count: deviceResidue } = await supabaseAdmin
    .from("guest_stay_devices")
    .select("id", { count: "exact", head: true })
    .eq("hotel_id", hotelId)
    .like("device_token", `${prefix}%`);

  return { stayIds, deviceResidue: deviceResidue || 0 };
}

async function ensureRoomHasNoActiveStay(hotelId: string, room: string) {
  const { count, error } = await supabaseAdmin
    .from("guest_stays")
    .select("id", { count: "exact", head: true })
    .eq("hotel_id", hotelId)
    .eq("room_number", room)
    .eq("status", "active");
  if (error) throw error;
  return count || 0;
}

async function runRace(hotelId: string) {
  const room = "101";
  const prefix = `factory-final-race-${randomUUID()}-`;
  await cleanupByPrefix(hotelId, "factory-final-race-");

  const activeBefore = await ensureRoomHasNoActiveStay(hotelId, room);
  if (activeBefore !== 0) {
    return { ok: false, code: "RACE_ROOM_NOT_CLEAN", activeBefore, room };
  }

  const payloadA = {
    hotelSlug: HOTEL_SLUG,
    room,
    checkInDate: "2026-09-02",
    checkOutDate: "2026-09-03",
    deviceToken: `${prefix}a`,
    language: "en",
  };
  const payloadB = {
    hotelSlug: HOTEL_SLUG,
    room,
    checkInDate: "2026-09-01",
    checkOutDate: "2026-09-03",
    deviceToken: `${prefix}b`,
    language: "en",
  };

  const startedAt = Date.now();
  const [a, b] = await Promise.all([
    callJsonPost(confirmStayPost, "/api/guest/stay/confirm", payloadA),
    callJsonPost(confirmStayPost, "/api/guest/stay/confirm", payloadB),
  ]);
  const elapsedMs = Date.now() - startedAt;

  const { data: stays, error: staysError } = await supabaseAdmin
    .from("guest_stays")
    .select("id, room_number, check_in_date, check_out_date, status")
    .eq("hotel_id", hotelId)
    .eq("room_number", room)
    .eq("status", "active");
  if (staysError) throw staysError;

  const { data: devices, error: devicesError } = await supabaseAdmin
    .from("guest_stay_devices")
    .select("id, stay_id, device_token, room_number")
    .eq("hotel_id", hotelId)
    .like("device_token", `${prefix}%`);
  if (devicesError) throw devicesError;

  const statuses = [a.status, b.status].sort((left, right) => left - right);
  const bodies = [a.body, b.body];
  const conflictCount = bodies.filter((body) => body.error === "STAY_DATES_CONFLICT").length;
  const pass =
    statuses.length === 2 &&
    statuses[0] === 200 &&
    statuses[1] === 409 &&
    conflictCount === 1 &&
    (stays || []).length === 1 &&
    (devices || []).length === 1;

  const cleanup = await cleanupByPrefix(hotelId, prefix);
  const activeAfter = await ensureRoomHasNoActiveStay(hotelId, room);

  return {
    ok: pass && cleanup.deviceResidue === 0 && activeAfter === 0,
    status: pass ? "TRUE_SIMULTANEOUS_STAY_RACE_OK" : "TRUE_SIMULTANEOUS_STAY_RACE_FAILED",
    room,
    elapsedMs,
    responses: { a, b },
    evidenceBeforeCleanup: {
      activeStayCount: (stays || []).length,
      deviceCount: (devices || []).length,
      stays,
      devices,
      conflictCount,
    },
    cleanup: { ...cleanup, activeAfter },
  };
}

async function runTakeover(hotelId: string) {
  const room = "102";
  const prefix = `factory-final-takeover-${randomUUID()}-`;
  await cleanupByPrefix(hotelId, "factory-final-takeover-");

  const activeBefore = await ensureRoomHasNoActiveStay(hotelId, room);
  if (activeBefore !== 0) {
    return { ok: false, code: "TAKEOVER_ROOM_NOT_CLEAN", activeBefore, room };
  }

  const guestA = await callJsonPost(confirmStayPost, "/api/guest/stay/confirm", {
    hotelSlug: HOTEL_SLUG,
    room,
    checkInDate: "2026-09-01",
    checkOutDate: "2026-09-03",
    deviceToken: `${prefix}guest-a`,
    language: "en",
  });

  const stayA = guestA.body.stay as Record<string, unknown> | undefined;
  const stayAId = String(stayA?.id || "");
  const deviceAId = String(stayA?.stayDeviceId || "");
  if (guestA.status !== 200 || !stayAId || !deviceAId) {
    await cleanupByPrefix(hotelId, prefix);
    return { ok: false, code: "GUEST_A_CONFIRM_FAILED", guestA };
  }

  const staleAt = "2026-09-01T08:00:00.000Z";
  const [{ error: staleStayError }, { error: staleDeviceError }] = await Promise.all([
    supabaseAdmin.from("guest_stays").update({ last_seen_at: staleAt }).eq("id", stayAId).eq("hotel_id", hotelId),
    supabaseAdmin.from("guest_stay_devices").update({ last_seen_at: staleAt }).eq("id", deviceAId).eq("hotel_id", hotelId),
  ]);
  if (staleStayError || staleDeviceError) throw staleStayError || staleDeviceError;

  const guestB = await callJsonPost(confirmStayPost, "/api/guest/stay/confirm", {
    hotelSlug: HOTEL_SLUG,
    room,
    checkInDate: "2026-09-02",
    checkOutDate: "2026-09-03",
    deviceToken: `${prefix}guest-b`,
    language: "en",
  });

  const stayB = guestB.body.stay as Record<string, unknown> | undefined;
  const stayBId = String(stayB?.id || "");
  const deviceBId = String(stayB?.stayDeviceId || "");

  const oldARequest = await callJsonPost(requestCreatePost, "/api/guest/request-create", {
    hotelSlug: HOTEL_SLUG,
    room,
    type: "extra_pillow",
    typeLabel: "Acceptance extra pillow",
    note: `${prefix}stale-a-request`,
    serviceTime: "now",
    sourceRequestDef: "extra_pillow",
    guestLanguage: "en",
    stayId: stayAId,
    stayDeviceId: deviceAId,
  });

  const liveBRequest = await callJsonPost(requestCreatePost, "/api/guest/request-create", {
    hotelSlug: HOTEL_SLUG,
    room,
    type: "extra_pillow",
    typeLabel: "Acceptance extra pillow",
    note: `${prefix}live-b-request`,
    serviceTime: "now",
    sourceRequestDef: "extra_pillow",
    guestLanguage: "en",
    stayId: stayBId,
    stayDeviceId: deviceBId,
  });

  const { data: stayRows, error: stayRowsError } = await supabaseAdmin
    .from("guest_stays")
    .select("id, room_number, check_in_date, check_out_date, status, lifecycle_state, read_only_at, effective_check_out_at")
    .eq("hotel_id", hotelId)
    .eq("room_number", room)
    .in("id", [stayAId, stayBId].filter(Boolean));
  if (stayRowsError) throw stayRowsError;

  const { data: requestRows, error: requestRowsError } = await supabaseAdmin
    .from("guest_requests")
    .select("id, stay_id, stay_device_id, room_number_snapshot, request_type, message")
    .eq("hotel_id", hotelId)
    .in("stay_id", [stayAId, stayBId].filter(Boolean));
  if (requestRowsError) throw requestRowsError;

  const aRow = (stayRows || []).find((row) => String(row.id) === stayAId);
  const bRow = (stayRows || []).find((row) => String(row.id) === stayBId);
  const aRequests = (requestRows || []).filter((row) => String(row.stay_id) === stayAId);
  const bRequests = (requestRows || []).filter((row) => String(row.stay_id) === stayBId);

  const pass =
    guestB.status === 200 &&
    Boolean(stayBId && deviceBId) &&
    aRow?.status === "ended" &&
    aRow?.lifecycle_state === "read_only" &&
    bRow?.status === "active" &&
    oldARequest.status === 409 &&
    oldARequest.body.code === "STAY_ENDED" &&
    liveBRequest.status === 200 &&
    aRequests.length === 0 &&
    bRequests.length === 1 &&
    String(bRequests[0]?.stay_device_id || "") === deviceBId;

  const cleanup = await cleanupByPrefix(hotelId, prefix);
  const activeAfter = await ensureRoomHasNoActiveStay(hotelId, room);

  return {
    ok: pass && cleanup.deviceResidue === 0 && activeAfter === 0,
    status: pass ? "STALE_GUEST_A_TO_GUEST_B_TAKEOVER_OK" : "STALE_GUEST_A_TO_GUEST_B_TAKEOVER_FAILED",
    room,
    guestA,
    guestB,
    oldARequest,
    liveBRequest,
    evidenceBeforeCleanup: {
      stayRows,
      requestRows,
      oldGuestRequestCount: aRequests.length,
      liveGuestRequestCount: bRequests.length,
    },
    cleanup: { ...cleanup, activeAfter },
  };
}

export async function GET(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const url = new URL(req.url);
  if (sha256(url.searchParams.get("challenge") || "") !== EXPECTED_CHALLENGE_HASH) {
    return NextResponse.json({ ok: false, code: "INVALID_CHALLENGE" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  if (sofiaDateKey() !== ACCEPTANCE_DATE) {
    return NextResponse.json({ ok: false, code: "ACCEPTANCE_WINDOW_CLOSED" }, { status: 410, headers: NO_STORE_HEADERS });
  }

  try {
    const hotel = await resolveHotelByAnySlugAdmin(HOTEL_SLUG);
    if (!hotel.is_sandbox || hotel.slug !== HOTEL_SLUG) {
      return NextResponse.json({ ok: false, code: "SANDBOX_ONLY" }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const mode = url.searchParams.get("mode") || "";
    const result = mode === "race"
      ? await runRace(hotel.id)
      : mode === "takeover"
        ? await runTakeover(hotel.id)
        : { ok: false, code: "MODE_REQUIRED" };

    return NextResponse.json(
      {
        ...result,
        previewOnly: true,
        hotelSlug: HOTEL_SLUG,
        productionLiveActivation: false,
      },
      { status: result.ok ? 200 : 409, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: "ACCEPTANCE_FAILED",
        error: error instanceof Error ? error.message : String(error),
        previewOnly: true,
        productionLiveActivation: false,
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
