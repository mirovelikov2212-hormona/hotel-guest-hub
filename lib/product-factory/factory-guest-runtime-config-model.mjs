import crypto from "node:crypto";

import { prepareFactoryCoreResources } from "./factory-core-resources-model.mjs";
import { prepareFactoryOperationalResources } from "./factory-operational-resources-model.mjs";
import { prepareFactoryNativeContentVenues } from "./factory-native-content-venues-model.mjs";
import { stableFactoryJson } from "./factory-onboarding-model.mjs";
import { getFactoryStandardService } from "./factory-standard-catalog.mjs";

const RUNTIME_SCHEMA_VERSION = "p4.12-guest-runtime-v1";
const PLACEHOLDER_COVER_IMAGE = "/images/stayhub-factory-placeholder-hero.svg";

function hashValue(value) {
  return crypto.createHash("sha256").update(stableFactoryJson(value)).digest("hex");
}

function humanizeKey(value) {
  return String(value || "")
    .trim()
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function localizedTextMap(locales, ...sources) {
  return Object.fromEntries(
    locales.map((locale) => {
      const language = String(locale || "").split("-")[0].toLowerCase();
      let value = "";
      for (const source of sources) {
        if (!source) continue;
        if (typeof source === "string" && source.trim()) {
          value = source.trim();
          break;
        }
        if (typeof source !== "object" || Array.isArray(source)) continue;
        const candidate = source[locale] ?? source[language] ?? source.en;
        if (String(candidate || "").trim()) {
          value = String(candidate).trim();
          break;
        }
      }
      return [locale, value];
    }),
  );
}

function toFiniteCoordinate(value) {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveFactoryHotelLocation(property) {
  const source = property?.location && typeof property.location === "object"
    ? property.location
    : {};
  const latitude = toFiniteCoordinate(
    source.latitude ?? source.lat ?? property?.latitude ?? property?.hotelLatitude,
  );
  const longitude = toFiniteCoordinate(
    source.longitude ?? source.lng ?? source.lon ?? property?.longitude ?? property?.hotelLongitude,
  );
  const hasCoordinates =
    latitude !== null &&
    longitude !== null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0);
  const query = String(
    source.query ||
      property?.locationQuery ||
      property?.address ||
      [property?.name, property?.city, property?.countryCode].filter(Boolean).join(", "),
  ).trim();

  return {
    query,
    ...(hasCoordinates
      ? {
          lat: latitude,
          lng: longitude,
          latitude,
          longitude,
        }
      : {}),
  };
}

function departmentHours(coreDepartments) {
  const result = {};
  for (const department of coreDepartments) {
    if (!department?.code) continue;
    if (department.is_24h === true) {
      result[department.code] = { open: "00:00", close: "23:59" };
      continue;
    }
    if (department.opens_at && department.closes_at) {
      result[department.code] = {
        open: String(department.opens_at).slice(0, 5),
        close: String(department.closes_at).slice(0, 5),
      };
    }
  }
  return result;
}

function builtinContacts(blueprintDepartments) {
  const contactsByDepartment = new Map(
    blueprintDepartments.map((department) => [department.id, department.contact || {}]),
  );
  const build = (key) => {
    const contact = contactsByDepartment.get(key) || {};
    return {
      ...(contact.phone ? { phone: String(contact.phone) } : {}),
      ...(contact.whatsapp ? { whatsapp: String(contact.whatsapp) } : {}),
      ...(contact.email ? { email: String(contact.email) } : {}),
    };
  };
  return {
    reception: build("reception"),
    housekeeping: build("housekeeping"),
    maintenance: build("maintenance"),
    restaurant: build("restaurant"),
    events: build("events"),
  };
}

function workflowSignals(operationalResources) {
  return new Map(
    operationalResources.workflows.map((workflow) => {
      const steps = Array.isArray(workflow?.definition_json?.steps)
        ? workflow.definition_json.steps
        : [];
      return [
        workflow.key,
        {
          hasApproval: steps.some((step) => step.action === "approval"),
          hasBilling: steps.some((step) => step.action === "billing"),
        },
      ];
    }),
  );
}

function materializeRequestDefs({ operationalResources, coreResources, locales }) {
  const workflows = workflowSignals(operationalResources);
  const departments = new Map(
    coreResources.departments.map((department) => [department.code, department]),
  );

  return operationalResources.services.map((service, index) => {
    const label = service.label || humanizeKey(service.key) || service.key;
    const standard = getFactoryStandardService(service.key);
    const definition = service.definition_json || {};
    const configuredTitle = definition.title || definition.labels || null;
    const configuredDescription = definition.description || null;
    const configuredStaffLabel = definition.staffLabel || definition.staffLabels || null;
    const title = localizedTextMap(locales, configuredTitle, standard?.title, label);
    const description = localizedTextMap(
      locales,
      configuredDescription,
      standard?.description,
    );
    const staffLabel = localizedTextMap(
      locales,
      configuredStaffLabel,
      standard?.staffLabel,
      configuredTitle,
      standard?.title,
      label,
    );
    const workflow = service.workflow_key ? workflows.get(service.workflow_key) : null;
    const department = service.department_code
      ? departments.get(service.department_code)
      : null;
    const guestVisible = Boolean(service.department_code && department);
    const requestKind = String(
      definition.requestKind || standard?.requestKind || "standard",
    );
    const requiresNote =
      typeof definition.requiresNote === "boolean"
        ? definition.requiresNote
        : Boolean(standard?.requiresNote);
    const requiresQuantity =
      typeof definition.requiresQuantity === "boolean"
        ? definition.requiresQuantity
        : Boolean(standard?.requiresQuantity);
    const requiresTime =
      typeof definition.requiresTime === "boolean"
        ? definition.requiresTime
        : Boolean(standard?.requiresTime);
    const timeMode = String(definition.timeMode || standard?.timeMode || "none");
    const success = localizedTextMap(locales, definition.success, standard?.success);
    const section = String(definition.section || standard?.departmentId || "services");
    const intentTags = Array.isArray(definition.intentTags)
      ? definition.intentTags
      : Array.isArray(standard?.intentTags)
        ? standard.intentTags
        : [service.key];
    const options = Array.isArray(definition.options) ? definition.options : [];
    const minQty = Number(definition.minQty ?? standard?.minQty);
    const maxQty = Number(definition.maxQty ?? standard?.maxQty);

    return {
      id: service.key,
      type: "request",
      category: section,
      enabled: guestVisible,
      sortOrder: index + 1,
      requestKind,
      targetDepartment: service.department_code || "none",
      ...(department?.after_hours_department_code
        ? { afterHoursDepartment: department.after_hours_department_code }
        : {}),
      requestType: service.key,
      requiresNote,
      requiresQuantity,
      ...(requiresQuantity && Number.isFinite(minQty) ? { minQty } : {}),
      ...(requiresQuantity && Number.isFinite(maxQty) ? { maxQty } : {}),
      requiresTime,
      timeMode,
      options,
      guestVisible,
      staffVisible: guestVisible,
      aiVisible:
        typeof definition.aiVisible === "boolean"
          ? definition.aiVisible
          : Boolean(standard?.aiVisible),
      confirmationMode: workflow?.hasApproval ? "staff_required" : "instant",
      title,
      subtitle: {},
      description,
      policy: {},
      success,
      staffLabel,
      section,
      requiresBilling: Boolean(workflow?.hasBilling),
      notifyDepartments: [],
      keywords: [service.key, ...new Set(Object.values(title).filter(Boolean))],
      aliasesByLang: {},
      intentTags: [...intentTags],
      uiSectionId: String(definition.uiSectionId || section),
      canonicalRef: String(definition.canonicalRef || standard?.id || service.key),
    };
  });
}

function sortByOrderAndId(items, idKey) {
  return [...items].sort((left, right) => {
    const leftOrder = Number(left?.sortOrder ?? 999);
    const rightOrder = Number(right?.sortOrder ?? 999);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left?.[idKey] || "").localeCompare(String(right?.[idKey] || ""));
  });
}

