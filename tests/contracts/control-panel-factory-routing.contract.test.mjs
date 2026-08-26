import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  FACTORY_STANDARD_CATALOG_VERSION,
  FACTORY_STANDARD_CORE_SERVICES,
} from "../../lib/product-factory/factory-standard-catalog.mjs";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const [nextHelper, loginPage, loginRoute, controlPanel, factoryPage, smartWizard, advancedPage] = await Promise.all([
  read("lib/control-plane-next.ts"),
  read("app/control-plane/login/page.tsx"),
  read("app/api/control-plane/login/route.ts"),
  read("app/control-panel/page.tsx"),
  read("app/hotel-factory/new/page.tsx"),
  read("app/hotel-factory/new/HotelManagerOnboardingWizard.tsx"),
  read("app/hotel-factory/advanced/new/page.tsx"),
]);

test("admin login preserves an allowlisted workspace destination and rejects open redirects", () => {
  assert.match(nextHelper, /ALLOWED_ADMIN_PATHS/);
  assert.match(nextHelper, /"\/control-panel"/);
  assert.match(nextHelper, /"\/hotel-factory"/);
  assert.match(nextHelper, /raw\.startsWith\("\/\/"\)/);
  assert.match(loginPage, /nextTarget/);
  assert.match(loginPage, /if \(existing\) redirect\(nextTarget\)/);
  assert.match(loginRoute, /requestNext\(req\)/);
  assert.match(loginRoute, /new URL\(requestNext\(req\), req\.url\)/);
});

test("Control Panel and Hotel Factory are separate user-facing workspaces", () => {
  assert.match(controlPanel, /StayHub Control Panel/);
  assert.match(controlPanel, /href=\{`\/hotel-factory\/new\?lang=\$\{lang\}`\}/);
  assert.match(factoryPage, /StayHub Hotel Factory/);
  assert.match(factoryPage, /HotelManagerOnboardingWizard/);
  assert.doesNotMatch(factoryPage, /FactoryBlueprintWizard/);
  assert.match(factoryPage, /href=\{`\/control-panel\?lang=\$\{lang\}`\}/);
});

test("Hotel Factory Smart Setup hides operator identifiers and generates safe blueprint fields", () => {
  assert.match(smartWizard, /StayHub Smart Setup/);
  assert.match(smartWizard, /SAFE DRAFT MODE/);
  assert.match(smartWizard, /hotelSlug \? `\$\{hotelSlug\}-org`/);
  assert.match(smartWizard, /publicSlug: hotelSlug/);
  assert.match(smartWizard, /timezone: country\[3\]/);
  assert.match(smartWizard, /integrations: \[\], workflows: \[\]/);
  assert.match(smartWizard, /keepProductionInactive: true/);
  assert.match(smartWizard, /keepSandboxInactive: true/);
  assert.match(smartWizard, /activateLive: false/);
  assert.doesNotMatch(smartWizard, /Organization ID \/ slug|Internal hotel slug|IANA timezone/);
});

test("technical Product Factory remains available only as explicit Advanced mode", () => {
  assert.match(factoryPage, /\/hotel-factory\/advanced\/new/);
  assert.match(advancedPage, /FactoryBlueprintWizard/);
  assert.match(advancedPage, /StayHub Hotel Factory · Advanced/);
  assert.match(advancedPage, /\/hotel-factory\/new\?lang=/);
});

test("Hotel Factory unauthenticated flow returns to Hotel Factory after login", () => {
  assert.match(factoryPage, /normalizeAdminNextTarget\(`\/hotel-factory\/new\?lang=\$\{lang\}`/);
  assert.match(factoryPage, /\/control-plane\/login\?lang=\$\{lang\}&next=/);
  assert.match(advancedPage, /normalizeAdminNextTarget\(`\/hotel-factory\/advanced\/new\?lang=\$\{lang\}`/);
});


test("Hotel Factory Smart Setup consumes versioned Core catalogs instead of parallel lists", () => {
  assert.equal(FACTORY_STANDARD_CATALOG_VERSION, "factory-standard-v2");
  assert.ok(FACTORY_STANDARD_CORE_SERVICES.length >= 30);
  assert.match(smartWizard, /FACTORY_STANDARD_CORE_SERVICES/);
  assert.match(smartWizard, /FACTORY_COMMON_LANGUAGE_OPTIONS/);
  assert.match(smartWizard, /const CORE_SERVICES/);
  assert.doesNotMatch(smartWizard, /const SERVICES: ServiceTemplate/);
  assert.doesNotMatch(smartWizard, /const LANGUAGES = \[\s*\["bg"/);
  assert.match(smartWizard, /DEFAULT_SERVICE_IDS/);
  assert.match(smartWizard, /starterDefault === true/);
  assert.match(smartWizard, /catalogVersion: FACTORY_STANDARD_CATALOG_VERSION/);
  assert.match(smartWizard, /catalogRef: service\.id/);
  assert.match(smartWizard, /title: \{ \.\.\.service\.title \}/);
  assert.match(smartWizard, /description: \{ \.\.\.service\.description \}/);
  assert.match(smartWizard, /staffLabel: \{ \.\.\.service\.staffLabel \}/);
  assert.match(smartWizard, /success: \{ \.\.\.service\.success \}/);
  assert.match(smartWizard, /requestKind: service\.requestKind/);
  assert.match(smartWizard, /requiresQuantity: Boolean\(service\.requiresQuantity\)/);
  assert.match(smartWizard, /requiresTime: Boolean\(service\.requiresTime\)/);
  assert.match(smartWizard, /intentTags: \[\.\.\.\(service\.intentTags/);
  assert.match(smartWizard, /Core каталог|Core catalog/);
  assert.match(smartWizard, /още опции|more options/);
});
