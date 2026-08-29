import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const clientPath = "app/design-studio/DesignStudioClient.tsx";
const previewPath = "app/design-studio/HubLivePreview.tsx";

test("Design Studio makes Design versus Factory ownership explicit", async () => {
  const client = await readProjectFile(clientPath);

  assertContains(client, 'workflow: "Работен поток и ownership"');
  assertContains(client, 'designOwner: "Design Studio"');
  assertContains(client, 'factoryOwner: "Hotel Factory"');
  assertContains(client, "/hotel-factory/new?lang=${lang}");
  assertContains(client, "Автоматичният package materialization ще бъде отделно изрично действие");
  assertContains(client, "profile.contacts.socialLinks");
  assertContains(client, "SocialLinks");
  assertContains(client, 'stepLive: "6 · Live"');
  assertNotContains(client, "publishRevision");
  assertNotContains(client, "activateLive");
});

test("Design Studio can compose local draft content without creating runtime objects", async () => {
  const preview = await readProjectFile(previewPath);

  assertContains(preview, 'composer: "Draft Content Composer"');
  assertContains(preview, "manualSections");
  assertContains(preview, "extraItems");
  assertContains(preview, "addDraftContent");
  assertContains(preview, "manual-section-");
  assertContains(preview, "manual-item-");
  assertContains(preview, "Това не създава оперативен обект");
  assertContains(preview, "setManualSections([])");
  assertContains(preview, "setExtraItems({})");
  assertNotContains(preview, "fetch(");
  assertNotContains(preview, ".from(");
  assertNotContains(preview, "publishRevision");
  assertNotContains(preview, "activateLive");
});
