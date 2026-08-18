import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("../../app/control-plane/factory/new/page.tsx", import.meta.url);
const wizardPath = new URL("../../app/control-plane/factory/new/FactoryBlueprintWizard.tsx", import.meta.url);
const panelPath = new URL("../../app/control-plane/factory/new/FactoryFoundationCreatePanel.tsx", import.meta.url);
const routePath = new URL("../../app/api/control-plane/onboarding/preflight/route.ts", import.meta.url);
const packagePath = new URL("../../package.json", import.meta.url);
const [page, wizard, panel, route, packageRaw] = await Promise.all([
  readFile(pagePath, "utf8"), readFile(wizardPath, "utf8"), readFile(panelPath, "utf8"), readFile(routePath, "utf8"), readFile(packagePath, "utf8"),
]);
const pkg = JSON.parse(packageRaw);

test("P4.1 workspace is Platform Admin authenticated and preserves BG/EN", () => {
  assert.match(page, /getCurrentPlatformAdminSession/);
  assert.match(page, /if \(!authority\) redirect\(`\/control-plane\/login\?lang=\$\{lang\}`\)/);
  assert.match(page, /normalizeControlPlaneLang/);
  assert.match(page, /href="\/control-plane\/factory\/new\?lang=bg"/);
  assert.match(page, /href="\/control-plane\/factory\/new\?lang=en"/);
  assert.match(page, /Нов хотел · Blueprint workspace/);
  assert.match(page, /New hotel · Blueprint workspace/);
});

test("P4.1 preflight stays same-origin, authenticated, bounded and mutation-free", () => {
  assert.match(route, /enforceControlPlaneSameOrigin\(req\)/);
  assert.match(route, /getCurrentPlatformAdminSession/);
  assert.match(route, /MAX_BODY_BYTES = 262_144/);
  assert.match(route, /prepareFactoryOnboarding/);
  assert.match(route, /validateFactoryBlueprint/);
  assert.doesNotMatch(route, /beginFactoryOnboarding/);
  assert.doesNotMatch(route, /supabaseAdmin|\.rpc\(|\.from\(/);
});

test("P4.1 parent wizard keeps preflight separate from the later explicit creation panel", () => {
  assert.match(wizard, /fetch\("\/api\/control-plane\/onboarding\/preflight"/);
  assert.match(wizard, /FactoryFoundationCreatePanel/);
  assert.doesNotMatch(wizard, /fetch\("\/api\/control-plane\/onboarding"\s*,/);
  assert.doesNotMatch(wizard, /production-live-activation|sandbox-certification|core-resources/);
  assert.doesNotMatch(wizard, /supabase|beginFactoryOnboarding/);
  assert.match(panel, /fetch\("\/api\/control-plane\/onboarding"/);
});

test("P4.1 still builds a real version 1 dual-environment Product Factory blueprint", () => {
  assert.match(wizard, /version:1|version: 1/);
  assert.match(wizard, /production:true|production: true/);
  assert.match(wizard, /sandbox:true|sandbox: true/);
  assert.match(wizard, /roomInventory/);
  assert.match(wizard, /departments:departments\.map|departments: departments\.map/);
  assert.match(wizard, /integrations:integrations\.map|integrations: integrations\.map/);
  assert.match(wizard, /workflows:workflows\.map|workflows: workflows\.map/);
  assert.match(wizard, /services:services\.map|services: services\.map/);
});

test("P4.1 supports range and explicit room inventories without a hotel-specific room assumption", () => {
  assert.match(wizard, /roomMode.*"range".*"explicit"/s);
  assert.match(wizard, /ranges:/);
  assert.match(wizard, /explicit:explicitRoomList\.map|explicit: explicitRoomList\.map/);
  assert.match(wizard, /padTo/);
  assert.match(wizard, /prefix/);
  assert.match(wizard, /suffix/);
  assert.doesNotMatch(wizard, /room 103|Aquamarine/i);
});

test("P4.1 keeps timezone and locale input tenant-defined", () => {
  assert.match(wizard, /timezone\.trim\(\)/);
  assert.match(wizard, /locales:localeList|locales: localeList/);
  assert.match(wizard, /placeholder="Europe\/Berlin"/);
  assert.match(wizard, /placeholder="de, en, bg"/);
  assert.doesNotMatch(wizard, /Europe\/Sofia/);
});

test("P4.1 supports generic departments, hours, and after-hours targets", () => {
  assert.match(wizard, /hoursMode:"24h"\|"window"|hoursMode: "24h" \| "window"/);
  assert.match(wizard, /afterHoursDepartmentId/);
  assert.match(wizard, /setDepartments/);
  assert.match(wizard, /removeDepartment/);
  assert.doesNotMatch(wizard, /housekeeping-default|maintenance-default/);
});

test("P4 workspace never collects credential values", () => {
  assert.doesNotMatch(wizard, /type="password"/i);
  assert.doesNotMatch(panel, /type="password"/i);
  assert.doesNotMatch(wizard + panel, /\b(apiKey|accessToken|clientSecret|passwordValue|credentialValue)\b/);
  assert.match(route, /P2_FACTORY_SECRET_FORBIDDEN/);
});

test("P4.1 blueprint authoring remains free of direct server mutation authority", () => {
  assert.match(wizard, /P4\.3 разрешава само audited P2\.1 foundation creation/);
  assert.match(wizard, /P4\.3 permits only audited P2\.1 foundation creation/);
  assert.doesNotMatch(wizard, /beginFactoryOnboarding|projectFactoryCoreResources|projectFactoryOperationalResources/);
});

test("P4.1 preflight returns deterministic future identities and blueprint hash", () => {
  assert.match(route, /blueprintHash: prepared\.blueprintHash/);
  assert.match(route, /identities: prepared\.identities/);
  assert.match(wizard, /preflight\.identities\.productionSlug/);
  assert.match(wizard, /preflight\.identities\.sandboxSlug/);
  assert.match(wizard, /preflight\.blueprintHash/);
});

test("P4.1 is wired into the full contract suite", () => {
  assert.match(pkg.scripts["test:contracts"], /p4-1-onboarding-workspace-blueprint-wizard\.contract\.test\.mjs/);
  assert.equal(pkg.scripts["test:p4-1"], "node --test tests/contracts/p4-1-onboarding-workspace-blueprint-wizard.contract.test.mjs");
});
