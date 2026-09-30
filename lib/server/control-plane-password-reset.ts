import "server-only";

import { createClient } from "@supabase/supabase-js";

import { logControlPlaneAudit } from "@/lib/server/control-plane-audit";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { sendSmtpTextEmail } from "@/lib/server/smtp-text-email";

type ResetLang = "bg" | "en";

const RESET_TOKEN_TTL_HINT_MINUTES = 60;

function clean(value: unknown, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizedEmail(value: unknown) {
  return clean(value, 320).toLowerCase();
}

function createRecoveryClient() {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("CONTROL_PLANE_RECOVERY_ENV_MISSING");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

async function activeAdminByEmail(email: string) {
  const { data, error } = await supabaseAdmin
    .from("platform_admins")
    .select("id,auth_user_id,email_snapshot,role,active")
    .eq("active", true)
    .ilike("email_snapshot", email)
    .maybeSingle();

  if (error) throw new Error(`CONTROL_PLANE_RESET_ADMIN_LOOKUP_FAILED:${error.message}`);
  return data || null;
}

function resetEmailCopy(lang: ResetLang, link: string) {
  if (lang === "bg") {
    return {
      subject: "GOSTAYA Control Panel — смяна на парола",
      body: [
        "Получихме заявка за смяна на паролата за GOSTAYA Control Panel.",
        "",
        "Отвори този еднократен линк:",
        link,
        "",
        `Линкът е предназначен само за Platform Admin и трябва да се използва възможно най-скоро (обичайно до ${RESET_TOKEN_TTL_HINT_MINUTES} минути според Auth настройките).`,
        "",
        "Ако не си поискал тази промяна, не използвай линка.",
        "",
        "GOSTAYA Security",
      ].join("\n"),
    };
  }

  return {
    subject: "GOSTAYA Control Panel — reset password",
    body: [
      "A password reset was requested for the GOSTAYA Control Panel.",
      "",
      "Open this one-time link:",
      link,
      "",
      `This link is for a Platform Admin only and should be used promptly (normally within ${RESET_TOKEN_TTL_HINT_MINUTES} minutes depending on Auth settings).`,
      "",
      "If you did not request this change, do not use the link.",
      "",
      "GOSTAYA Security",
    ].join("\n"),
  };
}

export async function requestPlatformAdminPasswordReset(input: {
  email: unknown;
  origin: string;
  lang: ResetLang;
}) {
  const email = normalizedEmail(input.email);
  if (!email) return { accepted: true };

  const admin = await activeAdminByEmail(email);
  if (!admin) return { accepted: true };

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  if (error) {
    throw new Error(`CONTROL_PLANE_RESET_LINK_FAILED:${error.message}`);
  }

  const properties = (data?.properties || {}) as Record<string, unknown>;
  const tokenHash = clean(
    properties.hashed_token
      || properties.hashedToken
      || properties.token_hash,
    512,
  );
  if (!tokenHash) throw new Error("CONTROL_PLANE_RESET_TOKEN_MISSING");

  const resetUrl = new URL("/control-plane/reset-password", input.origin);
  resetUrl.searchParams.set("token_hash", tokenHash);
  resetUrl.searchParams.set("lang", input.lang);

  const mail = resetEmailCopy(input.lang, resetUrl.toString());
  await sendSmtpTextEmail({
    to: email,
    subject: mail.subject,
    body: mail.body,
  });

  return { accepted: true };
}

function strongPassword(value: unknown) {
  const password = String(value || "");
  if (password.length < 12 || password.length > 512) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

export async function confirmPlatformAdminPasswordReset(input: {
  tokenHash: unknown;
  password: unknown;
}) {
  const tokenHash = clean(input.tokenHash, 512);
  const password = String(input.password || "");

  if (!tokenHash) throw new Error("CONTROL_PLANE_RESET_TOKEN_INVALID");
  if (!strongPassword(password)) {
    throw new Error("CONTROL_PLANE_RESET_PASSWORD_WEAK");
  }

  const recoveryClient = createRecoveryClient();
  const { data, error } = await recoveryClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "recovery",
  });

  if (error || !data.user) {
    throw new Error("CONTROL_PLANE_RESET_TOKEN_INVALID");
  }

  const { data: admin, error: adminError } = await supabaseAdmin
    .from("platform_admins")
    .select("id,auth_user_id,role,active")
    .eq("auth_user_id", data.user.id)
    .eq("active", true)
    .maybeSingle();

  if (adminError) {
    throw new Error(`CONTROL_PLANE_RESET_ADMIN_LOOKUP_FAILED:${adminError.message}`);
  }
  if (!admin) throw new Error("CONTROL_PLANE_RESET_AUTHORITY_REQUIRED");

  const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
    data.user.id,
    { password },
  );
  if (passwordError) {
    throw new Error(`CONTROL_PLANE_RESET_PASSWORD_UPDATE_FAILED:${passwordError.message}`);
  }

  const { error: revokeError } = await supabaseAdmin
    .from("platform_admin_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("admin_id", admin.id)
    .is("revoked_at", null);

  if (revokeError) {
    throw new Error(`CONTROL_PLANE_RESET_SESSION_REVOKE_FAILED:${revokeError.message}`);
  }

  await logControlPlaneAudit({
    actorAdminId: String(admin.id),
    action: "control_plane_password_reset",
    resourceType: "platform_admin",
    resourceId: String(admin.id),
    metadata: {
      role: admin.role,
      allControlPlaneSessionsRevoked: true,
    },
  });

  return { ok: true };
}
