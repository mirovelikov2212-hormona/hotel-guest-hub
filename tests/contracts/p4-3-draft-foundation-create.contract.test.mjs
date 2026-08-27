import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const wizardPath = new URL("../../app/control-plane/factory/new/FactoryBlueprintWizard.tsx", import.meta.url);
const panelPath = new URL("../../app/control-plane/factory/new/FactoryFoundationCreatePanel.tsx", import.meta.url);
const onboardingRoutePath = new URL("../../app/api/control-plane/onboarding/route.ts", import.meta.url);
const serverPath = new URL("../../lib/server/factory-onboarding.ts", import.meta.url);
const [wizard, panel, onboardingRoute, server] = await Promise.all([
  readFile(wizardPath, "utf8"),
  readFile(panelPath, "utf8"),
  readFile(onboardingRoutePath, "utf8"),
  readFile(serverPath, "utf8"),
]);

test("P4.3 uses the existing P2.1 transaction instead of adding a second tenant-creation authority", () => {
  assert.match(onboardingRoute, /beginFactoryOnboarding/);
  assert.match(server, /supabaseAdmin\.rpc\("begin_factory_onboarding_v1"/);
  assert.doesNotMatch(onboardingRoute, /supabaseAdmin|\.rpc\(|\.from\(/);
  assert.doesNotMatch(panel, /supabase|beginFactoryOnboarding/);
});

test("P4.3 onboarding route still requires same-origin Platform Admin authority", () => {
  assert.match(onboardingRoute, /enforceControlPlaneSameOrigin\(req\)/);
  assert.match(onboardingRoute, /getCurrentPlatformAdminSession\(\)/);
  assert.match(onboardingRoute, /MAX_BODY_BYTES = 262_144/);
  assert.match(onboardingRoute, /error: "unauthorized"/);
  assert.doesNotMatch(onboardingRoute, /manager_pin|staff_sessions/);
});

test("P4.3 requires an exact explicit draft-only approval object", () => {
  assert.match(onboardingRoute, /hasExactFoundationApproval/);
  assert.match(onboardingRoute, /createDraftTenant === true/);
  assert.match(onboardingRoute, /keepProductionInactive === true/);
  assert.match(onboardingRoute, /keepSandboxInactive === true/);
  assert.match(onboardingRoute, /publishRevision === false/);
  assert.match(onboardingRoute, /activateLive === false/);
  assert.match(onboardingRoute, /error: "approval_required"/);
});

test("P4.3 recomputes the normalized blueprint hash before the P2.1 mutation", () => {
  const prepareIndex = onboardingRoute.indexOf("const prepared = prepareFactoryOnboarding");
  const staleIndex = onboardingRoute.indexOf("prepared.blueprintHash !== expectedBlueprintHash");
  const beginIndex = onboardingRoute.indexOf("const result = await beginFactoryOnboarding");
  assert.ok(prepareIndex >= 0 && staleIndex > prepareIndex && beginIndex > staleIndex);
  assert.match(onboardingRoute, /BLUEPRINT_HASH_PATTERN/);
  assert.match(onboardingRoute, /error: "stale_preflight"/);
  assert.match(onboardingRoute, /409/);
});

test("P4.3 binds the create panel to the exact successful client preflight snapshot", () => {
  assert.match(wizard, /preflightBlueprintJson/);
  assert.match(wizard, /const\s+blueprintJson\s*=\s*JSON\.stringify\(blueprint\)/);
  assert.match(wizard, /preflightBlueprintJson\s*===\s*blueprintJson/);
  assert.match(wizard, /setPreflightBlueprintJson\(blueprintJson\)/);
  assert.match(wizard, /preflightCurrent\s*&&\s*preflight\?\.identities\s*&&\s*preflight\.blueprintHash/);
});

test("P4.3 invalidates preflight when room inventory fields are edited", () => {
  for (const setter of ["setRangeStart", "setRangeEnd", "setPadTo", "setPrefix", "setSuffix", "setExplicitRooms"]) {
    assert.match(wizard, new RegExp(`${setter}\\(event\\.target\\.value\\);\\s*invalidate\\(\\);`));
  }
});

test("P4.3 generates one retry-stable idempotency key per mounted approved preflight", () => {
  assert.match(panel, /useState\(\(\) => `control-plane:\$\{crypto\.randomUUID\(\)\}`\)/);
  assert.match(panel, /idempotencyKey,/);
  assert.match(panel, /retry safely replays a transaction/);
  assert.doesNotMatch(panel, /setIdempotencyKey/);
});

test("P4.3 browser sends the exact hash and draft-only approval to the single onboarding API", () => {
  assert.match(panel, /fetch\("\/api\/control-plane\/onboarding"/);
  assert.match(panel, /expectedBlueprintHash,/);
  assert.match(panel, /approval: FOUNDATION_APPROVAL/);
  assert.match(panel, /createDraftTenant: true/);
  assert.match(panel, /keepProductionInactive: true/);
  assert.match(panel, /keepSandboxInactive: true/);
  assert.match(panel, /publishRevision: false/);
  assert.match(panel, /activateLive: false/);
});

test("P4.3 requires an operator checkbox and never chains later lifecycle mutations", () => {
  assert.match(panel, /type="checkbox"/);
  assert.match(panel, /disabled=\{!confirmed \|\| creating\}/);
  assert.doesNotMatch(panel, /core-resources|operational-resources|sandbox-certification|production-publication|production-live-activation|commercial\/property-lifecycle/);
});

test("P4.3 success state is explicitly draft and inactive", () => {
  assert.match(onboardingRoute, /propertyLifecycle: "draft"/);
  assert.match(onboardingRoute, /productionActive: false/);
  assert.match(onboardingRoute, /sandboxActive: false/);
  assert.match(onboardingRoute, /revisionPublished: false/);
  assert.match(onboardingRoute, /liveActivated: false/);
  assert.match(panel, /Property: DRAFT/);
  assert.match(panel, /Production: INACTIVE/);
  assert.match(panel, /Sandbox: INACTIVE/);
});
