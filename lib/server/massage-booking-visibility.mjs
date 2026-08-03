/**
 * @typedef {Object} MassageBookingVisibilityInput
 * @property {string | null | undefined} rowStayId
 * @property {string | null | undefined} rowStayDeviceId
 * @property {string} bookingCreatedAt
 * @property {string} currentStayId
 * @property {string} currentStayDeviceId
 * @property {string} currentStayCheckInAt
 * @property {string} currentStayEffectiveCheckOutAt
 */

function normalizeIdentifier(value) {
  return String(value || "").trim();
}

/**
 * @param {MassageBookingVisibilityInput} input
 */
export function isMassageBookingVisibleForStay(input) {
  const rowStayId = normalizeIdentifier(input.rowStayId);
  const rowStayDeviceId = normalizeIdentifier(input.rowStayDeviceId);
  const currentStayId = normalizeIdentifier(input.currentStayId);
  const currentStayDeviceId = normalizeIdentifier(input.currentStayDeviceId);

  if (!currentStayId || !currentStayDeviceId) return false;
  if (rowStayId && rowStayId !== currentStayId) return false;
  if (rowStayDeviceId && rowStayDeviceId !== currentStayDeviceId) return false;

  // Older massage requests were created before stay/device identity was stored.
  // They remain visible only when their creation timestamp falls inside the
  // currently validated stay window. This prevents a same-room turnover from
  // exposing the previous guest's booking to the next guest.
  if (!rowStayId && !rowStayDeviceId) {
    const createdAtMs = new Date(input.bookingCreatedAt).getTime();
    const checkInMs = new Date(input.currentStayCheckInAt).getTime();
    const checkOutMs = new Date(input.currentStayEffectiveCheckOutAt).getTime();

    if (
      !Number.isFinite(createdAtMs) ||
      !Number.isFinite(checkInMs) ||
      !Number.isFinite(checkOutMs) ||
      createdAtMs < checkInMs ||
      createdAtMs > checkOutMs
    ) {
      return false;
    }
  }

  return true;
}
