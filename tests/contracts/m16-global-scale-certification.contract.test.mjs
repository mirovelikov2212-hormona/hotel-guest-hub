import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("M16 AI locale model is arbitrary BCP-47 rather than a fixed six-language allowlist", async () => {
  const source = await readProjectFile("lib/ai/types.ts");
  assertNotContains(source, "AI_LANGS");
  assertNotContains(source, '["bg", "en", "de", "ro", "cs", "ru"]');
  assertContains(source, "canonicalizeLocaleTag");
  assertContains(source, "export type AiLang = string");
});

test("M16 request definition localization follows tenant locales only", async () => {
  const source = await readProjectFile("lib/request-defs.ts");
  assertNotContains(source, "DEFAULT_LANGS");
  assertNotContains(source, '["bg", "en", "de", "ro", "cs", "ru"]');
  assertContains(source, "normalizeLocaleList");
});

test("M16 critical guest/runtime paths contain no Sofia timezone default", async () => {
  for (const path of [
    "app/api/weather/route.ts",
    "app/api/guest/day3-survey/route.ts",
    "app/api/internal/massage-calendar-changed/route.ts",
    "app/api/staff/surveys/route.ts",
    "components/staff/pages/ReceptionPageContent.tsx",
    "components/Day3GuestSurvey.tsx",
    "components/GuestHub.tsx",
    "components/MassageAvailabilityPreview.tsx",
  ]) {
    const source = await readProjectFile(path);
    assertNotContains(source, "Europe/Sofia", `${path} must not assume a Sofia timezone`);
  }
});

test("M16 day-3 survey preserves full canonical guest locale", async () => {
  const source = await readProjectFile("app/api/guest/day3-survey/route.ts");
  assertContains(source, "canonicalizeLocaleTag");
  assertNotContains(source, ".slice(0, 8)");
  assertNotContains(source, '|| "bg"');
});

test("M16 tracking cannot silently attribute an unknown tenant to Aquamarine", async () => {
  const source = await readProjectFile("lib/trackHubEvent.ts");
  assertNotContains(source, 'return "aquamarine"');
  assertNotContains(source, '|| "aquamarine"');
  assertContains(source, "if (!hotelAlias || !hotelSlug) return");
});

test("M16 Guest Hub has no Aquamarine, Kranevo or Sofia implicit tenant defaults", async () => {
  const source = await readProjectFile("components/GuestHub.tsx");
  assertNotContains(source, 'config.hotelSlug || "aquamarine"');
  assertNotContains(source, 'config.location.query || "Kranevo, Bulgaria"');
  assertNotContains(source, 'config.hotelTimezone || "Europe/Sofia"');
});

test("M16 obsolete GuestHub backup is absent from release source", async () => {
  await assert.rejects(access("components/GuestHub.tsx.bak.m13"));
});

test("M16 certification migration proves global tenant locale and timezone data", async () => {
  const source = await readProjectFile(
    "supabase/migrations/20260815194000_m16_certification_global_tenant_revision.sql",
  );
  for (const fragment of [
    "Pacific/Auckland",
    "pt-BR",
    "zh-Hans",
    "ja",
    "ar",
    "m16-certification-migration",
  ]) {
    assertContains(source, fragment);
  }
});

test("M16 production dependency set is patched beyond audited advisories", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(pkg.dependencies.next, "16.3.1");
  assert.equal(pkg.dependencies["@supabase/supabase-js"], "2.112.3");
  assert.equal(pkg.dependencies.openai, "6.49.0");
  assert.equal(pkg.overrides?.ws, "8.21.0");
});
