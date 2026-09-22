import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("CM5.5 lifecycle mutating authority is fail-closed behind one explicit server gate", async () => {
  const lifecycle = await readProjectFile("lib/server/manager-change-lifecycle.ts");
  const route = await readProjectFile("app/api/staff/content-changes/lifecycle/route.ts");

  for (const fragment of [
    'process.env.MANAGER_CONTENT_LIFECYCLE_WRITES_ENABLED',
    '=== ENABLED_VALUE',
    "assertManagerContentLifecycleWriteEnabled();",
    "if (!isManagerContentLifecycleWriteEnabled())",
    "return disabledResponse();",
    '"CM5_MANAGER_LIFECYCLE_WRITES_DISABLED"',
    '"draft"',
    '"confirmed"',
    '"candidate_created"',
    '"certified"',
    '"live"',
  ]) {
    assertContains(lifecycle + route, fragment);
  }

  assertContains(route, "enforceStaffSameOrigin(req)");
});

test("CM5.5 lifecycle keeps human gates explicit instead of auto-publishing after Save", async () => {
  const route = await readProjectFile("app/api/staff/content-changes/lifecycle/route.ts");

  for (const action of [
    '"create_draft"',
    '"save_draft"',
    '"confirm"',
    '"cancel"',
    '"create_candidate"',
    '"certify"',
    '"activate"',
  ]) {
    assertContains(route, action);
  }

  assertNotContains(route, 'action === "confirm_and_activate"');
  assertNotContains(route, 'action === "save_and_publish"');
});

test("CM5.5 typed Save is prepared server-side before persistence", async () => {
  const lifecycle = await readProjectFile("lib/server/manager-change-lifecycle.ts");

  const prepareIndex = lifecycle.indexOf("prepareManagerHubContentChange");
  const persistIndex = lifecycle.indexOf("persistManagerTypedContentDraft");
  if (prepareIndex < 0 || persistIndex < 0 || prepareIndex > persistIndex) {
    throw new Error("typed draft persistence must follow server-side preparation");
  }

  for (const fragment of [
    "resolveManagerContentChangeScope(input.hotelSlug)",
    "actorSessionId: authority.sessionId",
    "operations: prepared.operations",
    "preview: prepared.preview",
    "diff: prepared.diff",
  ]) {
    assertContains(lifecycle, fragment);
  }
});

test("CM5.5 lifecycle API never accepts candidate config/checksum from the client", async () => {
  const route = await readProjectFile("app/api/staff/content-changes/lifecycle/route.ts");

  for (const forbidden of [
    "body.candidateConfig",
    "body.candidateChecksum",
    "body.certification",
    "body.validation",
    "p_candidate_config",
    "p_candidate_checksum",
  ]) {
    assertNotContains(route, forbidden);
  }
});
