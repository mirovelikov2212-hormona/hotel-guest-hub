import { NextRequest, NextResponse } from "next/server";

import {
  dispatchDueGuestCommunications,
  guestCommunicationsDeliveryEnabled,
  recoverStuckGuestCommunications,
} from "@/lib/server/guest-communications-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function isAuthorizedCronRequest(req: NextRequest) {
  const configuredSecret = String(process.env.CRON_SECRET || "").trim();
  const authorization = req.headers.get("authorization") || "";
  if (configuredSecret) return authorization === `Bearer ${configuredSecret}`;
  return req.headers.get("x-vercel-cron") === "1";
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  if (!guestCommunicationsDeliveryEnabled()) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      authority: "guest_communications",
      message: "Guest Communications delivery is explicitly disabled.",
    }, { headers: NO_STORE });
  }

  try {
    const recovery = await recoverStuckGuestCommunications();
    const result = await dispatchDueGuestCommunications(20);
    return NextResponse.json({ ok: true, authority: "guest_communications", recovery, ...result }, { headers: NO_STORE });
  } catch (error) {
    console.error("Guest Communications dispatch failed", error);
    return NextResponse.json({ ok: false, error: "Guest Communications dispatch failed" }, { status: 500, headers: NO_STORE });
  }
}
