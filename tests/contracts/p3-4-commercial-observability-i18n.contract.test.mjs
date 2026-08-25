import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const i18nPath = new URL("../../lib/control-plane-i18n.ts", import.meta.url);
const nextPath = new URL("../../lib/control-plane-next.ts", import.meta.url);
const observabilityPath = new URL("../../lib/server/commercial-observability.ts", import.meta.url);
const pagePath = new URL("../../app/control-plane/page.tsx", import.meta.url);
const panelPath = new URL("../../app/control-plane/CommercialLifecyclePanel.tsx", import.meta.url);
const loginPagePath = new URL("../../app/control-plane/login/page.tsx", import.meta.url);
const loginRoutePath = new URL("../../app/api/control-plane/login/route.ts", import.meta.url);
const logoutRoutePath = new URL("../../app/api/control-plane/logout/route.ts", import.meta.url);
const packagePath = new URL("../../package.json", import.meta.url);

const [i18n, nextRouting, observability, page, panel, loginPage, loginRoute, logoutRoute, packageRaw] =
  await Promise.all([
    readFile(i18nPath, "utf8"),
    readFile(nextPath, "utf8"),
    readFile(observabilityPath, "utf8"),
    readFile(pagePath, "utf8"),
    readFile(panelPath, "utf8"),
    readFile(loginPagePath, "utf8"),
    readFile(loginRoutePath, "utf8"),
    readFile(logoutRoutePath, "utf8"),
    readFile(packagePath, "utf8"),
  ]);
const pkg = JSON.parse(packageRaw);

test("P3.4 exposes only Bulgarian and English Control Plane UI languages with Bulgarian default", () => {
  assert.match(i18n, /CONTROL_PLANE_LANGS = \["bg", "en"\]/);
  assert.match(i18n, /=== "en" \? "en" : "bg"/);
  assert.match(page, /href="\/control-plane\?lang=bg"/);
  assert.match(page, /href="\/control-plane\?lang=en"/);
  assert.match(loginPage, /\/control-plane\/login\?lang=bg&next=/);
  assert.match(loginPage, /\/control-plane\/login\?lang=en&next=/);
});

test("P3.4 translates visible platform, property, environment and commercial status presentation", () => {
  for (const text of [
    "Преглед на платформата",
    "Platform overview",
    "Търговско внимание",
    "Commercial attention",
    "ПРОБЕН ПЕРИОД",
    "TRIAL ACTIVE",
    "ПРОДУКЦИЯ",
  ]) {
    assert.match(page, new RegExp(text));
  }
  assert.match(page, /if \(lang === "en"\) return environment\.toUpperCase\(\)/);
});

test("P3.4 commercial action panel is bilingual while machine action codes stay unchanged", () => {
  for (const machineAction of [
    "initialize",
    "start_trial",
    "extend_trial",
    "convert_to_customer",
    "suspend",
    "resume",
    "end",
  ]) {
    assert.match(panel, new RegExp(`"${machineAction}"`));
  }
  for (const label of [
    "Стартирай пробен период",
    "Start trial",
    "Преобразувай в клиент",
    "Convert to customer",
    "Спри достъпа",
    "Suspend access",
  ]) {
    assert.match(panel, new RegExp(label));
  }
  assert.match(panel, /lang: ControlPlaneLang/);
  assert.match(page, /lang=\{lang\}/);
});

test("P3.4 preserves selected language and safe workspace destination through login and logout", () => {
  assert.match(loginPage, /action=\{`\/api\/control-plane\/login\?lang=\$\{lang\}&next=\$\{encodeURIComponent\(nextTarget\)\}`\}/);
  assert.match(loginPage, /if \(existing\) redirect\(nextTarget\)/);
  assert.match(loginRoute, /normalizeControlPlaneLang\(req\.nextUrl\.searchParams\.get\("lang"\)\)/);
  assert.match(loginRoute, /url\.searchParams\.set\("lang", requestLang\(req\)\)/);
  assert.match(loginRoute, /url\.searchParams\.set\("next", requestNext\(req\)\)/);
  assert.match(loginRoute, /new URL\(requestNext\(req\), req\.url\)/);
  assert.match(nextRouting, /"\/control-panel"/);
  assert.match(nextRouting, /"\/hotel-factory"/);
  assert.match(nextRouting, /"\/control-plane"/);
  assert.match(nextRouting, /raw\.startsWith\("\/\/"\)/);
  assert.match(nextRouting, /parsed\.searchParams\.set\("lang", lang\)/);
  assert.match(page, /action=\{`\/api\/control-plane\/logout\?lang=\$\{lang\}`\}/);
  assert.match(logoutRoute, /target\.searchParams\.set\("lang", lang\)/);
});

test("P3.4 observability uses deterministic 7, 3 and 1 day attention thresholds without cron", () => {
  assert.match(observability, /remainingMs <= DAY_MS/);
  assert.match(observability, /remainingMs <= 3 \* DAY_MS/);
  assert.match(observability, /remainingMs <= 7 \* DAY_MS/);
  assert.match(observability, /level: "expired"/);
  assert.match(observability, /level: "pending"/);
  assert.match(observability, /level: "suspended"/);
  assert.doesNotMatch(observability, /pg_cron|cron\.schedule|setInterval|setTimeout/);
});

test("P3.4 commercial history is read-only, bounded and newest-first", () => {
  assert.match(observability, /\.from\("property_commercial_lifecycle_events"\)/);
  assert.match(observability, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(observability, /\.limit\(50\)/);
  assert.doesNotMatch(observability, /\.(insert|update|delete|upsert)\(/);
});

test("P3.4 attention and timeline are rendered without a second alert authority", () => {
  assert.match(page, /observability\.attention/);
  assert.match(page, /observability\.recentEvents\.slice\(0, 12\)/);
  assert.match(page, /href=\{`#property-\$\{item\.propertyId\}`\}/);
  assert.doesNotMatch(observability, /commercial_alert|attention_state|notification_state/i);
});

test("P3.4 keeps commercial mutations on the existing same-origin API", () => {
  assert.match(panel, /fetch\("\/api\/control-plane\/commercial\/property-lifecycle"/);
  assert.doesNotMatch(panel, /supabase|property_commercial_state/);
  assert.match(loginRoute, /enforceControlPlaneSameOrigin\(req\)/);
  assert.match(logoutRoute, /enforceControlPlaneSameOrigin\(req\)/);
});

test("P3.4 UI copy does not rename authoritative database states or action codes", () => {
  assert.doesNotMatch(observability, /"пробен период"|"клиент"|"спрян"/i);
  assert.match(panel, /action: selectedAction/);
  assert.match(page, /statusLabel\(event\.newStatus, lang\)/);
});

test("P3.4 is wired into the full contract suite", () => {
  assert.match(pkg.scripts["test:contracts"], /p3-4-commercial-observability-i18n\.contract\.test\.mjs/);
  assert.equal(
    pkg.scripts["test:p3-4"],
    "node --test tests/contracts/p3-4-commercial-observability-i18n.contract.test.mjs",
  );
});
