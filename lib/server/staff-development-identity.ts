import "server-only";

import { cookies } from "next/headers";

import {
  assertStaffDevelopmentWriteEnabled,
} from "@/lib/server/staff-development-persistence";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { resolveHotelByAnySlugAdmin } from "@/lib/server/hotel-scope";
import {
  createRawSessionToken,
  getCurrentStaffSession,
  hashSessionToken,
} from "@/lib/staff-auth/session";
import { hashPin, verifyPin } from "@/lib/staff-auth/pin";
import {
  resolveStaffRuntimeRoleForHotelId,
} from "@/lib/server/staff-runtime-role";
import { normalizeStaffRoleCode } from "@/lib/staff/role-code";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERSONAL_PIN_RE = /^\d{6,8}$/;
const DEFAULT_DEVELOPMENT_SESSION_HOURS = 8;

type StaffUserRow = {
  id: string;
  hotel_id: string;
  department_id: string | null;
  full_name: string | null;
  role: string;
  active: boolean;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function uuid(value: unknown, code: string) {
  const id = clean(value).toLowerCase();
  if (!UUID_RE.test(id)) throw new Error(code);
  return id;
}

function normalizePersonalPin(value: unknown) {
  const pin = clean(value);
  if (!PERSONAL_PIN_RE.test(pin)) {
    throw new Error("STAFF_DEVELOPMENT_PERSONAL_PIN_INVALID");
  }
  return pin;
}

function sanitizeSegment(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-");
}

function developmentCookieName(hotelSlug: string) {
  return `stayhub_staff_development__${sanitizeSegment(hotelSlug)}`;
}

function developmentTokenHash(rawToken: string) {
  return hashSessionToken(`staff-development:${rawToken}`);
}

function configuredSessionHours() {
  const configured = Number(process.env.STAFF_DEVELOPMENT_SESSION_TTL_HOURS);
  if (Number.isFinite(configured) && configured > 0 && configured <= 24) {
    return configured;
  }
  return DEFAULT_DEVELOPMENT_SESSION_HOURS;
}

function sessionExpiry(operationalExpiresAt: unknown) {
  const operational = new Date(clean(operationalExpiresAt));
  if (!Number.isFinite(operational.getTime())) {
    throw new Error("STAFF_DEVELOPMENT_OPERATIONAL_SESSION_INVALID");
  }

  const localExpiry = new Date(
    Date.now() + configuredSessionHours() * 60 * 60 * 1000,
  );
  return operational.getTime() < localExpiry.getTime()
    ? operational
    : localExpiry;
}

async function setDevelopmentCookie(
  hotelSlug: string,
  rawToken: string,
  expiresAt: Date,
) {
  const store = await cookies();
  store.set(developmentCookieName(hotelSlug), rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/staff/${sanitizeSegment(hotelSlug)}`,
    expires: expiresAt,
  });
}

export async function clearStaffDevelopmentCookie(hotelSlug: string) {
  const store = await cookies();
  store.set(developmentCookieName(hotelSlug), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/staff/${sanitizeSegment(hotelSlug)}`,
    expires: new Date(0),
  });
}

async function activeStaffUser(
  hotelId: string,
  staffUserId: string,
): Promise<StaffUserRow> {
  const { data, error } = await supabaseAdmin
    .from("staff_users")
    .select("id,hotel_id,department_id,full_name,role,active")
    .eq("hotel_id", hotelId)
    .eq("id", staffUserId)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    throw new Error("STAFF_DEVELOPMENT_STAFF_USER_NOT_FOUND");
  }

  return {
    id: String(data.id),
    hotel_id: String(data.hotel_id),
    department_id: data.department_id ? String(data.department_id) : null,
    full_name: data.full_name ? String(data.full_name) : null,
    role: clean(data.role).toLowerCase(),
    active: data.active === true,
  };
}

async function assertIdentityMatchesOperationalRole(input: {
  hotelId: string;
  operationalRole: string;
  staffUser: StaffUserRow;
}) {
  const runtimeRole = await resolveStaffRuntimeRoleForHotelId(
    input.hotelId,
    input.operationalRole,
  );
  if (!runtimeRole) {
    throw new Error("STAFF_DEVELOPMENT_OPERATIONAL_ROLE_INVALID");
  }

  if (runtimeRole.kind === "manager") {
    if (input.staffUser.role !== "hotel_manager") {
      throw new Error("STAFF_DEVELOPMENT_IDENTITY_ROLE_MISMATCH");
    }
    return runtimeRole;
  }

  if (
    runtimeRole.departmentCode === "reception"
    && input.staffUser.role === "reception"
  ) {
    return runtimeRole;
  }

  if (
    !input.staffUser.department_id
    || input.staffUser.department_id !== runtimeRole.departmentId
    || !["staff", "department_manager", "reception"].includes(
      input.staffUser.role,
    )
  ) {
    throw new Error("STAFF_DEVELOPMENT_IDENTITY_DEPARTMENT_MISMATCH");
  }

  return runtimeRole;
}

