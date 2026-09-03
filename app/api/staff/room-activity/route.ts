import { NextRequest, NextResponse } from "next/server";

import { resolveGuestCommunicationsAccess } from "@/lib/server/guest-communications-access";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };
const ALLOWED_ROLES = new Set(["reception", "manager"]);

type RoomRow = {
  room_number: string;
  floor: string | null;
  building: string | null;
  room_type: string | null;
};

type StayRow = {
  id: string;
  room_number: string;
  last_seen_at: string;
  is_test: boolean;
};

type PushRow = {
  id: string;
  stay_id: string | null;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function naturalRoomCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export async function GET(req: NextRequest) {
  try {
    const hotelSlug = String(req.nextUrl.searchParams.get("hotelSlug") || "").trim().toLowerCase();
    const role = String(req.nextUrl.searchParams.get("role") || "").trim().toLowerCase();
    const access = await resolveGuestCommunicationsAccess(hotelSlug, role);

    if (!access) return json({ ok: false, error: "unauthorized" }, 401);
    if (!ALLOWED_ROLES.has(access.role)) return json({ ok: false, error: "forbidden" }, 403);

    const now = new Date().toISOString();
    const testFilter = access.hotel.isSandbox
      ? "is_test.is.null,is_test.eq.false,is_test.eq.true"
      : "is_test.is.null,is_test.eq.false";

    const [{ data: roomRows, error: roomsError }, { data: stayRows, error: staysError }, { data: pushRows, error: pushError }] = await Promise.all([
      supabaseAdmin
        .from("rooms")
        .select("room_number,floor,building,room_type")
        .eq("hotel_id", access.hotel.id)
        .eq("active", true)
        .limit(2500),
      supabaseAdmin
        .from("guest_stays")
        .select("id,room_number,last_seen_at,is_test")
        .eq("hotel_id", access.hotel.id)
        .eq("status", "active")
        .eq("lifecycle_state", "active")
        .or(testFilter)
        .gt("effective_check_out_at", now)
        .limit(2500),
      supabaseAdmin
        .from("guest_push_subscriptions")
        .select("id,stay_id")
        .eq("hotel_id", access.hotel.id)
        .eq("enabled", true)
        .or(testFilter)
        .limit(5000),
    ]);

    if (roomsError) throw roomsError;
    if (staysError) throw staysError;
    if (pushError) throw pushError;

    const rooms = (roomRows || []) as RoomRow[];
    const stays = (stayRows || []) as StayRow[];
    const pushes = (pushRows || []) as PushRow[];

    const activeStaysByRoom = new Map<string, StayRow[]>();
    const activeStayIds = new Set<string>();
    for (const stay of stays) {
      const roomNumber = String(stay.room_number || "").trim();
      if (!roomNumber) continue;
      activeStayIds.add(String(stay.id));
      const current = activeStaysByRoom.get(roomNumber) || [];
      current.push(stay);
      activeStaysByRoom.set(roomNumber, current);
    }

    const pushDevicesByStay = new Map<string, number>();
    for (const subscription of pushes) {
      const stayId = String(subscription.stay_id || "").trim();
      if (!stayId || !activeStayIds.has(stayId)) continue;
      pushDevicesByStay.set(stayId, (pushDevicesByStay.get(stayId) || 0) + 1);
    }

    const configuredRoomNumbers = new Set(rooms.map((room) => String(room.room_number || "").trim()).filter(Boolean));
    const unconfiguredActiveRooms = Array.from(activeStaysByRoom.keys()).filter((roomNumber) => !configuredRoomNumbers.has(roomNumber));

    const roomStates = rooms
      .map((room) => {
        const roomNumber = String(room.room_number || "").trim();
        const roomStays = activeStaysByRoom.get(roomNumber) || [];
        const pushDevices = roomStays.reduce((sum, stay) => sum + (pushDevicesByStay.get(String(stay.id)) || 0), 0);
        const latestSeenAt = roomStays
          .map((stay) => String(stay.last_seen_at || ""))
          .filter(Boolean)
          .sort()
          .at(-1) || null;

        return {
          roomNumber,
          floor: room.floor,
          building: room.building,
          roomType: room.room_type,
          activeStay: roomStays.length > 0,
          activeStayCount: roomStays.length,
          isTestStay: roomStays.some((stay) => Boolean(stay.is_test)),
          pushDevices,
          lastSeenAt: latestSeenAt,
        };
      })
      .filter((room) => room.roomNumber)
      .sort((a, b) => naturalRoomCompare(a.roomNumber, b.roomNumber));

    const activeRooms = roomStates.filter((room) => room.activeStay).length;
    const pushCoveredRooms = roomStates.filter((room) => room.activeStay && room.pushDevices > 0).length;
    const pushDevices = roomStates.reduce((sum, room) => sum + room.pushDevices, 0);

    return json({
      ok: true,
      hotel: access.hotel,
      generatedAt: now,
      summary: {
        totalRooms: roomStates.length,
        activeRooms,
        inactiveRooms: Math.max(0, roomStates.length - activeRooms),
        pushCoveredRooms,
        pushDevices,
        pushCoveragePercent: activeRooms ? Math.round((pushCoveredRooms / activeRooms) * 100) : 0,
        unconfiguredActiveRooms: unconfiguredActiveRooms.length,
      },
      rooms: roomStates,
    });
  } catch (error) {
    console.error("Staff room activity GET failed", error);
    return json({ ok: false, error: "unavailable" }, 503);
  }
}
