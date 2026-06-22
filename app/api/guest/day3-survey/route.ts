import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { sendManagerPushNotification } from "@/lib/staff-push/web-push";
import { translateGuestTextToStaffLanguages } from "@/lib/server/staff-translation";
import { getTestDataFields, getTestDataMetadata, getTestRoomPolicy } from "@/lib/server/test-rooms";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";
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
      await logSystemEvent({
        hotelId: hotel.id,
        severity: "warning",
        source: "survey",
        eventType: "day3_survey_invalid_room_blocked",
        message: "Day 3 survey submission was blocked because the room number is not valid for the hotel.",
        roomNumber: room,
        metadata: { hotelSlug, rating, code: roomValidation.error },
      });
      return NextResponse.json(
        { ok: false, error: roomValidation.error, code: "INVALID_ROOM" },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const testRoomPolicy = await getTestRoomPolicy(hotel.id, room);
    const timezone = String(body?.hotelTimezone || roomValidation.timezone || "Europe/Sofia").trim() || "Europe/Sofia";
    const submittedAt = new Date();
    const { hotelDateKey, activeUntil } = calculateSurveyActiveUntil(submittedAt, timezone);
    const [improvementTranslations, problemTranslations, resolutionNoteTranslations] = await Promise.all([
      translateGuestTextToStaffLanguages(improvementText, {
        sourceLanguage: language,
        context: "Day 3 hotel guest survey improvement answer for Manager/Reception staff and reports.",
        maxLength: 1000,
      }),
      translateGuestTextToStaffLanguages(problemText, {
        sourceLanguage: language,
        context: "Day 3 hotel guest survey problem description for Manager/Reception staff and reports.",
        maxLength: 1000,
      }),
      translateGuestTextToStaffLanguages(resolutionNote, {
        sourceLanguage: language,
        context: "Day 3 hotel guest survey resolution note for Manager/Reception staff and reports.",
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
        improvement_text_original: improvementText || null,
        improvement_text_bg: improvementTranslations.bg || null,
        improvement_text_en: improvementTranslations.en || null,
        improvement_text_de: improvementTranslations.de || null,
        problem_text: problemText,
        problem_text_original: problemText || null,
        problem_text_bg: problemTranslations.bg || null,
        problem_text_en: problemTranslations.en || null,
        problem_text_de: problemTranslations.de || null,
        resolution_status: resolutionStatus,
        resolution_note: resolutionNote,
        resolution_note_original: resolutionNote || null,
        resolution_note_bg: resolutionNoteTranslations.bg || null,
        resolution_note_en: resolutionNoteTranslations.en || null,
        resolution_note_de: resolutionNoteTranslations.de || null,
        language,
        survey_version: surveyVersion,
        hotel_date_key: hotelDateKey,
        target_date_key: targetDateKey,
        first_confirmed_date_key: firstConfirmedDateKey,
        guest_submitted_at: submittedAt.toISOString(),
        active_until: activeUntil,
        manager_read_at: null,
        ...getTestDataFields(testRoomPolicy),
        metadata_json: {
          hotelTimezone: timezone,
          source: "guest_hub",
          improvement_text_bg: improvementTranslations.bg || null,
          improvement_text_en: improvementTranslations.en || null,
          improvement_text_de: improvementTranslations.de || null,
          problem_text_bg: problemTranslations.bg || null,
          problem_text_en: problemTranslations.en || null,
          problem_text_de: problemTranslations.de || null,
          resolution_note_bg: resolutionNoteTranslations.bg || null,
          resolution_note_en: resolutionNoteTranslations.en || null,
          resolution_note_de: resolutionNoteTranslations.de || null,
          original_language: language,
          reception_read_at: null,
          reception_read_by: null,
          ...getTestDataMetadata(testRoomPolicy),
        },
      })
      .select(
        "id, hotel_id, room_number, survey_type, rating, selected_categories, improvement_text, improvement_text_original, improvement_text_bg, improvement_text_en, improvement_text_de, problem_text, problem_text_original, problem_text_bg, problem_text_en, problem_text_de, resolution_status, resolution_note, resolution_note_original, resolution_note_bg, resolution_note_en, resolution_note_de, language, survey_version, hotel_date_key, target_date_key, first_confirmed_date_key, guest_submitted_at, active_until, manager_read_at, is_test, test_expires_at, metadata_json, created_at",
      )
      .single();

    if (error || !data) {
      console.error("guest day3 survey insert error", error);
      await logSystemError({
        hotelId: hotel.id,
        severity: "critical",
        source: "survey",
        eventType: "day3_survey_insert_failed",
        message: "Day 3 survey could not be inserted in Supabase.",
        roomNumber: room,
        error: error || new Error("No guest survey row returned after insert."),
        metadata: { hotelSlug, rating, selectedCategories, language, surveyVersion, targetDateKey },
      });
      return NextResponse.json(
        { ok: false, error: error?.message || "Failed to save survey" },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    const survey = mapSurveyRow(data as GuestSurveyRow);

    if (!testRoomPolicy.isTest) {
      await sendManagerPushNotification({
      hotelId: hotel.id,
      hotelSlug: hotel.slug,
      requestId: `survey-${survey.id}`,
      room,
      requestTitle: `Анкета Ден 3 · оценка ${rating}/5`,
      notificationTitle: "StayHub — Нова анкета",
      notificationUrl: `/staff/${hotel.slug}/manager?source=push&survey=${encodeURIComponent(survey.id)}`,
      }).catch(async (pushError) => {
        console.error("Manager survey push notification failed", pushError);
        await logSystemError({
          hotelId: hotel.id,
          source: "push",
          eventType: "manager_push_failed_after_day3_survey",
          message: "Manager push notification failed after a Day 3 survey was submitted.",
          roomNumber: room,
          departmentId: "manager",
          surveyId: survey.id,
          error: pushError,
          metadata: { hotelSlug, rating, surveyVersion },
        });
      });
    }

    return NextResponse.json(
      {
        ok: true,
        survey,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("guest day3 survey POST error", error);
    await logSystemError({
      severity: "critical",
      source: "api",
      eventType: "day3_survey_unexpected_error",
      message: "Unexpected server error while saving a Day 3 survey.",
      error,
    });
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
