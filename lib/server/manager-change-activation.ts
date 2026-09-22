import "server-only";

import { validatePublishedHotelConfigRuntimeShape } from "@/lib/hotels/config-revision-contract.mjs";
import {
  loadManagerCurrentLiveConfig,
  resolveManagerContentChangeScope,
} from "@/lib/server/manager-content-changes";
import { reportManagerChangeSystemFailure } from "@/lib/server/manager-change-safety";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;

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

async function rollbackPostActivationFailure(input: {
  changeRequestId: string;
  actorSessionId: string;
  failureCode: string;
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "rollback_manager_content_activation_v1",
    {
      p_change_request_id: input.changeRequestId,
      p_actor_session_id: input.actorSessionId,
      p_failure_code: input.failureCode,
    },
  );

  if (error) {
    throw new Error(
      "CM5_POST_ACTIVATION_ROLLBACK_FAILED:"
      + (error.message || "unknown"),
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("CM5_POST_ACTIVATION_ROLLBACK_EMPTY");
  return row;
}

export async function activateManagerChangeCandidate(input: {
  hotelSlug: unknown;
  changeRequestId: unknown;
}) {
  const scope = await resolveManagerContentChangeScope(input.hotelSlug);
  const changeRequestId = normalizeUuid(
    input.changeRequestId,
    "CM5_CHANGE_REQUEST_ID_INVALID",
  );

  const { data, error } = await supabaseAdmin.rpc(
    "activate_manager_content_candidate_v1",
    {
      p_change_request_id: changeRequestId,
      p_actor_session_id: scope.sessionId,
    },
  );

  if (error) {
    throw new Error(error.message || "CM5_CANDIDATE_ACTIVATION_FAILED");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("CM5_CANDIDATE_ACTIVATION_EMPTY");

  const baseRevisionId = normalizeUuid(
    row.base_revision_id,
    "CM5_BASE_LIVE_REVISION_ID_INVALID",
  );
  const activatedRevisionId = normalizeUuid(
    row.activated_revision_id,
    "CM5_ACTIVATED_REVISION_ID_INVALID",
  );
  const activatedChecksum = normalizeHash(
    row.activated_checksum,
    "CM5_ACTIVATED_CHECKSUM_INVALID",
  );

  try {
    const currentLive = await loadManagerCurrentLiveConfig(scope.hotelId);
    if (
      currentLive.revisionId !== activatedRevisionId
      || currentLive.sourceChecksum !== activatedChecksum
    ) {
      throw new Error("CM5_POST_ACTIVATION_LIVE_IDENTITY_MISMATCH");
    }

    const runtimeShape = validatePublishedHotelConfigRuntimeShape(
      currentLive.config,
      { requireCanonicalRequestDefs: true },
    );
    if (!runtimeShape.ok) {
      throw new Error(
        "CM5_POST_ACTIVATION_RUNTIME_SHAPE_INVALID:"
        + runtimeShape.errors.join(","),
      );
    }

    return {
      changeRequestId,
      baseRevisionId,
      activatedRevisionId,
      activatedChecksum,
      activatedAssetCount: Number(row.activated_asset_count || 0),
      status: String(row.status || "live"),
      activatedAt: String(row.activated_at || ""),
      postActivationVerification: {
        ok: true as const,
        liveIdentityMatched: true,
        runtimeShapeOk: true,
      },
    };
  } catch (verificationError) {
    let rollbackResult: unknown = null;
    let rollbackError: unknown = null;

    try {
      rollbackResult = await rollbackPostActivationFailure({
        changeRequestId,
        actorSessionId: scope.sessionId,
        failureCode: "CM5_POST_ACTIVATION_VERIFY_FAILED",
      });
    } catch (reason) {
      rollbackError = reason;
    }

    const combinedError = new Error(
      rollbackError
        ? "CM5_POST_ACTIVATION_VERIFY_AND_ROLLBACK_FAILED"
        : "CM5_POST_ACTIVATION_VERIFY_FAILED_ROLLED_BACK",
    );

    await reportManagerChangeSystemFailure({
      hotelSlug: scope.hotelSlug,
      operation: rollbackError
        ? "manager_change_post_activation_verify_rollback_failed"
        : "manager_change_post_activation_verify_rolled_back",
      error: combinedError,
    });

    if (rollbackError) throw combinedError;

    return {
      changeRequestId,
      baseRevisionId,
      activatedRevisionId,
      activatedChecksum,
      status: "rolled_back" as const,
      postActivationVerification: {
        ok: false as const,
        failure:
          verificationError instanceof Error
            ? verificationError.message
            : String(verificationError),
        rollback: rollbackResult,
      },
    };
  }
}
