import "server-only";

import {
  loadManagerCurrentLiveConfig,
  resolveManagerContentChangeScope,
} from "@/lib/server/manager-content-changes";
import {
  prepareManagerServiceContentCandidate,
  prepareManagerVenueContentCandidate,
} from "@/lib/server/manager-safe-content-candidates.mjs";
import {
  prepareManagerOperationalScheduleChange,
} from "@/lib/server/manager-operational-schedule-changes.mjs";

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function localized(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [clean(key).toLowerCase(), clean(entry)])
      .filter(([key, entry]) => key && entry),
  );
}

function configuredLanguages(config: JsonObject) {
  const result: string[] = [];
  for (const value of Array.isArray(config.languages) ? config.languages : []) {
    const language = clean(value).toLowerCase();
    if (/^[a-z]{2}(?:-[a-z]{2})?$/.test(language) && !result.includes(language)) {
      result.push(language);
    }
  }
  const fallback = clean(config.languageDefault).toLowerCase();
  if (/^[a-z]{2}(?:-[a-z]{2})?$/.test(fallback) && !result.includes(fallback)) {
    result.unshift(fallback);
  }
  return result.length ? result : ["en"];
}

function serviceRows(config: JsonObject) {
  return (Array.isArray(config.requestDefs) ? config.requestDefs : [])
    .filter(isRecord)
    .map((service) => ({
      id: clean(service.id),
      title: localized(service.title),
      description: localized(service.description),
      price: clean(service.price) || null,
      currency: clean(service.currency).toUpperCase() || null,
      guestVisible: service.guestVisible !== false,
      enabled: service.enabled !== false,
      sortOrder: Number.isInteger(Number(service.sortOrder)) ? Number(service.sortOrder) : null,
      targetDepartment: clean(service.targetDepartment).toLowerCase() || null,
      requestType: clean(service.requestType) || null,
      operationallyConfigured: Boolean(
        clean(service.requestType)
        && clean(service.targetDepartment)
        && clean(service.targetDepartment).toLowerCase() !== "none"
      ),
    }))
    .filter((service) => service.id);
}

function venueRows(config: JsonObject) {
  return (Array.isArray(config.venueRows) ? config.venueRows : [])
    .filter(isRecord)
    .map((venue) => ({
      id: clean(venue.id),
      type: clean(venue.type),
      name: clean(venue.name),
      nameByLang: localized(venue.nameByLang),
      shortDescription: clean(venue.shortDescription),
      shortDescriptionByLang: localized(venue.shortDescriptionByLang),
      description: clean(venue.description),
      descriptionByLang: localized(venue.descriptionByLang),
      cuisine: clean(venue.cuisine),
      cuisineByLang: localized(venue.cuisineByLang),
      hours: clean(venue.hours),
      hoursByLang: localized(venue.hoursByLang),
      location: clean(venue.location),
      locationByLang: localized(venue.locationByLang),
      active: venue.active !== false,
      sortOrder: Number.isInteger(Number(venue.sortOrder)) ? Number(venue.sortOrder) : null,
      reservationManaged: Boolean(
        clean(venue.reservationDepartment)
        || clean(venue.reservationType)
        || venue.requiresReservation === true
      ),
    }))
    .filter((venue) => venue.id);
}

const ALL_DAYS = ["mon","tue","wed","thu","fri","sat","sun"];

function deriveLegacySchedule(config: JsonObject, department: string) {
  const legacy = isRecord(config.departmentHours)
    ? config.departmentHours[department]
    : null;
  if (!isRecord(legacy)) return null;
  const open = clean(legacy.open);
  const close = clean(legacy.close);
  if (!open || !close) return null;
  if (open === "00:00" && (close === "00:00" || close === "23:59")) {
    return { is24h: true, windows: [] };
  }
  return {
    is24h: false,
    windows: [{ days: ALL_DAYS, open, close }],
  };
}

