import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { sendManagerPushNotification } from "@/lib/staff-push/web-push";
import { translateGuestTextToBulgarian } from "@/lib/server/staff-translation";
import {
  DAY3_SURVEY_VERSION,
  calculateSurveyActiveUntil,
  getHotelByAnySlugAdmin,
  normalizeResolutionStatus,
  normalizeRoomNumber,
  normalizeSurveyCategories,
  normalizeSurveyText,
  validateHotelRoom,
  type GuestSurveyRow,
  mapSurveyRow,
} from "@/lib/server/day3-surveys";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function normalizeRating(value: unknown) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return null;
  const rounded = Math.round(rating);
  return rounded >= 1 && rounded <= 5 ? rounded : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const room = normalizeRoomNumber(body?.room);
    const rating = normalizeRating(body?.rating);
    const selectedCategories = normalizeSurveyCategories(body?.selectedCategories);
    const improvementText = normalizeSurveyText(body?.improvementText, 1000);
    const problemText = normalizeSurveyText(body?.problemText, 1000);
    const resolutionStatus = normalizeResolutionStatus(body?.resolutionStatus);
    const resolutionNote = normalizeSurveyText(body?.resolutionNote, 1000);
    const language = String(body?.language || body?.guestLanguage || "bg").trim().toLowerCase().slice(0, 8) || "bg";
    const surveyVersion = normalizeSurveyText(body?.surveyVersion, 40) || DAY3_SURVEY_VERSION;
    const targetDateKey = normalizeSurveyText(body?.targetDateKey, 20) || null;
    const firstConfirmedDateKey = normalizeSurveyText(body?.firstConfirmedDateKey, 20) || null;

    if (!hotelSlug || !room || rating === null) {
      return NextResponse.json(
        { ok: false, error: "Missing hotelSlug, room or rating" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const hotel = await getHotelByAnySlugAdmin(hotelSlug);
    const roomValidation = await validateHotelRoom(hotelSlug, room);
    if (!roomValidation.ok) {
      return NextResponse.json(
        { ok: false, error: roomValidation.error, code: "INVALID_ROOM" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const timezone = String(body?.hotelTimezone || roomValidation.timezone || "Europe/Sofia").trim() || "Europe/Sofia";
    const submittedAt = new Date();
    const { hotelDateKey, activeUntil } = calculateSurveyActiveUntil(submittedAt, timezone);
    const [improvementTextBg, problemTextBg, resolutionNoteBg] = await Promise.all([
      translateGuestTextToBulgarian(improvementText, {
        sourceLanguage: language,
        context: "Day 3 hotel guest survey improvement answer for Manager/Reception staff.",
        maxLength: 1000,
      }),
      translateGuestTextToBulgarian(problemText, {
        sourceLanguage: language,
        context: "Day 3 hotel guest survey problem description for Manager/Reception staff.",
        maxLength: 1000,
      }),
      translateGuestTextToBulgarian(resolutionNote, {
        sourceLanguage: language,
        context: "Day 3 hotel guest survey resolution note for Manager/Reception staff.",
        maxLength: 1000,
      }),
    ]);

    const { data, error } = await supabaseAdmin
      .from("guest_surveys")
      .insert({
        hotel_id: hotel.id,
        room_number: room,
        survey_type: "day3_guest_survey",
        rating,
        selected_categories: selectedCategories,
        improvement_text: improvementText,
        problem_text: problemText,
        resolution_status: resolutionStatus,
        resolution_note: resolutionNote,
        language,
        survey_version: surveyVersion,
        hotel_date_key: hotelDateKey,
        target_date_key: targetDateKey,
        first_confirmed_date_key: firstConfirmedDateKey,
        guest_submitted_at: submittedAt.toISOString(),
        active_until: activeUntil,
        metadata_json: {
          hotelTimezone: timezone,
          source: "guest_hub",
          improvement_text_bg: improvementTextBg || null,
          problem_text_bg: problemTextBg || null,
          resolution_note_bg: resolutionNoteBg || null,
          original_language: language,
        },
      })
      .select(
        "id, hotel_id, room_number, survey_type, rating, selected_categories, improvement_text, problem_text, resolution_status, resolution_note, language, survey_version, hotel_date_key, target_date_key, first_confirmed_date_key, guest_submitted_at, active_until, manager_read_at, metadata_json, created_at",
      )
      .single();

    if (error || !data) {
      console.error("guest day3 survey insert error", error);
      return NextResponse.json(
        { ok: false, error: error?.message || "Failed to save survey" },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    const survey = mapSurveyRow(data as GuestSurveyRow);

    await sendManagerPushNotification({
      hotelId: hotel.id,
      hotelSlug: hotel.slug,
      requestId: `survey-${survey.id}`,
      room,
      requestTitle: `Анкета Ден 3 · оценка ${rating}/5`,
      notificationTitle: "StayHub — Нова анкета",
      notificationUrl: `/staff/${hotel.slug}/manager?source=push&survey=${encodeURIComponent(survey.id)}`,
    }).catch((pushError) => {
      console.error("Manager survey push notification failed", pushError);
    });

    return NextResponse.json(
      {
        ok: true,
        survey,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("guest day3 survey POST error", error);
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
