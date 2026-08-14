export type GuestStayLifecycleState = "active" | "checkout_pending" | "ended" | "read_only";

export const GUEST_STAY_LIFECYCLE_STATES: readonly GuestStayLifecycleState[];

export function deriveGuestStayLifecycle(input: {
  status?: string | null;
  lateCheckoutStatus?: string | null;
  scheduledCheckOutAt?: string | null;
  effectiveCheckOutAt?: string | null;
  nowMs?: number;
}): GuestStayLifecycleState;

export function getGuestStayAccessPolicy(state: GuestStayLifecycleState | string): {
  state: GuestStayLifecycleState;
  canRead: boolean;
  canWrite: boolean;
  readOnly: boolean;
};
