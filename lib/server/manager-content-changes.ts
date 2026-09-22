import "server-only";

import { getCurrentStaffSession } from "@/lib/staff-auth/session";
import { hotelMatchesRequestedSlug } from "@/lib/server/hotel-scope";
import { resolveStaffRuntimeRoleForHotelId } from "@/lib/server/staff-runtime-role";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/i;

export const MANAGER_CONTENT_CHANGE_SCOPES = [
  "offers",
  "services",
  "venues",
] as const;

export type ManagerContentChangeScope = typeof MANAGER_CONTENT_CHANGE_SCOPES[number];

export type ManagerContentChangeStatus =
  | "draft"
  | "confirmed"
  | "candidate_created"
  | "validating"
  | "certified"
  | "live"
  | "failed"
  | "cancelled";

type AuthorizedManagerScope = {
  hotelId: string;
  hotelSlug: string;
  hotelPublicSlug: string;
  hotelName: string;
  isSandbox: boolean;
  sessionId: string;
};

function normalizeHotelSlug(value: unknown) {
  const slug = String(value || "").trim().toLowerCase();
  if (!slug) throw new Error("CM5_HOTEL_SLUG_REQUIRED");
  return slug;
}

function normalizeUuid(value: unknown, code: string) {
  const id = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(id)) throw new Error(code);
  return id;
}

export function normalizeManagerContentChangeScopes(value: unknown): ManagerContentChangeScope[] {
  if (!Array.isArray(value)) throw new Error("CM5_CHANGE_SCOPE_INVALID");
  const allowed = new Set<string>(MANAGER_CONTENT_CHANGE_SCOPES);
  const scopes = [...new Set(
    value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean),
  )].sort();

  if (
    scopes.length < 1
    || scopes.length > MANAGER_CONTENT_CHANGE_SCOPES.length
    || scopes.some((scope) => !allowed.has(scope))
  ) {
    throw new Error("CM5_CHANGE_SCOPE_INVALID");
  }

  return scopes as ManagerContentChangeScope[];
}

async function resolveAuthorizedManagerScope(hotelSlugInput: unknown): Promise<AuthorizedManagerScope> {
  const hotelSlug = normalizeHotelSlug(hotelSlugInput);
  const session = await getCurrentStaffSession(hotelSlug, "manager");
  if (!session || session.role !== "manager") {
    throw new Error("CM5_MANAGER_SESSION_REQUIRED");
  }

  const { data: hotel, error: hotelError } = await supabaseAdmin
    .from("hotels")
    .select("id,slug,public_slug,name,active,is_sandbox,is_demo")
    .eq("id", session.hotel_id)
    .eq("active", true)
    .maybeSingle();

  if (hotelError) throw new Error("CM5_MANAGER_HOTEL_READ_FAILED");
  if (!hotel || hotel.is_demo === true || !hotelMatchesRequestedSlug(hotel, hotelSlug)) {
    throw new Error("CM5_MANAGER_HOTEL_FORBIDDEN");
  }

  const runtimeRole = await resolveStaffRuntimeRoleForHotelId(String(hotel.id), "manager");
  if (!runtimeRole || runtimeRole.kind !== "manager") {
    throw new Error("CM5_MANAGER_RUNTIME_ROLE_REQUIRED");
  }

  return {
    hotelId: normalizeUuid(hotel.id, "CM5_MANAGER_HOTEL_ID_INVALID"),
    hotelSlug: String(hotel.slug || "").trim().toLowerCase(),
    hotelPublicSlug: String(hotel.public_slug || hotel.slug || "").trim().toLowerCase(),
    hotelName: String(hotel.name || hotel.slug || "").trim(),
    isSandbox: Boolean(hotel.is_sandbox),
    sessionId: normalizeUuid(session.id, "CM5_MANAGER_SESSION_ID_INVALID"),
  };
}

