import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const authority = fs.readFileSync("lib/server/guest-request-authority.mjs", "utf8");
const route = fs.readFileSync("app/api/guest/request-create/route.ts", "utf8");

test("configured staff labels bypass per-request AI title translation", () => {
  assert.match(authority, /const staffLabels = normalizeStaffLabels\(def\?\.staffLabel\)/);
  assert.match(route, /configuredStaffTitleEn \? Promise\.resolve\(configuredStaffTitleEn\)/);
  assert.match(route, /configuredStaffTitleDe \? Promise\.resolve\(configuredStaffTitleDe\)/);
  assert.ok(route.indexOf("configuredStaffTitleEn") < route.indexOf("after(async () =>"));
});
