import type { StaffDepartment, StaffRequestType } from "@/lib/staff/types";

export function getDepartmentForRequestType(
  requestType: StaffRequestType
): StaffDepartment {
  const type = String(requestType);

  switch (type) {
    case "towels":
    case "toilet_paper":
    case "extra_pillow":
    case "extra_blanket":
    case "bathrobe":
    case "slippers":
    case "baby_cot":
    case "iron":
    case "laundry":
    case "room_cleaning_request":
    case "extra_cleaning":
    case "minibar":
    case "minibar_refill":
    case "coffee_capsules":
    case "pillow_menu":
    case "other_housekeeping":
      return "housekeeping";

    case "air_conditioning":
    case "no_hot_water":
    case "tv_issue":
    case "light_not_working":
    case "bathroom_issue":
    case "door_lock_issue":
    case "wifi_issue":
    case "power_outlet_issue":
    case "safe_issue":
    case "balcony_door_issue":
    case "minibar_not_cooling":
    case "other_technical_issue":
      return "maintenance";

    case "taxi":
    case "late_checkout":
    case "wake_up_call":
    case "information":
    case "information_request":
    case "reservation_help":
    case "luggage_help":
    case "massage_booking":
    case "other_reception":
      return "reception";

    case "restaurant_reservation":
      return "restaurant";

    default:
      return "reception";
  }
}