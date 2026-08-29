import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const migrationPath = "supabase/migrations/20260829104500_hub_design_draft_versioning.sql";
const securityMigrationPath = "supabase/migrations/20260829105500_hub_design_draft_security_indexes.sql";
const modelPath = "lib/product-factory/hub-design-draft.ts";
const serverPath = "lib/server/hub-design-draft-revisions.ts";
const routePath = "app/api/control-plane/design-studio/drafts/route.ts";
const studioPath = "app/design-studio/VersionedDesignStudioClient.tsx";
const pagePath = "app/design-studio/page.tsx";

function loadDraftModel(source) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, URL }, { filename: modelPath });
  return module.exports;
}

test("Design Draft persistence stays separate from operational hotel config", async () => {
  const migration = await readProjectFile(migrationPath);
  assertContains(migration, "create table if not exists public.hub_design_workspaces");
  assertContains(migration, "create table if not exists public.hub_design_draft_revisions");
  assertContains(migration, "foreign key (workspace_id, parent_revision_id)");
  assertContains(migration, "restored_from_revision_id uuid null");
  assertContains(migration, "check (status = 'draft')");
  assertContains(migration, "hub_design_draft_revisions_immutable");
  assertContains(migration, "HUB_DESIGN_REVISION_IMMUTABLE");
  assertContains(migration, "enable row level security");
  assertContains(migration, "grant select on table public.hub_design_workspaces to service_role");
  assertContains(migration, "grant select on table public.hub_design_draft_revisions to service_role");
  assertNotContains(migration, "hotel_config_revisions");
  assertNotContains(migration, "hotel_config_publication_state");
  assertNotContains(migration, "update public.hotels");
  assertNotContains(migration, "publish_hotel_config_revision");
  assertNotContains(migration, "P2.6.4");
});

test("Design Draft tables have explicit deny policies and covering FK indexes", async () => {
  const migration = await readProjectFile(securityMigrationPath);
  assertContains(migration, "hub_design_workspaces_deny_direct_access");
  assertContains(migration, "hub_design_draft_revisions_deny_direct_access");
  assertContains(migration, "using (false)");
  assertContains(migration, "with check (false)");
  assertContains(migration, "hub_design_workspaces_created_by_idx");
  assertContains(migration, "hub_design_workspaces_current_revision_idx");
  assertContains(migration, "hub_design_draft_revisions_created_by_idx");
  assertContains(migration, "hub_design_draft_revisions_workspace_parent_idx");
  assertContains(migration, "hub_design_draft_revisions_workspace_restored_from_idx");
});

test("Revision writes are serialized, idempotent and optimistic-concurrency safe", async () => {
  const migration = await readProjectFile(migrationPath);
  assertContains(migration, "save_hub_design_draft_revision_v1");
  assertContains(migration, "restore_hub_design_draft_revision_v1");
  assertContains(migration, "pg_advisory_xact_lock");
  assertContains(migration, "idempotency_key text not null");
  assertContains(migration, "HUB_DESIGN_IDEMPOTENCY_CONFLICT");
  assertContains(migration, "v_workspace.current_revision_id is distinct from p_parent_revision_id");
  assertContains(migration, "HUB_DESIGN_PARENT_CONFLICT");
  assertContains(migration, "v_workspace.current_revision_id is distinct from p_expected_current_revision_id");
  assertContains(migration, "HUB_DESIGN_CURRENT_REVISION_CONFLICT");
  assertContains(migration, "restored_from_revision_id");
  assertContains(migration, "hub_design_draft_revision_restored");
  assertContains(migration, "'liveActivated', false");
});

test("Only mutating platform-admin roles can create or restore revisions", async () => {
  const migration = await readProjectFile(migrationPath);
  const route = await readProjectFile(routePath);
  assertContains(migration, "where id = p_actor_admin_id and active = true");
  assertContains(migration, "v_actor_role not in ('super_admin', 'operator')");
  assertContains(route, "getCurrentPlatformAdminSession()");
  assertContains(route, "canMutateControlPlane(authority.role)");
  assertContains(route, "enforceControlPlaneSameOrigin(request)");
  assertContains(route, 'return json({ ok: false, error: "forbidden" }, 403)');
  assertNotContains(route, "publishRevision");
  assertNotContains(route, "materialize");
  assertNotContains(route, "activate");
  assertNotContains(route, "sendPush");
});

