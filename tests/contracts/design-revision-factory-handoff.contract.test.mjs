import test from "node:test";

import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

const apiPath = "app/api/control-plane/design-studio/factory-handoff/route.ts";
const launcherPath = "app/design-studio/DesignFactoryHandoffLauncher.tsx";
const handoffPath = "app/hotel-factory/from-design/DesignRevisionFactoryHandoffClient.tsx";
const onboardingPath = "app/api/control-plane/onboarding/route.ts";

test("Factory handoff reads one exact immutable Design Revision and verifies both checksums", async () => {
  const source = await readProjectFile(apiPath);
  assertContains(source, '.from("hub_design_draft_revisions")');
  assertContains(source, '.eq("workspace_id", workspaceId)');
  assertContains(source, '.eq("id", revisionId)');
  assertContains(source, "payloadChecksum !== data.payload_checksum");
  assertContains(source, "sourcePackageChecksum !== data.source_package_checksum");
  assertContains(source, 'schemaVersion: "hub-design-factory-handoff-v1"');
  assertContains(source, "isCurrentRevision");
  assertNotContains(source, ".insert(");
  assertNotContains(source, ".update(");
  assertNotContains(source, "production-live-activation");
});

test("Design Studio launcher can hand the current saved revision to the reviewed Factory gate", async () => {
  const source = await readProjectFile(launcherPath);
  assertContains(source, "currentRevisionId");
  assertContains(source, "/hotel-factory/from-design");
  assertContains(source, "workspaceId=");
  assertContains(source, "revisionId=");
  assertContains(source, "Design revision required");
});

test("Factory handoff keeps uncertain operational identity under explicit human review", async () => {
  const source = await readProjectFile(handoffPath);
  assertContains(source, "setCountryCode(\"\")");
  assertContains(source, "setRoomsText(\"\")");
  assertContains(source, "setLanguages<string[]>([])");
  assertContains(source, "/api/control-plane/onboarding/location");
  assertContains(source, "verified location + timezone");
  assertContains(source, "explicit room inventory");
  assertNotContains(source, 'setCountryCode("BG")');
  assertNotContains(source, 'setRoomsText("101');
});

test("Factory blueprint carries exact Design Revision provenance into the existing onboarding source of truth", async () => {
  const source = await readProjectFile(handoffPath);
  for (const fragment of [
    "designHandoff",
    "workspaceId: handoff.workspaceId",
    "revisionId: handoff.revisionId",
    "revisionNo: handoff.revisionNo",
    "payloadChecksum: handoff.payloadChecksum",
    "sourcePackageChecksum: handoff.sourcePackageChecksum",
    'materializationPolicy: "sandbox_first_explicit_review"',
    "liveActivation: false",
  ]) assertContains(source, fragment);
  assertContains(source, "/api/control-plane/onboarding/preflight");
  assertContains(source, 'fetch("/api/control-plane/onboarding"');
});

test("Factory creation reuses the existing exact inactive foundation approval and never invokes LIVE activation", async () => {
  const handoff = await readProjectFile(handoffPath);
  const onboarding = await readProjectFile(onboardingPath);
  for (const fragment of [
    "createDraftTenant: true",
    "keepProductionInactive: true",
    "keepSandboxInactive: true",
    "publishRevision: false",
    "activateLive: false",
  ]) {
    assertContains(handoff, fragment);
    assertContains(onboarding, fragment);
  }
  assertNotContains(handoff, "production-live-activation");
  assertNotContains(handoff, "production-publication");
  assertNotContains(handoff, "sandbox-certification");
});
