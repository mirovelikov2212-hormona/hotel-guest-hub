import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import {
  mapSurveyRow,
  resolveAuthorizedSurveyScope,
  type GuestSurveyRow,
} from "@/lib/server/day3-surveys";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const role = String(body?.role || "").trim().toLowerCase();
    const surveyId = String(body?.surveyId || body?.id || "").trim();

    if (!hotelSlug || role !== "manager" || !surveyId) {
      return NextResponse.json(
        { ok: false, error: "Missing hotelSlug, manager role or surveyId" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const scope = await resolveAuthorizedSurveyScope(hotelSlug, "manager");
    if (!scope.ok) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status, headers: NO_STORE_HEADERS },
      );
    }

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("guest_surveys")
      .update({
        manager_read_at: now,
        updated_at: now,
      })
      .eq("hotel_id", scope.hotelId)
      .eq("id", surveyId)
      .select(
        "id, hotel_id, room_number, survey_type, rating, selected_categories, improvement_text, problem_text, resolution_status, resolution_note, language, survey_version, hotel_date_key, target_date_key, first_confirmed_date_key, guest_submitted_at, active_until, manager_read_at, created_at",
      )
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message || "Failed to mark survey read" },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        survey: mapSurveyRow(data as GuestSurveyRow),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("staff surveys read POST error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
