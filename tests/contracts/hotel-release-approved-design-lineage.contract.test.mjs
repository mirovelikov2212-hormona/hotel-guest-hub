import test from "node:test";

import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

const authorityPath = "lib/server/factory-release-design-authority.ts";
const preflightPath = "app/api/control-plane/onboarding/preflight/route.ts";
const onboardingPath = "lib/server/factory-onboarding.ts";
const onboardingRoutePath = "app/api/control-plane/onboarding/route.ts";
const sandboxCertificationPath = "lib/server/factory-trusted-sandbox-certification.ts";
const readinessPath = "lib/server/factory-production-readiness.ts";
const publicationPath = "lib/server/factory-production-publication.ts";
const runtimeCertificationPath = "lib/server/factory-production-runtime-certification.ts";
const liveActivationPath = "lib/server/factory-production-live-activation.ts";

test("Hotel Release authority reconstructs exact immutable Design provenance and revalidates Approved Intelligence + Scan lineage", async () => {
  const authority = await readProjectFile(authorityPath);

  for (const fragment of [
    'authority: "exact_immutable_design_revision"',
    '.from("hub_design_draft_revisions")',
    '.eq("workspace_id", workspaceId)',
    '.eq("id", revisionId)',
    "payloadChecksum !== requireChecksum(row.payload_checksum",
    "sourcePackageChecksum !== requireChecksum(row.source_package_checksum",
    "getHubDesignApprovedIntelligenceLineage(payload)",
    "loadApprovedHotelIntelligenceEnvelope(designLineage.revisionId)",
    "approvedLineageMatches(designLineage, approved)",
    "designLineage.scanRunId === approved.lineage.scanRunId",
    "designLineage.scanEvidenceChecksum === approved.lineage.scanEvidenceChecksum",
    "designLineage.contentChecksum === approved.lineage.contentChecksum",
    "sha256(approved.intelligencePackage) !== sourcePackageChecksum",
    "FACTORY_RELEASE_APPROVED_INTELLIGENCE_SOURCE_MISMATCH",
  ]) assertContains(authority, fragment);

  assertNotContains(authority, ".insert(");
  assertNotContains(authority, ".update(");
  assertNotContains(authority, ".delete(");
});

test("Browser Design handoff is only a locator; preflight and mutation rebuild the same authoritative blueprint server-side", async () => {
  const authority = await readProjectFile(authorityPath);
  const preflight = await readProjectFile(preflightPath);
  const onboarding = await readProjectFile(onboardingPath);
  const route = await readProjectFile(onboardingRoutePath);

  assertContains(authority, "const workspaceId = handoff.workspaceId");
  assertContains(authority, "const revisionId = handoff.revisionId || handoff.sourceDesignRevisionId");
  assertContains(authority, "designHandoff: canonicalDesignHandoff(verified)");
  assertContains(authority, "prepareAuthoritativeFactoryOnboarding");

  assertContains(preflight, "prepareAuthoritativeFactoryOnboarding");
  assertContains(preflight, "blueprintHash: prepared.blueprintHash");
  assertNotContains(preflight, ".rpc(");
  assertNotContains(preflight, ".from(");

  assertContains(onboarding, "prepareAuthoritativeFactoryOnboarding");
  assertContains(onboarding, "prepared.blueprintHash !== String(input.expectedBlueprintHash)");
  assertContains(onboarding, "P2_FACTORY_STALE_PREFLIGHT");
  assertContains(route, "expectedBlueprintHash,");
  assertNotContains(route, "prepareFactoryOnboarding");
});

