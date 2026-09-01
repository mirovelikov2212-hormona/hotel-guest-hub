import { NextRequest, NextResponse } from "next/server";

import { deliverSyntheticSandboxGuestCommunication } from "@/lib/server/guest-communications-delivery";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const secret = String(process.env.FACTORY_LOAD_TEST_SECRET || "").trim();
  const supplied = String(req.headers.get("x-stayhub-factory-load-secret") || "").trim();
  if (process.env.VERCEL_ENV !== "preview" || !secret || supplied !== secret) {
    return json({ ok: false, error: "not_found" }, 404);
  }

  const body = await req.json().catch(() => null);
  const communicationId = String(body?.communicationId || "").trim();
  const concurrency = Number(body?.concurrency || 25);
  if (!UUID_PATTERN.test(communicationId) || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 50) {
    return json({ ok: false, error: "invalid_input" }, 400);
  }

  const { data: communication, error: communicationError } = await supabaseAdmin
    .from("guest_communications")
    .select("id,hotel_id,category,source_language,title,body,title_i18n,body_i18n,translation_status,status,scheduled_at")
    .eq("id", communicationId)
    .eq("status", "queued")
    .eq("translation_status", "ready")
    .maybeSingle();
  if (communicationError) throw communicationError;
  if (!communication) return json({ ok: false, error: "communication_not_ready" }, 409);

  const { data: hotel, error: hotelError } = await supabaseAdmin
    .from("hotels")
    .select("id,slug,public_slug,active,is_sandbox")
    .eq("id", communication.hotel_id)
    .eq("is_sandbox", true)
    .maybeSingle();
  if (hotelError) throw hotelError;
  if (!hotel) return json({ ok: false, error: "sandbox_hotel_required" }, 409);

  const started = Date.now();
  const result = await deliverSyntheticSandboxGuestCommunication({ communication, hotel, concurrency });
  console.log(JSON.stringify({
    level: "info",
    message: "factory_synthetic_guest_communications_dispatch",
    communicationId,
    hotelId: hotel.id,
    durationMs: Date.now() - started,
    result,
  }));
  return json({ ok: true, transport: "synthetic_no_provider", durationMs: Date.now() - started, result });
}
