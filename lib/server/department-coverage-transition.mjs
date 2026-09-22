import {
  resolveDepartmentCoverageForConfig,
} from "../staff/operations-hours-model.mjs";

export const DEPARTMENT_COVERAGE_FALLBACK_EVENT = "department_coverage_fallback_started";
export const DEPARTMENT_COVERAGE_RESUMED_EVENT = "department_coverage_primary_resumed";

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeDepartment(value) {
  return clean(value).toLowerCase();
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requestDefForRow(hotelConfig, row) {
  const defs = Array.isArray(hotelConfig?.requestDefs) ? hotelConfig.requestDefs : [];
  const metadata = isRecord(row?.metadata_json) ? row.metadata_json : {};
  const sourceRequestDef = clean(metadata.sourceRequestDef);
  const requestType = clean(row?.request_type || metadata.authoritativeRequestType || metadata.rawType);

  return defs.find((def) => {
    if (!isRecord(def)) return false;
    if (sourceRequestDef && clean(def.id) === sourceRequestDef) return true;
    if (requestType && clean(def.requestType || def.id) === requestType) return true;
    return false;
  }) || null;
}

export function resolveRequestCoverageRouting(input) {
  const row = input?.request;
  const hotelConfig = input?.hotelConfig;
  const metadata = isRecord(row?.metadata_json) ? row.metadata_json : {};
  const requestDef = requestDefForRow(hotelConfig, row);

  const primaryDepartment = normalizeDepartment(
    metadata.department || requestDef?.targetDepartment,
  );
  const afterHoursDepartment = normalizeDepartment(
    metadata.afterHoursDepartment || requestDef?.afterHoursDepartment,
  ) || null;

  if (!primaryDepartment) {
    return {
      ok: false,
      code: "PRIMARY_DEPARTMENT_MISSING",
    };
  }

  const coverage = resolveDepartmentCoverageForConfig({
    hotelConfig,
    department: primaryDepartment,
    date: input?.now instanceof Date ? input.now : new Date(),
  });

  const createdCoverage = resolveDepartmentCoverageForConfig({
    hotelConfig,
    department: primaryDepartment,
    date: input?.createdAt instanceof Date
      ? input.createdAt
      : new Date(row?.created_at || input?.now || Date.now()),
  });

  const effectiveDepartment = coverage.working || !afterHoursDepartment
    ? primaryDepartment
    : afterHoursDepartment;

  return {
    ok: true,
    primaryDepartment,
    afterHoursDepartment,
    effectiveDepartment,
    coverage,
    createdCoverage,
    fallbackRequired: Boolean(
      coverage.workingHoursKnown
      && !coverage.working
      && afterHoursDepartment
      && afterHoursDepartment !== primaryDepartment
    ),
  };
}

export function decideRequestCoverageTransition(input) {
  const routing = resolveRequestCoverageRouting(input);
  if (!routing.ok) return { ...routing, action: "skip" };

  const lastEventType = clean(input?.lastEventType);
  const lastEffectiveDepartment = normalizeDepartment(input?.lastEffectiveDepartment);

  if (routing.fallbackRequired) {
    if (lastEventType === DEPARTMENT_COVERAGE_FALLBACK_EVENT) {
      if (
        lastEffectiveDepartment
        && lastEffectiveDepartment !== routing.effectiveDepartment
      ) {
        return {
          ...routing,
          action: "start_fallback",
          reason: "fallback_department_changed",
        };
      }
      return { ...routing, action: "none", reason: "fallback_already_active" };
    }

    if (
      !lastEventType
      && routing.createdCoverage.workingHoursKnown
      && !routing.createdCoverage.working
    ) {
      return {
        ...routing,
        action: "record_fallback_without_push",
        reason: "request_created_during_fallback_period",
      };
    }

    return {
      ...routing,
      action: "start_fallback",
      reason: "primary_coverage_ended",
    };
  }

  if (
    routing.coverage.workingHoursKnown
    && routing.coverage.working
    && lastEventType === DEPARTMENT_COVERAGE_FALLBACK_EVENT
  ) {
    return {
      ...routing,
      action: "resume_primary",
      reason: "primary_coverage_resumed",
    };
  }

  return {
    ...routing,
    action: "none",
    reason: routing.coverage.workingHoursKnown
      ? "primary_coverage_active"
      : "working_hours_unknown",
  };
}
