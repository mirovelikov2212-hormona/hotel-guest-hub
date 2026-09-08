import test from "node:test";

import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

const modelPath = "lib/product-factory/hub-design-draft.ts";
const serverPath = "lib/server/hub-design-draft-revisions.ts";
const draftRoutePath = "app/api/control-plane/design-studio/drafts/route.ts";
const factoryHandoffPath = "app/api/control-plane/design-studio/factory-handoff/route.ts";
const scannerPath = "app/hotel-scanner/HotelScannerClient.tsx";

test("Design provenance can carry exact approved Hotel Intelligence and Scan Run lineage without a new schema authority", async () => {
  const model = await readProjectFile(modelPath);
  for (const fragment of [
    'schemaVersion: "approved-hotel-intelligence-v1"',
    'authority: "approved_hotel_intelligence_revision"',
    "workspaceId: string",
    "revisionId: string",
    "revisionNo: number",
    "scanRunId: string",
    "scanEvidenceChecksum: string",
    "contentChecksum: string",
    "approvedIntelligence?: HubDesignApprovedIntelligenceLineage",
  ]) assertContains(model, fragment);
  assertContains(model, "getHubDesignApprovedIntelligenceLineage");
  assertContains(model, "SOURCE_APPROVED_INTELLIGENCE_SCAN_CHECKSUM_INVALID");
  assertContains(model, "SOURCE_APPROVED_INTELLIGENCE_CONTENT_CHECKSUM_INVALID");
});

test("Authoritative Design save resolves the approved Review revision on the server and ignores browser sourcePackage provenance", async () => {
  const server = await readProjectFile(serverPath);
  const route = await readProjectFile(draftRoutePath);

  for (const fragment of [
    "loadHotelIntelligenceWorkspaceByCanonicalUrl",
    "approvedRevisionId",
    "loadApprovedHotelIntelligenceEnvelope(approvedRevisionId)",
    "HUB_DESIGN_APPROVED_INTELLIGENCE_REQUIRED",
    "HUB_DESIGN_APPROVED_INTELLIGENCE_WORKSPACE_MISMATCH",
    "HUB_DESIGN_APPROVED_INTELLIGENCE_SOURCE_MISMATCH",
    "sourcePackage: approved.intelligencePackage",
    "approvedIntelligence: approvedLineage(approved.lineage)",
  ]) assertContains(server, fragment);

  assertNotContains(route, "const sourcePackage = body?.sourcePackage");
  assertNotContains(route, "prepareHubDesignRevision({ sourcePackage, payload })");
  assertContains(route, "saveHubDesignDraftRevision({");
  assertContains(route, "payload,");
});

test("Legacy Scanner browser package cannot become authoritative Design provenance by itself", async () => {
  const scanner = await readProjectFile(scannerPath);
  const server = await readProjectFile(serverPath);
  assertContains(scanner, "window.sessionStorage.setItem(PACKAGE_STORAGE_KEY");
  assertContains(server, "HUB_DESIGN_APPROVED_INTELLIGENCE_REQUIRED");
  assertContains(server, "loadApprovedHotelIntelligenceEnvelope(approvedRevisionId)");
  assertNotContains(server, "sourcePackage: input.sourcePackage");
});

test("Factory handoff rejects legacy Design revisions and revalidates exact approved upstream lineage", async () => {
  const handoff = await readProjectFile(factoryHandoffPath);
  for (const fragment of [
    "getHubDesignApprovedIntelligenceLineage(payload)",
    'error: "approved_intelligence_lineage_required"',
    "loadApprovedHotelIntelligenceEnvelope(designLineage.revisionId)",
    "approvedLineageMatches(designLineage, approved)",
    'error: "approved_intelligence_lineage_mismatch"',
    "approvedSourcePackageChecksum !== sourcePackageChecksum",
    'error: "approved_intelligence_source_mismatch"',
    "approvedCanonicalUrl !== payloadCanonicalUrl",
    "approvedCanonicalUrl !== workspaceCanonicalUrl",
  ]) assertContains(handoff, fragment);
});

test("Design hardening reuses existing revision and Factory authorities without new persistence or LIVE activation", async () => {
  const server = await readProjectFile(serverPath);
  const handoff = await readProjectFile(factoryHandoffPath);
  assertContains(server, 'rpc("save_hub_design_draft_revision_v1"');
  assertContains(server, 'rpc("restore_hub_design_draft_revision_v1"');
  assertContains(handoff, '.from("hub_design_draft_revisions")');
  assertNotContains(server, "create table");
  assertNotContains(handoff, ".insert({");
  assertNotContains(handoff, ".update({");
  assertNotContains(handoff, "production-live-activation");
  assertNotContains(handoff, "publish_hotel_config_revision");
});
