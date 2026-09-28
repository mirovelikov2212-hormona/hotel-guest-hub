import { NextRequest, NextResponse } from "next/server";

import {
  GUEST_COMMUNICATION_LANGUAGES,
  translateGuestCommunication,
  type GuestCommunicationLanguage,
} from "@/lib/server/guest-communications-translation";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import { enforceStaffSameOrigin } from "@/lib/staff-auth/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const originError = enforceStaffSameOrigin(req);
  if (originError) return originError;

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "OFFER_TRANSLATION_BODY_REQUIRED" }, { status: 400 });
  }

  const hotelSlug = String(body.hotelSlug || "").trim().toLowerCase();
  const sourceLanguage = String(body.sourceLanguage || "").trim().toLowerCase() as GuestCommunicationLanguage;
  const title = String(body.title || "").trim();
  const shortDescription = String(body.shortDescription || "").trim();

  if (!hotelSlug || !GUEST_COMMUNICATION_LANGUAGES.includes(sourceLanguage) || !title) {
    return NextResponse.json({ ok: false, error: "OFFER_TRANSLATION_INPUT_INVALID" }, { status: 400 });
  }

  const session = await getCurrentStaffSession(hotelSlug, "manager");
  if (!session || session.role !== "manager") {
    return NextResponse.json({ ok: false, error: "OFFER_TRANSLATION_MANAGER_REQUIRED" }, { status: 403 });
  }

  try {
    const translated = await translateGuestCommunication({
      sourceLanguage,
      title,
      body: shortDescription || title,
    });

    return NextResponse.json({
      ok: true,
      titleByLang: translated.titleI18n,
      shortDescriptionByLang: shortDescription ? translated.bodyI18n : {},
    });
  } catch (error) {
    console.error("offer translation failed", error);
    return NextResponse.json(
      { ok: false, error: "OFFER_TRANSLATION_FAILED" },
      { status: 502 },
    );
  }
}
