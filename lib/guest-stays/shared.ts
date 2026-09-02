import { normalizeStayDateKey as normalizeStayDateKeyStrict } from "@/lib/guest-stays/date-key.mjs";

export const GUEST_STAY_DEVICE_STORAGE_KEY = "stayhub_guest_device_id_v1";
export const GUEST_STAY_CHECK_IN_TIME = "15:00";
export const GUEST_STAY_CHECK_OUT_TIME = "12:00";
export const GUEST_SURVEY_START_MINUTES = 9 * 60;
export const GUEST_SURVEY_MAX_DAY_NUMBER = 5;

export type GuestStaySummary = {
  id: string;
  stayDeviceId: string;
  deviceToken: string;
  room: string;
  checkInDate: string;
  checkOutDate: string;
  checkInAt: string;
  scheduledCheckOutAt: string;
  effectiveCheckOutAt: string;
  lateCheckoutStatus: "none" | "pending" | "approved" | "rejected";
  lateCheckoutTime: string | null;
  datesRequired: boolean;
  active: boolean;
};

export function normalizeStayDateKey(value: unknown) {
  return normalizeStayDateKeyStrict(value);
}

export function addDaysToStayDateKey(dateKey: string, days: number) {
  const match = normalizeStayDateKey(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

export function getStayLengthNights(checkInDate: string, checkOutDate: string) {
  const start = Date.parse(`${normalizeStayDateKey(checkInDate)}T00:00:00.000Z`);
  const end = Date.parse(`${normalizeStayDateKey(checkOutDate)}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

export function getGuestSurveyWindow(checkInDate: string, checkOutDate: string) {
  const startDateKey = addDaysToStayDateKey(checkInDate, 2);
  const dayFiveDateKey = addDaysToStayDateKey(checkInDate, GUEST_SURVEY_MAX_DAY_NUMBER - 1);
  const dayBeforeCheckout = addDaysToStayDateKey(checkOutDate, -1);
  const endDateKey = dayFiveDateKey && dayBeforeCheckout
    ? (dayFiveDateKey < dayBeforeCheckout ? dayFiveDateKey : dayBeforeCheckout)
    : "";

  return {
    startDateKey,
    endDateKey,
    hasWindow: Boolean(startDateKey && endDateKey && startDateKey <= endDateKey),
  };
}

export function getStayDayNumber(checkInDate: string, currentDate: string) {
  const diff = getStayLengthNights(checkInDate, currentDate);
  return diff >= 0 ? diff + 1 : 0;
}

export function isDateInsideGuestSurveyWindow(input: {
  checkInDate: string;
  checkOutDate: string;
  hotelDateKey: string;
  hotelMinutes?: number;
}) {
  const window = getGuestSurveyWindow(input.checkInDate, input.checkOutDate);
  if (!window.hasWindow) return false;
  if (input.hotelDateKey < window.startDateKey || input.hotelDateKey > window.endDateKey) return false;
  if (
    input.hotelDateKey === window.startDateKey &&
    typeof input.hotelMinutes === "number" &&
    input.hotelMinutes < GUEST_SURVEY_START_MINUTES
  ) {
    return false;
  }
  return true;
}

export function normalizeLateCheckoutTime(value: unknown) {
  const match = String(value || "").trim().match(/\b(13|14):00\b/);
  return match ? `${match[1]}:00` : "";
}
