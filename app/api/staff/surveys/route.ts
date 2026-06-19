import { NextRequest, NextResponse } from "next/server";
import type { StaffRole } from "@/lib/staff-auth/cookie-name";
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

function isSurveyRole(value: string): value is Extract<StaffRole, "manager" | "reception"> {
  return value === "manager" || value === "reception";
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hotelSlug = String(searchParams.get("hotelSlug") || "").trim().toLowerCase();
    const role = String(searchParams.get("role") || "").trim().toLowerCase();

    if (!hotelSlug || !isSurveyRole(role)) {
      return NextResponse.json(
        { ok: false, error: "Missing hotelSlug or role" },
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

    const nowIso = new Date().toISOString();
    const recentCutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabaseAdmin
      .from("guest_surveys")
      .select(
        "id, hotel_id, room_number, survey_type, rating, selected_categories, improvement_text, problem_text, resolution_status, resolution_note, language, survey_version, hotel_date_key, target_date_key, first_confirmed_date_key, guest_submitted_at, active_until, manager_read_at, created_at",
      )
      .eq("hotel_id", scope.hotelId)
      .eq("survey_type", "day3_guest_survey")
      .order("guest_submitted_at", { ascending: false })
      .limit(250);

    if (role === "reception") {
      query = query.lte("rating", 3).gt("active_until", nowIso);
    } else {
      query = query.gte("guest_submitted_at", recentCutoff);
    }

    const { data, error } = await query;
    if (error) {
      console.error("staff surveys fetch error", error);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch surveys: ${error.message}` },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    const surveys = ((data || []) as GuestSurveyRow[]).map(mapSurveyRow);
    const activeSurveys = surveys.filter((survey) => new Date(survey.activeUntil).getTime() > Date.now());
    const reportSurveys = role === "manager"
      ? surveys.filter((survey) => new Date(survey.activeUntil).getTime() <= Date.now())
      : [];

    return NextResponse.json(
      {
        ok: true,
        activeSurveys,
        reportSurveys,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("staff surveys GET error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
