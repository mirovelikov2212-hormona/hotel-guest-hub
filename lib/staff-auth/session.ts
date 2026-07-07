import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { getStaffSessionCookieName, type StaffRole } from "@/lib/staff-auth/cookie-name";

export const STAFF_SESSION_COOKIE = "stayhub_staff_session";
const DEFAULT_STAFF_SESSION_TTL_HOURS = 24 * 30;

function getSessionSecret(): string {
  const secret = process.env.STAFF_SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing STAFF_SESSION_SECRET");
  }
  return secret;
}

export function createRawSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSessionToken(rawToken: string): string {
  const secret = getSessionSecret();
  return crypto
    .createHash("sha256")
    .update(`${rawToken}:${secret}`)
    .digest("hex");
}

export function getSessionExpiryDate(): Date {
  const now = new Date();
  const configuredTtlHours = Number(process.env.STAFF_SESSION_TTL_HOURS);
  const ttlHours =
    Number.isFinite(configuredTtlHours) && configuredTtlHours > 0
      ? configuredTtlHours
      : DEFAULT_STAFF_SESSION_TTL_HOURS;

  now.setHours(now.getHours() + ttlHours);
  return now;
}

export async function setStaffSessionCookie(
  hotelSlug: string,
  role: StaffRole,
  rawToken: string,
  expiresAt: Date
) {
  const cookieStore = await cookies();
  cookieStore.set(getStaffSessionCookieName(hotelSlug, role), rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearStaffSessionCookie(hotelSlug: string, role: StaffRole) {
  const cookieStore = await cookies();
  cookieStore.set(getStaffSessionCookieName(hotelSlug, role), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

export async function getCurrentRawStaffToken(hotelSlug: string, role: StaffRole): Promise<string | null> {
  const cookieStore = await cookies();
  return (
    cookieStore.get(getStaffSessionCookieName(hotelSlug, role))?.value ??
    cookieStore.get(STAFF_SESSION_COOKIE)?.value ??
    null
  );
}

export async function getCurrentStaffSession(hotelSlug: string, role: StaffRole) {
  const rawToken = await getCurrentRawStaffToken(hotelSlug, role);
  if (!rawToken) return null;

  const tokenHash = hashSessionToken(rawToken);

  const { data, error } = await supabaseAdmin
    .from("staff_sessions")
    .select("id, hotel_id, role, expires_at, revoked_at")
    .eq("session_token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !data) return null;

  const expiresAt = new Date(data.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return data;
}

export async function revokeCurrentStaffSession(hotelSlug: string, role: StaffRole) {
  const rawToken = await getCurrentRawStaffToken(hotelSlug, role);
  if (!rawToken) return;

  const tokenHash = hashSessionToken(rawToken);

  await supabaseAdmin
    .from("staff_sessions")
    .update({
      revoked_at: new Date().toISOString(),
    })
    .eq("session_token_hash", tokenHash)
    .is("revoked_at", null);
}
