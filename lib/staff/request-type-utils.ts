import type { StaffDepartment, StaffRequest, StaffRequestType } from "@/lib/staff/types";

const aliases: Record<string, StaffRequestType> = {
  minibar_refill: "minibar",
  minibar_notice: "minibar",
  light_issue: "light_not_working",
  cleaning: "other_housekeeping",
  room_cleaning_request: "other_housekeeping",
  extra_cleaning: "other_housekeeping",
  late_checkout_policy: "late_checkout",
  coffee_machine: "other_technical_issue",
};

const known = new Set<StaffRequestType>([
  "towels",
  "toilet_paper",
  "extra_pillow",
  "extra_blanket",
  "bathrobe",
  "slippers",
  "baby_cot",
  "iron",
  "minibar",
  "laundry",
  "other_housekeeping",
  "air_conditioning",
  "light_not_working",
  "no_hot_water",
  "tv_issue",
  "bathroom_issue",
  "door_lock_issue",
  "wifi_issue",
  "power_outlet_issue",
  "safe_issue",
  "balcony_door_issue",
  "minibar_not_cooling",
  "other_technical_issue",
  "taxi",
  "late_checkout",
  "wake_up_call",
  "information",
  "information_request",
  "reservation_help",
  "other_reception",
  "restaurant_reservation",
  "luggage_help",
  "massage_booking",
]);

export function normalizeStaffRequestType(rawType: string, department?: StaffDepartment): StaffRequestType {
  const normalized = String(rawType || "").trim().toLowerCase();
  const alias = aliases[normalized];
  if (alias) return alias;
  if (known.has(normalized as StaffRequestType)) return normalized as StaffRequestType;

  switch (department) {
    case "housekeeping":
      return "other_housekeeping";
    case "maintenance":
      return "other_technical_issue";
    case "restaurant":
      return "restaurant_reservation";
    default:
      return "other_reception";
  }
}

const technicalSet = new Set<StaffRequestType>([
  "air_conditioning",
  "light_not_working",
  "no_hot_water",
  "tv_issue",
  "bathroom_issue",
  "door_lock_issue",
  "wifi_issue",
  "power_outlet_issue",
  "safe_issue",
  "balcony_door_issue",
  "minibar_not_cooling",
  "other_technical_issue",
]);

export function isTechnicalRequestType(type: StaffRequestType | string) {
  return technicalSet.has(normalizeStaffRequestType(String(type || ""), "maintenance"));
}


function normalizeMassageDetectionText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isMassageBookingLikeRequest(request: Partial<StaffRequest> & Record<string, unknown>) {
  const signal = normalizeMassageDetectionText([
    request.type,
    request.typeLabel,
    request.note,
    request.sourceRequestDef,
    request.title,
    request.message,
    request.request_type,
    request.rawType,
  ].join(" | "));

  return (
    signal.includes("massage_booking") ||
    signal.includes("spa_massage") ||
    signal.includes("масаж") ||
    signal.includes("релакс") ||
    signal.includes("massage") ||
    signal.includes("relax") ||
    signal.includes("masaj") ||
    signal.includes("masaz") ||
    signal.includes("masáž")
  );
}
