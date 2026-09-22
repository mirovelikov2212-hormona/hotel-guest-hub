import "server-only";

import { supabaseAdmin } from "@/lib/server/supabase-admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

export type ManagerTypedDraftScope = "services" | "venues" | "schedules";

type TypedDraftContract = {
  operationKind: string;
  operationSchema: string;
  previewSchema: string;
};

const TYPED_DRAFT_CONTRACTS: Record<ManagerTypedDraftScope, TypedDraftContract> = {
  services: {
    operationKind: "service_content_update",
    operationSchema: "manager-service-change-v1",
    previewSchema: "manager-service-preview-v1",
  },
  venues: {
    operationKind: "venue_content_update",
    operationSchema: "manager-venue-change-v1",
    previewSchema: "manager-venue-preview-v1",
  },
  schedules: {
    operationKind: "set_department_schedule",
    operationSchema: "manager-operational-schedule-change-v1",
    previewSchema: "manager-operational-schedule-preview-v1",
  },
};

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeUuid(value: unknown, code: string) {
  const id = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(id)) throw new Error(code);
  return id;
}

function normalizeScope(value: unknown): ManagerTypedDraftScope {
  const scope = String(value || "").trim().toLowerCase();
  if (scope !== "services" && scope !== "venues" && scope !== "schedules") {
    throw new Error("CM5_TYPED_DRAFT_SCOPE_INVALID");
  }
  return scope;
}

function validatePreparedPayload(input: {
  scope: ManagerTypedDraftScope;
  operations: unknown;
  preview: unknown;
  diff: unknown;
}) {
  const contract = TYPED_DRAFT_CONTRACTS[input.scope];

  if (
    !Array.isArray(input.operations)
    || input.operations.length < 1
    || input.operations.length > 100
    || (input.scope === "schedules" && input.operations.length !== 1)
  ) {
    throw new Error("CM5_TYPED_DRAFT_OPERATIONS_INVALID");
  }

  for (const operation of input.operations) {
    if (
      !isRecord(operation)
      || operation.kind !== contract.operationKind
      || operation.schemaVersion !== contract.operationSchema
    ) {
      throw new Error("CM5_TYPED_DRAFT_OPERATIONS_INVALID");
    }
  }

  if (
    !isRecord(input.preview)
    || input.preview.schemaVersion !== contract.previewSchema
  ) {
    throw new Error("CM5_TYPED_DRAFT_PREVIEW_INVALID");
  }

  if (
    !isRecord(input.diff)
    || input.diff.schemaVersion !== "cm2-version-diff-v1"
    || input.diff.changed !== true
    || typeof input.diff.diffHash !== "string"
    || !HASH_PATTERN.test(input.diff.diffHash)
  ) {
    throw new Error("CM5_TYPED_DRAFT_DIFF_INVALID");
  }

  return contract;
}

/**
 * Persists an already server-validated typed Manager draft.
 *
 * This function intentionally accepts no candidate config JSON and performs no
 * direct table update. LIVE remains immutable; the DB RPC rechecks Manager
 * session, hotel ownership, draft scope, LIVE/LKG identity and checksum CAS.
 *
 * It is not mounted to a public route until the selected runtime database
 * exposes the matching typed-draft RPC.
 */
export async function persistManagerTypedContentDraft(input: {
  scope: unknown;
  changeRequestId: unknown;
  actorSessionId: unknown;
  operations: unknown;
  preview: unknown;
  diff: unknown;
}) {
  const scope = normalizeScope(input.scope);
  const changeRequestId = normalizeUuid(
    input.changeRequestId,
    "CM5_CHANGE_REQUEST_ID_INVALID",
  );
  const actorSessionId = normalizeUuid(
    input.actorSessionId,
    "CM5_MANAGER_SESSION_ID_INVALID",
  );
  const contract = validatePreparedPayload({
    scope,
    operations: input.operations,
    preview: input.preview,
    diff: input.diff,
  });

  const { data, error } = await supabaseAdmin.rpc(
    "save_hotel_content_typed_draft_v1",
    {
      p_change_request_id: changeRequestId,
      p_actor_session_id: actorSessionId,
      p_scope: scope,
      p_operation_kind: contract.operationKind,
      p_operation_schema: contract.operationSchema,
      p_preview_schema: contract.previewSchema,
      p_operations: input.operations,
      p_preview: input.preview,
      p_diff: input.diff,
    },
  );

  if (error) {
    throw new Error(error.message || "CM5_TYPED_DRAFT_SAVE_FAILED");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("CM5_TYPED_DRAFT_SAVE_EMPTY");

  return {
    changeRequestId,
    scope,
    status: String(row.status || "draft"),
    updatedAt: String(row.updated_at || ""),
  };
}

export const MANAGER_TYPED_DRAFT_CONTRACTS = Object.freeze({
  services: Object.freeze({ ...TYPED_DRAFT_CONTRACTS.services }),
  venues: Object.freeze({ ...TYPED_DRAFT_CONTRACTS.venues }),
  schedules: Object.freeze({ ...TYPED_DRAFT_CONTRACTS.schedules }),
});
