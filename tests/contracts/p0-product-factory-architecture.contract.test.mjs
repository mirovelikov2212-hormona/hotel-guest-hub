import assert from "node:assert/strict";
import test from "node:test";

import {
  FACTORY_SERVICE_MODES,
  FACTORY_WORKFLOW_ACTIONS,
  isValidIanaTimezone,
  isValidLocaleTag,
  validateFactoryBlueprint,
  validateFactoryPortfolio,
} from "../../lib/product-factory/factory-blueprint-model.mjs";
import {
  allInclusiveResortBlueprint,
  boutiqueHotelBlueprint,
  internationalGroupPortfolio,
} from "../fixtures/product-factory/p0-scenarios.mjs";
import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("P0 accepts the 30-room standalone boutique scenario", () => {
  const result = validateFactoryBlueprint(boutiqueHotelBlueprint);

  assert.equal(result.ok, true);
  assert.equal(result.roomCount, 30);
  assert.equal(result.localeCount, 2);
  assert.equal(result.integrationCount, 0);
  assert.ok(boutiqueHotelBlueprint.services.some((service) => service.mode === "custom"));
});

test("P0 accepts the 500-room integrated all-inclusive scenario without a hotel fork", () => {
  const result = validateFactoryBlueprint(allInclusiveResortBlueprint);

  assert.equal(result.ok, true);
  assert.equal(result.roomCount, 500);
  assert.equal(result.localeCount, 7);
  assert.equal(result.integrationCount, 3);
  assert.ok(allInclusiveResortBlueprint.departments.length >= 7);
  assert.ok(allInclusiveResortBlueprint.services.some((service) => service.id === "beach-cabana" && service.mode === "custom"));
  assert.equal(allInclusiveResortBlueprint.requiresDedicatedDeployment, undefined);
});

test("P0 accepts one organization with 20 isolated international properties", () => {
  const result = validateFactoryPortfolio(internationalGroupPortfolio);

  assert.equal(result.ok, true);
  assert.equal(result.propertyCount, 20);
  assert.ok(result.roomCount > 3000);
  assert.ok(result.timezoneCount >= 8);
  assert.ok(result.localeCount >= 10);
  assert.equal(new Set(internationalGroupPortfolio.properties.map((item) => item.property.slug)).size, 20);
});

test("P0 validates arbitrary IANA timezone and BCP-47 locale inputs rather than fixed hotel allowlists", () => {
  for (const timezone of ["Pacific/Auckland", "Asia/Tokyo", "America/Los_Angeles", "Africa/Johannesburg"]) {
    assert.equal(isValidIanaTimezone(timezone), true);
  }
  for (const locale of ["pt-BR", "zh-Hans", "ar", "ja-JP", "tr"]) {
    assert.equal(isValidLocaleTag(locale), true);
  }

  assert.equal(isValidIanaTimezone("Europe/HotelSpecific"), false);
  assert.equal(isValidLocaleTag("not_a_locale"), false);
});

test("P0 rejects undeclared workflow and adapter references", () => {
  const invalidWorkflow = structuredClone(boutiqueHotelBlueprint);
  invalidWorkflow.services[1].workflowId = "missing-workflow";
  assert.throws(() => validateFactoryBlueprint(invalidWorkflow), /P0_FACTORY_UNKNOWN_WORKFLOW/);

  const invalidIntegration = structuredClone(allInclusiveResortBlueprint);
  invalidIntegration.workflows[0].steps[1].integrationId = "missing-adapter";
  assert.throws(() => validateFactoryBlueprint(invalidIntegration), /P0_FACTORY_UNKNOWN_INTEGRATION/);
});

test("P0 rejects duplicate tenant identities and explicit hotel-specific deployment forks", () => {
  const duplicatePortfolio = structuredClone(internationalGroupPortfolio);
  duplicatePortfolio.properties[1].property.slug = duplicatePortfolio.properties[0].property.slug;
  assert.throws(() => validateFactoryPortfolio(duplicatePortfolio), /P0_FACTORY_DUPLICATE/);

  const forkedHotel = structuredClone(boutiqueHotelBlueprint);
  forkedHotel.requiresDedicatedDeployment = true;
  assert.throws(() => validateFactoryBlueprint(forkedHotel), /P0_FACTORY_FORBIDDEN_HOTEL_FORK/);
});

test("P0 exposes reusable service and workflow primitives", () => {
  assert.deepEqual([...FACTORY_SERVICE_MODES].sort(), ["configurable", "core", "custom"]);
  for (const action of ["assign", "condition", "approval", "wait", "billing", "notification", "escalation", "integration_action", "complete"]) {
    assert.ok(FACTORY_WORKFLOW_ACTIONS.includes(action), `Missing workflow action ${action}`);
  }
});

test("P0 architecture contract locks zero-code onboarding and website separation", async () => {
  const source = await readProjectFile("docs/P0-PRODUCT-FACTORY-ARCHITECTURE-CONTRACT.md");

  assertContains(source, "new hotel as **data/configuration**, not as a new software project");
  assertContains(source, "handwritten SQL during normal onboarding");
  assertContains(source, "an `if hotel === ...` runtime fork");
  assertContains(source, "Onboarding is idempotent");
  assertContains(source, "Website/commercial acquisition is a separate project layer");
  assertNotContains(source, "Europe/Sofia` fallback");
});
