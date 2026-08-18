import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const wizardPath = new URL("../../app/control-plane/factory/new/FactoryBlueprintWizard.tsx", import.meta.url);
const routePath = new URL("../../app/api/control-plane/onboarding/preflight/route.ts", import.meta.url);
const [wizard, route] = await Promise.all([
  readFile(wizardPath, "utf8"), readFile(routePath, "utf8"),
]);

test("P4.2 expands the bilingual wizard to five steps", () => {
  assert.match(wizard, /Услуги · Workflows · Integrations/);
  assert.match(wizard, /Services · Workflows · Integrations/);
  assert.match(wizard, /sm:grid-cols-5/);
  assert.match(wizard, /step===3|step === 3/);
  assert.match(wizard, /step===4|step === 4/);
});

test("P4.2 exposes exactly the Product Factory service modes and priorities", () => {
  assert.match(wizard, /\["core","configurable","custom"\]|\["core", "configurable", "custom"\]/);
  assert.match(wizard, /\["low","normal","high","urgent"\]|\["low", "normal", "high", "urgent"\]/);
  assert.match(wizard, /priorityDefault/);
});

test("P4.2 workflow builder uses only approved primitive action families", () => {
  for (const action of ["assign","condition","approval","wait","billing","notification","escalation","integration_action","complete"]) {
    assert.match(wizard, new RegExp(`"${action}"`));
  }
  assert.match(wizard, /WORKFLOW_ACTIONS\.map/);
});

test("P4.2 builds credential-free integration placeholders", () => {
  assert.match(wizard, /adapterKey/);
  assert.match(wizard, /kind/);
  assert.match(wizard, /integrations:integrations\.map|integrations: integrations\.map/);
  assert.doesNotMatch(wizard, /type="password"/i);
  assert.doesNotMatch(wizard, /\b(apiKey|accessToken|clientSecret|passwordValue|credentialValue)\b/);
});

test("P4.2 services reference tenant-defined departments, workflows and integrations", () => {
  assert.match(wizard, /departmentId:optionalRef\(s\.departmentId\)|departmentId: optionalRef\(s\.departmentId\)/);
  assert.match(wizard, /workflowId:optionalRef\(s\.workflowId\)|workflowId: optionalRef\(s\.workflowId\)/);
  assert.match(wizard, /integrationId:optionalRef\(s\.integrationId\)|integrationId: optionalRef\(s\.integrationId\)/);
  assert.match(wizard, /departmentOptions/);
  assert.match(wizard, /workflowOptions/);
  assert.match(wizard, /integrationOptions/);
});

test("P4.2 workflow steps can reference declared departments and integrations", () => {
  assert.match(wizard, /steps:w\.steps\.map|steps: w\.steps\.map/);
  assert.match(wizard, /patchWorkflowStep/);
  assert.match(wizard, /departmentId:optionalRef\(s\.departmentId\)|departmentId: optionalRef\(s\.departmentId\)/);
  assert.match(wizard, /integrationId:optionalRef\(s\.integrationId\)|integrationId: optionalRef\(s\.integrationId\)/);
});

test("P4.2 removes dangling references when operational resources are deleted", () => {
  assert.match(wizard, /removeDepartment/);
  assert.match(wizard, /removeIntegration/);
  assert.match(wizard, /removeWorkflow/);
  assert.match(wizard, /departmentId:""|departmentId: ""/);
  assert.match(wizard, /integrationId:""|integrationId: ""/);
  assert.match(wizard, /workflowId:""|workflowId: ""/);
});

test("P4.2 still uses only the P4.1 preflight mutation boundary", () => {
  assert.match(wizard, /fetch\("\/api\/control-plane\/onboarding\/preflight"/);
  assert.doesNotMatch(wizard, /fetch\("\/api\/control-plane\/onboarding"\s*,/);
  assert.doesNotMatch(wizard, /production-live-activation|sandbox-certification|projectFactoryOperationalResources|beginFactoryOnboarding/);
  assert.match(route, /prepareFactoryOnboarding/);
  assert.match(route, /validateFactoryBlueprint/);
});

test("P4.2 tells operators no tenant or credentials are created", () => {
  assert.match(wizard, /P4\.2 не създава хотел и не записва credentials/);
  assert.match(wizard, /P4\.2 does not create a hotel or store credentials/);
});
