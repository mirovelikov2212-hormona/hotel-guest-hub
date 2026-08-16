import "server-only";

import crypto from "crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { PlatformAdminAuthority, PlatformAdminRole } from "@/lib/server/control-plane-auth";

export const CONTROL_PLANE_SESSION_COOKIE = "stayhub_control_plane_session";
const DEFAULT_CONTROL_PLANE_SESSION_TTL_HOURS = 12;

function getRootSessionSecret() {
  const secret = String(process.env.STAFF_SESSION_SECRET || "").trim();
  if (!secret) throw new Error("Missing STAFF_SESSION_SECRET");
  return secret;
}

export function createRawControlPlaneSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashControlPlaneSessionToken(rawToken: string) {
  return crypto
    .createHmac("sha256", getRootSessionSecret())
    .update(`stayhub:control-plane:v1:${rawToken}`)
    .digest("hex");
}

export function getControlPlaneSessionExpiryDate() {
  const configured = Number(process.env.CONTROL_PLANE_SESSION_TTL_HOURS);
  const ttlHours = Number.isFinite(configured) && configured > 0 && configured <= 24
    ? configured
    : DEFAULT_CONTROL_PLANE_SESSION_TTL_HOURS;
  return new Date(Date.now() + ttlHours * 60 * 60 * 1000);
}

export async function setControlPlaneSessionCookie(rawToken: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(CONTROL_PLANE_SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearControlPlaneSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(CONTROL_PLANE_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
  });
}

export async function issueControlPlaneSession(adminId: string) {
  const rawToken = createRawControlPlaneSessionToken();
  const tokenHash = hashControlPlaneSessionToken(rawToken);
  const expiresAt = getControlPlaneSessionExpiryDate();

  const { error } = await supabaseAdmin
    .from("platform_admin_sessions")
    .insert({
      admin_id: adminId,
      session_token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    });

  if (error) throw new Error(`CONTROL_PLANE_SESSION_CREATE_FAILED:${error.message}`);
  await setControlPlaneSessionCookie(rawToken, expiresAt);
  return expiresAt;
}

type SessionRow = {
  id: string;
  admin_id: string;
  expires_at: string;
  revoked_at: string | null;
};

type AdminRow = {
  id: string;
  auth_user_id: string;
  email_snapshot: string | null;
  role: PlatformAdminRole;
  active: boolean;
};

export async function getCurrentPlatformAdminSession(): Promise<PlatformAdminAuthority | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(CONTROL_PLANE_SESSION_COOKIE)?.value || "";
  if (!rawToken) return null;

  const { data: sessionData, error: sessionError } = await supabaseAdmin
    .from("platform_admin_sessions")
    .select("id, admin_id, expires_at, revoked_at")
    .eq("session_token_hash", hashControlPlaneSessionToken(rawToken))
    .is("revoked_at", null)
    .maybeSingle();

  if (sessionError || !sessionData) return null;
  const session = sessionData as SessionRow;
  const expiresAt = new Date(session.expires_at);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) return null;

  const { data: adminData, error: adminError } = await supabaseAdmin
    .from("platform_admins")
    .select("id, auth_user_id, email_snapshot, role, active")
    .eq("id", session.admin_id)
    .eq("active", true)
    .maybeSingle();

  if (adminError || !adminData) return null;
  const admin = adminData as AdminRow;

  return {
    adminId: admin.id,
    authUserId: admin.auth_user_id,
    email: admin.email_snapshot,
    role: admin.role,
  };
}

export async function revokeCurrentControlPlaneSession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(CONTROL_PLANE_SESSION_COOKIE)?.value || "";
  if (!rawToken) {
    await clearControlPlaneSessionCookie();
    return;
  }

  await supabaseAdmin
    .from("platform_admin_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("session_token_hash", hashControlPlaneSessionToken(rawToken))
    .is("revoked_at", null);

  await clearControlPlaneSessionCookie();
}
