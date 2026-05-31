import type { StaffDepartment, StaffRequestStatus } from "@/lib/staff/types";

export const HOTEL_OPERATIONS_TIME_ZONE = "Europe/Sofia";
export const HOTEL_DEPARTMENT_OPEN_MINUTES = 7 * 60;
export const HOTEL_DEPARTMENT_CLOSE_MINUTES = 17 * 60;

function getHotelLocalMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HOTEL_OPERATIONS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const rawHour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const hour = Number.isFinite(rawHour) ? rawHour % 24 : 0;
  const rawMinute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const minute = Number.isFinite(rawMinute) ? rawMinute : 0;

  return hour * 60 + minute;
}

export function isOutsideDepartmentWorkingHours(date = new Date()) {
  const minutes = getHotelLocalMinutes(date);
  return minutes < HOTEL_DEPARTMENT_OPEN_MINUTES || minutes >= HOTEL_DEPARTMENT_CLOSE_MINUTES;
}

// Backward-compatible name used by older files/scripts.
export const isAfterOperationsHours = isOutsideDepartmentWorkingHours;

export function isActiveStaffStatus(status?: StaffRequestStatus | string | null) {
  return status === "new" || status === "in_progress" || status === "returned";
}

export function shouldRouteDepartmentToReceptionAfterHours(input: {
  department?: StaffDepartment | string | null;
  status?: StaffRequestStatus | string | null;
  serviceTime?: string | null;
  now?: Date;
}) {
  const department = String(input.department || "").trim().toLowerCase();

  if (!isActiveStaffStatus(input.status)) return false;
  if (department !== "housekeeping" && department !== "maintenance") return false;

  return isOutsideDepartmentWorkingHours(input.now);
}
