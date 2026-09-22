import "server-only";

import { validatePublishedHotelConfigRuntimeShape } from "@/lib/hotels/config-revision-contract.mjs";
import {
  loadManagerCurrentLiveConfig,
  resolveManagerContentChangeScope,
} from "@/lib/server/manager-content-changes";
import { buildConfirmedManagerCandidate } from "@/lib/server/manager-change-candidate";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeUuid(value: unknown, code: string) {
  const id = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(id)) throw new Error(code);
  return id;
}

function normalizeHash(value: unknown, code: string) {
  const hash = String(value || "").trim().toLowerCase();
  if (!HASH_PATTERN.test(hash)) throw new Error(code);
  return hash;
}

export async function createManagerChangeCandidate(input: {
  hotelSlug: unknown;
  changeRequestId: unknown;
}) {
  const scope = await resolveManagerContentChangeScope(input.hotelSlug);
  const changeRequestId = normalizeUuid(
    input.changeRequestId,
    "CM5_CHANGE_REQUEST_ID_INVALID",
  );

  const { data: change, error: changeError } = await supabaseAdmin
    .from("hotel_content_change_requests")
    .select(
      "id,status,change_scope,base_live_revision_id,base_live_checksum,operations_json,diff_json,change_hash,candidate_revision_id",
    )
    .eq("id", changeRequestId)
    .eq("hotel_id", scope.hotelId)
    .maybeSingle();

  if (changeError) throw new Error("CM5_CANDIDATE_CHANGE_READ_FAILED");
  if (!change) throw new Error("CM5_CHANGE_REQUEST_NOT_FOUND");
  if (
    change.status !== "confirmed"
    || change.candidate_revision_id
  ) {
    throw new Error("CM5_CHANGE_REQUEST_NOT_CONFIRMED");
  }

  const baseLiveRevisionId = normalizeUuid(
    change.base_live_revision_id,
    "CM5_BASE_LIVE_REVISION_ID_INVALID",
  );
  const baseLiveChecksum = normalizeHash(
    change.base_live_checksum,
    "CM5_BASE_LIVE_CHECKSUM_INVALID",
  );
  const changeHash = normalizeHash(
    change.change_hash,
    "CM5_CHANGE_HASH_INVALID",
  );

  if (!isRecord(change.diff_json)) {
    throw new Error("CM5_CANDIDATE_DIFF_INVALID");
  }
  const expectedDiffHash = normalizeHash(
    change.diff_json.diffHash,
    "CM5_CANDIDATE_DIFF_HASH_INVALID",
  );

  const currentLive = await loadManagerCurrentLiveConfig(scope.hotelId);
  if (
    currentLive.revisionId !== baseLiveRevisionId
    || currentLive.sourceChecksum !== baseLiveChecksum
  ) {
    throw new Error("CM5_STALE_LIVE_REVISION");
  }

  const rebuilt = buildConfirmedManagerCandidate({
    baseConfig: currentLive.config,
    changeScope: change.change_scope,
    operations: change.operations_json,
    expectedDiffHash,
  });

  const runtimeShape = validatePublishedHotelConfigRuntimeShape(
    rebuilt.candidateConfig,
    { requireCanonicalRequestDefs: true },
  );
  if (!runtimeShape.ok) {
    throw new Error(
      "CM5_CANDIDATE_RUNTIME_SHAPE_INVALID:"
      + runtimeShape.errors.join(","),
    );
  }

  const validation = {
    schemaVersion: "manager-candidate-validation-v1",
    ok: true,
    deterministicReplay: true,
    diffHash: rebuilt.diff.diffHash,
    changeHash,
    baseLiveRevisionId,
    changedCategories: rebuilt.diff.changedCategories,
    runtimeShape: {
      ok: true,
      compatibilityDefaultsApplied:
        runtimeShape.compatibilityDefaultsApplied,
    },
  };

  // This RPC is intentionally a server-only authority boundary. The database
  // independently rechecks same-hotel manager session, confirmed status,
  // current LIVE/LKG identity, base checksum, changeHash/diffHash binding and
  // computes the candidate checksum itself before inserting an immutable
  // manager_change revision. No caller-supplied candidate checksum is trusted.
  const { data, error } = await supabaseAdmin.rpc(
    "create_manager_content_candidate_v2",
    {
      p_change_request_id: changeRequestId,
      p_actor_session_id: scope.sessionId,
      p_candidate_config: rebuilt.candidateConfig,
      p_validation: validation,
    },
  );

  if (error) {
    throw new Error(error.message || "CM5_CANDIDATE_CREATE_FAILED");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("CM5_CANDIDATE_CREATE_EMPTY");

  const candidateRevisionId = normalizeUuid(
    row.candidate_revision_id,
    "CM5_CANDIDATE_REVISION_ID_INVALID",
  );
  const candidateChecksum = normalizeHash(
    row.candidate_checksum,
    "CM5_CANDIDATE_CHECKSUM_INVALID",
  );

  return {
    changeRequestId,
    candidateRevisionId,
    candidateRevisionNo: Number(row.candidate_revision_no),
    candidateChecksum,
    status: String(row.status || "candidate_created"),
    createdAt: String(row.created_at || ""),
    validation,
    diff: rebuilt.diff,
  };
}