test("Persisted Factory release revision is rebound to its exact immutable blueprint checksum before release gates", async () => {
  const authority = await readProjectFile(authorityPath);

  for (const fragment of [
    "verifyFactoryReleaseDesignRevision",
    '.from("hotel_config_revisions")',
    '.eq("hotel_id", hotelId)',
    '.eq("id", revisionId)',
    'data.source_type !== "factory_blueprint"',
    "config.factoryBlueprint",
    "hashFactoryBlueprint(blueprint) !== sourceChecksum",
    "FACTORY_RELEASE_BLUEPRINT_CHECKSUM_MISMATCH",
    "verifyPersistedFactoryReleaseDesignBlueprint(blueprint)",
    "FACTORY_RELEASE_DESIGN_PROVENANCE_MISMATCH",
    "FACTORY_RELEASE_DESIGN_LINEAGE_REQUIRED",
  ]) assertContains(authority, fragment);
});

test("Sandbox, readiness, publication, runtime certification and LIVE all independently fail closed on missing or forged Design lineage", async () => {
  const sandbox = await readProjectFile(sandboxCertificationPath);
  const readiness = await readProjectFile(readinessPath);
  const publication = await readProjectFile(publicationPath);
  const runtime = await readProjectFile(runtimeCertificationPath);
  const live = await readProjectFile(liveActivationPath);

  for (const source of [sandbox, readiness, publication, runtime, live]) {
    assertContains(source, "verifyFactoryReleaseDesignRevision");
  }

  assertContains(sandbox, "hotelId: preflight.lineage.sandboxHotelId");
  assertContains(sandbox, "revisionId: preflight.lineage.sandboxRevisionId");
  assertContains(readiness, "hotelId: evidence.certification.productionHotelId");
  assertContains(readiness, "revisionId: evidence.certification.productionRevisionId");
  assertContains(publication, "hotelId: expectedProductionHotelId");
  assertContains(publication, "revisionId: expectedProductionRevisionId");
  assertContains(runtime, "hotelId: expectedProductionHotelId");
  assertContains(runtime, "revisionId: expectedProductionRevisionId");
  assertContains(live, "hotelId: expectedProductionHotelId");
  assertContains(live, "revisionId: expectedProductionRevisionId");
});

test("Hotel Release hardening reuses the one existing Factory lifecycle and cannot activate LIVE from Design or onboarding", async () => {
  const authority = await readProjectFile(authorityPath);
  const preflight = await readProjectFile(preflightPath);
  const onboarding = await readProjectFile(onboardingPath);
  const sandbox = await readProjectFile(sandboxCertificationPath);
  const readiness = await readProjectFile(readinessPath);
  const publication = await readProjectFile(publicationPath);
  const runtime = await readProjectFile(runtimeCertificationPath);
  const live = await readProjectFile(liveActivationPath);

  assertContains(onboarding, 'supabaseAdmin.rpc("begin_factory_onboarding_v1"');
  assertContains(sandbox, "certifyFactorySandbox({");
  assertContains(readiness, 'supabaseAdmin.rpc("assess_factory_production_readiness_v1"');
  assertContains(publication, 'supabaseAdmin.rpc("publish_factory_production_revision_v1"');
  assertContains(runtime, 'supabaseAdmin.rpc("certify_factory_production_runtime_v1"');
  assertContains(live, 'supabaseAdmin.rpc("activate_factory_production_live_v1"');

  assertNotContains(authority, "create table");
  assertNotContains(authority, ".rpc(");
  assertNotContains(preflight, "activate_factory_production_live_v1");
  assertNotContains(onboarding, "activate_factory_production_live_v1");
  assertNotContains(sandbox, "activate_factory_production_live_v1");
});

test("Hotel Release remains Sandbox-first and exact revision authority does not require the Design to remain the current workspace pointer", async () => {
  const authority = await readProjectFile(authorityPath);

  assertContains(authority, "isCurrentRevision:");
  assertContains(authority, "materializationPolicy: \"sandbox_first_explicit_review\"");
  assertContains(authority, "liveActivation: false");
  assertContains(authority, "keepProductionInactive: true");
  assertContains(authority, "keepSandboxInactive: true");
  assertNotContains(authority, "if (!verified.isCurrentRevision");
  assertNotContains(authority, "verified.isCurrentRevision !== true");
});
