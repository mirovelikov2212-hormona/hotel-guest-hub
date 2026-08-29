import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const clientPath = "app/design-studio/DesignStudioClient.tsx";
const builderPath = "app/design-studio/HubExperienceBuilder.tsx";

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

test("Experience Builder can compose local draft content without creating runtime objects", async () => {
  const builder = await readProjectFile(builderPath);

  assertContains(builder, 'manualContent: "Draft Content Composer"');
  assertContains(builder, "manualSections");
  assertContains(builder, "extraItems");
  assertContains(builder, "addDraftContent");
  assertContains(builder, "manual-section-");
  assertContains(builder, "manual-item-");
  assertContains(builder, "Този builder не изпраща съобщения и не публикува оферти");
  assertContains(builder, "setManualSections([])");
  assertContains(builder, "setExtraItems({})");
  assertNotContains(builder, "fetch(");
  assertNotContains(builder, ".from(");
  assertNotContains(builder, "publishRevision");
  assertNotContains(builder, "activateLive");
});
