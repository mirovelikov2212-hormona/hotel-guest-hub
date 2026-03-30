import type { StaffDepartment, StaffRequestType } from "@/lib/staff/types";

const requestDepartmentMap: Record<StaffRequestType, StaffDepartment> = {
  towels: "housekeeping",
  toilet_paper: "housekeeping",
  extra_pillow: "housekeeping",
  extra_blanket: "housekeeping",
  bathrobe: "housekeeping",
  slippers: "housekeeping",
  baby_cot: "housekeeping",
  iron: "housekeeping",
  minibar: "housekeeping",
  laundry: "housekeeping",
  other_housekeeping: "housekeeping",

  air_conditioning: "maintenance",
  light_not_working: "maintenance",
  no_hot_water: "maintenance",
  tv_issue: "maintenance",
  bathroom_issue: "maintenance",
  door_lock_issue: "maintenance",
  wifi_issue: "maintenance",
  power_outlet_issue: "maintenance",
  safe_issue: "maintenance",
  balcony_door_issue: "maintenance",
  minibar_not_cooling: "maintenance",
  other_technical_issue: "maintenance",

  taxi: "reception",
  late_checkout: "reception",
  wake_up_call: "reception",
  information: "reception",
  information_request: "reception",
  reservation_help: "reception",
  other_reception: "reception",
  luggage_help: "reception",

  restaurant_reservation: "restaurant",
};

export function getDepartmentForRequestType(
  requestType: StaffRequestType
): StaffDepartment {
  return requestDepartmentMap[requestType] ?? "reception";
}