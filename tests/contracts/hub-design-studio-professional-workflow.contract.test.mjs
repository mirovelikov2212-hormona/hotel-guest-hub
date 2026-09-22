import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const pagePath = "app/design-studio/page.tsx";
const studioPath = "app/design-studio/VersionedDesignStudioClient.tsx";

test("One active versioned Design Studio owns onboarding authoring", async () => {
  const page = await readProjectFile(pagePath);
  assertContains(page, 'import VersionedDesignStudioClient from "./VersionedDesignStudioClient"');
  assertContains(page, "<VersionedDesignStudioClient");
  assertContains(page, "<DesignFactoryHandoffLauncher");
  assertNotContains(page, 'import DesignStudioClient from "./DesignStudioClient"');
  assertNotContains(page, 'import HubExperienceBuilder from "./HubExperienceBuilder"');
});

test("Active Design Studio keeps authoring separate from LIVE publication", async () => {
  const studio = await readProjectFile(studioPath);
  for (const fragment of [
    'materializationPolicy: "explicit_review_required"',
    'runtimeCampaignSend: false',
    'liveActivation: false',
    "manualSections",
    "extraItems",
    "saveRevision",
    "restoreRevision",
    "compareRevision",
  ]) assertContains(studio, fragment);
  assertNotContains(studio, "publish_hotel_config_revision");
  assertNotContains(studio, "/production-live-activation");
  assertNotContains(studio, "vercel --prod");
});
