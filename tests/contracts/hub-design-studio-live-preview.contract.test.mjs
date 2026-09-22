import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const proposalPath = "lib/product-factory/hub-design-proposal.ts";
const studioPath = "app/design-studio/VersionedDesignStudioClient.tsx";
const pagePath = "app/design-studio/page.tsx";

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

test("Versioned Design Studio owns the live preview and remains draft-only", async () => {
  const studio = await readProjectFile(studioPath);
  const page = await readProjectFile(pagePath);

  assertContains(page, 'import VersionedDesignStudioClient from "./VersionedDesignStudioClient"');
  assertContains(page, "<VersionedDesignStudioClient");
  assertContains(studio, 'const language: "bg" | "en" = lang === "en" ? "en" : "bg"');
  assertContains(studio, "buildHubDesignProposal(pkg, language)");
  assertContains(studio, "buildHubExperienceBlueprint(pkg, language)");
  assertContains(studio, "setPrimaryColor");
  assertContains(studio, "setSecondaryColor");
  assertContains(studio, "setBackgroundColor");
  assertContains(studio, "setHeadingFont");
  assertContains(studio, "setBodyFont");
  assertContains(studio, "setHiddenSectionIds");
  assertContains(studio, 'activePage?.kind === "offers"');
  assertContains(studio, "<nav");
  assertContains(studio, 'materializationPolicy: "explicit_review_required"');
  assertContains(studio, 'liveActivation: false');
  assertNotContains(studio, "publish_hotel_config_revision");
  assertNotContains(studio, "/production-live-activation");
});
