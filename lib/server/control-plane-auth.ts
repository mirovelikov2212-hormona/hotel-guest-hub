import "server-only";

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

export async function resolvePlatformAdminAccessToken(
  accessToken: string,
): Promise<PlatformAdminAuthority | null> {
  const token = String(accessToken || "").trim();
  if (!token) return null;

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return null;

  const { data, error } = await supabaseAdmin
    .from("platform_admins")
    .select("id, auth_user_id, email_snapshot, role, active")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`CONTROL_PLANE_ADMIN_LOOKUP_FAILED:${error.message}`);
  }
  if (!data) return null;

  const admin = data as PlatformAdminRow;
  return {
    adminId: admin.id,
    authUserId: admin.auth_user_id,
    email: user.email || admin.email_snapshot,
    role: admin.role,
  };
}

export function canMutateControlPlane(role: PlatformAdminRole) {
  return role === "super_admin" || role === "operator";
}

export function canManagePlatformAdmins(role: PlatformAdminRole) {
  return role === "super_admin";
}
