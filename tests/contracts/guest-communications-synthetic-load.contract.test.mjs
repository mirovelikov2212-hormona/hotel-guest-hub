import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const delivery = await readFile("lib/server/guest-communications-delivery.ts", "utf8");
const route = await readFile("app/api/internal/factory/guest-communications-synthetic-dispatch/route.ts", "utf8");

test("synthetic communications transport is Preview, secret, Sandbox and test-data only", () => {
  assert.match(route, /VERCEL_ENV !== "preview"/);
  assert.match(route, /FACTORY_LOAD_TEST_SECRET/);
  assert.match(route, /x-stayhub-factory-load-secret/);
  assert.match(route, /\.eq\("is_sandbox", true\)/);
  assert.match(delivery, /if \(!subscription\.is_test\)/);
  assert.match(delivery, /non_test_subscription_blocked/);
  assert.match(delivery, /synthetic_no_provider|syntheticTransport/);
});

test("fanout remains bounded, idempotent and records per-device evidence", () => {
  assert.match(delivery, /Math\.min\(50/);
  assert.match(delivery, /Promise\.all\(subscriptions\.slice/);
  assert.match(delivery, /onConflict: "communication_id,subscription_id"/);
  assert.match(delivery, /if \(!evidence \|\| evidence\.status === "sent"\)/);
  assert.match(delivery, /writeDeliveryResult/);
  assert.match(delivery, /finalizeCommunication/);
});

test("normal delivery still rejects Sandbox and excludes test identities", () => {
  assert.match(delivery, /input\.hotel\.is_sandbox && !mode\.allowSandbox/);
  assert.match(delivery, /if \(!includeTest\) query = query\.or\("is_test\.is\.null,is_test\.eq\.false"\)/);
});
