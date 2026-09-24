import { NextResponse } from "next/server";

export const dynamic = "force-static";

const BODY = `# GOSTAYA

> GOSTAYA is a multi-hotel AI guest-experience and hotel-operations platform.

Canonical website: https://gostaya.com/en
German: https://gostaya.com/de
Bulgarian: https://gostaya.com/bg

## What GOSTAYA does

GOSTAYA connects the hotel guest, hotel departments and management in one operational platform.

Core product areas:
- Guest Hub: browser/PWA guest experience, room confirmation, hotel information, venues, services, requests, surveys and AI concierge.
- Staff Operations: Reception, Housekeeping and Maintenance role-based workspaces, direct routing, working-hours rules, alerts and request lifecycle.
- Operational AI: hotel-grounded concierge, safe action bridge, escalation and service-recovery boundaries.
- Manager Intelligence: operational overview, incidents, surveys, KPI and AI-assisted analysis.
- Staff Development: Hotel Standards -> Training -> Testing -> Verified Results -> HR Rules -> AI Management Analysis.
- Revenue Intelligence: paid services, immutable price evidence, upsell and ROI/value measurement.
- Integration Layer: provider-neutral contracts for PMS and other hotel systems with idempotency, audit and human approval boundaries.
- Product Factory: multi-hotel onboarding, Design Studio, sandbox certification, lifecycle and rollback.

## What GOSTAYA is not

GOSTAYA is not only a hotel chatbot. It connects guest intent to operational workflows and measurable management evidence.
GOSTAYA does not require a guest app download.
GOSTAYA does not make automatic punitive HR decisions.
External actions such as PMS folio charges require provider confirmation before they are treated as successful.

## Pilot evidence

An anonymized 2026 seasonal pilot at a Bulgarian seaside hotel recorded:
- 5,347 Guest Hub opens
- 2,448 deduplicated information interactions
- 145 non-test service requests
- 56 massage bookings
- EUR 2,570 charged massage value across 54 charged bookings
- 24-45 hours estimated administrative/coordination time avoided under a conservative model

The time-saved figure is a modeled estimate, not stopwatch-measured labor time. Observed counts and modeled values are kept separate.

## Demo

Live Guest Hub demo: https://gostaya.com/qr/demo?src=llms&code=gostaya-llms
`;

export function GET() {
  return new NextResponse(BODY, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
