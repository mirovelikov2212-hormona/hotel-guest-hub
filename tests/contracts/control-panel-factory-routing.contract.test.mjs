import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const [nextHelper, loginPage, loginRoute, controlPanel, factoryPage] = await Promise.all([
  read("lib/control-plane-next.ts"),
  read("app/control-plane/login/page.tsx"),
  read("app/api/control-plane/login/route.ts"),
  read("app/control-panel/page.tsx"),
  read("app/hotel-factory/new/page.tsx"),
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
  assert.match(factoryPage, /FactoryBlueprintWizard/);
  assert.match(factoryPage, /href=\{`\/control-panel\?lang=\$\{lang\}`\}/);
});

test("Hotel Factory unauthenticated flow returns to Hotel Factory after login", () => {
  assert.match(factoryPage, /normalizeAdminNextTarget\(`\/hotel-factory\/new\?lang=\$\{lang\}`/);
  assert.match(factoryPage, /\/control-plane\/login\?lang=\$\{lang\}&next=/);
});
