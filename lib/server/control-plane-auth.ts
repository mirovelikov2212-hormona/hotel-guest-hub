import "server-only";

import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type PlatformAdminRole = "super_admin" | "operator" | "support" | "read_only";

export type PlatformAdminAuthority = {
  adminId: string;
  authUserId: string;
  email: string | null;
  role: PlatformAdminRole;
};

type PlatformAdminRow = {
  id: string;
  auth_user_id: string;
  email_snapshot: string | null;
  role: PlatformAdminRole;
  active: boolean;
};

function mapPlatformAdmin(
  admin: PlatformAdminRow,
  email: string | null | undefined,
): PlatformAdminAuthority {
  return {
    adminId: admin.id,
    authUserId: admin.auth_user_id,
    email: email || admin.email_snapshot,
    role: admin.role,
  };
}

async function loadActivePlatformAdmin(authUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("platform_admins")
    .select("id, auth_user_id, email_snapshot, role, active")
    .eq("auth_user_id", authUserId)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`CONTROL_PLANE_ADMIN_LOOKUP_FAILED:${error.message}`);
  }
  return data ? (data as PlatformAdminRow) : null;
}

function createControlPlaneCredentialClient() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("CONTROL_PLANE_AUTH_ENV_MISSING");
  }

  // Per-request client: password verification must never mutate the shared
  // supabaseAdmin auth state used by unrelated server requests.
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function authenticatePlatformAdminCredentials(input: {
  email: string;
  password: string;
}): Promise<PlatformAdminAuthority | null> {
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  if (!email || email.length > 320 || !password || password.length > 512) return null;

  const authClient = createControlPlaneCredentialClient();
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  const user = data.user;
  if (error || !user) return null;

  const admin = await loadActivePlatformAdmin(user.id);
  if (!admin) return null;
  return mapPlatformAdmin(admin, user.email);
}

export async function resolvePlatformAdminAccessToken(
  accessToken: string,
): Promise<PlatformAdminAuthority | null> {
  const token = String(accessToken || "").trim();
  if (!token) return null;

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return null;

  const admin = await loadActivePlatformAdmin(user.id);
  if (!admin) return null;
  return mapPlatformAdmin(admin, user.email);
}

export function canMutateControlPlane(role: PlatformAdminRole) {
  return role === "super_admin" || role === "operator";
}

export function canManagePlatformAdmins(role: PlatformAdminRole) {
  return role === "super_admin";
}
