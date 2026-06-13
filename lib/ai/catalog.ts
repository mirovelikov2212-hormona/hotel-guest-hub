import { getRequestDefText } from "@/lib/request-defs";
import type { AiCatalogRecord, AiHotelCatalog, AiLang, LocalizedList, LocalizedText } from "@/lib/ai/types";
import { AI_LANGS } from "@/lib/ai/types";
import type { HotelConfig, HotelInfoItem, RequestDef, VenueRow } from "@/lib/types";

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stripIcon(value: string) {
  return clean(value).replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, "").trim();
}

function safeUrl(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function localizedValue(map: Partial<Record<string, string>> | undefined, lang: AiLang) {
  const order = [lang, "bg", "en", "de", "ro", "cs", "ru"];
  for (const key of order) {
    const value = clean(map?.[key]);
    if (value) return value;
  }
  return "";
}

function localizedMap(map: Partial<Record<string, string>> | undefined): LocalizedText {
  const out: LocalizedText = {};
  for (const lang of AI_LANGS) {
    const value = localizedValue(map, lang);
    if (value) out[lang] = value;
  }
  return out;
}

function localizedLists(map: Partial<Record<string, string[]>> | undefined): LocalizedList {
  const out: LocalizedList = {};
  for (const lang of AI_LANGS) {
    const values = unique((map?.[lang] ?? []).map(String));
    if (values.length) out[lang] = values;
  }
  return out;
}

function i18n(config: HotelConfig, lang: AiLang, key: string, fallback: string) {
  return stripIcon(config.i18n?.[lang]?.[key] || config.i18n?.bg?.[key] || config.i18n?.en?.[key] || fallback);
}

const SECTION_FALLBACKS: Record<string, Record<AiLang, string>> = {
  reception: { bg: "Рецепция", en: "Reception", de: "Rezeption", ro: "Recepție", cs: "Recepce", ru: "Ресепшен" },
  housekeeping: { bg: "Камериерки", en: "Housekeeping", de: "Housekeeping", ro: "Curățenie", cs: "Úklid pokoje", ru: "Уборка номера" },
  maintenance: { bg: "Поддръжка", en: "Maintenance", de: "Technik", ro: "Mentenanță", cs: "Údržba", ru: "Техническая служба" },
  wifi: { bg: "Wi‑Fi", en: "Wi‑Fi", de: "WLAN", ro: "Wi‑Fi", cs: "Wi‑Fi", ru: "Wi‑Fi" },
  info: { bg: "Инфо", en: "Info", de: "Info", ro: "Info", cs: "Info", ru: "Информация" },
  outlets: { bg: "Обекти", en: "Outlets", de: "Bereiche", ro: "Locații", cs: "Provozovny", ru: "Объекты" },
  animation: { bg: "Анимация", en: "Animation", de: "Animation", ro: "Animație", cs: "Animace", ru: "Анимация" },
  world_cup: { bg: "Световно първенство 2026", en: "World Cup 2026", de: "Weltmeisterschaft 2026", ro: "Cupa Mondială 2026", cs: "Mistrovství světa 2026", ru: "Чемпионат мира 2026" },
  nearby: { bg: "Около хотела", en: "Explore nearby", de: "Umgebung", ro: "În apropiere", cs: "V okolí", ru: "Рядом с отелем" },
};

function sectionLabel(config: HotelConfig, lang: AiLang, sectionId: string) {
  const id = clean(sectionId).toLowerCase();
  const fallback = SECTION_FALLBACKS[id]?.[lang] || id.replace(/_/g, " ");
  const keyMap: Record<string, string> = {
    reception: "reception_title",
    housekeeping: "housekeeping_title",
    maintenance: "maintenance_title",
    wifi: "wifi_title",
    info: "info_title",
    outlets: "outlets_title",
    animation: "section_animation_title",
    world_cup: "world_cup_title",
  };
  return i18n(config, lang, keyMap[id] || `${id}_title`, fallback);
}

function groupLabel(config: HotelConfig, lang: AiLang, sectionId: string) {
  const id = clean(sectionId).toLowerCase();
  if (["reception", "housekeeping", "maintenance", "wifi"].includes(id)) return "";
  if (["outlets", "animation", "world_cup", "spa", "kids", "entertainment"].includes(id)) {
    return i18n(config, lang, "food_entertainment_title", {
      bg: "Храна и забавления", en: "Food & entertainment", de: "Essen & Unterhaltung", ro: "Mâncare și divertisment", cs: "Jídlo a zábava", ru: "Еда и развлечения",
    }[lang]);
  }
  if (["info", "weather"].includes(id)) {
    return i18n(config, lang, "hotel_stay_title", {
      bg: "Хотел и престой", en: "Hotel & stay", de: "Hotel & Aufenthalt", ro: "Hotel și sejur", cs: "Hotel a pobyt", ru: "Отель и проживание",
    }[lang]);
  }
  return "";
}

function pathFor(config: HotelConfig, lang: AiLang, sectionId: string, sectionTitle: string, itemTitle: string) {
  const id = clean(sectionId).toLowerCase();
  const group = groupLabel(config, lang, id);
  const section = stripIcon(sectionTitle || sectionLabel(config, lang, id));
  const item = stripIcon(itemTitle);
  return unique([group, section, item]);
}

function priceText(def: RequestDef) {
  const price = clean(def.price);
  if (!price) return "";
  const currency = clean(def.currency || "€");
  if (price.includes(currency)) return price;
  return `${price} ${currency}`.trim();
}

function requestRecord(def: RequestDef, config: HotelConfig): AiCatalogRecord {
  const titles: LocalizedText = {};
  const summaries: LocalizedText = {};
  const pathByLang: Partial<Record<AiLang, string[]>> = {};
  const optionsByLang: LocalizedList = {};
  const sectionId = clean(def.uiSectionId || def.section || def.category || def.targetDepartment || "info");

  for (const lang of AI_LANGS) {
    const title = stripIcon(getRequestDefText(def, lang, "title")) || def.id.replace(/_/g, " ");
    const description = clean(getRequestDefText(def, lang, "description"));
    const policy = clean(getRequestDefText(def, lang, "policy"));
    const subtitle = clean(getRequestDefText(def, lang, "subtitle"));
    const sectionTitle = stripIcon(def.sectionTitle?.[lang] || "");
    titles[lang] = title;
    summaries[lang] = unique([subtitle, description, policy]).join("\n");
    pathByLang[lang] = pathFor(config, lang, sectionId, sectionTitle, title);
    const options = unique((def.optionsByLang?.[lang] || def.options || []).map(String));
    if (options.length) optionsByLang[lang] = options;
  }

  const aliases = localizedLists(def.aliasesByLang);
  for (const lang of AI_LANGS) {
    aliases[lang] = unique([
      ...(aliases[lang] || []),
      titles[lang] || "",
      def.id.replace(/_/g, " "),
      def.requestType || "",
    ]);
  }

  return {
    id: `service:${def.id}`,
    kind: "service",
    active: def.enabled && def.guestVisible,
    aiVisible: def.aiVisible,
    titles,
    summaries,
    aliases,
    intentTags: unique([...(def.intentTags || []), ...(def.keywords || []), def.type, def.category, def.subsection || ""]),
    pathByLang,
    urls: unique([safeUrl(def.linkUrl), safeUrl(def.externalUrl), safeUrl(def.pdfUrl)]),
    targetDepartment: def.targetDepartment,
    requestType: def.requestType,
    requestKind: def.requestKind,
    requiresBilling: def.requiresBilling,
    price: priceText(def),
    currency: def.currency,
    optionsByLang,
    sourceRef: def.canonicalRef,
  };
}

function venueTextMap(venue: VenueRow, field: "nameByLang" | "shortDescriptionByLang" | "descriptionByLang" | "hoursByLang") {
  const source = venue[field] as Partial<Record<string, string>> | undefined;
  const generic = field === "nameByLang" ? venue.name : field === "shortDescriptionByLang" ? venue.shortDescription : field === "descriptionByLang" ? venue.description : venue.hours;
  const out: LocalizedText = {};
  for (const lang of AI_LANGS) out[lang] = clean(source?.[lang] || generic);
  return out;
}

function venueRecord(venue: VenueRow, config: HotelConfig, index: number): AiCatalogRecord {
  const stableId = clean(venue.id) || clean(venue.name).toLowerCase().replace(/[^a-z0-9]+/g, "_") || `venue_${index}`;
  const titles = venueTextMap(venue, "nameByLang");
  const summaries: LocalizedText = {};
  const pathByLang: Partial<Record<AiLang, string[]>> = {};
  const hoursByLang = venueTextMap(venue, "hoursByLang");
  const sectionId = clean(venue.uiSectionId || "outlets");

  for (const lang of AI_LANGS) {
    const summary = clean(venue.shortDescriptionByLang?.[lang] || venue.shortDescription || venue.descriptionByLang?.[lang] || venue.description);
    summaries[lang] = summary;
    pathByLang[lang] = pathFor(config, lang, sectionId, sectionLabel(config, lang, sectionId), titles[lang] || venue.name);
  }

  const aliases = localizedLists(venue.aliasesByLang);
  for (const lang of AI_LANGS) aliases[lang] = unique([...(aliases[lang] || []), titles[lang] || "", venue.type || "", venue.category || ""]);

  return {
    id: `venue:${stableId}`,
    kind: "venue",
    active: venue.active !== false,
    aiVisible: venue.aiVisible !== false,
    titles,
    summaries,
    aliases,
    intentTags: unique([...(venue.intentTags || []), venue.type || "", venue.category || "", "venue"]),
    pathByLang,
    urls: unique([safeUrl(venue.menuUrl), safeUrl(venue.reservationUrl), safeUrl(venue.programUrl)]),
    hoursByLang,
  };
}

function infoRecord(item: HotelInfoItem, config: HotelConfig): AiCatalogRecord {
  const titles = localizedMap(item.title);
  const summaries = localizedMap(item.text);
  const aliases = localizedLists(item.aliasesByLang);
  const pathByLang: Partial<Record<AiLang, string[]>> = {};
  const sectionId = clean(item.uiSectionId || item.category || "info");

  for (const lang of AI_LANGS) {
    aliases[lang] = unique([...(aliases[lang] || []), titles[lang] || "", item.key.replace(/_/g, " ")]);
    pathByLang[lang] = pathFor(config, lang, sectionId, sectionLabel(config, lang, sectionId), titles[lang] || item.key);
  }

  return {
    id: `info:${item.key}`,
    kind: "info",
    active: item.active !== false,
    aiVisible: item.aiVisible !== false,
    titles,
    summaries,
    aliases,
    intentTags: unique([...(item.intentTags || []), item.category || "", "hotel_info"]),
    pathByLang,
    urls: unique([safeUrl(item.linkUrl)]),
    sourceRef: item.canonicalRef,
  };
}

function fixedTitles(values: Record<AiLang, string>): LocalizedText {
  return values;
}

function baseRecords(config: HotelConfig): AiCatalogRecord[] {
  const records: AiCatalogRecord[] = [];
  if (config.wifi?.ssid || config.wifi?.password) {
    const summaries: LocalizedText = {};
    const pathByLang: Partial<Record<AiLang, string[]>> = {};
    for (const lang of AI_LANGS) {
      const network = config.wifi.ssid ? `SSID: ${config.wifi.ssid}` : "";
      const password = config.wifi.password ? `Password: ${config.wifi.password}` : "";
      summaries[lang] = unique([network, password]).join("\n");
      pathByLang[lang] = [sectionLabel(config, lang, "wifi")];
    }
    records.push({
      id: "hotel:wifi",
      kind: "hotel",
      active: true,
      aiVisible: true,
      titles: fixedTitles({ bg: "Wi‑Fi", en: "Wi‑Fi", de: "WLAN", ro: "Wi‑Fi", cs: "Wi‑Fi", ru: "Wi‑Fi" }),
      summaries,
      aliases: {
        bg: ["wifi", "wi-fi", "интернет", "парола"], en: ["wifi", "wi-fi", "internet", "password"], de: ["wlan", "wifi", "passwort"],
        ro: ["wifi", "internet", "parolă"], cs: ["wifi", "internet", "heslo"], ru: ["wifi", "вайфай", "интернет", "пароль"],
      },
      intentTags: ["wifi_credentials", "internet", "password"],
      pathByLang,
      urls: [],
    });
  }

  if (config.location?.query) {
    const summaries = Object.fromEntries(AI_LANGS.map((lang) => [lang, config.location.query])) as LocalizedText;
    const pathByLang = Object.fromEntries(AI_LANGS.map((lang) => [lang, pathFor(config, lang, "info", sectionLabel(config, lang, "info"), "")])) as Partial<Record<AiLang, string[]>>;
    records.push({
      id: "hotel:location",
      kind: "hotel",
      active: true,
      aiVisible: true,
      titles: fixedTitles({ bg: "Местоположение", en: "Location", de: "Standort", ro: "Locație", cs: "Poloha", ru: "Расположение" }),
      summaries,
      aliases: { bg: ["къде е хотелът", "адрес", "местоположение"], en: ["hotel location", "address", "where is the hotel"], de: ["hotelstandort", "adresse"], ro: ["locația hotelului", "adresă"], cs: ["poloha hotelu", "adresa"], ru: ["где отель", "адрес", "расположение"] },
      intentTags: ["location", "address"],
      pathByLang,
      urls: [],
    });
  }

  return records;
}

export function buildAiCatalog(config: HotelConfig): AiHotelCatalog {
  const serviceRecords = (config.requestDefs || []).map((def) => requestRecord(def, config));
  const venueRecords = (config.venueRows || []).map((venue, index) => venueRecord(venue, config, index));
  const knownIds = new Set([...serviceRecords, ...venueRecords].map((record) => record.id));
  const infoRecords = (config.hotelInfoItems || [])
    .map((item) => infoRecord(item, config))
    .filter((record) => !record.sourceRef || !knownIds.has(record.sourceRef));

  const records = [...baseRecords(config), ...serviceRecords, ...venueRecords, ...infoRecords]
    .filter((record) => record.active && record.aiVisible)
    .filter((record, index, all) => all.findIndex((candidate) => candidate.id === record.id) === index);

  return {
    hotelId: config.hotelId,
    hotelSlug: config.hotelSlug || "",
    hotelName: config.hotelName,
    languages: AI_LANGS.filter((lang) => config.languages.includes(lang)),
    records,
    builtAt: Date.now(),
  };
}
