import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const proposalPath = "lib/product-factory/hub-design-proposal.ts";
const livePreviewPath = "app/design-studio/HubLivePreview.tsx";
const designStudioClientPath = "app/design-studio/DesignStudioClient.tsx";

test("Hub Design Proposal is deterministic and Intelligence Package based", async () => {
  const proposal = await readProjectFile(proposalPath);

  assertContains(proposal, 'schemaVersion: "hub-design-proposal-v1"');
  assertContains(proposal, "buildHubDesignProposal");
  assertContains(proposal, "pkg.routing.hub");
  assertContains(proposal, "pkg.designIntelligenceLayer.colors");
  assertContains(proposal, "pkg.designIntelligenceLayer.fonts");
  assertContains(proposal, 'generatedFrom: "hotel-intelligence-v1"');
  assertContains(proposal, 'assetPolicy: "hotel_authorization_required"');
  assertNotContains(proposal, "fetch(");
  assertNotContains(proposal, ".from(");
});

test("Hub Design Proposal filters icon fonts before typography selection", async () => {
  const proposal = await readProjectFile(proposalPath);

  assertContains(proposal, "ICON_FONT_PATTERN");
  assertContains(proposal, "isContentFont");
  assertContains(proposal, "selectHubTypography");
  assertContains(proposal, "font\\s*awesome");
  assertContains(proposal, "eleganticons");
  assertContains(proposal, "ionicons");
  assertContains(proposal, "linearicons");
  assertContains(proposal, "FALLBACK_FONT");
});

test("Hub Design Studio live preview is editable and draft-only", async () => {
  const preview = await readProjectFile(livePreviewPath);
  const client = await readProjectFile(designStudioClientPath);

  assertContains(preview, "buildHubDesignProposal(pkg, lang)");
  assertContains(preview, "setPrimaryColor");
  assertContains(preview, "setSecondaryColor");
  assertContains(preview, "setBackgroundColor");
  assertContains(preview, "setHeadingFont");
  assertContains(preview, "setBodyFont");
  assertContains(preview, "toggleSection");
  assertContains(preview, "quickSections");
  assertContains(preview, "Hero image after hotel approval");
  assertContains(client, "<HubLivePreview pkg={pkg} lang={lang} />");
  assertNotContains(preview, "fetch(");
  assertNotContains(preview, ".from(");
  assertNotContains(preview, "publishRevision");
  assertNotContains(preview, "activateLive");
  assertNotContains(client, "publishRevision");
  assertNotContains(client, "activateLive");
});