export function prepareFactoryGuestRuntimeConfig({ blueprint }) {
  // P2.3 deliberately exposes hashes plus operational resources, not the P2.2
  // payload itself. Materialize the P2.2 resources from the same blueprint here
  // so P4.12 stays compatible with the existing public P2.2/P2.3 model contracts
  // instead of widening P2.3's return shape just for this consumer.
  const core = prepareFactoryCoreResources({ blueprint });
  const operational = prepareFactoryOperationalResources({ blueprint: core.blueprint });
  const normalizedBlueprint = operational.blueprint;
  const native = prepareFactoryNativeContentVenues({ blueprint: normalizedBlueprint });
  const coreResources = core.coreResources;
  const operationalResources = operational.operationalResources;
  const nativeResources = native.nativeResources;
  const property = normalizedBlueprint.property;
  const locales = [...property.locales];
  const location = resolveFactoryHotelLocation(property);
  const rooms = coreResources.rooms.map((room) => ({
    roomNumber: room.room_number,
    ...(room.floor ? { floor: room.floor } : {}),
    ...(room.building ? { building: room.building } : {}),
    ...(room.room_type ? { roomType: room.room_type } : {}),
    active: true,
  }));
  const validRoomNumbers = rooms.map((room) => room.roomNumber);
  const requestDefs = materializeRequestDefs({
    operationalResources,
    coreResources,
    locales,
  });
  const hotelInfoItems = sortByOrderAndId(
    nativeResources.hotel_info_items.filter((item) => item.active !== false),
    "key",
  );
  const venueRows = sortByOrderAndId(
    nativeResources.venues.filter((venue) => venue.active !== false),
    "id",
  );

  const config = {
    hotelName: property.name,
    coverImage: PLACEHOLDER_COVER_IMAGE,
    coverImagePosition: "center center",
    languageDefault: locales[0],
    languages: locales,
    opsLanguage: locales[0],
    staffHelperEnabled: false,
    staffHelperLanguage: locales[0],
    i18n: Object.fromEntries(locales.map((locale) => [locale, {}])),
    wifi: { ...nativeResources.wifi },
    location,
    ...(Number.isFinite(location.latitude) ? { hotelLatitude: location.latitude } : {}),
    ...(Number.isFinite(location.longitude) ? { hotelLongitude: location.longitude } : {}),
    hotelTimezone: property.timezone,
    weatherEnabled: property.weatherEnabled !== false && Boolean(location.query || Number.isFinite(location.latitude)),
    geoGuardEnabled: false,
    testModeEnabled: false,
    theme: {},
    contacts: builtinContacts(normalizedBlueprint.departments),
    departmentHours: departmentHours(coreResources.departments),
    housekeepingExtras: [],
    taxiProviders: [],
    reviews: {},
    socialLinks: [],
    venueRows,
    hotelInfoItems,
    requestDefs,
    hotelRooms: rooms,
    validRoomNumbers,
  };

  const configHash = hashValue(config);
  return {
    schemaVersion: RUNTIME_SCHEMA_VERSION,
    status: "materialized",
    config,
    configHash,
    nativeResourcesHash: native.nativeResourcesHash,
    counts: {
      rooms: rooms.length,
      languages: locales.length,
      requestDefs: requestDefs.length,
      guestVisibleRequestDefs: requestDefs.filter((item) => item.guestVisible).length,
      departmentsWithHours: Object.keys(config.departmentHours).length,
      hotelInfoItems: hotelInfoItems.length,
      venues: venueRows.length,
    },
  };
}

export const FACTORY_GUEST_RUNTIME_SCHEMA_VERSION = RUNTIME_SCHEMA_VERSION;
