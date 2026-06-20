import { NextRequest, NextResponse } from "next/server";
import type { StaffRole } from "@/lib/staff-auth/cookie-name";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import {
  mapSurveyRow,
  resolveAuthorizedSurveyScope,
  type GuestSurveyRow,
} from "@/lib/server/day3-surveys";
import { hasBulgarianLetters, translateGuestTextToBulgarian } from "@/lib/server/staff-translation";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function isSurveyRole(value: string): value is Extract<StaffRole, "manager" | "reception"> {
  return value === "manager" || value === "reception";
}

function shouldBackfillBulgarianText(original: string | null, translated: unknown, metadata: Record<string, unknown>) {
  const raw = String(original || "").trim();
  if (!raw || hasBulgarianLetters(raw)) return false;
  if (metadata.staff_translation_attempted_at) return false;

  const current = String(translated || "").trim();
  if (!current) return true;
  return current === raw || !hasBulgarianLetters(current);
}

async function backfillMissingSurveyTranslations(rows: GuestSurveyRow[]) {
  const candidates = rows
    .filter((row) => String(row.language || "").toLowerCase() !== "bg")
    .filter((row) => {
      const metadata = row.metadata_json && typeof row.metadata_json === "object"
        ? row.metadata_json as Record<string, unknown>
        : {};

      return (
        shouldBackfillBulgarianText(row.improvement_text, metadata.improvement_text_bg, metadata) ||
        shouldBackfillBulgarianText(row.problem_text, metadata.problem_text_bg, metadata) ||
        shouldBackfillBulgarianText(row.resolution_note, metadata.resolution_note_bg, metadata)
      );
    })
    .slice(0, 6);

  if (!candidates.length) return rows;

  const updatedById = new Map<string, GuestSurveyRow>();

  await Promise.all(candidates.map(async (row) => {
    const metadata = row.metadata_json && typeof row.metadata_json === "object"
      ? row.metadata_json as Record<string, unknown>
      : {};
    const sourceLanguage = String(row.language || "unknown");

    const [improvementBg, problemBg, resolutionNoteBg] = await Promise.all([
      shouldBackfillBulgarianText(row.improvement_text, metadata.improvement_text_bg, metadata)
        ? translateGuestTextToBulgarian(row.improvement_text, {
            sourceLanguage,
            context: "Backfill Day 3 hotel guest survey improvement answer for Manager/Reception staff.",
            maxLength: 1000,
          })
        : Promise.resolve(String(metadata.improvement_text_bg || row.improvement_text || "")),
      shouldBackfillBulgarianText(row.problem_text, metadata.problem_text_bg, metadata)
        ? translateGuestTextToBulgarian(row.problem_text, {
            sourceLanguage,
            context: "Backfill Day 3 hotel guest survey problem answer for Manager/Reception staff.",
            maxLength: 1000,
          })
        : Promise.resolve(String(metadata.problem_text_bg || row.problem_text || "")),
      shouldBackfillBulgarianText(row.resolution_note, metadata.resolution_note_bg, metadata)
        ? translateGuestTextToBulgarian(row.resolution_note, {
            sourceLanguage,
            context: "Backfill Day 3 hotel guest survey resolution note for Manager/Reception staff.",
            maxLength: 1000,
          })
        : Promise.resolve(String(metadata.resolution_note_bg || row.resolution_note || "")),
    ]);

    const nextMetadata = {
      ...metadata,
      improvement_text_bg: improvementBg || null,
      problem_text_bg: problemBg || null,
      resolution_note_bg: resolutionNoteBg || null,
      staff_translation_attempted_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("guest_surveys")
      .update({
        improvement_text_original: row.improvement_text_original || row.improvement_text || null,
        improvement_text_bg: improvementBg || null,
        problem_text_original: row.problem_text_original || row.problem_text || null,
        problem_text_bg: problemBg || null,
        resolution_note_original: row.resolution_note_original || row.resolution_note || null,
        resolution_note_bg: resolutionNoteBg || null,
        metadata_json: nextMetadata,
      })
      .eq("id", row.id)
      .select(
        "id, hotel_id, room_number, survey_type, rating, selected_categories, improvement_text, improvement_text_original, improvement_text_bg, improvement_text_en, improvement_text_de, problem_text, problem_text_original, problem_text_bg, problem_text_en, problem_text_de, resolution_status, resolution_note, resolution_note_original, resolution_note_bg, resolution_note_en, resolution_note_de, language, survey_version, hotel_date_key, target_date_key, first_confirmed_date_key, guest_submitted_at, active_until, manager_read_at, metadata_json, created_at",
      )
      .single();

    if (error || !data) {
      console.error("survey translation backfill failed", { surveyId: row.id, error });
      return;
    }

    updatedById.set(row.id, data as GuestSurveyRow);
  }));

  return rows.map((row) => updatedById.get(row.id) || row);
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
        "id, hotel_id, room_number, survey_type, rating, selected_categories, improvement_text, improvement_text_original, improvement_text_bg, improvement_text_en, improvement_text_de, problem_text, problem_text_original, problem_text_bg, problem_text_en, problem_text_de, resolution_status, resolution_note, resolution_note_original, resolution_note_bg, resolution_note_en, resolution_note_de, language, survey_version, hotel_date_key, target_date_key, first_confirmed_date_key, guest_submitted_at, active_until, manager_read_at, metadata_json, created_at",
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

    const hydratedRows = await backfillMissingSurveyTranslations((data || []) as GuestSurveyRow[]);
    const surveys = hydratedRows.map(mapSurveyRow);
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
