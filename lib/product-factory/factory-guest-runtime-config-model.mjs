import crypto from "node:crypto";

import { prepareFactoryOperationalResources } from "./factory-operational-resources-model.mjs";
import { stableFactoryJson } from "./factory-onboarding-model.mjs";

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

function textMap(locales, value) {
  return Object.fromEntries(locales.map((locale) => [locale, value]));
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
    const workflow = service.workflow_key ? workflows.get(service.workflow_key) : null;
    const department = service.department_code
      ? departments.get(service.department_code)
      : null;
    const guestVisible = Boolean(service.department_code && department);

    return {
      id: service.key,
      type: "request",
      category: "services",
      enabled: guestVisible,
      sortOrder: index + 1,
      requestKind: "standard",
      targetDepartment: service.department_code || "none",
      ...(department?.after_hours_department_code
        ? { afterHoursDepartment: department.after_hours_department_code }
        : {}),
      requestType: service.key,
      requiresNote: false,
      requiresQuantity: false,
      requiresTime: false,
      timeMode: "none",
      options: [],
      guestVisible,
      staffVisible: guestVisible,
      aiVisible: false,
      confirmationMode: workflow?.hasApproval ? "staff_required" : "instant",
      title: textMap(locales, label),
      subtitle: {},
      description: {},
      policy: {},
      success: {},
      staffLabel: textMap(locales, label),
      section: "services",
      requiresBilling: Boolean(workflow?.hasBilling),
      notifyDepartments: [],
      keywords: [service.key, label],
      aliasesByLang: {},
      intentTags: [service.key],
      uiSectionId: "services",
      canonicalRef: service.key,
    };
  });
}

export function prepareFactoryGuestRuntimeConfig({ blueprint }) {
  const operational = prepareFactoryOperationalResources({ blueprint });
  const normalizedBlueprint = operational.blueprint;
  const coreResources = operational.coreResources;
  const operationalResources = operational.operationalResources;
  const property = normalizedBlueprint.property;
  const locales = [...property.locales];
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
    wifi: { ssid: "", password: "" },
    location: { query: `${property.name}, ${property.countryCode}` },
    hotelTimezone: property.timezone,
    geoGuardEnabled: false,
    testModeEnabled: false,
    theme: {},
    contacts: builtinContacts(normalizedBlueprint.departments),
    departmentHours: departmentHours(coreResources.departments),
    housekeepingExtras: [],
    taxiProviders: [],
    reviews: {},
    socialLinks: [],
    venueRows: [],
    hotelInfoItems: [],
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
    counts: {
      rooms: rooms.length,
      languages: locales.length,
      requestDefs: requestDefs.length,
      guestVisibleRequestDefs: requestDefs.filter((item) => item.guestVisible).length,
      departmentsWithHours: Object.keys(config.departmentHours).length,
    },
  };
}

export const FACTORY_GUEST_RUNTIME_SCHEMA_VERSION = RUNTIME_SCHEMA_VERSION;
