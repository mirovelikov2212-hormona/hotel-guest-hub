const RECOVERABLE_GUEST_STAY_ERROR_CODES = new Set([
  "STAY_NOT_FOUND",
  "STAY_DEVICE_NOT_FOUND",
  "MISSING_STAY_IDENTITY",
]);

export function normalizeGuestStayErrorCode(value) {
  return String(value || "").trim().toUpperCase();
}

export function isRecoverableGuestStayErrorCode(value) {
  return RECOVERABLE_GUEST_STAY_ERROR_CODES.has(normalizeGuestStayErrorCode(value));
}
