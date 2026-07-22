import { NextRequest, NextResponse } from "next/server";
import { confirmGuestStay } from "@/lib/server/guest-stays";
import { logSystemError } from "@/lib/server/system-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };

function statusForError(message: string) {
  if (message === "STAY_DATES_CONFLICT") return 409;
  if (["MISSING_STAY_FIELDS", "INVALID_STAY_DATES", "STAY_NOT_CURRENT", "STAY_TOO_OLD", "INVALID_ROOM", "STAY_ENDED"].includes(message)) return 400;
  return 500;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const result = await confirmGuestStay({
      hotelSlug: body?.hotelSlug,
      room: body?.room,
      checkInDate: body?.checkInDate,
      checkOutDate: body?.checkOutDate,
      deviceToken: body?.deviceToken,
      language: body?.language,
    });
    return NextResponse.json({ ok: true, stay: result.stay, surveyWindow: result.surveyWindow }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "STAY_CONFIRM_FAILED";
    if (statusForError(message) >= 500) {
      await logSystemError({
        source: "guest_hub",
        eventType: "guest_stay_confirm_failed",
        message: "Guest stay confirmation failed.",
        roomNumber: String(body?.room || "") || null,
        error,
        metadata: { hotelSlug: body?.hotelSlug, checkInDate: body?.checkInDate, checkOutDate: body?.checkOutDate },
      });
    }
    return NextResponse.json({ ok: false, error: message }, { status: statusForError(message), headers: NO_STORE_HEADERS });
  }
}
