import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { sendManagerPushNotification } from "@/lib/staff-push/web-push";
import { translateGuestTextToStaffLanguages } from "@/lib/server/staff-translation";
import { getTestRoomPolicy } from "@/lib/server/test-rooms";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";
import {
  getOperationalIsolationFields,
  getOperationalIsolationMetadata,
  shouldSuppressLivePush,
} from "@/lib/server/hotel-scope";
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
import { getHotelTimeParts, validateGuestStayIdentity } from "@/lib/server/guest-stays";
import { canonicalizeLocaleTag } from "@/lib/i18n/locale-model.mjs";
import {
  addDaysToStayDateKey,
  isDateInsideGuestSurveyWindow,
} from "@/lib/guest-stays/shared";

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

function validationError(error: string, code: string, status = 400) {
  return NextResponse.json(
    { ok: false, error, code },
    { status, headers: NO_STORE_HEADERS },
  );
}

async function findExistingStayDeviceSurvey(input: {
  stayId: string;
  stayDeviceId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("guest_surveys")
    .select("id")
    .eq("stay_id", input.stayId)
    .eq("stay_device_id", input.stayDeviceId)
    .eq("survey_type", "day3_guest_survey")
    .order("guest_submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data, error };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const hotelSlug = String(body?.hotelSlug || "").trim().toLowerCase();
    const room = normalizeRoomNumber(body?.room);
    const stayId = String(body?.stayId || "").trim();
    const stayDeviceId = String(body?.stayDeviceId || "").trim();
    const launchSource = normalizeSurveyText(body?.launchSource, 40) || "automatic";
    const rating = normalizeRating(body?.rating);
    const selectedCategories = normalizeSurveyCategories(body?.selectedCategories);
    const improvementText = normalizeSurveyText(body?.improvementText, 1000);
    const problemText = normalizeSurveyText(body?.problemText, 1000);
    const resolutionStatus = normalizeResolutionStatus(body?.resolutionStatus);
    const resolutionNote = normalizeSurveyText(body?.resolutionNote, 1000);
    const language = canonicalizeLocaleTag(body?.language || body?.guestLanguage) || "en";
    const surveyVersion = normalizeSurveyText(body?.surveyVersion, 40) || DAY3_SURVEY_VERSION;

    if (!hotelSlug || !room || !stayId || !stayDeviceId || rating === null) {
      return validationError(
        "Missing hotelSlug, room, stay identity or rating",
        "MISSING_SURVEY_IDENTITY",
      );
    }

    if (rating <= 4 && selectedCategories.length === 0) {
      return validationError("At least one survey category is required.", "MISSING_SURVEY_CATEGORY");
    }

    if (rating <= 4 && !improvementText) {
      return validationError("Improvement feedback is required.", "MISSING_SURVEY_IMPROVEMENT");
    }

    if (rating <= 3 && !problemText) {
      return validationError("Problem feedback is required for critical surveys.", "MISSING_SURVEY_PROBLEM");
    }

    if (rating <= 3 && !resolutionStatus) {
      return validationError("Resolution status is required for critical surveys.", "MISSING_SURVEY_RESOLUTION_STATUS");
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
      return validationError(roomValidation.error, "INVALID_ROOM");
    }

    const testRoomPolicy = await getTestRoomPolicy(hotel.id, room);
    const isolationFields = getOperationalIsolationFields({ hotel, testRoomPolicy });
    const isolationMetadata = getOperationalIsolationMetadata({ hotel, testRoomPolicy });
    const suppressLivePush = shouldSuppressLivePush({ hotel, testRoomPolicy });

    const stayIdentity = await validateGuestStayIdentity({
      hotelId: hotel.id,
      room,
      stayId,
      stayDeviceId,
    });
    if (!stayIdentity) {
      return validationError("A confirmed stay is required.", "STAY_REQUIRED", 401);
    }

    const checkInDate = String(stayIdentity.stay.check_in_date || "");
    const checkOutDate = String(stayIdentity.stay.check_out_date || "");
    const targetDateKey = addDaysToStayDateKey(checkInDate, 2);
    const firstConfirmedDateKey = checkInDate;
    const timezone = String(body?.hotelTimezone || roomValidation.timezone || "UTC").trim() || "UTC";
    const submittedAt = new Date();
    const hotelNow = getHotelTimeParts(timezone, submittedAt);
    const insideSurveyWindow = isDateInsideGuestSurveyWindow({
      checkInDate,
      checkOutDate,
      hotelDateKey: hotelNow.dateKey,
      hotelMinutes: hotelNow.minutes,
    });
    const allowSandboxForce = launchSource === "manual_force" && Boolean(hotel.is_sandbox || isolationFields.is_test);

    if (!insideSurveyWindow && !allowSandboxForce) {
      return validationError(
        "The mid-stay survey is not active for this stay today.",
        "SURVEY_NOT_ACTIVE",
        409,
      );
    }

    const existing = await findExistingStayDeviceSurvey({ stayId, stayDeviceId });
    if (existing.error) {
      await logSystemError({
        hotelId: hotel.id,
        source: "survey",
        eventType: "day3_survey_duplicate_check_failed",
        message: "Day 3 survey duplicate protection could not verify an existing response.",
        roomNumber: room,
        error: existing.error,
        metadata: { hotelSlug, surveyVersion, targetDateKey, stayId, stayDeviceId },
      });
    } else if (existing.data?.id) {
      return NextResponse.json(
        { ok: true, survey: { id: existing.data.id }, duplicate: true },
        { headers: NO_STORE_HEADERS },
      );
    }

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

    const insertPayload = {
      hotel_id: hotel.id,
      room_number: room,
      stay_id: stayId,
      stay_device_id: stayDeviceId,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
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
      ...isolationFields,
      metadata_json: {
        ...isolationMetadata,
        hotelTimezone: timezone,
        source: "guest_hub",
        launchSource,
        stayId,
        stayDeviceId,
        checkInDate,
        checkOutDate,
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
      },
    };

    let { data, error } = await supabaseAdmin
      .from("guest_surveys")
      .insert(insertPayload)
      .select(
        "id, hotel_id, room_number, survey_type, rating, selected_categories, improvement_text, improvement_text_original, improvement_text_bg, improvement_text_en, improvement_text_de, problem_text, problem_text_original, problem_text_bg, problem_text_en, problem_text_de, resolution_status, resolution_note, resolution_note_original, resolution_note_bg, resolution_note_en, resolution_note_de, language, survey_version, hotel_date_key, target_date_key, first_confirmed_date_key, guest_submitted_at, active_until, manager_read_at, is_test, test_expires_at, metadata_json, created_at",
      )
      .single();

    if (error?.code === "23505") {
      const duplicate = await findExistingStayDeviceSurvey({ stayId, stayDeviceId });
      if (duplicate.data?.id) {
        return NextResponse.json(
          { ok: true, survey: { id: duplicate.data.id }, duplicate: true },
          { headers: NO_STORE_HEADERS },
        );
      }
    }

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
        metadata: { hotelSlug, rating, selectedCategories, language, surveyVersion, targetDateKey, stayId, stayDeviceId },
      });
      return NextResponse.json(
        { ok: false, error: error?.message || "Failed to save survey" },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    const survey = mapSurveyRow(data as GuestSurveyRow);

    if (!suppressLivePush) {
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
          metadata: { hotelSlug, rating, surveyVersion, stayId, stayDeviceId },
        });
      });
    }

    return NextResponse.json({ ok: true, survey }, { headers: NO_STORE_HEADERS });
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
