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

const SURVEY_SELECT =
  "id, hotel_id, room_number, survey_type, rating, selected_categories, improvement_text, problem_text, resolution_status, resolution_note, language, survey_version, hotel_date_key, target_date_key, first_confirmed_date_key, guest_submitted_at, active_until, manager_read_at, metadata_json, created_at";

function isSurveyReadRole(value: string): value is "manager" | "reception" {
  return value === "manager" || value === "reception";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const role = String(body?.role || "").trim().toLowerCase();
    const surveyId = String(body?.surveyId || body?.id || "").trim();

    if (!hotelSlug || !isSurveyReadRole(role) || !surveyId) {
      return NextResponse.json(
        { ok: false, error: "Missing hotelSlug, role or surveyId" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const scope = await resolveAuthorizedSurveyScope(hotelSlug, role);
    if (!scope.ok) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status, headers: NO_STORE_HEADERS },
      );
    }

    const now = new Date().toISOString();

    if (role === "manager") {
      const { data, error } = await supabaseAdmin
        .from("guest_surveys")
        .update({
          manager_read_at: now,
          manager_read_by: "manager",
          updated_at: now,
        })
        .eq("hotel_id", scope.hotelId)
        .eq("id", surveyId)
        .select(SURVEY_SELECT)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { ok: false, error: error?.message || "Failed to mark survey read" },
          { status: 500, headers: NO_STORE_HEADERS },
        );
      }

      return NextResponse.json(
        { ok: true, survey: mapSurveyRow(data as GuestSurveyRow) },
        { headers: NO_STORE_HEADERS },
      );
    }

    const { data: current, error: currentError } = await supabaseAdmin
      .from("guest_surveys")
      .select("metadata_json")
      .eq("hotel_id", scope.hotelId)
      .eq("id", surveyId)
      .single();

    if (currentError || !current) {
      return NextResponse.json(
        { ok: false, error: currentError?.message || "Survey not found" },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    const metadata = current.metadata_json && typeof current.metadata_json === "object"
      ? current.metadata_json as Record<string, unknown>
      : {};

    const { data, error } = await supabaseAdmin
      .from("guest_surveys")
      .update({
        metadata_json: {
          ...metadata,
          reception_read_at: now,
          reception_read_by: "reception",
        },
        updated_at: now,
      })
      .eq("hotel_id", scope.hotelId)
      .eq("id", surveyId)
      .select(SURVEY_SELECT)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message || "Failed to mark survey read" },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { ok: true, survey: mapSurveyRow(data as GuestSurveyRow) },
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
