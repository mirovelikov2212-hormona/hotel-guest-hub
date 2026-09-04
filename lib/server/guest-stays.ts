import "server-only";

import {
  validateGuestStayIdentity as validateGuestStayIdentityLegacy,
  type GuestStayDeviceRow,
  type GuestStayRow,
} from "@/lib/server/guest-stays-legacy";
import { resolveFactoryGuestWriteIdentity } from "@/lib/server/factory-guest-context";

export * from "@/lib/server/guest-stays-legacy";

/**
 * Preserve the complete legacy stay service while collapsing certified Factory
 * Sandbox stay + device validation into the consolidated guest-write RPC.
 * Rolling test stays explicitly return fallback_required from SQL and therefore
 * keep the legacy refresh/lifecycle path byte-for-byte.
 */
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

  return {
    stay: factoryIdentity.stay as unknown as GuestStayRow,
    device: factoryIdentity.device as unknown as GuestStayDeviceRow,
  };
}
