import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("Typed Manager draft persistence uses one service-role RPC and never writes LIVE config directly", async () => {
  const source = await readProjectFile("lib/server/manager-typed-content-drafts.ts");

  for (const fragment of [
    'import "server-only"',
    '"save_hotel_content_typed_draft_v1"',
    'scope !== "services" && scope !== "venues" && scope !== "schedules"',
    '"service_content_update"',
    '"manager-service-change-v1"',
    '"venue_content_update"',
    '"manager-venue-change-v1"',
    '"set_department_schedule"',
    '"manager-operational-schedule-change-v1"',
    '"cm2-version-diff-v1"',
    "input.diff.changed !== true",
  ]) {
    assertContains(source, fragment);
  }

  for (const forbidden of [
    '.from("hotel_config_revisions").update',
    ".update({ config_json",
    "p_config_json",
    "jsonPatch",
    "PlatformAdminAuthority",
  ]) {
    assertNotContains(source, forbidden);
  }
});

test("Typed Manager draft persistence keeps exact scope-to-schema contracts server-side", async () => {
  const source = await readProjectFile("lib/server/manager-typed-content-drafts.ts");

  for (const fragment of [
    'previewSchema: "manager-service-preview-v1"',
    'previewSchema: "manager-venue-preview-v1"',
    'previewSchema: "manager-operational-schedule-preview-v1"',
    "p_operation_kind: contract.operationKind",
    "p_operation_schema: contract.operationSchema",
    "p_preview_schema: contract.previewSchema",
    "p_actor_session_id: actorSessionId",
  ]) {
    assertContains(source, fragment);
  }
});
