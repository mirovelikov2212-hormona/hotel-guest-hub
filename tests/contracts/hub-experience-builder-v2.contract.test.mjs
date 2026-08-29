import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const modelPath = "lib/product-factory/hub-experience-blueprint.ts";
const builderPath = "app/design-studio/HubExperienceBuilder.tsx";

test("Experience Blueprint V2 models pages navigation campaigns and runtime boundaries", async () => {
  const model = await readProjectFile(modelPath);
  assertContains(model, 'schemaVersion: "hub-experience-blueprint-v2"');
  assertContains(model, "HubInternalPage");
  assertContains(model, "HubNavigationItem");
  assertContains(model, "HubPromotionDraft");
  assertContains(model, "HubOfferDraft");
  assertContains(model, "HubMessageDraft");
  assertContains(model, "HubSurveySurface");
  assertContains(model, 'materializationPolicy: "explicit_review_required"');
  assertContains(model, 'assetPolicy: "hotel_authorization_required"');
  assertContains(model, 'runtimeOwned: true');
  assertContains(model, 'generatedFrom: "hotel-intelligence-v1"');
  assertNotContains(model, "fetch(");
  assertNotContains(model, ".from(");
});

test("Experience Blueprint defaults to stable five-destination mobile navigation", async () => {
  const model = await readProjectFile(modelPath);
  assertContains(model, 'id: "nav-home"');
  assertContains(model, 'id: "nav-services"');
  assertContains(model, 'id: "nav-offers"');
  assertContains(model, 'id: "nav-messages"');
  assertContains(model, 'id: "nav-more"');
  assertContains(model, 'pageId: "page-services"');
  assertContains(model, 'pageId: "page-offers"');
  assertContains(model, 'pageId: "page-messages"');
  assertContains(model, 'pageId: "page-info"');
});

test("Promotions and marketing messaging have interruption and consent guardrails", async () => {
  const model = await readProjectFile(modelPath);
  assertContains(model, 'placement: "floating_bottom"');
  assertContains(model, "dismissible: true");
  assertContains(model, 'frequencyCap: "once_per_session"');
  assertContains(model, "marketingConsentRequired");
  assertContains(model, "timeSensitiveAllowed");
  assertContains(model, "Marketing push requires consent");
  assertContains(model, "One floating promotion maximum");
  assertContains(model, "Promotions are frequency-capped");
});

test("Design QA enforces navigation contrast progressive disclosure and touch targets", async () => {
  const model = await readProjectFile(modelPath);
  assertContains(model, "evaluateHubExperienceDesign");
  assertContains(model, "contrastRatio");
  assertContains(model, 'id: "top-level-navigation"');
  assertContains(model, 'id: "home-destination"');
  assertContains(model, 'id: "progressive-disclosure"');
  assertContains(model, 'id: "text-contrast"');
  assertContains(model, 'id: "control-contrast"');
  assertContains(model, 'id: "touch-targets"');
  assertContains(model, "bodyContrast >= 4.5");
  assertContains(model, "controlContrast >= 3");
  assertContains(model, "Touch targets ≥ 44px");
});

test("Experience Builder previews inner pages offers messages surveys and persistent navigation", async () => {
  const builder = await readProjectFile(builderPath);
  assertContains(builder, 'type BuilderPanel = "structure" | "pages" | "campaigns" | "navigation" | "style" | "qa"');
  assertContains(builder, 'panel === "pages"');
  assertContains(builder, 'panel === "campaigns"');
  assertContains(builder, 'panel === "navigation"');
  assertContains(builder, 'panel === "qa"');
  assertContains(builder, 'activePage?.kind === "offers"');
  assertContains(builder, 'activePage?.kind === "messages"');
  assertContains(builder, 'activePage.kind !== "offers" && activePage.kind !== "messages"');
  assertContains(builder, 'modules.includes("survey_card")');
  assertContains(builder, 'modules.includes("ai_concierge")');
  assertContains(builder, 'promo?.placement === "floating_bottom"');
  assertContains(builder, "bottom-[76px]");
  assertContains(builder, "<nav");
  assertContains(builder, "min-h-11");
  assertContains(builder, "moveNavigation");
  assertContains(builder, "↑");
  assertContains(builder, "↓");
});

test("Experience Builder remains local design-only and cannot publish or materialize", async () => {
  const builder = await readProjectFile(builderPath);
  assertContains(builder, "EXPERIENCE DRAFT");
  assertContains(builder, "Hotel Factory");
  assertNotContains(builder, "fetch(");
  assertNotContains(builder, ".from(");
  assertNotContains(builder, "publishRevision");
  assertNotContains(builder, "activateLive");
  assertNotContains(builder, "materializeHotel");
});
