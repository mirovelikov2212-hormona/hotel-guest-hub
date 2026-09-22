import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const modelPath = "lib/product-factory/hub-design-assets.ts";
const serverPath = "lib/server/hub-design-assets-server.ts";
const routePath = "app/api/control-plane/design-studio/assets/route.ts";
const studioPath = "app/design-studio/VersionedDesignStudioClient.tsx";
const revisionPath = "lib/server/hub-design-draft-revisions.ts";

function loadAssetModel(source) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    TextEncoder,
    TextDecoder,
    Uint8Array,
  }, { filename: modelPath });
  return module.exports;
}

test("DS3 uses one private asset contract with explicit file allowlist and limits", async () => {
  const model = await readProjectFile(modelPath);
  for (const fragment of [
    'HUB_DESIGN_ASSET_BUCKET = "hub-design-assets"',
    '"image/jpeg"',
    '"image/png"',
    '"image/webp"',
    '"application/pdf"',
    "wordprocessingml.document",
    "spreadsheetml.sheet",
    '"text/csv"',
    "validateHubDesignAssetDeclaration",
    "validateHubDesignAssetBytes",
    "collectHubDesignAssetIds",
  ]) assertContains(model, fragment);
  assertNotContains(model, "image/svg+xml");
  assertNotContains(model, "text/html");
  assertNotContains(model, "application/javascript");
});

test("Asset content validation rejects disguised binary and validates common safe formats", async () => {
  const source = await readProjectFile(modelPath);
  const model = loadAssetModel(source);
  assert.equal(model.validateHubDesignAssetBytes(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), "image/jpeg"), true);
  assert.equal(model.validateHubDesignAssetBytes(new TextEncoder().encode("%PDF-1.7"), "application/pdf"), true);
  assert.equal(model.validateHubDesignAssetBytes(new TextEncoder().encode("<script>alert(1)</script>"), "application/pdf"), false);
  assert.equal(model.validateHubDesignAssetBytes(new TextEncoder().encode("a,b\n1,2"), "text/csv"), true);
});

test("Server issues random signed uploads, validates uploaded bytes and registers immutable metadata", async () => {
  const server = await readProjectFile(serverPath);
  for (const fragment of [
    "crypto.randomUUID()",
    "createSignedUploadUrl",
    "{ upsert: false }",
    ".download(input.storagePath)",
    "validateHubDesignAssetBytes",
    'createHash("sha256")',
    'rpc("register_hub_design_asset_v1"',
    "createSignedUrls",
    "assertHubDesignOfferAssetReferences",
    "HUB_DESIGN_ASSET_REFERENCE_FOREIGN_OR_MISSING",
  ]) assertContains(server, fragment);
  assertNotContains(server, "getPublicUrl");
  assertNotContains(server, "public: true");
  assertNotContains(server, "@/lib/server/hub-design-draft-revisions");
});

test("Control Plane asset route is same-origin, role-gated and never exposes service credentials", async () => {
  const route = await readProjectFile(routePath);
  assertContains(route, "enforceControlPlaneSameOrigin(request)");
  assertContains(route, "getCurrentPlatformAdminSession()");
  assertContains(route, "canMutateControlPlane(authority.role)");
  assertContains(route, 'action === "prepare"');
  assertContains(route, 'action === "finalize"');
  assertContains(route, "asset_storage_not_ready");
  assertNotContains(route, "SUPABASE_SERVICE_ROLE_KEY");
});

test("Versioned Design Studio uses direct signed upload and stores only asset UUID references", async () => {
  const studio = await readProjectFile(studioPath);
  for (const fragment of [
    "uploadOfferAsset",
    "prepared.upload.signedUrl",
    'method: "PUT"',
    '"x-upsert": "false"',
    "HUB_DESIGN_IMAGE_ACCEPT",
    "HUB_DESIGN_ASSET_ACCEPT",
    "coverAssetId: asset.id",
    "galleryAssetIds",
    "attachmentAssetIds",
    "detachOfferAsset",
  ]) assertContains(studio, fragment);
  assertNotContains(studio, "SUPABASE_SERVICE_ROLE_KEY");
  assertNotContains(studio, "getPublicUrl");
  assertNotContains(studio, "base64");
});

test("Design revision save blocks foreign or missing asset references before immutable revision creation", async () => {
  const revisions = await readProjectFile(revisionPath);
  assertContains(revisions, "assertHubDesignOfferAssetReferences");
  assertContains(revisions, "offers: prepared.payloadJson.authoring.offers");
  const guardIndex = revisions.indexOf("assertHubDesignOfferAssetReferences");
  const saveIndex = revisions.indexOf('rpc("save_hub_design_draft_revision_v1"');
  assert.ok(guardIndex >= 0 && saveIndex > guardIndex);
});
