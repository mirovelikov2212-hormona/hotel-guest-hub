const CANONICAL_REQUEST_DEFINITIONS = {
  towels: { department: "housekeeping" },
  toilet_paper: { department: "housekeeping" },
  extra_pillow: { department: "housekeeping" },
  pillow_menu: { department: "housekeeping" },
  extra_blanket: { department: "housekeeping" },
  bathrobe: { department: "housekeeping" },
  slippers: { department: "housekeeping" },
  baby_cot: { department: "housekeeping" },
  iron: { department: "housekeeping" },
  minibar: { department: "housekeeping" },
  laundry: { department: "housekeeping" },
  other_housekeeping: { department: "housekeeping" },

  air_conditioning: { department: "maintenance" },
  light_not_working: { department: "maintenance" },
  no_hot_water: { department: "maintenance" },
  tv_issue: { department: "maintenance" },
  bathroom_issue: { department: "maintenance" },
  door_lock_issue: { department: "maintenance" },
  wifi_issue: { department: "maintenance" },
  power_outlet_issue: { department: "maintenance" },
  safe_issue: { department: "maintenance" },
  balcony_door_issue: { department: "maintenance" },
  minibar_not_cooling: { department: "maintenance" },
  other_technical_issue: { department: "maintenance" },

  taxi: { department: "reception" },
  late_checkout: { department: "reception" },
  wake_up_call: { department: "reception" },
  information: { department: "reception" },
  information_request: { department: "reception" },
  reservation_help: { department: "reception" },
  other_reception: { department: "reception" },
  luggage_help: { department: "reception" },
  massage_booking: { department: "reception" },

  restaurant_reservation: { department: "restaurant" },
};

export const CANONICAL_STAFF_REQUESTS = Object.freeze(
  Object.fromEntries(
    Object.entries(CANONICAL_REQUEST_DEFINITIONS).map(([key, value]) => [
      key,
      Object.freeze({ ...value }),
    ]),
  ),
);

export const STAFF_REQUEST_ALIASES = Object.freeze({
  minibar_refill: "minibar",
  minibar_notice: "minibar",
  light_issue: "light_not_working",
  cleaning: "other_housekeeping",
  room_cleaning_request: "other_housekeeping",
  extra_cleaning: "other_housekeeping",
  late_checkout_policy: "late_checkout",
  coffee_machine: "other_technical_issue",
});

function normalizeRequestContractKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function resolveCanonicalStaffRequestType(value) {
  const normalized = normalizeRequestContractKey(value);
  if (!normalized) return null;

  const alias = STAFF_REQUEST_ALIASES[normalized];
  if (alias) return alias;

  return Object.prototype.hasOwnProperty.call(
    CANONICAL_STAFF_REQUESTS,
    normalized,
  )
    ? normalized
    : null;
}

export function isCanonicalStaffRequestType(value) {
  const normalized = normalizeRequestContractKey(value);
  return Boolean(
    normalized &&
      Object.prototype.hasOwnProperty.call(
        CANONICAL_STAFF_REQUESTS,
        normalized,
      ),
  );
}

export function getCanonicalStaffRequestDepartment(value) {
  const canonicalType = resolveCanonicalStaffRequestType(value);
  if (!canonicalType) return null;
  return CANONICAL_STAFF_REQUESTS[canonicalType].department;
}

export function getCanonicalStaffRequestTypes() {
  return Object.keys(CANONICAL_STAFF_REQUESTS);
}
