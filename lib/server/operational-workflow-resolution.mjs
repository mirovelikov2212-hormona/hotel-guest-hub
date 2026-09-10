import { resolveGuestRequestAuthority } from "./guest-request-authority.mjs";
import { isDepartmentWorkingHoursForConfig } from "../staff/operations-hours-model.mjs";
import { getCanonicalStaffRequestDepartment } from "../staff/request-contract.mjs";

const DEFAULT_MIN_CONFIDENCE = 0.7;

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return clean(value).toLowerCase().replace(/\s+/g, "_").replace(/-+/g, "_");
}

function uniqueClean(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => clean(value))
        .filter(Boolean),
    ),
  );
}

function uniqueLower(values) {
  return Array.from(new Set(uniqueClean(values).map((value) => value.toLowerCase())));
}

function notApplicable(code, status = "not_applicable") {
  return { ok: false, status, code };
}

function configuredDepartmentHours(hotelConfig, department) {
  const hours = hotelConfig?.departmentHours?.[department];
  return Boolean(hours && clean(hours.open) && clean(hours.close));
}

function resolveEffectiveDepartment({ hotelConfig, primaryDepartment, afterHoursDepartment, now }) {
  const hasConfiguredHours = configuredDepartmentHours(hotelConfig, primaryDepartment);
  const working = hasConfiguredHours
    ? isDepartmentWorkingHoursForConfig({
        hotelConfig,
        department: primaryDepartment,
        date: now,
      })
    : true;

  if (working) {
    return {
      effectiveDepartment: primaryDepartment,
      afterHoursApplied: false,
      workingHoursKnown: hasConfiguredHours,
    };
  }

  if (afterHoursDepartment) {
    return {
      effectiveDepartment: afterHoursDepartment,
      afterHoursApplied: afterHoursDepartment !== primaryDepartment,
      workingHoursKnown: true,
    };
  }

  if (primaryDepartment === "housekeeping" || primaryDepartment === "maintenance") {
    return {
      effectiveDepartment: "reception",
      afterHoursApplied: true,
      workingHoursKnown: true,
    };
  }

  return {
    effectiveDepartment: primaryDepartment,
    afterHoursApplied: false,
    workingHoursKnown: true,
  };
}

export function resolveOperationalWorkflow(input) {
  const routerResult = input?.routerResult;
  if (!routerResult || routerResult.status !== "answer") {
    return notApplicable("AI_RESULT_NOT_ACTIONABLE");
  }

  const requestedFields = uniqueLower(routerResult.requested_fields);
  if (!requestedFields.includes("request")) {
    return notApplicable("OPERATIONAL_REQUEST_NOT_REQUESTED");
  }

  const selectedIds = uniqueClean(routerResult.selected_ids);
  if (selectedIds.length !== 1) {
    return notApplicable("OPERATIONAL_TARGET_AMBIGUOUS", "clarification_required");
  }

  const confidence = Number(routerResult.confidence);
  const minConfidence = Number.isFinite(Number(input?.minConfidence))
    ? Math.max(0, Math.min(1, Number(input.minConfidence)))
    : DEFAULT_MIN_CONFIDENCE;
  if (!Number.isFinite(confidence) || confidence < minConfidence) {
    return notApplicable("OPERATIONAL_CONFIDENCE_TOO_LOW", "clarification_required");
  }

  const catalogRecords = Array.isArray(input?.catalog?.records) ? input.catalog.records : [];
  const catalogRecord = catalogRecords.find((record) => clean(record?.id) === selectedIds[0]);
  if (!catalogRecord || catalogRecord.kind !== "service") {
    return notApplicable("OPERATIONAL_TARGET_NOT_SERVICE");
  }
  if (catalogRecord.active !== true || catalogRecord.aiVisible !== true) {
    return notApplicable("OPERATIONAL_SERVICE_NOT_AVAILABLE");
  }
  if (normalizeKey(catalogRecord.requestKind) === "info_only") {
    return notApplicable("OPERATIONAL_SERVICE_INFO_ONLY");
  }

  const catalogId = clean(catalogRecord.id);
  if (!catalogId.startsWith("service:")) {
    return notApplicable("OPERATIONAL_SERVICE_ID_INVALID");
  }
  const sourceRequestDef = catalogId.slice("service:".length);
  if (!sourceRequestDef) {
    return notApplicable("OPERATIONAL_SERVICE_ID_INVALID");
  }

  const requestDefs = Array.isArray(input?.hotelConfig?.requestDefs)
    ? input.hotelConfig.requestDefs
    : [];
  const requestDef = requestDefs.find((def) => clean(def?.id) === sourceRequestDef);
  if (!requestDef) {
    return notApplicable("OPERATIONAL_REQUEST_DEF_NOT_FOUND");
  }
  if (
    requestDef.enabled !== true ||
    requestDef.guestVisible !== true ||
    requestDef.aiVisible !== true ||
    normalizeKey(requestDef.requestKind) === "info_only"
  ) {
    return notApplicable("OPERATIONAL_REQUEST_DEF_NOT_EXECUTABLE");
  }

  const rawType = clean(requestDef.requestType || requestDef.id);
  const authority = resolveGuestRequestAuthority({
    requestDefs,
    strictConfiguredRequests: true,
    rawType,
    sourceRequestDef: requestDef.id,
    note: clean(input?.guestText),
  });

  if (!authority.ok) {
    return notApplicable(
      authority.code === "REQUEST_QUANTITY_INVALID"
        ? "OPERATIONAL_DETAILS_REQUIRED"
        : `OPERATIONAL_AUTHORITY_${clean(authority.code) || "REJECTED"}`,
      authority.code === "REQUEST_QUANTITY_INVALID"
        ? "clarification_required"
        : "not_applicable",
    );
  }

  const primaryDepartment =
    clean(authority.department) ||
    clean(getCanonicalStaffRequestDepartment(authority.requestType)) ||
    "reception";
  const afterHoursDepartment = clean(authority.afterHoursDepartment) || null;
  const delivery = resolveEffectiveDepartment({
    hotelConfig: input.hotelConfig,
    primaryDepartment,
    afterHoursDepartment,
    now: input?.now instanceof Date ? input.now : new Date(),
  });

  return {
    ok: true,
    status: "ready_for_confirmation",
    action: {
      kind: "guest_request",
      executionMode: "confirmation_required",
      requiresGuestConfirmation: true,
      authority: "hotel_request_def",
      catalogRecordId: catalogId,
      sourceRequestDef: clean(requestDef.id),
      requestType: clean(authority.requestType),
      primaryDepartment,
      effectiveDepartment: delivery.effectiveDepartment,
      afterHoursDepartment,
      afterHoursApplied: delivery.afterHoursApplied,
      workingHoursKnown: delivery.workingHoursKnown,
      notifyDepartments: uniqueLower(authority.notifyDepartments),
      requiresBilling: authority.requiresBilling === true,
      price: authority.price ?? null,
      currency: authority.currency ?? null,
      quantity: authority.quantity ?? null,
    },
  };
}
