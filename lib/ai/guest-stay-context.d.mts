import type { GuestStayContext } from "../server/guest-stay-context.mjs";

export type GuestStayContextIntent =
  | "stay_context_requests"
  | "stay_context_massage"
  | "stay_context_dates"
  | "stay_context_service_usage";

export type GuestSafeStayContext = {
  scope: "current_stay" | null;
  stay: {
    roomNumber: string | null;
    lifecycleState: string | null;
    checkInDate: string | null;
    checkOutDate: string | null;
  };
  requests: { total: number; active: number; completed: number };
  bookings: { active: number; upcoming: number };
  serviceUsageCount: number;
};

export function detectGuestStayContextIntent(question: unknown): GuestStayContextIntent | null;
export function answerFromGuestStayContext(input?: {
  intent?: GuestStayContextIntent | null;
  lang?: string;
  stayContext?: GuestStayContext | Record<string, unknown>;
}): {
  answer: string;
  intent: GuestStayContextIntent;
  guestSafeContext: GuestSafeStayContext;
} | null;

export const GUEST_STAY_CONTEXT_INTENTS: Readonly<{
  REQUESTS: "stay_context_requests";
  MASSAGE: "stay_context_massage";
  STAY_DATES: "stay_context_dates";
  SERVICE_USAGE: "stay_context_service_usage";
}>;
