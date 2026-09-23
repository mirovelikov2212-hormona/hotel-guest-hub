import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildHistoricalServiceIdentitySnapshot,
  readHistoricalServiceIdentitySnapshot,
} from "../../lib/change-management/historical-service-identity.mjs";

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("CM6 historical service identity is revision-bound and independent from future LIVE labels", () => {
  const revisionId = "00000000-0000-4000-8000-000000000001";
  const checksum = "a".repeat(64);
  const identity = buildHistoricalServiceIdentitySnapshot({
    sourceRequestDef: "late_checkout",
    requestType: "late_checkout",
    canonicalRequestType: "late_checkout",
    title: "Late checkout",
    configRevisionId: revisionId,
    configSourceChecksum: checksum,
  });

  assert.deepEqual(identity, {
    schemaVersion: "service-identity-snapshot-v1",
    serviceKey: "late_checkout",
    sourceRequestDef: "late_checkout",
    requestType: "late_checkout",
    canonicalRequestType: "late_checkout",
    title: "Late checkout",
    configRevisionId: revisionId,
    configSourceChecksum: checksum,
  });

  const loaded = readHistoricalServiceIdentitySnapshot({
    historicalServiceIdentity: identity,
    sourceRequestDef: "late_checkout_v2",
    typeLabel: "Late checkout NEW",
  });

  assert.equal(loaded?.serviceKey, "late_checkout");
  assert.equal(loaded?.title, "Late checkout");
  assert.equal(loaded?.configRevisionId, revisionId);
});

test("CM6 guest request creation snapshots service identity and paid price at the historical config revision", () => {
  const source = read("../../app/api/guest/request-create/route.ts");

  assert.match(source, /buildHistoricalServiceIdentitySnapshot/);
  assert.match(source, /historicalServiceIdentity:/);
  assert.match(source, /sourceRequestDef,/);
  assert.match(source, /requestType: authoritativeRequestType/);
  assert.match(source, /canonicalRequestType: legacyNormalizedType/);
  assert.match(source, /configRevisionId: relationalIds\.revisionId/);
  assert.match(source, /configSourceChecksum: relationalIds\.sourceChecksum/);
  assert.match(source, /revenuePriceSnapshot:/);
  assert.match(source, /revenue-price-snapshot-v1/);
});

test("CM6 Factory version upgrade SQL cannot mutate operational, Revenue, ROI or Staff Development evidence", () => {
  const sql = read(
    "../../supabase/migrations/20260909120000_cm1_post_live_version_transition_v1.sql",
  ).toLowerCase();

  for (const forbidden of [
    "guest_requests",
    "hub_events",
    "hotel_settings",
    "staff_development",
    "request_billing_",
    "gostaya_value_baseline",
  ]) {
    assert.equal(
      sql.includes(forbidden),
      false,
      `CM1 cutover unexpectedly references historical evidence: ${forbidden}`,
    );
  }

  assert.match(sql, /activate_factory_production_live_v2/);
  assert.match(sql, /update public\.hotel_config_publication_state/);
  assert.match(sql, /factory_production_live_activation_runs/);
});

test("CM6 historical restore SQL is config-only and append-only with respect to hotel value evidence", () => {
  const sql = read(
    "../../supabase/migrations/20260909200000_cm3_historical_version_restore_v1.sql",
  ).toLowerCase();

  for (const forbidden of [
    "guest_requests",
    "hub_events",
    "hotel_settings",
    "staff_development",
    "request_billing_",
    "gostaya_value_baseline",
  ]) {
    assert.equal(
      sql.includes(forbidden),
      false,
      `CM3 restore unexpectedly references historical evidence: ${forbidden}`,
    );
  }

  assert.match(sql, /activate_factory_production_restore_live_v1/);
  assert.match(sql, /factory_production_live_activation_runs/);
  assert.match(sql, /control_plane_audit_log/);
});

test("CM6 application activation paths never directly rewrite Revenue or ROI evidence", () => {
  const sources = [
    "../../lib/server/factory-production-version-transition.ts",
    "../../lib/server/factory-production-version-restore.ts",
    "../../lib/server/manager-change-activation.ts",
  ].map(read).join("\n");

  for (const forbidden of [
    '.from("guest_requests")',
    '.from("hub_events")',
    'gostaya_value_baseline_v1',
    "request_billing_",
    "revenuePriceSnapshot =",
    "historicalServiceIdentity =",
  ]) {
    assert.equal(
      sources.includes(forbidden),
      false,
      `activation path may rewrite historical value evidence: ${forbidden}`,
    );
  }
});

test("CM6 version transition and restore retain compare-and-swap LIVE authority", () => {
  const upgrade = read(
    "../../lib/server/factory-production-version-transition.ts",
  );
  const restore = read(
    "../../lib/server/factory-production-version-restore.ts",
  );

  assert.match(upgrade, /expectedCurrentLiveRevisionId/);
  assert.match(upgrade, /CM1_ACTIVATION_STALE_LIVE_REVISION/);
  assert.match(upgrade, /p_expected_current_live_revision_id/);

  assert.match(restore, /expectedCurrentLiveRevisionId/);
  assert.match(restore, /CM3_RESTORE_ACTIVATION_STALE_LIVE_REVISION/);
  assert.match(restore, /append_only_restore_audit: true/);
  assert.match(restore, /p_expected_current_live_revision_id/);
});

test("CM6 Manager activation verifies LIVE identity and rolls back failed post-activation verification", () => {
  const activation = read(
    "../../lib/server/manager-change-activation.ts",
  );

  assert.match(activation, /CM5_POST_ACTIVATION_LIVE_IDENTITY_MISMATCH/);
  assert.match(activation, /validatePublishedHotelConfigRuntimeShape/);
  assert.match(activation, /rollback_manager_content_activation_v1/);
  assert.match(
    activation,
    /CM5_POST_ACTIVATION_VERIFY_FAILED_ROLLED_BACK/,
  );
});

test("CM6 ROI baseline cannot be revised after actual Production Go-Live", () => {
  const baseline = read(
    "../../lib/server/gostaya-value-baseline.ts",
  );

  assert.match(baseline, /factory_production_live_activation_runs/);
  assert.match(baseline, /VALUE_BASELINE_LOCKED_AFTER_GOLIVE/);
  assert.match(baseline, /if \(goLiveAt && currentRow\)/);
  assert.match(baseline, /historicalBackfillAvailable: false/);
});

test("CM6 Revenue authority prefers immutable request snapshots and reconstructs mismatched native deltas", () => {
  const revenue = read(
    "../../lib/revenue/ancillary-revenue-model.mjs",
  );

  assert.match(revenue, /readHistoricalServiceIdentitySnapshot/);
  assert.match(revenue, /historical_service_identity_v1/);
  assert.match(revenue, /nativeMatchesReconstruction/);
  assert.match(revenue, /reconstructed_native_mismatch/);
  assert.match(
    revenue,
    /revenueDeltaMinor: nativeMatchesReconstruction/,
  );
});

test("CM6 Value history exposes explicit methodology and baseline revision instead of current LIVE config identity", () => {
  const value = read(
    "../../lib/value/gostaya-value-measurement.mjs",
  );

  assert.match(value, /const VALUE_SCHEMA = "gostaya-value-measurement-v1"/);
  assert.match(value, /revision: baseline\.revision/);
  assert.match(value, /baselinePeriod: baseline\.baselinePeriod/);
  assert.match(value, /goLiveAt,/);
  assert.doesNotMatch(value, /currentLiveRevisionId/);
  assert.doesNotMatch(value, /currentConfig/);
});
