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

  air_conditioning: "maintenance",
  light_not_working: "maintenance",
  no_hot_water: "maintenance",
  tv_issue: "maintenance",
  bathroom_issue: "maintenance",
  other_technical_issue: "maintenance",

  taxi: "reception",
  late_checkout: "reception",
  wake_up_call: "reception",
  information: "reception",
  luggage_help: "reception",

  restaurant_reservation: "restaurant",
};

export function getDepartmentForRequestType(
  requestType: StaffRequestType
): StaffDepartment {
  return requestDepartmentMap[requestType] ?? "reception";
}