async function loadCurrentLiveIdentity(hotelId: string) {
  const { data: state, error: stateError } = await supabaseAdmin
    .from("hotel_config_publication_state")
    .select("published_revision_id,last_known_good_revision_id,updated_at")
    .eq("hotel_id", hotelId)
    .maybeSingle();

  if (stateError) throw new Error("CM5_CURRENT_LIVE_STATE_READ_FAILED");
  if (
    !state
    || !state.published_revision_id
    || !state.last_known_good_revision_id
    || String(state.published_revision_id).toLowerCase() !== String(state.last_known_good_revision_id).toLowerCase()
  ) {
    throw new Error("CM5_CURRENT_LIVE_STATE_INVALID");
  }

  const revisionId = normalizeUuid(state.published_revision_id, "CM5_CURRENT_LIVE_REVISION_ID_INVALID");
  const { data: revision, error: revisionError } = await supabaseAdmin
    .from("hotel_config_revisions")
    .select("id,revision_no,status,source_type,source_checksum,created_at,published_at")
    .eq("hotel_id", hotelId)
    .eq("id", revisionId)
    .eq("status", "published")
    .maybeSingle();

  if (revisionError) throw new Error("CM5_CURRENT_LIVE_REVISION_READ_FAILED");
  if (!revision || !CHECKSUM_PATTERN.test(String(revision.source_checksum || ""))) {
    throw new Error("CM5_CURRENT_LIVE_REVISION_INVALID");
  }

  return {
    revisionId,
    revisionNo: Number(revision.revision_no),
    sourceType: String(revision.source_type || ""),
    sourceChecksum: String(revision.source_checksum || "").toLowerCase(),
    createdAt: String(revision.created_at || ""),
    publishedAt: revision.published_at ? String(revision.published_at) : null,
    publicationStateUpdatedAt: state.updated_at ? String(state.updated_at) : null,
  };
}

