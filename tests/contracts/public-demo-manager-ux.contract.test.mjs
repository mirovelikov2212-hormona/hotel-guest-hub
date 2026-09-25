import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("Guest Hub keeps the real department labels and never invents a Contact us online section", async () => {
  const guestHub = await source("components/GuestHub.tsx");
  const guide = await source("components/guest/DemoJourneyGuide.tsx");
  const marketing = await source("components/marketing/MarketingPage.tsx");

  for (const text of [guestHub, guide, marketing]) {
    assert.doesNotMatch(text, /Свържи се с нас онлайн/i);
    assert.doesNotMatch(text, /Contact us online/i);
    assert.doesNotMatch(text, /Kontakt online/i);
  }

  const blockStart = guestHub.indexOf("const legacyPremiumTiles");
  const reception = guestHub.indexOf('{ id: "reception"', blockStart);
  const housekeeping = guestHub.indexOf('{ id: "housekeeping"', blockStart);
  const maintenance = guestHub.indexOf('{ id: "maintenance"', blockStart);
  const info = guestHub.indexOf('{ id: "info"', blockStart);

  assert.ok(blockStart >= 0);
  assert.ok(reception > blockStart);
  assert.ok(housekeeping > reception);
  assert.ok(maintenance > housekeeping);
  assert.ok(info > maintenance);
  assert.match(guestHub, /const factoryPremiumTiles:[\s\S]*?\.\.\.factoryConfiguredDepartmentTiles,[\s\S]*?id: "info"/);
});

test("demo Manager includes TEST requests in demo counters but real hotels keep test exclusion", async () => {
  const manager = await source("components/staff/pages/ManagerPageContent.tsx");
  assert.match(manager, /const isDemoHotel = String\(hotelSlug \|\| ""\).*=== "demo"/s);
  assert.match(
    manager,
    /isDemoHotel \? requests : requests\.filter\(\(request\) => !request\.isTest\)/,
  );
  assert.match(manager, /grid gap-4 md:grid-cols-2 xl:grid-cols-3/);
});

test("every routed Manager submodule provides a path back to the Manager dashboard", async () => {
  const backLink = await source("components/staff/ManagerModuleBackLink.tsx");
  const development = await source("components/staff/pages/StaffDevelopmentRoutePage.tsx");
  const revenue = await source("app/staff/[hotelSlug]/manager/revenue/page.tsx");
  const value = await source("app/staff/[hotelSlug]/manager/value/page.tsx");
  const pinRepair = await source("app/staff/[hotelSlug]/manager/reception-pin-repair/page.tsx");

  assert.match(backLink, /Назад към Manager панела/);
  assert.match(backLink, /\/staff\/\$\{hotelSlug\}\/manager/);
  for (const text of [development, revenue, value, pinRepair]) {
    assert.match(text, /ManagerModuleBackLink/);
  }
});

test("problem reporting uses human-readable choice grids instead of raw technical module and severity controls", async () => {
  const incident = await source("components/staff/ManagerProblemReportCard.tsx");
  assert.match(incident, /Къде се случва\?/);
  assert.match(incident, /Какъв е проблемът\?/);
  assert.match(incident, /Колко е спешно\?/);
  assert.match(incident, /Guest Hub/);
  assert.match(incident, /Камериерки/);
  assert.match(incident, /Критично · работата е блокирана/);
  assert.doesNotMatch(incident, /<select/);
  assert.doesNotMatch(incident, /staff_operations/);
});

test("Revenue and Value copy explicitly defines scope and excludes room-revenue expectations", async () => {
  const revenueCard = await source("components/staff/RevenueAccessCard.tsx");
  const revenue = await source("components/staff/revenue/RevenueDashboard.tsx");
  const valueCard = await source("components/staff/GostayaValueAccessCard.tsx");
  const value = await source("components/staff/value/GostayaValueDashboard.tsx");

  assert.match(revenueCard, /Приходи от допълнителни услуги/);
  assert.match(revenue, /цени на стаи, ADR, RevPAR, Occupancy или общия приход на хотела/);
  assert.match(valueCard, /Оперативна стойност и спестено време/);
  assert.match(value, /Direct Routing/);
  assert.match(value, /Reception Bypass/);
  assert.match(value, /AI Containment/);
  assert.match(value, /не е хотелски P&L и не включва приходите от стаи/);
});

test("Reception exposes real direct and broadcast guest communication workspaces", async () => {
  const reception = await source("components/staff/pages/ReceptionPageContent.tsx");
  assert.match(reception, /GuestDirectCommunicationsWorkspace/);
  assert.match(reception, /GuestCommunicationsWorkspace/);
  assert.match(reception, /id="reception-direct-message"/);
  assert.match(reception, /id="reception-broadcast-message"/);
});

test("public demo guide covers the full eight-step guest lifecycle", async () => {
  const guide = await source("components/guest/DemoJourneyGuide.tsx");
  const guestHub = await source("components/GuestHub.tsx");
  const endStay = await source("app/api/guest/demo/end-stay/route.ts");

  assert.match(guide, /Стъпка 1 · Потвърди demo стаята/);
  assert.match(guide, /Стъпка 4 · Обработи заявката и провери Manager/);
  assert.match(guide, /Стъпка 5 · Изпрати лично съобщение/);
  assert.match(guide, /Стъпка 6 · Изпрати съобщение до всички/);
  assert.match(guide, /Стъпка 7 · Покажи анкетата/);
  assert.match(guide, /Стъпка 8 · Приключи престоя/);
  assert.match(guide, /\{step\}\/8/);
  assert.match(guestHub, /url\.searchParams\.set\("survey", "force"\)/);
  assert.match(guestHub, /fetch\("\/api\/guest\/demo\/end-stay"/);

  assert.match(endStay, /hotelSlug !== "demo"/);
  assert.match(endStay, /result\.stay\.room \|\| ""\) !== "901"/);
  assert.match(endStay, /\.eq\("room_number", "901"\)/);
  assert.match(endStay, /\.eq\("is_test", true\)/);
  assert.match(endStay, /status: "ended"/);
});

test("demo broadcasts are Hub-only and do not enter the normal external push queue", async () => {
  const route = await source("app/api/staff/guest-communications/route.ts");
  const direct = await source("app/api/staff/guest-direct-communications/route.ts");

  assert.match(route, /access\.hotel\.slug === "demo"/);
  assert.match(route, /publicDemoHubOnly \? "sent" : "queued"/);
  assert.match(route, /demo_hub_only_no_external_push/);
  assert.match(route, /access\.hotel\.isSandbox \|\| access\.hotel\.slug === "demo"/);
  assert.match(direct, /access\.hotel\.isSandbox \|\| access\.hotel\.slug === "demo"/);
});

test("marketing pilot evidence title is hard-split into two lines", async () => {
  const marketing = await source("components/marketing/MarketingPage.tsx");
  assert.match(marketing, /evidenceTitle: "Реален сезон\.\\nРеални данни\."/);
  assert.match(marketing, /c\.evidenceTitle\.split\("\\n"\)/);
});
