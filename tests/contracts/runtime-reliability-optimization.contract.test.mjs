import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const requestRoute = await readFile("app/api/guest/request-create/route.ts", "utf8");
const surveyRoute = await readFile("app/api/guest/day3-survey/route.ts", "utf8");
const massageRoute = await readFile("app/api/guest/massages/route.ts", "utf8");
const delivery = await readFile("lib/server/guest-communications-delivery.ts", "utf8");
const migration = await readFile("supabase/migrations/20260901183650_guest_communications_delivery_recovery.sql", "utf8");

test("guest request and survey persist before asynchronous translation and push", () => {
  for (const source of [requestRoute, surveyRoute]) {
    assert.match(source, /from\("guest_(requests|surveys)"\)[\s\S]*\.insert/);
    assert.match(source, /after\(async \(\) =>/);
    assert.match(source, /translation_status|translationStatus/);
  }
  assert.ok(requestRoute.indexOf('.from("guest_requests")\n      .insert') < requestRoute.indexOf("after(async () =>"));
  assert.ok(surveyRoute.indexOf('.from("guest_surveys")\n      .insert') < surveyRoute.indexOf("after(async () =>"));
});

test("critical write paths emit structured stage timing without guest content", () => {
  for (const source of [requestRoute, surveyRoute, massageRoute]) {
    assert.match(source, /createApiStageTiming/);
    assert.match(source, /timing\.mark/);
    assert.match(source, /timing\.finish\("success"/);
    assert.doesNotMatch(source, /timing\.finish\([^\n]+note|timing\.finish\([^\n]+body/);
  }
});

test("communications recovery is bounded, delayed and dead-letters exhausted work", () => {
  assert.match(migration, /delivery_attempts integer not null default 0/);
  assert.match(migration, /next_delivery_attempt_at timestamptz/);
  assert.match(migration, /dead_lettered_at timestamptz/);
  assert.match(delivery, /maxAttempts \|\| 3/);
  assert.match(delivery, /Math\.min\(30, 2 \*\*/);
  assert.match(delivery, /status: "failed"/);
  assert.match(delivery, /dead_lettered_at/);
  assert.match(delivery, /next_delivery_attempt_at\.lte/);
  assert.match(delivery, /\.eq\("delivery_attempts", attempts\)/);
});