function firstRpcRow<T>(value: T[] | T | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function getManagerContentChangeSnapshot(hotelSlugInput: unknown) {
  const scope = await resolveAuthorizedManagerScope(hotelSlugInput);
  const currentLive = await loadCurrentLiveIdentity(scope.hotelId);

  const { data: changes, error } = await supabaseAdmin
    .from("hotel_content_change_requests")
    .select("id,status,change_scope,base_live_revision_id,base_live_checksum,change_hash,candidate_revision_id,activated_revision_id,failure_code,created_at,updated_at,confirmed_at,candidate_created_at,activated_at,cancelled_at")
    .eq("hotel_id", scope.hotelId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw new Error("CM5_CHANGE_REQUESTS_READ_FAILED");

  return {
    hotel: {
      id: scope.hotelId,
      slug: scope.hotelSlug,
      publicSlug: scope.hotelPublicSlug,
      name: scope.hotelName,
      environment: scope.isSandbox ? "sandbox" as const : "production" as const,
    },
    currentLive,
    changes: (changes || []).map((row) => ({
      id: normalizeUuid(row.id, "CM5_CHANGE_REQUEST_ID_INVALID"),
      status: String(row.status || "") as ManagerContentChangeStatus,
      changeScope: Array.isArray(row.change_scope) ? row.change_scope : [],
      baseLiveRevisionId: normalizeUuid(row.base_live_revision_id, "CM5_BASE_LIVE_REVISION_ID_INVALID"),
      baseLiveChecksum: String(row.base_live_checksum || "").toLowerCase(),
      changeHash: row.change_hash ? String(row.change_hash).toLowerCase() : null,
      candidateRevisionId: row.candidate_revision_id ? normalizeUuid(row.candidate_revision_id, "CM5_CANDIDATE_REVISION_ID_INVALID") : null,
      activatedRevisionId: row.activated_revision_id ? normalizeUuid(row.activated_revision_id, "CM5_ACTIVATED_REVISION_ID_INVALID") : null,
      failureCode: row.failure_code ? String(row.failure_code) : null,
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
      confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
      candidateCreatedAt: row.candidate_created_at ? String(row.candidate_created_at) : null,
      activatedAt: row.activated_at ? String(row.activated_at) : null,
      cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    })),
  };
}

export async function createManagerContentChangeDraft(input: {
  hotelSlug: unknown;
  changeScope: unknown;
}) {
  const scope = await resolveAuthorizedManagerScope(input.hotelSlug);
  const changeScope = normalizeManagerContentChangeScopes(input.changeScope);

  const { data, error } = await supabaseAdmin.rpc(
    "create_hotel_content_change_request_v1",
    {
      p_hotel_id: scope.hotelId,
      p_change_scope: changeScope,
      p_actor_session_id: scope.sessionId,
    },
  );

  if (error) throw new Error(error.message || "CM5_CHANGE_REQUEST_CREATE_FAILED");
  const row = firstRpcRow(data as Array<Record<string, unknown>> | Record<string, unknown> | null);
  if (!row) throw new Error("CM5_CHANGE_REQUEST_CREATE_EMPTY");

  return {
    id: normalizeUuid(row.change_request_id, "CM5_CHANGE_REQUEST_ID_INVALID"),
    baseLiveRevisionId: normalizeUuid(row.base_live_revision_id, "CM5_BASE_LIVE_REVISION_ID_INVALID"),
    baseLiveChecksum: String(row.base_live_checksum || "").toLowerCase(),
    status: String(row.status || "draft") as ManagerContentChangeStatus,
    createdAt: String(row.created_at || ""),
    changeScope,
  };
}

export async function confirmManagerContentChangeDraft(input: {
  hotelSlug: unknown;
  changeRequestId: unknown;
}) {
  const scope = await resolveAuthorizedManagerScope(input.hotelSlug);
  const changeRequestId = normalizeUuid(input.changeRequestId, "CM5_CHANGE_REQUEST_ID_INVALID");

  const { data: owned, error: ownedError } = await supabaseAdmin
    .from("hotel_content_change_requests")
    .select("id")
    .eq("id", changeRequestId)
    .eq("hotel_id", scope.hotelId)
    .maybeSingle();

  if (ownedError) throw new Error("CM5_CHANGE_REQUEST_OWNERSHIP_READ_FAILED");
  if (!owned) throw new Error("CM5_CHANGE_REQUEST_NOT_FOUND");

  const { data, error } = await supabaseAdmin.rpc(
    "confirm_hotel_content_change_request_v1",
    {
      p_change_request_id: changeRequestId,
      p_actor_session_id: scope.sessionId,
    },
  );

  if (error) throw new Error(error.message || "CM5_CHANGE_REQUEST_CONFIRM_FAILED");
  const row = firstRpcRow(data as Array<Record<string, unknown>> | Record<string, unknown> | null);
  if (!row) throw new Error("CM5_CHANGE_REQUEST_CONFIRM_EMPTY");

  return {
    id: normalizeUuid(row.change_request_id, "CM5_CHANGE_REQUEST_ID_INVALID"),
    hotelId: normalizeUuid(row.hotel_id, "CM5_MANAGER_HOTEL_ID_INVALID"),
    baseLiveRevisionId: normalizeUuid(row.base_live_revision_id, "CM5_BASE_LIVE_REVISION_ID_INVALID"),
    baseLiveChecksum: String(row.base_live_checksum || "").toLowerCase(),
    changeHash: String(row.change_hash || "").toLowerCase(),
    status: String(row.status || "confirmed") as ManagerContentChangeStatus,
    confirmedAt: String(row.confirmed_at || ""),
  };
}

export async function cancelManagerContentChangeDraft(input: {
  hotelSlug: unknown;
  changeRequestId: unknown;
}) {
  const scope = await resolveAuthorizedManagerScope(input.hotelSlug);
  const changeRequestId = normalizeUuid(input.changeRequestId, "CM5_CHANGE_REQUEST_ID_INVALID");

  const { data: owned, error: ownedError } = await supabaseAdmin
    .from("hotel_content_change_requests")
    .select("id")
    .eq("id", changeRequestId)
    .eq("hotel_id", scope.hotelId)
    .maybeSingle();

  if (ownedError) throw new Error("CM5_CHANGE_REQUEST_OWNERSHIP_READ_FAILED");
  if (!owned) throw new Error("CM5_CHANGE_REQUEST_NOT_FOUND");

  const { data, error } = await supabaseAdmin.rpc(
    "cancel_hotel_content_change_request_v1",
    {
      p_change_request_id: changeRequestId,
      p_actor_session_id: scope.sessionId,
    },
  );

  if (error) throw new Error(error.message || "CM5_CHANGE_REQUEST_CANCEL_FAILED");
  const row = firstRpcRow(data as Array<Record<string, unknown>> | Record<string, unknown> | null);
  if (!row) throw new Error("CM5_CHANGE_REQUEST_CANCEL_EMPTY");

  return {
    id: normalizeUuid(row.change_request_id, "CM5_CHANGE_REQUEST_ID_INVALID"),
    status: String(row.status || "cancelled") as ManagerContentChangeStatus,
    cancelledAt: String(row.cancelled_at || ""),
  };
}
