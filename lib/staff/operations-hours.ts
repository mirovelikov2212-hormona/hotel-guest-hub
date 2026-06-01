export const DEFAULT_HOTEL_TIME_ZONE = "Europe/Sofia";

const DEPARTMENT_WORK_START_MINUTES = 7 * 60;
const DEPARTMENT_WORK_END_MINUTES = 17 * 60;

function getTimePartsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");

  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
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
