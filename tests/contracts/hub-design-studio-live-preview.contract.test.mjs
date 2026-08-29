import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const proposalPath = "lib/product-factory/hub-design-proposal.ts";
const livePreviewPath = "app/design-studio/HubLivePreview.tsx";
const builderPath = "app/design-studio/HubExperienceBuilder.tsx";
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

test("Hub Design Studio live preview delegates to Experience Builder V2 and remains draft-only", async () => {
  const preview = await readProjectFile(livePreviewPath);
  const builder = await readProjectFile(builderPath);
  const client = await readProjectFile(designStudioClientPath);

  assertContains(preview, "HubExperienceBuilder");
  assertContains(preview, "<HubExperienceBuilder pkg={pkg} lang={lang} />");
  assertContains(builder, 'const language: "bg" | "en" = lang === "en" ? "en" : "bg"');
  assertContains(builder, "buildHubDesignProposal(pkg, language)");
  assertContains(builder, "buildHubExperienceBlueprint(pkg, language)");
  assertContains(builder, "setPrimaryColor");
  assertContains(builder, "setSecondaryColor");
  assertContains(builder, "setBackgroundColor");
  assertContains(builder, "setHeadingFont");
  assertContains(builder, "setBodyFont");
  assertContains(builder, "toggleSection");
  assertContains(builder, "Hero / welcome");
  assertContains(client, "<HubLivePreview pkg={pkg} lang={lang} />");
  assertNotContains(builder, "fetch(");
  assertNotContains(builder, ".from(");
  assertNotContains(builder, "publishRevision");
  assertNotContains(builder, "activateLive");
  assertNotContains(client, "publishRevision");
  assertNotContains(client, "activateLive");
});
