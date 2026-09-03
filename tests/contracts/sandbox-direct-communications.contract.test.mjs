import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("sandbox direct communications expose test stays without weakening Production filtering", async () => {
  const staffRoute = await readProjectFile("app/api/staff/guest-direct-communications/route.ts");
  const delivery = await readProjectFile("lib/server/guest-direct-communications-delivery.ts");
  const migration = await readProjectFile("supabase/migrations/20260903070000_allow_sandbox_test_direct_communications.sql");

  assert.match(staffRoute, /access\.hotel\.isSandbox/);
  assert.match(staffRoute, /is_test\.eq\.true/);
  assert.match(staffRoute, /is_test\.eq\.false/);
  assert.match(delivery, /sandbox_delivery_disabled/);
  assert.match(migration, /v_hotel_is_sandbox/);
  assert.match(migration, /new\.audience_type = 'direct_guest'/);
  assert.match(migration, /coalesce\(gs\.is_test, false\) = false or v_hotel_is_sandbox = true/);
  assert.match(migration, /coalesce\(gsd\.is_test, false\) = false/);
  assert.ok(!migration.includes("or v_hotel_is_sandbox = true);\n    if not found then\n      raise exception using errcode = '23514', message = 'GUEST_REQUEST_CONVERSATION_SCOPE_MISMATCH'"));
});
