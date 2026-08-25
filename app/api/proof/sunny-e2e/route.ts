import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = "gxAt3HPwBf417YETYApu_vMSRhp7K0RcE1Lz5ud9hSo";
const BASE = "https://www.stayhub.app";
const HOTEL = "sunny-castle-sandbox";
const ROOM = "SC-T03";
const DEVICE = "sunny-proof-20260825-7f5e90d4";
const MARKER = "SUNNY_E2E_20260825 тест 7f5e90d4";

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("token") !== TOKEN) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const stayRes = await fetch(`${BASE}/api/guest/stay/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "StayHub-Sunny-E2E-Proof/1.0" },
    body: JSON.stringify({
      hotelSlug: HOTEL,
      room: ROOM,
      checkInDate: "2026-08-25",
      checkOutDate: "2026-08-27",
      deviceToken: DEVICE,
      language: "bg",
    }),
    cache: "no-store",
  });
  const stay = await stayRes.json().catch(() => null);
  if (!stayRes.ok || !stay?.ok || !stay?.stay?.id || !stay?.stay?.stayDeviceId) {
    return NextResponse.json({ ok: false, phase: "stay_confirm", stayStatus: stayRes.status, stay }, { status: 502 });
  }

  const requestRes = await fetch(`${BASE}/api/guest/request-create`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "StayHub-Sunny-E2E-Proof/1.0" },
    body: JSON.stringify({
      hotelSlug: HOTEL,
      room: ROOM,
      type: "extra-towel",
      typeLabel: "Допълнителна кърпа",
      note: MARKER,
      serviceTime: "now",
      sourceRequestDef: "extra-towel",
      guestLanguage: "bg",
      stayId: stay.stay.id,
      stayDeviceId: stay.stay.stayDeviceId,
    }),
    cache: "no-store",
  });
  const requestBody = await requestRes.json().catch(() => null);

  return NextResponse.json({
    ok: requestRes.ok && Boolean(requestBody?.ok),
    phase: "complete",
    stayStatus: stayRes.status,
    requestStatus: requestRes.status,
    stay: {
      id: stay.stay.id,
      stayDeviceId: stay.stay.stayDeviceId,
      room: stay.stay.room,
      active: stay.stay.active,
    },
    request: requestBody,
    marker: MARKER,
  }, { status: requestRes.ok && requestBody?.ok ? 200 : 502, headers: { "cache-control": "no-store" } });
}
