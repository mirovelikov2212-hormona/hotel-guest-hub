export const GUEST_STAY_LIFECYCLE_STATES = Object.freeze([
  "active",
  "checkout_pending",
  "ended",
  "read_only",
]);

function toEpochMs(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function deriveGuestStayLifecycle(input) {
  const nowMs = Number.isFinite(Number(input?.nowMs)) ? Number(input.nowMs) : Date.now();
  const legacyStatus = String(input?.status || "").trim().toLowerCase();
  const lateCheckoutStatus = String(input?.lateCheckoutStatus || "none").trim().toLowerCase();
  const scheduledCheckOutMs = toEpochMs(input?.scheduledCheckOutAt);
  const effectiveCheckOutMs = toEpochMs(input?.effectiveCheckOutAt);

  if (legacyStatus === "cancelled") return "ended";

  if (
    lateCheckoutStatus === "pending" &&
    Number.isFinite(scheduledCheckOutMs) &&
    scheduledCheckOutMs <= nowMs
  ) {
    return "checkout_pending";
  }

  if (Number.isFinite(effectiveCheckOutMs) && effectiveCheckOutMs <= nowMs) {
    return "read_only";
  }

  return "active";
}

export function getGuestStayAccessPolicy(state) {
  const normalized = String(state || "").trim().toLowerCase();
  if (!GUEST_STAY_LIFECYCLE_STATES.includes(normalized)) {
    return { state: "ended", canRead: false, canWrite: false, readOnly: true };
  }

  return {
    state: normalized,
    canRead: normalized !== "ended",
    canWrite: normalized === "active",
    readOnly: normalized !== "active",
  };
}