function scheduleState(config: JsonObject) {
  const departments = new Set<string>();

  for (const source of [config.departmentSchedules, config.departmentHours, config.contacts]) {
    if (!isRecord(source)) continue;
    for (const key of Object.keys(source)) {
      const department = clean(key).toLowerCase();
      if (department) departments.add(department);
    }
  }

  for (const requestDef of Array.isArray(config.requestDefs) ? config.requestDefs : []) {
    if (!isRecord(requestDef)) continue;
    const department = clean(requestDef.targetDepartment).toLowerCase();
    if (department && department !== "none") departments.add(department);
  }

  return [...departments].sort().map((department) => {
    const configured = isRecord(config.departmentSchedules)
      && isRecord(config.departmentSchedules[department])
      ? structuredClone(config.departmentSchedules[department])
      : deriveLegacySchedule(config, department);

    const fallbacks = new Set<string>();
    for (const requestDef of Array.isArray(config.requestDefs) ? config.requestDefs : []) {
      if (!isRecord(requestDef)) continue;
      if (clean(requestDef.targetDepartment).toLowerCase() !== department) continue;
      const fallback = clean(requestDef.afterHoursDepartment).toLowerCase();
      if (fallback && fallback !== "none" && fallback !== department) fallbacks.add(fallback);
    }

    return {
      department,
      fallbackDepartment: fallbacks.size === 1 ? [...fallbacks][0] : null,
      fallbackConflict: fallbacks.size > 1,
      schedule: configured,
      scheduleSource: isRecord(config.departmentSchedules)
        && isRecord(config.departmentSchedules[department])
        ? "v2"
        : configured
          ? "legacy"
          : "missing",
    };
  });
}

export async function getManagerHubContentEditorState(hotelSlugInput: unknown) {
  const scope = await resolveManagerContentChangeScope(hotelSlugInput);
  const live = await loadManagerCurrentLiveConfig(scope.hotelId);
  const config = live.config as JsonObject;

  return {
    hotel: {
      id: scope.hotelId,
      slug: scope.hotelSlug,
      name: scope.hotelName,
    },
    liveRevision: {
      id: live.revisionId,
      revisionNo: live.revisionNo,
      checksum: live.sourceChecksum,
    },
    languages: configuredLanguages(config),
    services: serviceRows(config),
    venues: venueRows(config),
    schedules: scheduleState(config),
  };
}

export async function prepareManagerHubContentChange(input: {
  hotelSlug: unknown;
  scope: unknown;
  operations?: unknown;
  department?: unknown;
  schedule?: unknown;
}) {
  const authority = await resolveManagerContentChangeScope(input.hotelSlug);
  const live = await loadManagerCurrentLiveConfig(authority.hotelId);
  const changeScope = clean(input.scope).toLowerCase();

  if (changeScope === "services") {
    const prepared = prepareManagerServiceContentCandidate({
      liveConfig: live.config,
      operations: input.operations,
    });
    return {
      scope: changeScope,
      operations: structuredClone(input.operations),
      preview: prepared.preview,
      diff: prepared.diff,
    };
  }

  if (changeScope === "venues") {
    const prepared = prepareManagerVenueContentCandidate({
      liveConfig: live.config,
      operations: input.operations,
    });
    return {
      scope: changeScope,
      operations: structuredClone(input.operations),
      preview: prepared.preview,
      diff: prepared.diff,
    };
  }

  if (changeScope === "schedules") {
    const prepared = prepareManagerOperationalScheduleChange({
      liveConfig: live.config,
      department: input.department,
      schedule: input.schedule,
    });
    return {
      scope: changeScope,
      operations: prepared.operations,
      preview: prepared.preview,
      diff: prepared.diff,
    };
  }

  throw new Error("CM5_CHANGE_SCOPE_INVALID");
}

export async function previewManagerHubContentChange(input: {
  hotelSlug: unknown;
  scope: unknown;
  operations?: unknown;
  department?: unknown;
  schedule?: unknown;
}) {
  const prepared = await prepareManagerHubContentChange(input);
  return {
    scope: prepared.scope,
    preview: prepared.preview,
    diff: prepared.diff,
  };
}
