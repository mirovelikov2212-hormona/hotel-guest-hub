import "server-only";

import { validatePublishedHotelConfigRuntimeShape } from "@/lib/hotels/config-revision-contract.mjs";
import { buildConfirmedManagerCandidate } from "@/lib/server/manager-change-candidate";
import {
  loadManagerCurrentLiveConfig,
  resolveManagerContentChangeScope,
} from "@/lib/server/manager-content-changes";
import { buildHotelConfigVersionDiff } from "@/lib/server/factory-production-version-diff.mjs";
import { validateManagerCandidateOfferAssets } from "@/lib/server/manager-offer-changes";
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

export async function certifyManagerChangeCandidate(input: {
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

  if (changeError) throw new Error("CM5_CERTIFICATION_CHANGE_READ_FAILED");
  if (
    !change
    || change.status !== "candidate_created"
    || !change.candidate_revision_id
  ) {
    throw new Error("CM5_CHANGE_REQUEST_NOT_CANDIDATE");
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
  const candidateRevisionId = normalizeUuid(
    change.candidate_revision_id,
    "CM5_CANDIDATE_REVISION_ID_INVALID",
  );

  if (!isRecord(change.diff_json)) {
    throw new Error("CM5_CERTIFICATION_DIFF_INVALID");
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

  const { data: candidate, error: candidateError } = await supabaseAdmin
    .from("hotel_config_revisions")
    .select(
      "id,revision_no,status,source_type,source_checksum,config_json,provenance_json,validation_json,created_at",
    )
    .eq("hotel_id", scope.hotelId)
    .eq("id", candidateRevisionId)
    .eq("status", "draft")
    .eq("source_type", "manager_change")
    .maybeSingle();

  if (candidateError) throw new Error("CM5_CANDIDATE_REVISION_READ_FAILED");
  if (
    !candidate
    || !isRecord(candidate.config_json)
    || !isRecord(candidate.provenance_json)
    || !isRecord(candidate.validation_json)
  ) {
    throw new Error("CM5_CANDIDATE_REVISION_INVALID");
  }

  const candidateChecksum = normalizeHash(
    candidate.source_checksum,
    "CM5_CANDIDATE_CHECKSUM_INVALID",
  );

  const rebuilt = buildConfirmedManagerCandidate({
    baseConfig: currentLive.config,
    changeScope: change.change_scope,
    operations: change.operations_json,
    expectedDiffHash,
  });

  const storedVsRebuilt = buildHotelConfigVersionDiff(
    rebuilt.candidateConfig,
    candidate.config_json,
  );
  if (storedVsRebuilt.changed) {
    throw new Error("CM5_CANDIDATE_STORED_CONFIG_MISMATCH");
  }

  if (
    candidate.provenance_json.changeRequestId !== changeRequestId
    || candidate.provenance_json.baseLiveRevisionId !== baseLiveRevisionId
    || candidate.provenance_json.baseLiveChecksum !== baseLiveChecksum
    || candidate.provenance_json.changeHash !== changeHash
    || candidate.provenance_json.diffHash !== expectedDiffHash
  ) {
    throw new Error("CM5_CANDIDATE_LINEAGE_INVALID");
  }

  const runtimeShape = validatePublishedHotelConfigRuntimeShape(
    candidate.config_json,
    { requireCanonicalRequestDefs: true },
  );
  if (!runtimeShape.ok) {
    throw new Error(
      "CM5_CERTIFICATION_RUNTIME_SHAPE_INVALID:"
      + runtimeShape.errors.join(","),
    );
  }

  const scopes = Array.isArray(change.change_scope)
    ? change.change_scope.map((value) => String(value || "").trim().toLowerCase())
    : [];

  const assetValidation = scopes.includes("offers")
    ? await validateManagerCandidateOfferAssets({
        hotelId: scope.hotelId,
        changeRequestId,
        liveConfig: currentLive.config,
        candidateConfig: candidate.config_json,
      })
    : {
        ok: true as const,
        referencedAssetIds: [],
        referencedAssetCount: 0,
      };

  const certification = {
    schemaVersion: "manager-candidate-certification-v1",
    ok: true,
    candidateRevisionId,
    candidateChecksum,
    baseLiveRevisionId,
    changeHash,
    diffHash: expectedDiffHash,
    changedCategories: rebuilt.diff.changedCategories,
    deterministicReplay: {
      ok: true,
      storedCandidateMatched: true,
    },
    runtimeShape: {
      ok: true,
      compatibilityDefaultsApplied:
        runtimeShape.compatibilityDefaultsApplied,
    },
    assets: assetValidation,
  };

  // The database independently binds this evidence to the exact candidate,
  // base LIVE/LKG, candidate checksum and confirmed change hashes before
  // allowing the change request to become certified.
  const { data, error } = await supabaseAdmin.rpc(
    "certify_manager_content_candidate_v1",
    {
      p_change_request_id: changeRequestId,
      p_actor_session_id: scope.sessionId,
      p_certification: certification,
    },
  );

  if (error) {
    throw new Error(error.message || "CM5_CANDIDATE_CERTIFICATION_FAILED");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("CM5_CANDIDATE_CERTIFICATION_EMPTY");

  return {
    changeRequestId,
    candidateRevisionId,
    candidateChecksum,
    certificationHash: normalizeHash(
      row.certification_hash,
      "CM5_CERTIFICATION_HASH_INVALID",
    ),
    status: String(row.status || "certified"),
    certifiedAt: String(row.certified_at || ""),
    certification,
  };
}
