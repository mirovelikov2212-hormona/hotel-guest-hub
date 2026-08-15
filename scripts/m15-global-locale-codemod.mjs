import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, value) {
  fs.writeFileSync(path, value);
}

function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`M15_CODEMOD_MISSING:${label}`);
  }
  const next = source.replace(needle, replacement);
  if (next === source) throw new Error(`M15_CODEMOD_NOOP:${label}`);
  return next;
}

function replaceRegex(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`M15_CODEMOD_MISSING:${label}`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function edit(path, mutator) {
  const before = read(path);
  const after = mutator(before);
  if (after === before) throw new Error(`M15_CODEMOD_NO_CHANGE:${path}`);
  write(path, after);
  console.log(`updated ${path}`);
}

edit("lib/config.ts", (source) => {
  source = replaceOnce(
    source,
    'import { getHotelSheetSources } from "@/lib/hotels/getHotelSheetSources";\n',
    'import { getHotelSheetSources } from "@/lib/hotels/getHotelSheetSources";\nimport { canonicalizeLocaleTag, normalizeLocaleList, resolveEnabledLocale } from "@/lib/i18n/locale-model.mjs";\n',
    "config-locale-import",
  );

  source = replaceOnce(
    source,
    '      const lang = readCell(row, ["lang", "LANG", "language", "Language"]);\n      const value = readCell(row, ["value", "Value", "VALUE"]);\n      if (!key || !lang) continue;\n      out[lang] ||= {};\n      out[lang][key] = value;',
    '      const lang = canonicalizeLocaleTag(readCell(row, ["lang", "LANG", "language", "Language"]));\n      const value = readCell(row, ["value", "Value", "VALUE"]);\n      if (!key || !lang) continue;\n      out[lang] ||= {};\n      out[lang][key] = value;',
    "config-i18n-row-locale",
  );

  source = replaceOnce(
    source,
    '      const lang = column.trim();\n      if (!lang) continue;\n      out[lang] ||= {};\n      out[lang][key] = String(value ?? "").trim();',
    '      const lang = canonicalizeLocaleTag(column.trim());\n      if (!lang) continue;\n      out[lang] ||= {};\n      out[lang][key] = String(value ?? "").trim();',
    "config-i18n-column-locale",
  );

  source = replaceRegex(
    source,
    /function parseHotelInfoRows\([\s\S]*?\n}\n\n\n\nfunction isNegativeValue/,
    `function parseHotelInfoRows(rows: Record<string, string>[], languages: LangKey[]): Array<{
  key: string;
  category?: string;
  sortOrder?: number;
  icon?: string;
  active?: boolean;
  aiVisible?: boolean;
  aliasesByLang?: Record<string, string[]>;
  intentTags?: string[];
  uiSectionId?: string;
  linkUrl?: string;
  canonicalRef?: string;
  title: Record<string, string>;
  text: Record<string, string>;
}> {
  const enabledLanguages = normalizeLocaleList(languages) as LangKey[];

  return rows
    .map((row) => {
      const key = readCell(row, ["Key", "key", "KEY", "Id", "id"]);
      const category = readCell(row, ["Category", "category"]);
      const sortValue = readCell(row, ["Sort", "sort", "Sort Order", "sort_order", "sortOrder"]);
      const icon = readCell(row, ["Icon", "icon"]);
      const activeRaw = readCell(row, ["Active", "active"]);
      const title = buildMultilingualFieldMap(row, ["Title"], enabledLanguages) as Record<string, string>;
      const text = buildMultilingualFieldMap(row, ["Text", "Body"], enabledLanguages) as Record<string, string>;
      const aliasesByLang: Record<string, string[]> = {};

      for (const lang of enabledLanguages) {
        const rawAliases = readMultilingualField(row, ["Aliases"], String(lang));
        if (rawAliases) {
          aliasesByLang[String(lang)] = rawAliases
            .split("|")
            .map((item) => item.trim())
            .filter(Boolean);
        }
      }

      return {
        key,
        category,
        sortOrder: Number(sortValue || "999"),
        icon,
        active: !["false", "0", "no"].includes(String(activeRaw || "TRUE").trim().toLowerCase()),
        aiVisible: !["false", "0", "no"].includes(readCell(row, ["AI Visible", "ai_visible", "aiVisible"]).toLowerCase() || "yes"),
        aliasesByLang,
        intentTags: readCell(row, ["Intent Tags", "intent_tags", "intentTags"]).split("|").map((item) => item.trim()).filter(Boolean),
        uiSectionId: readCell(row, ["UI Section ID", "ui_section_id", "uiSectionId"]),
        linkUrl: readCell(row, ["Link URL", "link_url", "linkUrl", "URL", "url"]),
        canonicalRef: readCell(row, ["Canonical Ref", "canonical_ref", "canonicalRef"]),
        title,
        text,
      };
    })
    .filter((item) => item.key && item.active && Object.values(item.title).concat(Object.values(item.text)).some((value) => String(value || "").trim()))
    .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
}



function isNegativeValue`,
    "config-hotel-info-dynamic",
  );

  source = replaceRegex(
    source,
    /  const languages = pick\(mergedConfig, "languages", "bg,en,de"\)[\s\S]*?  const requestDefs = parseRequestDefs\(requestDefRows, effectiveLanguages\);/,
    `  const languages = normalizeLocaleList(
    pick(mergedConfig, "languages", "en")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ) as LangKey[];

  const effectiveLanguages = (languages.length ? languages : ["en"]) as LangKey[];
  const venueLanguages = effectiveLanguages;
  const languageDefault = resolveEnabledLocale(
    pick(mergedConfig, "languageDefault", ""),
    effectiveLanguages,
    effectiveLanguages[0] || "en",
  ) as LangKey;
  const opsLanguage = resolveEnabledLocale(
    pick(mergedConfig, "opsLanguage", ""),
    effectiveLanguages,
    languageDefault,
  ) as LangKey;
  const staffHelperLanguage = resolveEnabledLocale(
    pick(mergedConfig, "staffHelperLanguage", ""),
    effectiveLanguages,
    opsLanguage,
  ) as LangKey;
  const requestDefs = parseRequestDefs(requestDefRows, effectiveLanguages);`,
    "config-dynamic-languages",
  );

  source = replaceOnce(
    source,
    '    hotelTimezone: pick(mergedConfig, "hotelTimezone", "Europe/Sofia"),',
    '    hotelTimezone: sheetSources.hotelTimezone || pick(mergedConfig, "hotelTimezone", "UTC"),',
    "config-tenant-timezone",
  );
  source = replaceOnce(
    source,
    '    languageDefault: (pick(mergedConfig, "languageDefault", "bg") as LangKey) as LangKey,\n    opsLanguage: (pick(mergedConfig, "opsLanguage", "bg") as LangKey) as LangKey,\n    staffHelperEnabled: pick(mergedConfig, "staffHelperEnabled", "true").toLowerCase() !== "false",\n    staffHelperLanguage: (pick(mergedConfig, "staffHelperLanguage", "en") as LangKey) as LangKey,\n    hotelInfoItems: parseHotelInfoRows(hotelInfoRows),',
    '    languageDefault,\n    opsLanguage,\n    staffHelperEnabled: pick(mergedConfig, "staffHelperEnabled", "true").toLowerCase() !== "false",\n    staffHelperLanguage,\n    hotelInfoItems: parseHotelInfoRows(hotelInfoRows, effectiveLanguages),',
    "config-locale-authority-fields",
  );

  return source;
});

edit("components/GuestHub.tsx", (source) => {
  source = replaceOnce(
    source,
    'import { isRecoverableGuestStayErrorCode } from "@/lib/guest-stays/stale-state-recovery.mjs";\n',
    'import { isRecoverableGuestStayErrorCode } from "@/lib/guest-stays/stale-state-recovery.mjs";\nimport { findEnabledLocale, getLocaleFallbackOrder as getTenantLocaleFallbackOrder, normalizeLocaleList, resolveEnabledLocale } from "@/lib/i18n/locale-model.mjs";\n',
    "guest-locale-import",
  );

  source = replaceRegex(
    source,
    /const SUPPORTED_GUEST_LANGS:[\s\S]*?\nfunction getGuestIntroCopy/,
    `function getEnabledGuestLocales(languages: unknown): LangKey[] {
  return normalizeLocaleList(Array.isArray(languages) ? languages : []) as LangKey[];
}

function parseGuestLang(value: unknown, enabledLanguages: unknown): LangKey | null {
  const enabled = getEnabledGuestLocales(enabledLanguages);
  if (!enabled.length) return null;
  return findEnabledLocale(value, enabled) as LangKey | null;
}

function normalizeGuestLang(
  value: unknown,
  enabledLanguages: unknown,
  fallback: LangKey | string = "en",
): LangKey {
  return resolveEnabledLocale(value, enabledLanguages, fallback) as LangKey;
}

function getBrowserPreferredGuestLang(enabledLanguages: unknown): LangKey | null {
  if (typeof navigator === "undefined") return null;

  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ];

  for (const item of candidates) {
    const matched = parseGuestLang(item, enabledLanguages);
    if (matched) return matched;
  }

  return null;
}

function getInitialGuestLang(defaultLang: string | undefined, enabledLanguages: unknown): LangKey {
  const enabled = getEnabledGuestLocales(enabledLanguages);
  const fallback = resolveEnabledLocale(defaultLang, enabled, enabled[0] || "en") as LangKey;

  if (typeof window !== "undefined") {
    const urlLang = parseGuestLang(
      new URLSearchParams(window.location.search).get("lang"),
      enabled,
    );

    if (urlLang) {
      try {
        window.localStorage.setItem(GUEST_LANGUAGE_STORAGE_KEY, urlLang);
      } catch { }
      return urlLang;
    }

    const savedLang = parseGuestLang(
      window.localStorage.getItem(GUEST_LANGUAGE_STORAGE_KEY),
      enabled,
    );
    if (savedLang) return savedLang;

    const browserLang = getBrowserPreferredGuestLang(enabled);
    if (browserLang) return browserLang;
  }

  return fallback;
}

function getGuestIntroCopy`,
    "guest-dynamic-language-parser",
  );

  source = replaceOnce(
    source,
    '    normalizeGuestLang(config.languageDefault || "bg")',
    '    normalizeGuestLang(config.languageDefault || "en", config.languages, config.languageDefault || "en")',
    "guest-initial-state",
  );
  source = replaceOnce(
    source,
    '    const nextLang = getInitialGuestLang(config.languageDefault);',
    '    const nextLang = getInitialGuestLang(config.languageDefault, config.languages);',
    "guest-initial-effect",
  );
  source = replaceOnce(
    source,
    '  }, [config.languageDefault]);',
    '  }, [config.languageDefault, config.languages]);',
    "guest-language-effect-deps",
  );
  source = replaceOnce(
    source,
    '    const safeLang = normalizeGuestLang(nextLang);',
    '    const safeLang = normalizeGuestLang(nextLang, config.languages, config.languageDefault || "en");',
    "guest-set-language",
  );

  source = replaceRegex(
    source,
    /  const guestLanguageOptions = useMemo\(\(\) => \{[\s\S]*?\n  }, \[config\.languages\]\);/,
    `  const guestLanguageOptions = useMemo(() => {
    const enabled = normalizeLocaleList(config.languages) as LangKey[];
    if (enabled.length) return enabled;
    return [resolveEnabledLocale(config.languageDefault, [], config.languageDefault || "en") as LangKey];
  }, [config.languageDefault, config.languages]);`,
    "guest-language-options",
  );

  source = replaceRegex(
    source,
    /  const fallbackLangs = useMemo\(\(\) => \{[\s\S]*?\n  }, \[lang\]\);\n\n  const translateFromI18n/,
    `  const fallbackLangs = useMemo(
    () => getTenantLocaleFallbackOrder(
      lang,
      normalizeLocaleList(config.languages),
      config.languageDefault || "en",
    ) as LangKey[],
    [config.languageDefault, config.languages, lang],
  );

  const translateFromI18n`,
    "guest-fallback-locales",
  );

  source = replaceRegex(
    source,
    /function getLanguageFallbackOrder\(lang: LangKey \| string\): string\[\] \{[\s\S]*?\n}\n/,
    `function getLanguageFallbackOrder(
  lang: LangKey | string,
  availableLocales: string[] = [],
): string[] {
  return getTenantLocaleFallbackOrder(lang, availableLocales, "en");
}
`,
    "guest-content-fallback-helper",
  );
  source = replaceOnce(
    source,
    "  for (const candidate of getLanguageFallbackOrder(lang)) {",
    "  for (const candidate of getLanguageFallbackOrder(lang, Object.keys(values))) {",
    "guest-content-fallback-call",
  );

  source = replaceOnce(
    source,
    "    void prefetchMassageBookingData(hotelContentSlug).catch(() => {",
    "    void prefetchMassageBookingData(hotelContentSlug, config.hotelTimezone || \"UTC\").catch(() => {",
    "guest-massage-prefetch-timezone",
  );
  source = replaceOnce(
    source,
    "  }, [hotelContentSlug, massageBookingPreviewVisible]);",
    "  }, [config.hotelTimezone, hotelContentSlug, massageBookingPreviewVisible]);",
    "guest-massage-prefetch-deps",
  );
  source = replaceOnce(
    source,
    "                    hotelSlug={hotelContentSlug}\n                    language={lang}",
    "                    hotelSlug={hotelContentSlug}\n                    hotelTimezone={config.hotelTimezone || \"UTC\"}\n                    language={lang}",
    "guest-massage-timezone-prop",
  );

  return source;
});

edit("components/MassageBookingSection.tsx", (source) => {
  source = replaceOnce(
    source,
    'import type { TrackHubPayload } from "@/lib/trackHubEvent";\n',
    'import type { TrackHubPayload } from "@/lib/trackHubEvent";\nimport { getLocaleFallbackOrder } from "@/lib/i18n/locale-model.mjs";\n',
    "massage-ui-locale-import",
  );
  source = replaceOnce(
    source,
    "  nameRu: string;\n  durationMinutes: number;",
    "  nameRu: string;\n  nameI18n?: Record<string, string>;\n  durationMinutes: number;",
    "massage-ui-dynamic-name-type",
  );

  source = replaceRegex(
    source,
    /function normalizeLanguage\(language: LangKey\): LangKey \{[\s\S]*?\n}\n\nfunction getSofiaIsoDate\(\) \{[\s\S]*?\n}\n\nfunction serviceName\(service: MassageService, language: LangKey\) \{[\s\S]*?\n}\n\nfunction languageLocale\(language: LangKey\) \{[\s\S]*?\n}\n/,
    `function normalizeLanguage(language: LangKey): LangKey {
  const raw = String(language || "").trim();
  const base = raw.split("-")[0].toLowerCase();
  if (COPY[raw]) return raw;
  if (COPY[base]) return base;
  return "en";
}

function getHotelIsoDate(hotelTimezone: string) {
  const timeZone = String(hotelTimezone || "UTC").trim() || "UTC";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return \\`${values.year}-\${values.month}-\${values.day}\\`;
}

function serviceName(service: MassageService, language: LangKey) {
  const dynamicNames = service.nameI18n || {};
  for (const locale of getLocaleFallbackOrder(language, Object.keys(dynamicNames), "en")) {
    const value = String(dynamicNames[locale] || "").trim();
    if (value) return value;
  }

  const base = String(language || "").split("-")[0].toLowerCase();
  const legacyNames: Record<string, string> = {
    bg: service.nameBg,
    en: service.nameEn,
    de: service.nameDe,
    ro: service.nameRo,
    cs: service.nameCs,
    ru: service.nameRu,
  };

  return legacyNames[base] || service.nameEn || service.nameBg || service.serviceId;
}

function languageLocale(language: LangKey) {
  try {
    return Intl.getCanonicalLocales(String(language || "en"))[0] || "en";
  } catch {
    return "en";
  }
}
`,
    "massage-ui-timezone-and-locale",
  );

  source = replaceOnce(
    source,
    "export async function prefetchMassageBookingData(\n  hotelSlugInput: string\n): Promise<MassageBootstrapResult | null> {",
    "export async function prefetchMassageBookingData(\n  hotelSlugInput: string,\n  hotelTimezone = \"UTC\",\n): Promise<MassageBootstrapResult | null> {",
    "massage-prefetch-signature",
  );
  source = source.replaceAll("getSofiaIsoDate()", "getHotelIsoDate(hotelTimezone)");
  source = replaceOnce(
    source,
    "  hotelSlug,\n  language,",
    "  hotelSlug,\n  hotelTimezone = \"UTC\",\n  language,",
    "massage-component-timezone-param",
  );
  source = replaceOnce(
    source,
    "  hotelSlug: string;\n  language: LangKey;",
    "  hotelSlug: string;\n  hotelTimezone?: string;\n  language: LangKey;",
    "massage-component-timezone-type",
  );
  source = source.replaceAll(
    "prefetchMassageBookingData(hotelSlug)",
    "prefetchMassageBookingData(hotelSlug, hotelTimezone)",
  );
  source = source.replaceAll(
    "[hotelSlug]);",
    "[hotelSlug, hotelTimezone]);",
  );
  source = source.replaceAll(
    "[availabilityByService, hotelSlug]);",
    "[availabilityByService, hotelSlug, hotelTimezone]);",
  );

  return source;
});

edit("lib/server/massage-api-legacy.ts", (source) => {
  source = replaceOnce(
    source,
    "  nameRu: string;\n  durationMinutes: number;",
    "  nameRu: string;\n  nameI18n?: Record<string, string>;\n  durationMinutes: number;",
    "massage-api-dynamic-name-type",
  );
  return source;
});

edit("lib/server/massage-native-runtime.ts", (source) => {
  source = replaceOnce(
    source,
    "  name_ru?: unknown;\n  duration_minutes?: unknown;",
    "  name_ru?: unknown;\n  name_i18n?: unknown;\n  duration_minutes?: unknown;",
    "native-runtime-map-row",
  );
  source = replaceOnce(
    source,
    "function parseRuntimeService(row: RuntimeServiceRow): MassageService {\n  return {",
    `function parseLocaleMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [locale, raw] of Object.entries(value as Record<string, unknown>)) {
    const text = String(raw || "").trim();
    if (locale && text) out[locale] = text;
  }
  return out;
}

function parseRuntimeService(row: RuntimeServiceRow): MassageService {
  const serviceId = requireText(row.service_id, "MASSAGE_NATIVE_SERVICE_INVALID", 80);
  const nameI18n = parseLocaleMap(row.name_i18n);
  const legacyNameBg = String(row.name_bg || "").trim();
  const legacyNameEn = String(row.name_en || "").trim();
  const fallbackName = legacyNameBg || legacyNameEn || Object.values(nameI18n)[0] || serviceId;

  return {`,
    "native-runtime-map-parser",
  );
  source = replaceOnce(
    source,
    '    serviceId: requireText(row.service_id, "MASSAGE_NATIVE_SERVICE_INVALID", 80),\n    nameBg: requireText(row.name_bg, "MASSAGE_NATIVE_SERVICE_NAME_INVALID", 200),\n    nameEn: String(row.name_en || "").trim(),',
    '    serviceId,\n    nameBg: legacyNameBg || fallbackName,\n    nameEn: legacyNameEn,',
    "native-runtime-name-fallback",
  );
  source = replaceOnce(
    source,
    '    nameRu: String(row.name_ru || "").trim(),\n    durationMinutes:',
    '    nameRu: String(row.name_ru || "").trim(),\n    nameI18n,\n    durationMinutes:',
    "native-runtime-name-map-result",
  );
  source = replaceOnce(
    source,
    '.select("service_id, name_bg, name_en, name_de, name_ro, name_cs, name_ru, duration_minutes, buffer_minutes, price, currency, sort_order")',
    '.select("service_id, name_bg, name_en, name_de, name_ro, name_cs, name_ru, name_i18n, duration_minutes, buffer_minutes, price, currency, sort_order")',
    "native-runtime-select-map",
  );
  return source;
});

edit("lib/server/massage-native-authority-booking.ts", (source) => {
  source = replaceOnce(
    source,
    'import { supabaseAdmin } from "@/lib/server/supabase-admin";\n',
    'import { supabaseAdmin } from "@/lib/server/supabase-admin";\nimport { canonicalizeLocaleTag } from "@/lib/i18n/locale-model.mjs";\n',
    "native-booking-locale-import",
  );
  source = replaceOnce(
    source,
    '    p_guest_language: String(input.guestLanguage || "bg").trim().toLowerCase().slice(0, 8) || "bg",',
    '    p_guest_language: canonicalizeLocaleTag(input.guestLanguage) || "en",',
    "native-booking-full-locale",
  );
  return source;
});

edit("lib/server/guest-request-input-validation.mjs", (source) => {
  source = 'import { canonicalizeLocaleTag } from "../i18n/locale-model.mjs";\n\n' + source;
  source = replaceOnce(source, "  guestLanguage: 16,", "  guestLanguage: 64,", "guest-request-language-limit");
  source = replaceRegex(
    source,
    /  const guestLanguage = String\(guestLanguageResult\.value \|\| "en"\)\.toLowerCase\(\);\n  if \(!\/\^\[a-z\]\{2,3\}[\s\S]*?\n  }\n/,
    `  const guestLanguage = canonicalizeLocaleTag(guestLanguageResult.value || "en");
  if (!guestLanguage) {
    return fail(
      "INVALID_REQUEST_FIELD",
      "Invalid guestLanguage.",
      "guestLanguage",
    );
  }
`,
    "guest-request-language-validation",
  );
  return source;
});

edit("lib/server/tracking-input-validation.mjs", (source) =>
  replaceOnce(source, "  language: 24,", "  language: 64,", "tracking-language-limit"),
);

edit("tests/contracts/m14-4-generic-third-hotel.contract.test.mjs", (source) => {
  source = source.replace(
    "M14.4 generic certification tenant is data-only, six-language and has no external Sheet source",
    "M14.4 generic certification tenant is data-only, tenant-localized and has no external Sheet source",
  );
  source = replaceRegex(
    source,
    /  assert\.deepEqual\(\n    new Set\(fixture\.languages\),\n    new Set\(\["bg", "en", "de", "ro", "cs", "ru"\]\),\n  \);/,
    '  assert.ok(Array.isArray(fixture.languages) && fixture.languages.length >= 1);',
    "m14-4-language-assumption",
  );
  return source;
});

edit("package.json", (source) => {
  const pkg = JSON.parse(source);
  pkg.scripts["test:m15"] = "node --test tests/contracts/m15-global-locales-ops-governance.contract.test.mjs";
  if (!pkg.scripts["test:contracts"].includes("m15-global-locales-ops-governance.contract.test.mjs")) {
    pkg.scripts["test:contracts"] = pkg.scripts["test:contracts"].replace(
      "tests/contracts/m14-4-generic-third-hotel.contract.test.mjs",
      "tests/contracts/m14-4-generic-third-hotel.contract.test.mjs tests/contracts/m15-global-locales-ops-governance.contract.test.mjs",
    );
  }
  return JSON.stringify(pkg, null, 2) + "\n";
});

console.log("M15 global locale codemod complete");
