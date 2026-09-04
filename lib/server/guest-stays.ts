import "server-only";

import {
  markLateCheckoutRequested as markLateCheckoutRequestedLegacy,
  validateGuestStayIdentity as validateGuestStayIdentityLegacy,
  type GuestStayDeviceRow,
  type GuestStayRow,
} from "@/lib/server/guest-stays-legacy";
import {
  deriveGuestStayLifecycle,
  getGuestStayAccessPolicy,
} from "@/lib/guest-stays/lifecycle-model.mjs";
import {
  resolveFactoryGuestWriteIdentity,
  type FactoryGuestReadyIdentity,
} from "@/lib/server/factory-guest-context";

export * from "@/lib/server/guest-stays-legacy";

/**
 * Preserve the complete legacy stay service while collapsing certified Factory
 * Sandbox stay + device validation into the consolidated guest-write RPC.
 * Rolling test stays explicitly return fallback_required from SQL and therefore
 * keep the legacy refresh/lifecycle path byte-for-byte.
 */
export function validatePreparedFactoryGuestWriteIdentity(
  factoryIdentity: FactoryGuestReadyIdentity,
) {
  // The consolidated RPC proves tenant/room/stay/device identity, but M13
  // lifecycle authority remains application-visible and fail-closed here too.
  // Request-scoped prepared identity is never persisted or reused across writes.
  const currentStay = factoryIdentity.stay as unknown as GuestStayRow;
  const lifecycleState = deriveGuestStayLifecycle({
    status: currentStay.status,
    lateCheckoutStatus: currentStay.late_checkout_status,
    scheduledCheckOutAt: currentStay.scheduled_check_out_at,
    effectiveCheckOutAt: currentStay.effective_check_out_at,
    nowMs: Date.now(),
  });
  const access = getGuestStayAccessPolicy(lifecycleState);
  if (!access.canWrite) throw new Error("STAY_ENDED");

  return {
    stay: currentStay,
    device: factoryIdentity.device as unknown as GuestStayDeviceRow,
  };
}

export async function validateGuestStayIdentity(input: {
  hotelId: string;
  room: string;
  stayId?: unknown;
  stayDeviceId?: unknown;
}) {
  const factoryIdentity = await resolveFactoryGuestWriteIdentity(input);
  if (!factoryIdentity) {
    return validateGuestStayIdentityLegacy(input);
  }
  if (factoryIdentity.kind === "missing") return null;
  if (factoryIdentity.kind === "stay_ended") throw new Error("STAY_ENDED");

  // Keep the canonical M13 lifecycle derivation explicit at the shared mutation
  // boundary even though positive Factory routes may also validate prepared
  // request-scoped identity without another database roundtrip.
  const currentStay = factoryIdentity.stay as unknown as GuestStayRow;
  const lifecycleState = deriveGuestStayLifecycle({
    status: currentStay.status,
    lateCheckoutStatus: currentStay.late_checkout_status,
    scheduledCheckOutAt: currentStay.scheduled_check_out_at,
    effectiveCheckOutAt: currentStay.effective_check_out_at,
    nowMs: Date.now(),
  });
  const access = getGuestStayAccessPolicy(lifecycleState);
  if (!access.canWrite) throw new Error("STAY_ENDED");

  return {
    stay: currentStay,
    device: factoryIdentity.device as unknown as GuestStayDeviceRow,
  };
}

export async function markLateCheckoutRequested(input: {
  stayId: string;
  requestId: string;
  requestedTime: string;
}) {
  return markLateCheckoutRequestedLegacy(input);
}
