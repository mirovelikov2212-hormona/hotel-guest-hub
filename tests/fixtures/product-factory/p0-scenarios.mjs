function baseEnvironment() {
  return { production: true, sandbox: true };
}

function generatedRoomInventory(roomCount) {
  return {
    ranges: [
      {
        start: 1,
        end: roomCount,
        padTo: roomCount >= 100 ? 3 : 2,
      },
    ],
  };
}

export const boutiqueHotelBlueprint = {
  version: 1,
  organization: { id: "org-boutique-demo", name: "Boutique Demo Group" },
  property: {
    slug: "boutique-30",
    publicSlug: "boutique-30",
    name: "Boutique Thirty",
    countryCode: "DE",
    timezone: "Europe/Berlin",
    locales: ["de", "en"],
    roomCount: 30,
    roomInventory: generatedRoomInventory(30),
  },
  environment: baseEnvironment(),
  departments: [
    { id: "reception", name: "Reception", hours: { is24h: true } },
    {
      id: "housekeeping",
      name: "Housekeeping",
      hours: { open: "07:00", close: "17:00" },
      afterHoursDepartmentId: "reception",
    },
  ],
  integrations: [],
  workflows: [
    {
      id: "bike-rental-manual",
      trigger: "service_request",
      steps: [
        { action: "assign", departmentId: "reception" },
        { action: "approval", departmentId: "reception" },
        { action: "billing", departmentId: "reception" },
        { action: "notification" },
        { action: "complete" },
      ],
    },
  ],
  services: [
    { id: "towels", mode: "configurable", departmentId: "housekeeping" },
    {
      id: "bike-rental",
      mode: "custom",
      departmentId: "reception",
      workflowId: "bike-rental-manual",
    },
  ],
};

export const allInclusiveResortBlueprint = {
  version: 1,
  organization: { id: "org-resort-demo", name: "Resort Demo Group" },
  property: {
    slug: "resort-500",
    publicSlug: "resort-500",
    name: "Future Coast Resort",
    countryCode: "TR",
    timezone: "Europe/Istanbul",
    locales: ["tr", "en", "de", "ru", "ar", "pl", "ro"],
    roomCount: 500,
    roomInventory: generatedRoomInventory(500),
  },
  environment: baseEnvironment(),
  departments: [
    { id: "reception", name: "Reception", hours: { is24h: true } },
    {
      id: "housekeeping",
      name: "Housekeeping",
      hours: { open: "07:00", close: "17:00" },
      afterHoursDepartmentId: "reception",
    },
    {
      id: "maintenance",
      name: "Maintenance",
      hours: { open: "07:00", close: "17:00" },
      afterHoursDepartmentId: "reception",
    },
    { id: "spa", name: "SPA", hours: { open: "09:00", close: "20:00" } },
    { id: "pool", name: "Pool & Beach", hours: { open: "08:00", close: "19:00" } },
    { id: "guest-relations", name: "Guest Relations", hours: { open: "08:00", close: "22:00" } },
    { id: "restaurant", name: "Restaurant", hours: { open: "07:00", close: "23:00" } },
  ],
  integrations: [
    { id: "pms-primary", kind: "pms", adapterKey: "generic-pms" },
    { id: "pos-primary", kind: "pos", adapterKey: "generic-pos" },
    { id: "spa-primary", kind: "spa", adapterKey: "generic-spa" },
  ],
  workflows: [
    {
      id: "cabana-approval",
      trigger: "service_request",
      steps: [
        { action: "assign", departmentId: "pool" },
        { action: "integration_action", integrationId: "pms-primary" },
        { action: "approval", departmentId: "pool" },
        { action: "billing", departmentId: "reception", integrationId: "pos-primary" },
        { action: "notification" },
        { action: "complete" },
      ],
    },
    {
      id: "spa-booking",
      trigger: "service_request",
      steps: [
        { action: "integration_action", integrationId: "spa-primary" },
        { action: "assign", departmentId: "spa" },
        { action: "notification" },
        { action: "complete" },
      ],
    },
  ],
  services: [
    { id: "housekeeping", mode: "core", departmentId: "housekeeping" },
    { id: "maintenance", mode: "core", departmentId: "maintenance" },
    { id: "massage", mode: "configurable", departmentId: "spa", workflowId: "spa-booking", integrationId: "spa-primary" },
    { id: "beach-cabana", mode: "custom", departmentId: "pool", workflowId: "cabana-approval" },
    { id: "restaurant-reservation", mode: "configurable", departmentId: "restaurant" },
  ],
};

const groupTimezones = [
  "Europe/Berlin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Athens",
  "Europe/Istanbul",
  "America/New_York",
  "Asia/Dubai",
  "Asia/Singapore",
];

const groupLocaleSets = [
  ["de", "en"],
  ["en", "fr"],
  ["es", "en", "pt-BR"],
  ["el", "en", "de"],
  ["tr", "en", "de", "ru"],
  ["en-US", "es"],
  ["ar", "en"],
  ["en", "zh-Hans", "ja"],
];

function groupProperty(index) {
  const integrated = index % 2 === 0;
  const timezone = groupTimezones[index % groupTimezones.length];
  const locales = groupLocaleSets[index % groupLocaleSets.length];
  const suffix = String(index + 1).padStart(2, "0");
  const roomCount = 80 + index * 11;

  return {
    version: 1,
    organization: { id: "org-global-20", name: "Global Twenty Hotels" },
    property: {
      slug: `global-hotel-${suffix}`,
      publicSlug: `global-hotel-${suffix}`,
      name: `Global Hotel ${suffix}`,
      countryCode: ["DE", "GB", "ES", "GR", "TR", "US", "AE", "SG"][index % 8],
      timezone,
      locales,
      roomCount,
      roomInventory: generatedRoomInventory(roomCount),
    },
    environment: baseEnvironment(),
    departments: [
      { id: "reception", name: "Reception", hours: { is24h: true } },
      {
        id: "housekeeping",
        name: "Housekeeping",
        hours: { open: "07:00", close: "17:00" },
        afterHoursDepartmentId: "reception",
      },
      {
        id: "maintenance",
        name: "Maintenance",
        hours: { open: "07:00", close: "17:00" },
        afterHoursDepartmentId: "reception",
      },
    ],
    integrations: integrated
      ? [{ id: "pms", kind: "pms", adapterKey: `portfolio-pms-${index % 3}` }]
      : [],
    workflows: [
      {
        id: "late-checkout",
        trigger: "service_request",
        steps: [
          { action: "assign", departmentId: "reception" },
          ...(integrated ? [{ action: "integration_action", integrationId: "pms" }] : []),
          { action: "approval", departmentId: "reception" },
          { action: "billing", departmentId: "reception" },
          { action: "notification" },
          { action: "complete" },
        ],
      },
    ],
    services: [
      { id: "towels", mode: "configurable", departmentId: "housekeeping" },
      { id: "late-checkout", mode: "configurable", departmentId: "reception", workflowId: "late-checkout", ...(integrated ? { integrationId: "pms" } : {}) },
    ],
  };
}

export const internationalGroupPortfolio = {
  organization: { id: "org-global-20", name: "Global Twenty Hotels" },
  properties: Array.from({ length: 20 }, (_, index) => groupProperty(index)),
};
