export const DEFAULT_HOTEL_TIME_ZONE = "UTC";

export const DEPARTMENT_WEEKDAYS = Object.freeze([
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
]);

const WEEKDAY_SET = new Set(DEPARTMENT_WEEKDAYS);
const WEEKDAY_INDEX = new Map(DEPARTMENT_WEEKDAYS.map((day, index) => [day, index]));

function normalizeText(value) {
  return String(value ?? "").trim();
}

function getTimePartsInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const weekdayRaw = normalizeText(
    parts.find((part) => part.type === "weekday")?.value,
  ).slice(0, 3).toLowerCase();

  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
    weekday: WEEKDAY_SET.has(weekdayRaw) ? weekdayRaw : null,
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

function previousWeekday(day) {
  const index = WEEKDAY_INDEX.get(day);
  if (!Number.isInteger(index)) return null;
  return DEPARTMENT_WEEKDAYS[(index + 6) % 7];
}

function normalizeDays(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 7) return null;
  const result = [];
  for (const candidate of value) {
    const day = normalizeText(candidate).toLowerCase();
    if (!WEEKDAY_SET.has(day) || result.includes(day)) return null;
    result.push(day);
  }
  return result;
}

function normalizeCoverageWindow(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const days = normalizeDays(value.days);
  const open = clockMinutes(value.open);
  const close = clockMinutes(value.close);
  if (!days || open === null || close === null || open === close) return null;
  return { days, open, close };
}

function isCoverageWindowActive(window, localDay, localMinutes) {
  const previousDay = previousWeekday(localDay);
  if (!previousDay) return false;

  if (window.open < window.close) {
    return (
      window.days.includes(localDay)
      && localMinutes >= window.open
      && localMinutes < window.close
    );
  }

  return (
    (window.days.includes(localDay) && localMinutes >= window.open)
    || (window.days.includes(previousDay) && localMinutes < window.close)
  );
}

function scheduleForConfig(config, department) {
  const raw = config?.departmentSchedules?.[department];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  if (raw.is24h === true) {
    if (Array.isArray(raw.windows) && raw.windows.length > 0) return null;
    return { is24h: true, windows: [] };
  }

  if (!Array.isArray(raw.windows) || raw.windows.length < 1 || raw.windows.length > 64) {
    return null;
  }

  const windows = raw.windows.map(normalizeCoverageWindow);
  if (windows.some((window) => !window)) return null;
  return { is24h: false, windows };
}

function legacyHoursForConfig(config, department) {
  const hours = config?.departmentHours?.[department];
  const open = clockMinutes(hours?.open);
  const close = clockMinutes(hours?.close);
  if (open === null || close === null) return null;

  if (open === 0 && (close === 0 || close === 23 * 60 + 59)) {
    return { is24h: true, open, close };
  }
  if (open === close) return null;
  return { is24h: false, open, close };
}

export function getHotelLocalMinutes(
  date = new Date(),
  timeZone = DEFAULT_HOTEL_TIME_ZONE,
) {
  const { hour, minute } = getTimePartsInZone(date, timeZone);
  return hour * 60 + minute;
}

export function hasConfiguredDepartmentScheduleForConfig(input) {
  const config = input?.hotelConfig;
  if (!config) return false;

  const department = normalizeText(input?.department).toLowerCase();
  if (!department) return false;

  if (scheduleForConfig(config, department)) return true;
  return Boolean(legacyHoursForConfig(config, department));
}

export function isDepartmentWorkingHoursForConfig(input) {
  const config = input?.hotelConfig;
  if (!config) return false;

  const date = input?.date instanceof Date ? input.date : new Date();
  const timeZone = normalizeText(config.hotelTimezone);
  const department = normalizeText(input?.department).toLowerCase();
  if (!timeZone || !department) return false;

  let local;
  try {
    local = getTimePartsInZone(date, timeZone);
  } catch {
    return false;
  }
  if (!local.weekday) return false;

  const schedule = scheduleForConfig(config, department);
  if (schedule) {
    if (schedule.is24h) return true;
    const localMinutes = local.hour * 60 + local.minute;
    return schedule.windows.some((window) =>
      isCoverageWindowActive(window, local.weekday, localMinutes),
    );
  }

  const legacy = legacyHoursForConfig(config, department);
  if (!legacy) return false;
  if (legacy.is24h) return true;

  const localMinutes = local.hour * 60 + local.minute;
  if (legacy.open < legacy.close) {
    return localMinutes >= legacy.open && localMinutes < legacy.close;
  }
  return localMinutes >= legacy.open || localMinutes < legacy.close;
}

/**
 * Legacy compatibility helper.
 * No hotel-independent working hours exist anymore: callers must supply an
 * explicit open/close window. Missing or invalid hours fail closed.
 */
export function isDepartmentWorkingHours(
  date = new Date(),
  timeZone = DEFAULT_HOTEL_TIME_ZONE,
  hours = null,
) {
  const open = clockMinutes(hours?.open);
  const close = clockMinutes(hours?.close);
  if (open === null || close === null || open === close) return false;

  let localMinutes;
  try {
    localMinutes = getHotelLocalMinutes(date, timeZone);
  } catch {
    return false;
  }

  if (open === 0 && (close === 0 || close === 23 * 60 + 59)) return true;
  if (open < close) return localMinutes >= open && localMinutes < close;
  return localMinutes >= open || localMinutes < close;
}

/**
 * Legacy compatibility helper. Without explicit hours there is no basis for
 * rerouting, so the function fails closed rather than inventing a schedule.
 */
export function isReceptionBackupHours(
  date = new Date(),
  timeZone = DEFAULT_HOTEL_TIME_ZONE,
  hours = null,
) {
  if (!hours) return false;
  return !isDepartmentWorkingHours(date, timeZone, hours);
}
