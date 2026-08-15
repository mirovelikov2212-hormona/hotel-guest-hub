import "server-only";

import { supabaseAdmin } from "@/lib/server/supabase-admin";

export type MassageRuntimeAuthorityMode = "legacy_adapter" | "native_supabase";

export type MassageRuntimeAuthorityState = {
  hotelId: string;
  authorityMode: MassageRuntimeAuthorityMode;
  revision: number;
  updatedAt: string;
  updatedBy: string;
  reason: string | null;
};

type AuthorityRow = {
  hotel_id?: unknown;
  authority_mode?: unknown;
  revision?: unknown;
  updated_at?: unknown;
  updated_by?: unknown;
  reason?: unknown;
};

function requireUuid(value: unknown, code: string) {
  const normalized = String(value || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
}

function parseMode(value: unknown): MassageRuntimeAuthorityMode {
  const mode = String(value || "").trim();
  if (mode !== "legacy_adapter" && mode !== "native_supabase") {
    throw new Error("MASSAGE_AUTHORITY_MODE_INVALID");
  }
  return mode;
}

function parseAuthorityRow(value: unknown, expectedHotelId: string): MassageRuntimeAuthorityState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("MASSAGE_AUTHORITY_STATE_INVALID");
  }
  const row = value as AuthorityRow;
  const hotelId = requireUuid(row.hotel_id, "MASSAGE_AUTHORITY_HOTEL_INVALID");
  if (hotelId !== expectedHotelId) throw new Error("MASSAGE_AUTHORITY_SCOPE_MISMATCH");
  const revision = Number(row.revision);
  if (!Number.isInteger(revision) || revision < 1) throw new Error("MASSAGE_AUTHORITY_REVISION_INVALID");

  return {
    hotelId,
    authorityMode: parseMode(row.authority_mode),
    revision,
    updatedAt: String(row.updated_at || ""),
    updatedBy: String(row.updated_by || ""),
    reason: row.reason == null ? null : String(row.reason),
  };
}

export async function getMassageRuntimeAuthority(hotelIdInput: string) {
  const hotelId = requireUuid(hotelIdInput, "MASSAGE_AUTHORITY_HOTEL_INVALID");
  const { data, error } = await supabaseAdmin
    .from("massage_runtime_authority_state")
    .select("hotel_id, authority_mode, revision, updated_at, updated_by, reason")
    .eq("hotel_id", hotelId)
    .single();

  if (error || !data) {
    throw error || new Error("MASSAGE_AUTHORITY_STATE_MISSING");
  }
  return parseAuthorityRow(data, hotelId);
}

export async function setMassageRuntimeAuthority(input: {
  hotelId: string;
  expectedRevision: number;
  targetMode: MassageRuntimeAuthorityMode;
  actor: string;
  reason?: string | null;
}) {
  const hotelId = requireUuid(input.hotelId, "MASSAGE_AUTHORITY_HOTEL_INVALID");
  const expectedRevision = Number(input.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error("MASSAGE_AUTHORITY_REVISION_INVALID");
  }
  const targetMode = parseMode(input.targetMode);
  const actor = String(input.actor || "").trim();
  if (!actor) throw new Error("MASSAGE_AUTHORITY_ACTOR_REQUIRED");

  const { data, error } = await supabaseAdmin.rpc("set_massage_runtime_authority", {
    p_hotel_id: hotelId,
    p_expected_revision: expectedRevision,
    p_target_mode: targetMode,
    p_actor: actor.slice(0, 160),
    p_reason: String(input.reason || "").trim().slice(0, 500) || null,
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("MASSAGE_AUTHORITY_RESULT_INVALID");
  }

  const result = data as Record<string, unknown>;
  const resultHotelId = requireUuid(result.hotelId, "MASSAGE_AUTHORITY_HOTEL_INVALID");
  if (resultHotelId !== hotelId) throw new Error("MASSAGE_AUTHORITY_SCOPE_MISMATCH");
  const revision = Number(result.revision);
  if (!Number.isInteger(revision) || revision < 1) throw new Error("MASSAGE_AUTHORITY_REVISION_INVALID");

  return {
    ok: result.ok === true,
    hotelId,
    authorityMode: parseMode(result.authorityMode),
    revision,
    changed: result.changed === true,
    previousMode: result.previousMode ? parseMode(result.previousMode) : null,
  };
}

export function isNativeMassageAuthority(state: MassageRuntimeAuthorityState) {
  return state.authorityMode === "native_supabase";
}
