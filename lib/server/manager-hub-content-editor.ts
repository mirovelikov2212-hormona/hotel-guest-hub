import "server-only";

import demoHotelConfig from "@/data/hotels/demo.json";
import { getCurrentStaffSession } from "@/lib/staff-auth/session";
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

function demoServiceRows() {
  return [
    {
      id: "extra_towels",
      title: { bg: "Допълнителни хавлии", en: "Extra towels", de: "Zusätzliche Handtücher" },
      description: { bg: "Допълнителни хавлии до стаята.", en: "Extra towels delivered to the room.", de: "Zusätzliche Handtücher aufs Zimmer." },
      price: null,
      currency: null,
      guestVisible: true,
      enabled: true,
      sortOrder: 1,
      targetDepartment: "housekeeping",
      requestType: "towels",
      operationallyConfigured: true,
    },
    {
      id: "toiletries",
      title: { bg: "Тоалетни принадлежности", en: "Toiletries", de: "Pflegeprodukte" },
      description: { bg: "Допълване на основни принадлежности.", en: "Replenish essential toiletries.", de: "Zusätzliche Pflegeprodukte." },
      price: null,
      currency: null,
      guestVisible: true,
      enabled: true,
      sortOrder: 2,
      targetDepartment: "housekeeping",
      requestType: "toiletries",
      operationallyConfigured: true,
    },
    {
      id: "ac_issue",
      title: { bg: "Проблем с климатик", en: "Air-conditioning issue", de: "Problem mit der Klimaanlage" },
      description: { bg: "Техническа заявка за климатизацията в стаята.", en: "Technical request for room air conditioning.", de: "Technische Anfrage zur Klimaanlage im Zimmer." },
      price: null,
      currency: null,
      guestVisible: true,
      enabled: true,
      sortOrder: 3,
      targetDepartment: "maintenance",
      requestType: "ac_issue",
      operationallyConfigured: true,
    },
    {
      id: "reception_general",
      title: { bg: "Въпрос към рецепция", en: "Reception request", de: "Anfrage an die Rezeption" },
      description: { bg: "Обща заявка към рецепция.", en: "General request to Reception.", de: "Allgemeine Anfrage an die Rezeption." },
      price: null,
      currency: null,
      guestVisible: true,
      enabled: true,
      sortOrder: 4,
      targetDepartment: "reception",
      requestType: "reception_general",
      operationallyConfigured: true,
    },
  ];
}

function demoVenueRows() {
  return [
    {
      id: "main_restaurant",
      type: "restaurant",
      name: "Main Restaurant",
      nameByLang: { bg: "Основен ресторант", en: "Main Restaurant", de: "Hauptrestaurant" },
      shortDescription: "Main hotel restaurant",
      shortDescriptionByLang: { bg: "Основният ресторант на хотела.", en: "The hotel's main restaurant.", de: "Das Hauptrestaurant des Hotels." },
      description: "Breakfast, lunch and dinner",
      descriptionByLang: { bg: "Закуска, обяд и вечеря.", en: "Breakfast, lunch and dinner.", de: "Frühstück, Mittag- und Abendessen." },
      cuisine: "International",
      cuisineByLang: { bg: "Международна кухня", en: "International cuisine", de: "Internationale Küche" },
      hours: "07:30 - 10:00 | 12:30 - 14:30 | 18:30 - 21:00",
      hoursByLang: { bg: "07:30 - 10:00 | 12:30 - 14:30 | 18:30 - 21:00", en: "07:30 - 10:00 | 12:30 - 14:30 | 18:30 - 21:00", de: "07:30 - 10:00 | 12:30 - 14:30 | 18:30 - 21:00" },
      location: "Lobby level",
      locationByLang: { bg: "Ниво лоби", en: "Lobby level", de: "Lobby-Ebene" },
      active: true,
      sortOrder: 1,
      reservationManaged: false,
    },
    {
      id: "lobby_bar",
      type: "bar",
      name: "Lobby Bar",
      nameByLang: { bg: "Лоби бар", en: "Lobby Bar", de: "Lobbybar" },
      shortDescription: "Hotel lobby bar",
      shortDescriptionByLang: { bg: "Напитки и кафе в лобито.", en: "Drinks and coffee in the lobby.", de: "Getränke und Kaffee in der Lobby." },
      description: "",
      descriptionByLang: {},
      cuisine: "Drinks",
      cuisineByLang: { bg: "Напитки", en: "Drinks", de: "Getränke" },
      hours: "10:00 - 23:00",
      hoursByLang: { bg: "10:00 - 23:00", en: "10:00 - 23:00", de: "10:00 - 23:00" },
      location: "Lobby",
      locationByLang: { bg: "Лоби", en: "Lobby", de: "Lobby" },
      active: true,
      sortOrder: 2,
      reservationManaged: false,
    },
    {
      id: "spa",
      type: "spa",
      name: "SPA",
      nameByLang: { bg: "СПА център", en: "SPA Centre", de: "SPA-Bereich" },
      shortDescription: "Wellness and massage",
      shortDescriptionByLang: { bg: "Уелнес и масажи.", en: "Wellness and massage.", de: "Wellness und Massagen." },
      description: "",
      descriptionByLang: {},
      cuisine: "",
      cuisineByLang: {},
      hours: "09:00 - 19:00",
      hoursByLang: { bg: "09:00 - 19:00", en: "09:00 - 19:00", de: "09:00 - 19:00" },
      location: "SPA level",
      locationByLang: { bg: "СПА зона", en: "SPA level", de: "SPA-Bereich" },
      active: true,
      sortOrder: 3,
      reservationManaged: true,
    },
  ];
}

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
  const normalizedSlug = clean(hotelSlugInput).toLowerCase();

  if (normalizedSlug === "demo") {
    const session = await getCurrentStaffSession("demo", "manager");
    if (!session || session.role !== "manager") {
      throw new Error("CM5_MANAGER_SESSION_REQUIRED");
    }

    const config = demoHotelConfig as unknown as JsonObject;
    const services = serviceRows(config);
    const venues = venueRows(config);
    return {
      hotel: {
        id: String(session.hotel_id || ""),
        slug: "demo",
        name: clean(demoHotelConfig.hotelName) || "Hotel Demo",
      },
      liveRevision: {
        id: "demo-read-only",
        revisionNo: 0,
        checksum: "demo-read-only",
      },
      languages: configuredLanguages(config),
      // The public demo config intentionally stays minimal. Supply representative
      // read-only rows so all three Manager content tabs can be tested visually.
      services: services.length ? services : demoServiceRows(),
      venues: venues.length ? venues : demoVenueRows(),
      schedules: scheduleState(config),
      readOnly: true,
    };
  }

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
    readOnly: false,
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