test("Draft payload preserves exact authoring state and explicit safety policies", async () => {
  const model = await readProjectFile(modelPath);
  for (const fragment of [
    "primaryColor",
    "secondaryColor",
    "backgroundColor",
    "headingFont",
    "bodyFont",
    "modules: HubModuleKind[]",
    "hiddenSectionIds: string[]",
    "manualSections: HubDesignSection[]",
    "extraItems:",
    "pages: HubInternalPage[]",
    "navigation: HubNavigationItem[]",
    "offers: HubOfferDraft[]",
    "messages: HubMessageDraft[]",
    "promotions: HubPromotionDraft[]",
    "promotionEnabled: boolean",
    "searchEnabled: boolean",
    "survey: HubSurveySurface",
    'runtimeCampaignSend: false',
    'liveActivation: false',
    'materializationPolicy: "explicit_review_required"',
  ]) assertContains(model, fragment);
});

test("Active Design Studio wires all committed authoring state into save, history, compare and restore", async () => {
  const studio = await readProjectFile(studioPath);
  const page = await readProjectFile(pagePath);
  assertContains(page, 'import VersionedDesignStudioClient from "./VersionedDesignStudioClient"');
  assertContains(page, "<VersionedDesignStudioClient lang={lang} />");
  for (const fragment of [
    "HUB_DESIGN_DRAFT_SCHEMA_VERSION",
    "parentRevisionId: snapshot?.workspace.currentRevisionId || null",
    'action: "restore"',
    "expectedCurrentRevisionId: snapshot.workspace.currentRevisionId",
    "compareRevision",
    "applyPayload",
    "hiddenSectionIds",
    "manualSections",
    "extraItems",
    "pages",
    "navigation",
    "offers",
    "messages",
    "promotions",
    "promotionEnabled",
    "searchEnabled",
    "survey",
    "ctaDestination",
    'runtimeCampaignSend: false',
    'liveActivation: false',
  ]) assertContains(studio, fragment);
  assertNotContains(studio, "/activate");
  assertNotContains(studio, "publish_hotel_config_revision");
});

test("Canonical normalization is deterministic without reordering design arrays", async () => {
  const source = await readProjectFile(modelPath);
  const model = loadDraftModel(source);
  const left = {
    z: 2,
    pages: [{ id: "b" }, { id: "a" }],
    a: { y: 2, x: 1 },
  };
  const right = {
    a: { x: 1, y: 2 },
    pages: [{ id: "b" }, { id: "a" }],
    z: 2,
  };
  assert.equal(model.stableDesignDraftStringify(left), model.stableDesignDraftStringify(right));
  assert.match(model.stableDesignDraftStringify(left), /"pages":\[\{"id":"b"\},\{"id":"a"\}\]/);
});

test("Draft diff reports changed paths and restore service never mutates old snapshots", async () => {
  const source = await readProjectFile(modelPath);
  const model = loadDraftModel(source);
  const diff = model.diffHubDesignDraftPayloads(
    { authoring: { theme: { primaryColor: "#111111" }, pages: [{ title: "A" }] } },
    { authoring: { theme: { primaryColor: "#222222" }, pages: [{ title: "B" }] } },
  );
  assert.equal(diff.changeCount, 2);
  assert.deepEqual([...diff.changedPaths], [
    "authoring.pages[0].title",
    "authoring.theme.primaryColor",
  ]);

  const server = await readProjectFile(serverPath);
  assertContains(server, 'rpc("restore_hub_design_draft_revision_v1"');
  assertContains(server, "diffHubDesignDraftPayloads");
  assertNotContains(server, '.from("hub_design_draft_revisions")\n    .update(');
});
