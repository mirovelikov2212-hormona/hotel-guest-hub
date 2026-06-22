import { NextRequest, NextResponse } from "next/server";

import { logSystemEvent } from "@/lib/server/system-events";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function isAuthorized(req: NextRequest) {
  const configuredSecret = String(process.env.CRON_SECRET || "").trim();
  if (!configuredSecret) return false;

  const authHeader = req.headers.get("authorization") || "";
  return authHeader === `Bearer ${configuredSecret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  await logSystemEvent({
    severity: "critical",
    source: "api",
    eventType: "monitoring_critical_email_test",
    message: "Controlled critical email alert test from StayHub monitoring.",
    metadata: {
      controlledTest: true,
      expectedEmail: true,
      route: "/api/admin/monitoring/test-critical-alert",
    },
  });

  return NextResponse.json(
    {
      ok: true,
      eventType: "monitoring_critical_email_test",
      message: "Critical test event logged. If email alerts are configured, one alert email should be sent.",
    },
    { headers: NO_STORE_HEADERS },
  );
}
