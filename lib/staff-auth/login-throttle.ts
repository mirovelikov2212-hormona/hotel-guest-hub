import "server-only";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { StaffRole } from "@/lib/staff-auth/cookie-name";

type StaffLoginThrottleInput = {
  hotelId: string;
  role: StaffRole;
  sourceKey: string;
};

type StaffLoginThrottleAction = "check" | "failure" | "success";

export type StaffLoginThrottleState = {
  locked: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  retryAfterSeconds: number;
};

function getThrottleSecret() {
  const secret =
    process.env.STAFF_LOGIN_THROTTLE_SECRET ||
    process.env.STAFF_SESSION_SECRET;

  if (!secret) {
    throw new Error("Missing STAFF_LOGIN_THROTTLE_SECRET or STAFF_SESSION_SECRET");
  }

  return secret;
}

function getClientAddress(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const forwardedAddress = forwardedFor?.split(",")[0]?.trim();
  const realAddress = req.headers.get("x-real-ip")?.trim();
  return forwardedAddress || realAddress || "unknown";
}

export function getStaffLoginSourceKey(req: Request) {
  const clientAddress = getClientAddress(req);
  return crypto
    .createHmac("sha256", getThrottleSecret())
    .update(`stayhub-staff-login:${clientAddress}`)
    .digest("hex");
}

async function applyStaffLoginThrottleAction(
  input: StaffLoginThrottleInput,
  action: StaffLoginThrottleAction,
): Promise<StaffLoginThrottleState> {
  const { data, error } = await supabaseAdmin.rpc("staff_login_throttle", {
    p_hotel_id: input.hotelId,
    p_role: input.role,
    p_source_key: input.sourceKey,
    p_action: action,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw new Error("STAFF_LOGIN_THROTTLE_EMPTY_RESULT");
  }

  const retryAfterSeconds = Math.max(
    0,
    Number((row as Record<string, unknown>).retry_after_seconds || 0),
  );

  return {
    locked: (row as Record<string, unknown>).allowed === false,
    failedAttempts: Math.max(
      0,
      Number((row as Record<string, unknown>).failed_attempts || 0),
    ),
    lockedUntil:
      typeof (row as Record<string, unknown>).locked_until === "string"
        ? String((row as Record<string, unknown>).locked_until)
        : null,
    retryAfterSeconds: Number.isFinite(retryAfterSeconds)
      ? Math.ceil(retryAfterSeconds)
      : 0,
  };
}

export function checkStaffLoginThrottle(input: StaffLoginThrottleInput) {
  return applyStaffLoginThrottleAction(input, "check");
}

export function recordStaffLoginFailure(input: StaffLoginThrottleInput) {
  return applyStaffLoginThrottleAction(input, "failure");
}

export function clearStaffLoginThrottle(input: StaffLoginThrottleInput) {
  return applyStaffLoginThrottleAction(input, "success");
}