export async function provisionStaffDevelopmentCredential(input: {
  hotelId: unknown;
  staffUserId: unknown;
  personalPin: unknown;
  createdByStaffUserId: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();

  const hotelId = uuid(
    input.hotelId,
    "STAFF_DEVELOPMENT_HOTEL_ID_INVALID",
  );
  const staffUserId = uuid(
    input.staffUserId,
    "STAFF_DEVELOPMENT_STAFF_USER_ID_INVALID",
  );
  const createdByStaffUserId = uuid(
    input.createdByStaffUserId,
    "STAFF_DEVELOPMENT_CREATOR_ID_INVALID",
  );
  const pin = normalizePersonalPin(input.personalPin);

  const target = await activeStaffUser(hotelId, staffUserId);
  const creator = await activeStaffUser(hotelId, createdByStaffUserId);

  if (!["department_manager", "hotel_manager"].includes(creator.role)) {
    throw new Error("STAFF_DEVELOPMENT_CREDENTIAL_MANAGER_REQUIRED");
  }
  if (
    creator.role === "department_manager"
    && (
      !creator.department_id
      || creator.department_id !== target.department_id
      || target.role === "hotel_manager"
    )
  ) {
    throw new Error("STAFF_DEVELOPMENT_CREDENTIAL_SCOPE_FORBIDDEN");
  }

  const { data, error } = await supabaseAdmin
    .from("staff_development_credentials")
    .upsert(
      {
        hotel_id: hotelId,
        staff_user_id: staffUserId,
        pin_hash: hashPin(pin),
        active: true,
        failed_attempts: 0,
        locked_until: null,
        last_failed_at: null,
        created_by_staff_user_id: createdByStaffUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "hotel_id,staff_user_id" },
    )
    .select("id,hotel_id,staff_user_id,active,created_at,updated_at")
    .single();

  if (error || !data) {
    throw new Error(
      error?.message || "STAFF_DEVELOPMENT_CREDENTIAL_PERSIST_FAILED",
    );
  }

  return data;
}

export async function listStaffDevelopmentIdentityCandidates(input: {
  hotelSlug: unknown;
  operationalRole: unknown;
}) {
  const hotelSlug = sanitizeSegment(input.hotelSlug);
  const operationalRole = normalizeStaffRoleCode(input.operationalRole);
  if (!hotelSlug || !operationalRole) {
    throw new Error("STAFF_DEVELOPMENT_OPERATIONAL_CONTEXT_INVALID");
  }

  const operationalSession = await getCurrentStaffSession(
    hotelSlug,
    operationalRole,
  );
  if (!operationalSession) {
    throw new Error("STAFF_DEVELOPMENT_OPERATIONAL_SESSION_REQUIRED");
  }

  const hotelId = uuid(
    operationalSession.hotel_id,
    "STAFF_DEVELOPMENT_HOTEL_ID_INVALID",
  );
  const runtimeRole = await resolveStaffRuntimeRoleForHotelId(
    hotelId,
    operationalRole,
  );
  if (!runtimeRole) {
    throw new Error("STAFF_DEVELOPMENT_OPERATIONAL_ROLE_INVALID");
  }

  const { data: users, error } = await supabaseAdmin
    .from("staff_users")
    .select("id,department_id,full_name,role,active")
    .eq("hotel_id", hotelId)
    .eq("active", true)
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error("STAFF_DEVELOPMENT_IDENTITY_LIST_FAILED");
  }

  const eligible = (users || []).filter((user) => {
    const role = clean(user.role).toLowerCase();
    const departmentId = user.department_id
      ? String(user.department_id)
      : null;

    if (runtimeRole.kind === "manager") {
      return role === "hotel_manager";
    }

    if (
      runtimeRole.departmentCode === "reception"
      && role === "reception"
    ) {
      return true;
    }

    return (
      departmentId === runtimeRole.departmentId
      && ["staff", "department_manager", "reception"].includes(role)
    );
  });

  const ids = eligible.map((user) => String(user.id));
  let configured = new Set<string>();
  if (ids.length) {
    const { data: credentials, error: credentialError } =
      await supabaseAdmin
        .from("staff_development_credentials")
        .select("staff_user_id")
        .eq("hotel_id", hotelId)
        .eq("active", true)
        .in("staff_user_id", ids);

    if (credentialError) {
      throw new Error("STAFF_DEVELOPMENT_CREDENTIAL_LIST_FAILED");
    }
    configured = new Set(
      (credentials || []).map((row) => String(row.staff_user_id)),
    );
  }

  return eligible.map((user) => ({
    staffUserId: String(user.id),
    fullName: user.full_name ? String(user.full_name) : "",
    role: clean(user.role).toLowerCase(),
    credentialConfigured: configured.has(String(user.id)),
  }));
}

