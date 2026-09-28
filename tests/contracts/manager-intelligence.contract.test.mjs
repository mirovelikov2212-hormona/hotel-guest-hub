import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL("../../" + path, import.meta.url), "utf8");
}

test("Manager Intelligence is a separately entitled Manager module and is visible in Demo", () => {
  const catalog = source("lib/commercial/product-module-entitlements.mjs");
  const server = source("lib/server/manager-intelligence.ts");
  const page = source("app/staff/[hotelSlug]/manager/intelligence/page.tsx");
  const card = source("components/staff/ManagerIntelligenceAccessCard.tsx");
  const manager = source("components/staff/pages/ManagerPageContent.tsx");

  assert.match(catalog, /"manager_intelligence"/);
  assert.match(catalog, /manager_intelligence: \["staff_operations"\]/);
  assert.match(server, /requireHotelPaidProductModuleAccess\(String\(hotel\.id\), "manager_intelligence"\)/);
  assert.match(page, /requireHotelPaidProductModuleAccess\(String\(access\.hotelId\), "manager_intelligence"\)/);
  assert.match(card, /Допълнителен платен модул/);
  assert.match(card, /\/api\/staff\/manager-intelligence/);
  assert.match(manager, /<ManagerIntelligenceAccessCard hotelSlug=\{hotelSlug\} \/>/);
});

test("Manager Intelligence grounds analysis in multiple hotel modules, not Staff Development alone", () => {
  const server = source("lib/server/manager-intelligence.ts");

  assert.match(server, /\.from\("guest_requests"\)/);
  assert.match(server, /\.from\("guest_surveys"\)/);
  assert.match(server, /\.from\("hub_events"\)/);
  assert.match(server, /\.from\("system_events"\)/);
  assert.match(server, /staff_training_assignments/);
  assert.match(server, /staff_assessment_attempts/);
  assert.match(server, /staff_hr_evaluations/);
  assert.match(server, /getHotelIntegrationConnections/);
  assert.match(server, /revenue_intelligence/);
  assert.match(server, /operational_ai/);
  assert.match(server, /staff_development/);
  assert.match(server, /integration_layer/);
});

test("Manager Intelligence keeps AI subordinate to verified facts and human management authority", () => {
  const server = source("lib/server/manager-intelligence.ts");

  assert.match(server, /Use only VERIFIED_HOTEL_SNAPSHOT/);
  assert.match(server, /Never invent events, revenue, causes, staff behavior, hotel policy or operational facts/);
  assert.match(server, /Do not make employment decisions or rank employees/);
  assert.match(server, /If a module is disabled, do not infer anything about it/);
  assert.match(server, /deterministic_fallback/);
  assert.match(server, /store: false/);
});

test("Manager Intelligence delivers live attention and a hotel-local morning brief", () => {
  const server = source("lib/server/manager-intelligence.ts");
  const morningRoute = source("app/api/cron/manager-intelligence-morning-brief/route.ts");
  const watchRoute = source("app/api/cron/manager-intelligence-watch/route.ts");
  const vercel = source("vercel.json");

  assert.match(server, /const MORNING_HOUR_LOCAL = 8/);
  assert.match(server, /localHour\(now, hotel\.timezone\)/);
  assert.match(server, /manager_intelligence_morning_brief/);
  assert.match(server, /manager_intelligence_live_alert/);
  assert.match(server, /sendManagerPushNotification/);
  assert.match(server, /alertRecentlyDelivered/);
  assert.match(morningRoute, /runManagerIntelligenceMorningBriefCron/);
  assert.match(watchRoute, /runManagerIntelligenceWatchCron/);
  assert.match(vercel, /\/api\/cron\/manager-intelligence-watch/);
  assert.match(vercel, /\/api\/cron\/manager-intelligence-morning-brief/);
});

test("Manager Intelligence UI exposes live signals, morning report, history and verified daily metrics", () => {
  const dashboard = source("components/staff/manager-intelligence/ManagerIntelligenceDashboard.tsx");
  const api = source("app/api/staff/manager-intelligence/route.ts");

  assert.match(dashboard, /Нужно внимание сега/);
  assert.match(dashboard, /Сутрешен отчет/);
  assert.match(dashboard, /Предишни сутрешни отчети/);
  assert.match(dashboard, /Вчера в числа/);
  assert.match(dashboard, /window\.setInterval\(\(\) => void load\(\), 60_000\)/);
  assert.match(api, /getManagerIntelligenceDashboard/);
  assert.match(api, /generateManagerMorningBrief/);
  assert.match(api, /enforceStaffSameOrigin\(req\)/);
});

test("new paid Manager Intelligence never leaks through legacy unmanaged Production compatibility", () => {
  const entitlements = source("lib/server/product-module-entitlements.ts");
  const manager = source("lib/server/manager-intelligence.ts");

  assert.match(entitlements, /entitlement\.commercial\.environment !== "production"/);
  assert.match(entitlements, /entitlement\.source === "full_trial"/);
  assert.match(entitlements, /return entitlement\.source === "explicit_config"/);
  assert.match(entitlements, /requireHotelPaidProductModuleAccess/);
  assert.match(manager, /hasHotelPaidProductModuleAccess\(entitlement, "manager_intelligence"\)/);
});

test("shared staff module availability does not advertise paid Manager Intelligence through legacy Production compatibility", () => {
  const availability = source("lib/server/staff-module-availability.ts");

  assert.match(availability, /hasHotelPaidProductModuleAccess/);
  assert.match(availability, /"manager_intelligence"/);
});
