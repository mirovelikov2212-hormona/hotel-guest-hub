export type CanonicalStaffRequestDepartment =
  | "housekeeping"
  | "maintenance"
  | "reception"
  | "restaurant";

export type CanonicalStaffRequestType =
  | "towels"
  | "toilet_paper"
  | "extra_pillow"
  | "pillow_menu"
  | "extra_blanket"
  | "bathrobe"
  | "slippers"
  | "baby_cot"
  | "iron"
  | "minibar"
  | "laundry"
  | "other_housekeeping"
  | "air_conditioning"
  | "light_not_working"
  | "no_hot_water"
  | "tv_issue"
  | "bathroom_issue"
  | "door_lock_issue"
  | "wifi_issue"
  | "power_outlet_issue"
  | "safe_issue"
  | "balcony_door_issue"
  | "minibar_not_cooling"
  | "other_technical_issue"
  | "taxi"
  | "late_checkout"
  | "wake_up_call"
  | "information"
  | "information_request"
  | "reservation_help"
  | "other_reception"
  | "restaurant_reservation"
  | "luggage_help"
  | "massage_booking";

export const CANONICAL_STAFF_REQUESTS: Readonly<
  Record<
    CanonicalStaffRequestType,
    Readonly<{ department: CanonicalStaffRequestDepartment }>
  >
>;

export const STAFF_REQUEST_ALIASES: Readonly<
  Record<string, CanonicalStaffRequestType>
>;

export function resolveCanonicalStaffRequestType(
  value: unknown,
): CanonicalStaffRequestType | null;

export function isCanonicalStaffRequestType(
  value: unknown,
): value is CanonicalStaffRequestType;

export function getCanonicalStaffRequestDepartment(
  value: unknown,
): CanonicalStaffRequestDepartment | null;

export function getCanonicalStaffRequestTypes(): CanonicalStaffRequestType[];
