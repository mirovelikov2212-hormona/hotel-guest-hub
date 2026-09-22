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
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizeText(value) {
  return String(value ?? "").trim();
}

function getLocalPartsInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");
  const weekdayRaw = normalizeText(
    parts.find((part) => part.type === "weekday")?.value,
  ).slice(0, 3).toLowerCase();

  const dateKey = [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");

  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
    weekday: WEEKDAY_SET.has(weekdayRaw) ? weekdayRaw : null,
    dateKey,
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

function normalizeDateKey(value) {
  const text = normalizeText(value);
  const match = text.match(DATE_KEY_RE);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year
    || utc.getUTCMonth() !== month - 1
    || utc.getUTCDate() !== day
  ) {
    return null;
  }
  return text;
}

function previousDateKey(value) {
  const normalized = normalizeDateKey(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
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

function normalizeDailyCoverageWindow(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const open = clockMinutes(value.open);
  const close = clockMinutes(value.close);
  // Exact-date overrides define one hotel-local calendar day. Crossing
  // midnight is deliberately forbidden to avoid ambiguous ownership.
  if (open === null || close === null || open >= close) return null;
  return { open, close };
}

function normalizeScheduleRule(value, options = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const maxWindows = Number(options.maxWindows || 64);

  if (value.is24h === true) {
    if (Array.isArray(value.windows) && value.windows.length > 0) return null;
    return { is24h: true, windows: [] };
  }

  if (!Array.isArray(value.windows) || value.windows.length > maxWindows) return null;
  const windows = value.windows.map(normalizeCoverageWindow);
  if (windows.some((window) => !window)) return null;
  return { is24h: false, windows };
}

function normalizeSeason(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = normalizeText(value.id);
  const startDate = normalizeDateKey(value.startDate);
  const endDate = normalizeDateKey(value.endDate);
  if (!id || id.length > 120 || !startDate || !endDate || startDate > endDate) return null;

  const rule = normalizeScheduleRule(value);
  if (!rule) return null;

  return {
    id,
    startDate,
    endDate,
    is24h: rule.is24h,
    windows: rule.windows,
  };
}

function normalizeDateOverride(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const date = normalizeDateKey(value.date);
  const mode = normalizeText(value.mode).toLowerCase();
  if (!date || !["closed", "24h", "custom"].includes(mode)) return null;

  if (mode === "closed" || mode === "24h") {
    if (Array.isArray(value.windows) && value.windows.length > 0) return null;
    return { date, mode, windows: [] };
  }

  if (!Array.isArray(value.windows) || value.windows.length < 1 || value.windows.length > 16) {
    return null;
  }
  const windows = value.windows.map(normalizeDailyCoverageWindow);
  if (windows.some((window) => !window)) return null;
  return { date, mode, windows };
}

function rangesOverlap(left, right) {
  return left.startDate <= right.endDate && right.startDate <= left.endDate;
}

function scheduleForConfig(config, department) {
  const raw = config?.departmentSchedules?.[department];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const base = normalizeScheduleRule(raw);
  if (!base) return null;

  const rawSeasons = raw.seasons === undefined ? [] : raw.seasons;
  if (!Array.isArray(rawSeasons) || rawSeasons.length > 32) return null;
  const seasons = rawSeasons.map(normalizeSeason);
  if (seasons.some((season) => !season)) return null;

  const seasonIds = new Set();
  for (let index = 0; index < seasons.length; index += 1) {
    const season = seasons[index];
    if (seasonIds.has(season.id)) return null;
    seasonIds.add(season.id);
    for (let previous = 0; previous < index; previous += 1) {
      if (rangesOverlap(season, seasons[previous])) return null;
    }
  }

  const rawDateOverrides = raw.dateOverrides === undefined ? [] : raw.dateOverrides;
  if (!Array.isArray(rawDateOverrides) || rawDateOverrides.length > 366) return null;
  const dateOverrides = rawDateOverrides.map(normalizeDateOverride);
  if (dateOverrides.some((override) => !override)) return null;

  const overrideDates = new Set();
  for (const override of dateOverrides) {
    if (overrideDates.has(override.date)) return null;
    overrideDates.add(override.date);
  }

  if (
    base.is24h !== true
    && base.windows.length === 0
    && seasons.length === 0
    && dateOverrides.length === 0
  ) {
    return null;
  }

  return {
    is24h: base.is24h,
    windows: base.windows,
    seasons,
    dateOverrides,
  };
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

function seasonForDate(schedule, dateKey) {
  return schedule.seasons.find(
    (season) => season.startDate <= dateKey && dateKey <= season.endDate,
  ) || null;
}

function dateOverrideForDate(schedule, dateKey) {
  return schedule.dateOverrides.find((override) => override.date === dateKey) || null;
}

function ruleForDate(schedule, dateKey) {
  const override = dateOverrideForDate(schedule, dateKey);
  if (override) {
    return {
      kind: "date_override",
      key: override.date,
      rule: override,
    };
  }

  const season = seasonForDate(schedule, dateKey);
  if (season) {
    return {
      kind: "season",
      key: season.id,
      rule: season,
    };
  }

  return {
    kind: "weekly",
    key: "weekly",
    rule: schedule,
  };
}

function isWeeklyRuleActiveForCurrentDay(rule, localDay, localMinutes) {
  if (rule.is24h) return true;

  return rule.windows.some((window) => {
    if (window.open < window.close) {
      return (
        window.days.includes(localDay)
        && localMinutes >= window.open
        && localMinutes < window.close
      );
    }

    return window.days.includes(localDay) && localMinutes >= window.open;
  });
}

function isPreviousRuleOvernightSpillActive(rule, previousDay, localMinutes) {
  if (!rule || rule.is24h || !previousDay) return false;

  return rule.windows.some((window) => (
    window.open > window.close
    && window.days.includes(previousDay)
    && localMinutes < window.close
  ));
}

function isDateOverrideActive(override, localMinutes) {
  if (override.mode === "closed") return false;
  if (override.mode === "24h") return true;
  return override.windows.some(
    (window) => localMinutes >= window.open && localMinutes < window.close,
  );
}

export function getHotelLocalMinutes(
  date = new Date(),
  timeZone = DEFAULT_HOTEL_TIME_ZONE,
) {
  const { hour, minute } = getLocalPartsInZone(date, timeZone);
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

/**
 * Runtime compatibility rule:
 * - configured schedule => the schedule is authoritative;
 * - no configured schedule => keep the primary department active, but mark
 *   workingHoursKnown=false so Manager/Safety tooling can surface the gap.
 *
 * This prevents different callers from inventing their own fallback behavior.
 */
export function resolveDepartmentCoverageForConfig(input) {
  const configured = hasConfiguredDepartmentScheduleForConfig(input);
  if (!configured) {
    return {
      configured: false,
      workingHoursKnown: false,
      working: true,
    };
  }

  return {
    configured: true,
    workingHoursKnown: true,
    working: isDepartmentWorkingHoursForConfig(input),
  };
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
    local = getLocalPartsInZone(date, timeZone);
  } catch {
    return false;
  }
  if (!local.weekday || !normalizeDateKey(local.dateKey)) return false;

  const schedule = scheduleForConfig(config, department);
  if (schedule) {
    const currentAuthority = ruleForDate(schedule, local.dateKey);
    const localMinutes = local.hour * 60 + local.minute;

    if (currentAuthority.kind === "date_override") {
      return isDateOverrideActive(currentAuthority.rule, localMinutes);
    }

    if (
      isWeeklyRuleActiveForCurrentDay(
        currentAuthority.rule,
        local.weekday,
        localMinutes,
      )
    ) {
      return true;
    }

    // An overnight shift belongs to the local date on which it started.
    // Let an already-started weekly/seasonal shift finish even when a season
    // boundary occurs at midnight. Exact-date overrides remain absolute and
    // deliberately suppress any previous-day spill.
    const previousKey = previousDateKey(local.dateKey);
    const previousDay = previousWeekday(local.weekday);
    const previousAuthority = previousKey ? ruleForDate(schedule, previousKey) : null;
    if (!previousAuthority || previousAuthority.kind === "date_override") {
      return false;
    }

    return isPreviousRuleOvernightSpillActive(
      previousAuthority.rule,
      previousDay,
      localMinutes,
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
