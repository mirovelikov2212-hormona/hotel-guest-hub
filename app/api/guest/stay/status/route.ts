import { NextRequest, NextResponse } from "next/server";
import { getGuestStayStatus } from "@/lib/server/guest-stays";
import { getGuestStayAccessState } from "@/lib/server/guest-stay-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const result = await getGuestStayStatus({
      hotelSlug: body?.hotelSlug,
      stayId: body?.stayId,
      stayDeviceId: body?.stayDeviceId,
      deviceToken: body?.deviceToken,
    });
    const access = await getGuestStayAccessState({
      hotelId: result.hotel.id,
      room: result.stay.room,
      stayId: result.stay.id,
      stayDeviceId: result.stay.stayDeviceId,
    });

    return NextResponse.json(
      {
        ok: true,
        stay: {
          ...result.stay,
          // Compatibility: the existing Guest Hub keeps a confirmed room while
          // read access remains valid. New guest-side writes use canWrite/state.
          active: access.canRead,
          lifecycleState: access.state,
          canRead: access.canRead,
          canWrite: access.canWrite,
          readOnly: access.readOnly,
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "STAY_STATUS_FAILED";
    return NextResponse.json({ ok: false, error: message }, { status: 404, headers: NO_STORE_HEADERS });
  }
}
