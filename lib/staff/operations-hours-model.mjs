export const DEFAULT_HOTEL_TIME_ZONE = "UTC";

const DEPARTMENT_WORK_START_MINUTES = 7 * 60;
const DEPARTMENT_WORK_END_MINUTES = 17 * 60;

function normalizeText(value) {
  return String(value ?? "").trim();
}

function getTimePartsInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0",
  );

  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function clockMinutes(value) {
  const match = normalizeText(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}

export function getHotelLocalMinutes(
  date = new Date(),
  timeZone = DEFAULT_HOTEL_TIME_ZONE,
) {
  const { hour, minute } = getTimePartsInZone(date, timeZone);
  return hour * 60 + minute;
}

export function isDepartmentWorkingHours(
  date = new Date(),
  timeZone = DEFAULT_HOTEL_TIME_ZONE,
) {
  const minutes = getHotelLocalMinutes(date, timeZone);
  return (
    minutes >= DEPARTMENT_WORK_START_MINUTES &&
    minutes < DEPARTMENT_WORK_END_MINUTES
  );
}

export function isReceptionBackupHours(
  date = new Date(),
  timeZone = DEFAULT_HOTEL_TIME_ZONE,
) {
  return !isDepartmentWorkingHours(date, timeZone);
}

export function isDepartmentWorkingHoursForConfig(input) {
  const config = input?.hotelConfig;
  const date = input?.date instanceof Date ? input.date : new Date();
  const timeZone = normalizeText(config?.hotelTimezone);
  const department = normalizeText(input?.department).toLowerCase();
  const hours = config?.departmentHours?.[department];
  const open = clockMinutes(hours?.open);
  const close = clockMinutes(hours?.close);

  if (!timeZone || !department || open === null || close === null) {
    return false;
  }

  let localMinutes;
  try {
    localMinutes = getHotelLocalMinutes(date, timeZone);
  } catch {
    return false;
  }

  if (open === 0 && (close === 0 || close === 23 * 60 + 59)) return true;
  if (open === close) return false;
  if (open < close) return localMinutes >= open && localMinutes < close;
  return localMinutes >= open || localMinutes < close;
}
