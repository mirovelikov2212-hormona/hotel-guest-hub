import { after, NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { validateGuestRequestCreatePayload } from "@/lib/server/guest-request-input-validation.mjs";
import { resolveGuestRequestAuthority } from "@/lib/server/guest-request-authority.mjs";
import { isFactoryManagedGuestConfig } from "@/lib/guest/guest-runtime-capabilities.mjs";
import { getDepartmentForRequestType } from "@/lib/staff/routing/request-routing";
import { normalizeStaffRequestType } from "@/lib/staff/request-type-utils";
import { getOperationalRequestNoteBg, getOperationalRequestTitleBg } from "@/lib/staff/ops-request-copy";
import type { HotelConfig } from "@/lib/types";
import type { StaffDepartment, StaffRequestStatus } from "@/lib/staff/types";
import { getHotelConfig } from "@/lib/config";
import { sendManagerPushNotification, sendStaffPushNotification } from "@/lib/staff-push/web-push";
import type { PushStaffRole } from "@/lib/staff-push/manager-auth";
import { isDepartmentWorkingHoursForConfig } from "@/lib/staff/operations-hours";
import { translateGuestText, translateGuestTextToBulgarian, hasBulgarianLetters } from "@/lib/server/staff-translation";
import { getTestRoomPolicy } from "@/lib/server/test-rooms";
import { logSystemError, logSystemEvent } from "@/lib/server/system-events";
import { resolveGuestRequestRelationalIds } from "@/lib/server/guest-request-relational-ids.mjs";
import {
  markLateCheckoutRequested,
  validateGuestStayIdentity,
  validatePreparedFactoryGuestWriteIdentity,
} from "@/lib/server/guest-stays";
import {
  buildFactoryGuestHotelConfig,
  resolveFactoryGuestWriteContextFastPath,
} from "@/lib/server/factory-guest-context";
import {
  getOperationalIsolationFields,
  getOperationalIsolationMetadata,
  resolveHotelByAnySlugAdmin,
  shouldSuppressLivePush,
} from "@/lib/server/hotel-scope";
import {
  maybeForwardSandboxGuestRequest,
  runtimeCanaryRoutingErrorResponse,
} from "@/lib/server/runtime-sandbox-canary-router";
import { createApiStageTiming } from "@/lib/server/api-stage-timing";

const STAFF_ROLE_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/;

function normalizeRoomNumber(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function normalizePushRole(value: unknown): PushStaffRole | null {
  const role = String(value || "").trim().toLowerCase();
  if (!STAFF_ROLE_PATTERN.test(role) || role === "manager") return null;
  return role;
}

function getStaffPushRolesForRequest(input: {
  department: StaffDepartment;
  afterHoursDepartment: StaffDepartment | null;
  notifyDepartments: string[];
  hotelConfig: HotelConfig;
}) {
  const roles = new Set<PushStaffRole>();

  const addDepartmentRole = (
    value: string,
    configuredAfterHoursDepartment: StaffDepartment | null = null,
  ) => {
    const role = normalizePushRole(value);
    if (!role) return;

    if (role === "reception") {
      roles.add(role);
      return;
    }

    const configuredHours = Object.entries(input.hotelConfig.departmentHours ?? {}).find(
      ([departmentCode]) => departmentCode === role,
    )?.[1];
    const working = configuredHours
      ? isDepartmentWorkingHoursForConfig({
          hotelConfig: input.hotelConfig,
          department: role,
        })
      : true;

    if (working) {
      roles.add(role);
      return;
    }

    const configuredFallback = normalizePushRole(configuredAfterHoursDepartment);
    if (configuredFallback) {
      roles.add(configuredFallback);
      return;
    }

    if (role === "housekeeping" || role === "maintenance") {
      roles.add("reception");
      return;
    }

    roles.add(role);
  };

  addDepartmentRole(input.department, input.afterHoursDepartment);
  input.notifyDepartments.forEach((value) => addDepartmentRole(value));

  return Array.from(roles);
}

export async function POST(req: NextRequest) {
  const timing = createApiStageTiming("/api/guest/request-create", req.headers.get("x-vercel-id"));
  try {
    const contentLengthHeader = req.headers.get("content-length");
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : 0;

    if (Number.isFinite(contentLength) && contentLength > 16_384) {
      return NextResponse.json(
        {
          ok: false,
          error: "Request body is too large.",
          code: "REQUEST_BODY_TOO_LARGE",
        },
        { status: 413 },
      );
    }

    const body = await req.json().catch(() => null);
    const payloadValidation = validateGuestRequestCreatePayload(body);

    if (!payloadValidation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: payloadValidation.message,
          code: payloadValidation.code,
          field: payloadValidation.field,
        },
        { status: payloadValidation.status },
      );
    }

    const {
      hotelSlug,
      room,
      rawType,
      typeLabel,
      note,
      serviceTime,
      requestedSourceRequestDef,
      guestLanguage,
      stayId,
      stayDeviceId,
      lateCheckoutRequestedTime,
    } = payloadValidation.value;

    const factoryWriteContext = await resolveFactoryGuestWriteContextFastPath({
      hotelSlug,
      room,
      stayId,
      stayDeviceId,
    });
    const hotel = factoryWriteContext?.hotel ?? await resolveHotelByAnySlugAdmin(hotelSlug);

    try {
      const routed = await maybeForwardSandboxGuestRequest({
        req,
        hotel,
        body,
        routePath: "/api/guest/request-create",
      });
      if (routed) return routed;
    } catch (routingError) {
      return runtimeCanaryRoutingErrorResponse(routingError);
    }

    const hotelConfig = factoryWriteContext
      ? buildFactoryGuestHotelConfig(factoryWriteContext.runtime)
      : await getHotelConfig(hotelSlug).catch(async (error) => {
          console.error("Failed to load hotel config for room validation", { hotelSlug, error });
          await logSystemError({
            hotelId: hotel.id,
            source: "guest_hub",
            eventType: "guest_request_room_validation_config_failed",
            message: "Guest request room validation config could not be loaded.",
            error,
            metadata: { hotelSlug },
          });
          return null;
        });
    timing.mark("hotel_and_config");

    if (!hotelConfig) {
      return NextResponse.json(
        {
          ok: false,
          error: "Hotel configuration is temporarily unavailable",
          code: "HOTEL_CONFIG_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    const validRoomNumbers = Array.isArray(hotelConfig.validRoomNumbers)
      ? hotelConfig.validRoomNumbers.map((item) => normalizeRoomNumber(item)).filter(Boolean)
      : [];

    if (validRoomNumbers.length === 0) {
      await logSystemError({
        hotelId: hotel.id,
        source: "guest_hub",
        eventType: "guest_request_room_validation_config_empty",
        message: "Guest request room validation was blocked because the hotel room configuration is empty.",
        roomNumber: room,
        error: new Error("Hotel validRoomNumbers configuration is empty."),
        metadata: { hotelSlug, rawType },
      });

      return NextResponse.json(
        {
          ok: false,
          error: "Hotel room configuration is temporarily unavailable",
          code: "ROOM_CONFIG_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    if (!validRoomNumbers.includes(room)) {
      await logSystemEvent({
        hotelId: hotel.id,
        severity: "warning",
        source: "guest_hub",
        eventType: "guest_request_invalid_room_blocked",
        message: "Guest request was blocked because the room number is not valid for the hotel.",
        roomNumber: room,
        metadata: { hotelSlug, rawType },
      });
      return NextResponse.json(
        { ok: false, error: "Invalid room number", code: "INVALID_ROOM" },
        { status: 400 }
      );
    }

    const testRoomPolicy = await getTestRoomPolicy(hotel.id, room);
    const isolationFields = getOperationalIsolationFields({ hotel, testRoomPolicy });
    const isolationMetadata = getOperationalIsolationMetadata({ hotel, testRoomPolicy });
    const suppressLivePush = shouldSuppressLivePush({ hotel, testRoomPolicy });
    const stayIdentity = factoryWriteContext
      ? validatePreparedFactoryGuestWriteIdentity(factoryWriteContext.identity)
      : await validateGuestStayIdentity({
          hotelId: hotel.id,
          room,
          stayId,
          stayDeviceId,
        });
    timing.mark("room_and_stay");
    if (!stayIdentity) {
      return NextResponse.json(
        { ok: false, error: "A confirmed stay is required", code: "STAY_REQUIRED" },
        { status: 401 },
      );
    }

    const requestAuthority = resolveGuestRequestAuthority({
      requestDefs: hotelConfig?.requestDefs,
      strictConfiguredRequests: isFactoryManagedGuestConfig(hotelConfig),
      rawType,
      sourceRequestDef: requestedSourceRequestDef,
      note,
    });

    if (!requestAuthority.ok) {
      await logSystemEvent({
        hotelId: hotel.id,
        severity: "warning",
        source: "guest_hub",
        eventType: "guest_request_authority_rejected",
        message: requestAuthority.message,
        roomNumber: room,
        metadata: {
          hotelSlug,
          rawType,
          requestedSourceRequestDef,
          code: requestAuthority.code,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          error: requestAuthority.message,
          code: requestAuthority.code,
        },
        { status: 400 },
      );
    }

    const legacyNormalizedType = normalizeStaffRequestType(
      requestAuthority.requestType,
      requestAuthority.department ?? undefined,
    );
    const normalizedType = legacyNormalizedType;
    const authoritativeRequestType = requestAuthority.sourceRequestDef
      ? String(requestAuthority.requestType)
      : legacyNormalizedType;
    const department =
      requestAuthority.department ?? getDepartmentForRequestType(normalizedType);
    const afterHoursDepartment = requestAuthority.afterHoursDepartment ?? null;
    const notifyDepartments = requestAuthority.notifyDepartments;
    const requiresBilling = requestAuthority.requiresBilling;
    const price = requestAuthority.price;
    const currency = requestAuthority.currency;
    const sourceRequestDef = requestAuthority.sourceRequestDef;
    const authoritativeStaffLabels = requestAuthority.staffLabels;
    const relationalIds = resolveGuestRequestRelationalIds(hotelConfig, {
      roomNumber: room,
      departmentCode: department,
      requestType: authoritativeRequestType,
    });
    timing.mark("authority_and_routing");

    if (!relationalIds.ok) {
      await logSystemError({
        hotelId: hotel.id,
        source: "guest_hub",
        eventType: "guest_request_relational_id_resolution_failed",
        message:
          "Guest request relational IDs could not be resolved from the activated normalized authority.",
        roomNumber: room,
        departmentId: department,
        error: new Error(relationalIds.code),
        metadata: {
          hotelSlug,
          rawType,
          authoritativeRequestType,
          legacyNormalizedType,
          code: relationalIds.code,
        },
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Hotel request routing is temporarily unavailable",
          code: "NORMALIZED_RELATIONAL_IDS_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    const translatedGuestNoteBg = note && hasBulgarianLetters(note) ? note : null;
    const noteForStaffCopy = translatedGuestNoteBg || note;
    const operationalMetadata = {
      department,
      afterHoursDepartment,
      notifyDepartments,
      requiresBilling,
      price,
      currency,
      sourceRequestDef,
      serviceTime,
      typeLabel,
      note,
      guestNoteOriginal: note,
      guestNoteBg: translatedGuestNoteBg || null,
      rawType,
      authoritativeRequestType,
      canonicalRequestType: legacyNormalizedType,
      billingStatus: requiresBilling ? "pending" : undefined,
      stayId: stayIdentity?.stay.id ?? null,
      stayDeviceId: stayIdentity?.device.id ?? null,
      lateCheckoutRequestedTime: legacyNormalizedType === "late_checkout" ? lateCheckoutRequestedTime : null,
      normalizedRelationalIdsActive: relationalIds.active,
      normalizedRelationalRevisionId: relationalIds.revisionId,
      normalizedRelationalSourceChecksum: relationalIds.sourceChecksum,
      ...isolationMetadata,
    };
    const staffTitleBg = authoritativeStaffLabels?.bg || getOperationalRequestTitleBg({
      requestType: legacyNormalizedType,
      title: typeLabel,
      message: noteForStaffCopy,
      metadata: {
        ...operationalMetadata,
        note: noteForStaffCopy,
      },
    });
    const configuredStaffTitleEn = authoritativeStaffLabels?.en || authoritativeStaffLabels?.bg || staffTitleBg || null;
    const configuredStaffTitleDe = authoritativeStaffLabels?.de || authoritativeStaffLabels?.en || authoritativeStaffLabels?.bg || staffTitleBg || null;
    const staffNoteBg = getOperationalRequestNoteBg({
      requestType: legacyNormalizedType,
      title: typeLabel,
      message: noteForStaffCopy,
      metadata: {
        ...operationalMetadata,
        note: noteForStaffCopy,
      },
    });
    const messageBg = staffNoteBg || translatedGuestNoteBg || note || null;
    const { data, error } = await supabaseAdmin
      .from("guest_requests")
      .insert({
        hotel_id: hotel.id,
        room_id: relationalIds.roomId,
        department_id: relationalIds.departmentId,
        stay_id: stayIdentity?.stay.id ?? null,
        stay_device_id: stayIdentity?.device.id ?? null,
        room_number_snapshot: room,
        source: "guest_hub",
        channel: "pwa",
        guest_language: guestLanguage,
        request_type: authoritativeRequestType,
        category: legacyNormalizedType === "restaurant_reservation" ? "reservation" : legacyNormalizedType === "information" || legacyNormalizedType === "information_request" ? "info" : "service",
        priority: "normal",
        title: typeLabel,
        message: note,
        title_original: typeLabel || null,
        message_original: note,
        title_bg: staffTitleBg || null,
        title_en: configuredStaffTitleEn || staffTitleBg || null,
        title_de: configuredStaffTitleDe || staffTitleBg || null,
        message_bg: messageBg,
        message_en: messageBg,
        message_de: messageBg,
        status: "new",
        ...isolationFields,
        metadata_json: {
          ...operationalMetadata,
          guestLanguage,
          staffTitleBg,
          staffTitleEn: configuredStaffTitleEn,
          staffTitleDe: configuredStaffTitleDe,
          staffNoteBg,
          staffNoteEn: null,
          staffNoteDe: null,
          translationStatus: "pending",
        },
      })
      .select("id, room_number_snapshot, request_type, title, message, status, created_at, metadata_json")
      .single();
    timing.mark("authoritative_write");

    if (error || !data) {
      await logSystemError({
        hotelId: hotel.id,
        severity: "critical",
        source: "guest_hub",
        eventType: "guest_request_insert_failed",
        message: "Guest request could not be inserted in Supabase.",
        roomNumber: room,
        departmentId: department,
        error: error || new Error("No guest request row returned after insert."),
        metadata: { hotelSlug, rawType, authoritativeRequestType, legacyNormalizedType, requiresBilling, notifyDepartments },
      });
      return NextResponse.json({ ok: false, error: error?.message || "Failed to create request" }, { status: 500 });
    }

    if (legacyNormalizedType === "late_checkout" && lateCheckoutRequestedTime) {
      await markLateCheckoutRequested({
        stayId: stayIdentity.stay.id,
        requestId: String(data.id),
        requestedTime: lateCheckoutRequestedTime,
      }).catch(async (lateCheckoutError) => {
        await logSystemError({
          hotelId: hotel.id,
          source: "guest_hub",
          eventType: "late_checkout_stay_pending_update_failed",
          message: "Late checkout request was created, but the stay could not be marked as pending.",
          roomNumber: room,
          requestId: String(data.id),
          error: lateCheckoutError,
          metadata: { hotelSlug, stayId: stayIdentity.stay.id, lateCheckoutRequestedTime },
        });
      });
    }

    after(async () => {
      try {
        const translatedNoteBg = note && !hasBulgarianLetters(note)
          ? await translateGuestTextToBulgarian(note, {
              sourceLanguage: guestLanguage,
              context: `StayHub guest request note. Request type: ${authoritativeRequestType}. Staff department: ${department}.`,
              maxLength: 1000,
            })
          : note;
        const finalMessageBg = translatedNoteBg || messageBg;
        const [staffTitleEn, staffTitleDe, staffNoteEn, staffNoteDe] = await Promise.all([
          configuredStaffTitleEn ? Promise.resolve(configuredStaffTitleEn) : translateGuestText(staffTitleBg, { sourceLanguage: "bg", targetLanguage: "en", context: "StayHub operational request title for hotel staff reports.", maxLength: 500 }),
          configuredStaffTitleDe ? Promise.resolve(configuredStaffTitleDe) : translateGuestText(staffTitleBg, { sourceLanguage: "bg", targetLanguage: "de", context: "StayHub operational request title for hotel staff reports.", maxLength: 500 }),
          finalMessageBg ? translateGuestText(finalMessageBg, { sourceLanguage: "bg", targetLanguage: "en", context: "StayHub operational request note for hotel staff reports.", maxLength: 1200 }) : Promise.resolve(""),
          finalMessageBg ? translateGuestText(finalMessageBg, { sourceLanguage: "bg", targetLanguage: "de", context: "StayHub operational request note for hotel staff reports.", maxLength: 1200 }) : Promise.resolve(""),
        ]);
        const { error: translationUpdateError } = await supabaseAdmin.from("guest_requests").update({
          title_en: staffTitleEn || staffTitleBg || null,
          title_de: staffTitleDe || staffTitleBg || null,
          message_bg: finalMessageBg || null,
          message_en: staffNoteEn || finalMessageBg || null,
          message_de: staffNoteDe || finalMessageBg || null,
          metadata_json: { ...operationalMetadata, guestLanguage, staffTitleBg, staffTitleEn: staffTitleEn || null,
            staffTitleDe: staffTitleDe || null, staffNoteBg: finalMessageBg || null, staffNoteEn: staffNoteEn || null,
            staffNoteDe: staffNoteDe || null, translationStatus: "ready" },
        }).eq("id", data.id).eq("hotel_id", hotel.id);
        if (translationUpdateError) throw translationUpdateError;
      } catch (translationError) {
        await logSystemError({ hotelId: hotel.id, source: "guest_hub", eventType: "guest_request_translation_failed",
          message: "Guest request was saved, but asynchronous staff translation failed.", roomNumber: room,
          requestId: String(data.id), error: translationError, metadata: { hotelSlug, guestLanguage, authoritativeRequestType } });
      }

      if (!suppressLivePush) await sendManagerPushNotification({
        hotelId: hotel.id,
        hotelSlug: hotel.slug,
        requestId: String(data.id),
        room: String(data.room_number_snapshot ?? room),
        requestTitle: staffTitleBg || typeLabel,
      }).catch(async (pushError) => {
        console.error("Manager push notification failed", pushError);
        await logSystemError({
          hotelId: hotel.id,
          source: "push",
          eventType: "manager_push_failed_after_guest_request",
          message: "Manager push notification failed after a guest request was created.",
          roomNumber: room,
          departmentId: "manager",
          requestId: String(data.id),
          error: pushError,
          metadata: { hotelSlug, rawType, authoritativeRequestType, legacyNormalizedType },
        });
      });

      const staffPushRoles = getStaffPushRolesForRequest({
        department,
        afterHoursDepartment,
        notifyDepartments,
        hotelConfig,
      });

      if (staffPushRoles.length) {
        await sendStaffPushNotification({
          hotelId: hotel.id,
          hotelSlug: hotel.slug,
          requestId: String(data.id),
          room: String(data.room_number_snapshot ?? room),
          requestTitle: staffTitleBg || typeLabel,
          targetRoles: staffPushRoles,
        }).catch(async (pushError) => {
          console.error("Department staff push notification failed", pushError);
          await logSystemError({
            hotelId: hotel.id,
            source: "push",
            eventType: "department_push_failed_after_guest_request",
            message: "Department staff push notification failed after a guest request was created.",
            roomNumber: room,
            departmentId: department,
            requestId: String(data.id),
            error: pushError,
            metadata: { hotelSlug, rawType, authoritativeRequestType, legacyNormalizedType, staffPushRoles },
          });
        });
      }
    });

    const created = new Date(data.created_at);
    const hotelTimeZone = String(hotelConfig.hotelTimezone || "UTC").trim() || "UTC";

    timing.mark("response_ready");
    timing.finish("success", { hotelId: hotel.id, sandbox: Boolean(hotel.is_sandbox) });
    return NextResponse.json({
      ok: true,
      request: {
        id: data.id,
        room: data.room_number_snapshot ?? room,
        department: data.metadata_json?.department ?? department,
        type: data.request_type,
        typeLabel: data.metadata_json?.typeLabel ?? data.title,
        status: data.status as StaffRequestStatus,
        serviceTime: data.metadata_json?.serviceTime ?? serviceTime,
        notifyDepartments: data.metadata_json?.notifyDepartments ?? notifyDepartments,
        requiresBilling: data.metadata_json?.requiresBilling ?? requiresBilling,
        price: data.metadata_json?.price ?? price ?? undefined,
        currency: data.metadata_json?.currency ?? currency ?? undefined,
        sourceRequestDef: data.metadata_json?.sourceRequestDef ?? sourceRequestDef ?? undefined,
        billingStatus: data.metadata_json?.billingStatus ?? (requiresBilling ? "pending" : undefined),
        createdAt: created.toLocaleString([], {
          timeZone: hotelTimeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
        createdAtIso: data.created_at,
        createdDateKey: created.toLocaleDateString("sv-SE", {
          timeZone: hotelTimeZone,
        }),
        note: data.metadata_json?.note ?? data.message ?? undefined,
        isTest: Boolean(data.metadata_json?.isTest),
        testExpiresAt: data.metadata_json?.testExpiresAt ?? undefined,
      },
    });
  } catch (error) {
    timing.finish("failed");
    const reason = error instanceof Error ? error.message : "";
    if (reason === "STAY_ENDED") {
      return NextResponse.json(
        {
          ok: false,
          error: "This stay has ended and can no longer create new requests.",
          code: "STAY_ENDED",
        },
        { status: 409 },
      );
    }

    console.error("guest request-create POST error", error);
    await logSystemError({
      severity: "critical",
      source: "api",
      eventType: "guest_request_create_unexpected_error",
      message: "Unexpected server error while creating a guest request.",
      error,
    });
    return NextResponse.json({ ok: false, error: "Unexpected server error" }, { status: 500 });
  }
}
