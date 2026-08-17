import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelPath = new URL("../../app/control-plane/CommercialLifecyclePanel.tsx", import.meta.url);
const pagePath = new URL("../../app/control-plane/page.tsx", import.meta.url);
const packagePath = new URL("../../package.json", import.meta.url);

const [panel, page, pkgRaw] = await Promise.all([
  readFile(panelPath, "utf8"),
  readFile(pagePath, "utf8"),
  readFile(packagePath, "utf8"),
]);
const pkg = JSON.parse(pkgRaw);

test("P3.2 exposes the exact P3.1 commercial state-machine actions in the operator UI", () => {
  for (const action of [
    "initialize",
    "start_trial",
    "extend_trial",
    "convert_to_customer",
    "suspend",
    "resume",
    "end",
  ]) {
    assert.match(panel, new RegExp(`"${action}"`));
  }
  assert.match(panel, /Start 14-day trial/);
  assert.match(panel, /Стартирай 14-дневен тест/);
  assert.match(panel, /min=\{1\}/);
  assert.match(panel, /max=\{60\}/);
});

test("P3.2 browser UI calls only the same-origin Control Plane API and never imports Supabase", () => {
  assert.match(panel, /fetch\("\/api\/control-plane\/commercial\/property-lifecycle"/);
  assert.match(panel, /method: "POST"/);
  assert.match(panel, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(panel, /@supabase/);
  assert.doesNotMatch(panel, /supabaseAdmin/);
});

test("P3.2 preserves optimistic version CAS and action-specific payloads", () => {
  assert.match(panel, /body\.expectedVersion = commercial\.version/);
  assert.match(panel, /body\.trialDays = days/);
  assert.match(panel, /body\.trialEndsAt = parsed\.toISOString\(\)/);
  assert.match(panel, /body\.planCode = planCode\.trim\(\)/);
});

test("P3.2 requires an audit reason and explicit confirmation before every mutation", () => {
  assert.match(panel, /reason\.trim\(\)\.length < 3/);
  assert.match(panel, /if \(!confirmed\)/);
  assert.match(panel, /Потвърждавам изрично търговската промяна/);
  assert.match(panel, /I explicitly confirm the commercial change/);
  assert.match(panel, /disabled=\{submitting \|\| !confirmed\}/);
});

test("P3.2 fail-closes entitlement-granting actions when Production is not LIVE", () => {
  assert.match(panel, /requiresLiveProduction/);
  assert.match(panel, /\["start_trial", "convert_to_customer", "resume"\]/);
  assert.match(panel, /disabled=\{blocked\}/);
  assert.match(panel, /Production трябва първо да е LIVE/);
  assert.match(panel, /Production must be LIVE first/);
});

test("P3.2 renders action availability from commercial status rather than a hotel allowlist", () => {
  assert.match(panel, /state\.status === "pending"/);
  assert.match(panel, /state\.status === "trial"/);
  assert.match(panel, /state\.status === "active_customer"/);
  assert.match(panel, /state\.status === "suspended"/);
  assert.doesNotMatch(panel, /aquamarin/i);
  assert.doesNotMatch(panel, /kranevo/i);
});

test("P3.2 makes trial time visible and refreshes server authority after a successful transition", () => {
  assert.match(panel, /daysRemaining/);
  assert.match(panel, /commercial\.status === "trial"/);
  assert.match(panel, /\{copy\.trial\}: <strong>\{daysRemaining\}<\/strong> \{copy\.daysLeft\}/);
  assert.match(panel, /router\.refresh\(\)/);
});

test("P3.2 Control Plane page remains authenticated and keeps the P1.2 read-only registry contract", () => {
  assert.match(page, /getCurrentPlatformAdminSession/);
  assert.match(page, /if \(!authority\) redirect\(controlPlaneHref\("\/control-plane\/login", lang\)\)/);
  assert.match(page, /Read only registry/);
  assert.match(page, /CommercialLifecyclePanel/);
  assert.match(page, /environment\.environment === "production" && environment\.active/);
});

test("P3.2 explicitly documents that commercial UI does not silently own runtime access", () => {
  assert.match(panel, /Commercial entitlement is separate from technical runtime/);
  assert.match(panel, /Търговското право за достъп е отделно от техническия runtime/);
  assert.match(panel, /enforced automatically in Production/);
});

test("P3.2 is wired into the full contract suite", () => {
  assert.match(pkg.scripts["test:contracts"], /p3-2-commercial-control-plane-ui\.contract\.test\.mjs/);
  assert.equal(
    pkg.scripts["test:p3-2"],
    "node --test tests/contracts/p3-2-commercial-control-plane-ui.contract.test.mjs",
  );
});