export async function authenticateStaffDevelopmentIdentity(input: {
  hotelSlug: unknown;
  operationalRole: unknown;
  staffUserId: unknown;
  personalPin: unknown;
  ip?: unknown;
  userAgent?: unknown;
}) {
  assertStaffDevelopmentWriteEnabled();

  const hotelSlug = sanitizeSegment(input.hotelSlug);
  const operationalRole = normalizeStaffRoleCode(input.operationalRole);
  if (!hotelSlug || !operationalRole) {
    throw new Error("STAFF_DEVELOPMENT_OPERATIONAL_CONTEXT_INVALID");
  }

  const operationalSession = await getCurrentStaffSession(
    hotelSlug,
    operationalRole,
  );
  if (!operationalSession) {
    throw new Error("STAFF_DEVELOPMENT_OPERATIONAL_SESSION_REQUIRED");
  }

  const hotelId = uuid(
    operationalSession.hotel_id,
    "STAFF_DEVELOPMENT_HOTEL_ID_INVALID",
  );
  const staffUserId = uuid(
    input.staffUserId,
    "STAFF_DEVELOPMENT_STAFF_USER_ID_INVALID",
  );
  const pin = normalizePersonalPin(input.personalPin);

  const staffUser = await activeStaffUser(hotelId, staffUserId);
  await assertIdentityMatchesOperationalRole({
    hotelId,
    operationalRole,
    staffUser,
  });

  const { data: credential, error: credentialError } = await supabaseAdmin
    .from("staff_development_credentials")
    .select(
      "id,hotel_id,staff_user_id,pin_hash,active,failed_attempts,locked_until",
    )
    .eq("hotel_id", hotelId)
    .eq("staff_user_id", staffUserId)
    .eq("active", true)
    .maybeSingle();

  if (credentialError || !credential) {
    throw new Error("STAFF_DEVELOPMENT_CREDENTIAL_NOT_FOUND");
  }

  const lockedUntil = credential.locked_until
    ? new Date(String(credential.locked_until))
    : null;
  if (
    lockedUntil
    && Number.isFinite(lockedUntil.getTime())
    && lockedUntil.getTime() > Date.now()
  ) {
    throw new Error("STAFF_DEVELOPMENT_PERSONAL_PIN_LOCKED");
  }

  if (!verifyPin(pin, String(credential.pin_hash || ""))) {
    const { data: failureRows, error: failureError } =
      await supabaseAdmin.rpc(
        "record_staff_development_pin_failure_v1",
        {
          p_hotel_id: hotelId,
          p_staff_user_id: staffUserId,
        },
      );

    if (failureError) {
      throw new Error("STAFF_DEVELOPMENT_PIN_THROTTLE_FAILED");
    }

    const failure = Array.isArray(failureRows)
      ? failureRows[0]
      : failureRows;
    if (failure?.locked_until) {
      throw new Error("STAFF_DEVELOPMENT_PERSONAL_PIN_LOCKED");
    }
    throw new Error("STAFF_DEVELOPMENT_PERSONAL_PIN_INVALID");
  }

  const { error: clearError } = await supabaseAdmin.rpc(
    "clear_staff_development_pin_failures_v1",
    {
      p_hotel_id: hotelId,
      p_staff_user_id: staffUserId,
    },
  );
  if (clearError) {
    throw new Error("STAFF_DEVELOPMENT_PIN_THROTTLE_RESET_FAILED");
  }

  const operationalSessionId = uuid(
    operationalSession.id,
    "STAFF_DEVELOPMENT_OPERATIONAL_SESSION_ID_INVALID",
  );

  await supabaseAdmin
    .from("staff_development_sessions")
    .update({
      revoked_at: new Date().toISOString(),
    })
    .eq("hotel_id", hotelId)
    .eq("operational_session_id", operationalSessionId)
    .is("revoked_at", null);

  const rawToken = createRawSessionToken();
  const tokenHash = developmentTokenHash(rawToken);
  const expiresAt = sessionExpiry(operationalSession.expires_at);

  const { data: developmentSession, error: sessionError } =
    await supabaseAdmin
      .from("staff_development_sessions")
      .insert({
        hotel_id: hotelId,
        staff_user_id: staffUserId,
        operational_session_id: operationalSessionId,
        operational_role: operationalRole,
        session_token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
        ip: clean(input.ip) || null,
        user_agent: clean(input.userAgent) || null,
      })
      .select(
        "id,hotel_id,staff_user_id,operational_session_id,operational_role,expires_at",
      )
      .single();

  if (sessionError || !developmentSession) {
    throw new Error(
      sessionError?.message
      || "STAFF_DEVELOPMENT_SESSION_CREATE_FAILED",
    );
  }

  await setDevelopmentCookie(hotelSlug, rawToken, expiresAt);

  return {
    sessionId: String(developmentSession.id),
    hotelId,
    staffUserId,
    operationalRole,
    staffUserRole: staffUser.role,
    departmentId: staffUser.department_id,
    fullName: staffUser.full_name,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function getCurrentStaffDevelopmentIdentity(
  hotelSlugInput: unknown,
) {
  const hotelSlug = sanitizeSegment(hotelSlugInput);
  if (!hotelSlug) return null;

  const store = await cookies();
  const rawToken = store.get(developmentCookieName(hotelSlug))?.value;
  if (!rawToken) return null;

  const hotel = await resolveHotelByAnySlugAdmin(hotelSlug).catch(() => null);
  if (!hotel?.id || hotel.active !== true) return null;

  const tokenHash = developmentTokenHash(rawToken);
  const { data: session, error } = await supabaseAdmin
    .from("staff_development_sessions")
    .select(
      "id,hotel_id,staff_user_id,operational_session_id,operational_role,expires_at,revoked_at",
    )
    .eq("hotel_id", String(hotel.id))
    .eq("session_token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !session) return null;

  const expiresAt = new Date(String(session.expires_at));
  if (
    !Number.isFinite(expiresAt.getTime())
    || expiresAt.getTime() <= Date.now()
  ) {
    return null;
  }

  const operationalRole = normalizeStaffRoleCode(session.operational_role);
  if (!operationalRole) return null;

  const operationalSession = await getCurrentStaffSession(
    hotelSlug,
    operationalRole,
  );
  if (
    !operationalSession
    || String(operationalSession.id) !== String(session.operational_session_id)
    || String(operationalSession.hotel_id) !== String(session.hotel_id)
  ) {
    return null;
  }

  const staffUser = await activeStaffUser(
    String(session.hotel_id),
    String(session.staff_user_id),
  ).catch(() => null);
  if (!staffUser) return null;

  try {
    await assertIdentityMatchesOperationalRole({
      hotelId: String(session.hotel_id),
      operationalRole,
      staffUser,
    });
  } catch {
    return null;
  }

  return {
    sessionId: String(session.id),
    hotelId: String(session.hotel_id),
    staffUserId: String(session.staff_user_id),
    operationalSessionId: String(session.operational_session_id),
    operationalRole,
    staffUserRole: staffUser.role,
    departmentId: staffUser.department_id,
    fullName: staffUser.full_name,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function requireStaffDevelopmentIdentity(
  hotelSlug: unknown,
) {
  const identity = await getCurrentStaffDevelopmentIdentity(hotelSlug);
  if (!identity) {
    throw new Error("STAFF_DEVELOPMENT_IDENTITY_REQUIRED");
  }
  return identity;
}

export async function revokeCurrentStaffDevelopmentIdentity(
  hotelSlugInput: unknown,
) {
  const hotelSlug = sanitizeSegment(hotelSlugInput);
  if (!hotelSlug) return;

  const store = await cookies();
  const rawToken = store.get(developmentCookieName(hotelSlug))?.value;
  if (!rawToken) {
    await clearStaffDevelopmentCookie(hotelSlug);
    return;
  }

  const hotel = await resolveHotelByAnySlugAdmin(hotelSlug).catch(() => null);
  if (!hotel?.id || hotel.active !== true) {
    await clearStaffDevelopmentCookie(hotelSlug);
    return;
  }

  const tokenHash = developmentTokenHash(rawToken);
  await supabaseAdmin
    .from("staff_development_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("hotel_id", String(hotel.id))
    .eq("session_token_hash", tokenHash)
    .is("revoked_at", null);

  await clearStaffDevelopmentCookie(hotelSlug);
}
