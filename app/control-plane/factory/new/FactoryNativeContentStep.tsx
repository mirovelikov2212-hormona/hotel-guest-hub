"use client";

import { useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";

export type LocalizedDraft = Record<string, string>;

export type HotelInfoDraft = {
  key: string;
  id: string;
  category: string;
  titleByLocale: LocalizedDraft;
  textByLocale: LocalizedDraft;
  active: boolean;
  aiVisible: boolean;
};

export type VenueDraft = {
  key: string;
  id: string;
  type: string;
  nameByLocale: LocalizedDraft;
  descriptionByLocale: LocalizedDraft;
  hoursByLocale: LocalizedDraft;
  locationByLocale: LocalizedDraft;
  cuisineByLocale: LocalizedDraft;
  open: string;
  close: string;
  requiresReservation: boolean;
  reservationType: "none" | "request" | "staff" | "phone" | "whatsapp" | "email" | "url";
  reservationUrl: string;
  reservationPhone: string;
  reservationWhatsapp: string;
  reservationEmail: string;
  active: boolean;
  aiVisible: boolean;
};

export type NativeSetupDraft = {
  wifiSsid: string;
  wifiGuestAccessCode: string;
  items: HotelInfoDraft[];
  venues: VenueDraft[];
};

const VENUE_TYPE_SUGGESTIONS = [
  "restaurant",
  "bar",
  "lounge",
  "water_park",
  "pool",
  "beach",
  "spa",
  "fitness",
  "kids_club",
  "entertainment",
  "event_space",
  "other",
] as const;

const RESERVATION_TYPES: VenueDraft["reservationType"][] = [
  "none",
  "request",
  "staff",
  "phone",
  "whatsapp",
  "email",
  "url",
];

const COPY = {
  bg: {
    title: "Native съдържание и обекти",
    intro: "Въведи реалното хотелско съдържание, което Guest runtime и AI могат да използват. Езиците идват директно от избраните locales.",
    localesMissing: "Първо добави поне един locale в стъпката „Стаи и езици“.",
    wifi: "Wi‑Fi",
    wifiHelp: "Тук се въвежда само guest-facing достъпът за хотела — не административни или интеграционни credentials.",
    ssid: "Wi‑Fi име / SSID",
    guestAccessCode: "Guest access code",
    hotelInfo: "Хотелска информация",
    hotelInfoHelp: "Политики, check-in/out, паркинг, emergency инструкции, секции и всяка друга хотелска информация.",
    addInfo: "+ Добави информация",
    infoId: "ID",
    category: "Категория",
    titleLabel: "Заглавие",
    textLabel: "Текст",
    venues: "Обекти / venues",
    venuesHelp: "Добавяй ресторанти, барове, басейни, плаж, SPA, фитнес, kids club, entertainment или произволен custom тип.",
    venuesRequiredHelp: "За всеки обект са задължителни само Venue ID, Тип и Име на поне един избран език. Всички останали полета са по избор.",
    addVenue: "+ Добави обект",
    venueId: "Venue ID",
    venueType: "Тип",
    customType: "Друг / custom",
    customTypeLabel: "Custom type",
    nameLabel: "Име",
    descriptionLabel: "Описание",
    hoursLabel: "Работно време / текст",
    locationLabel: "Локация",
    cuisineLabel: "Кухня / тип храна",
    structuredHours: "Структурирани часове",
    opens: "Отваря",
    closes: "Затваря",
    reservation: "Резервации",
    reservationType: "Reservation type",
    reservationUrl: "Reservation URL",
    reservationPhone: "Телефон",
    reservationWhatsapp: "WhatsApp",
    reservationEmail: "Email",
    requiresReservation: "Изисква резервация",
    active: "Активно съдържание",
    aiVisible: "Видимо за AI",
    remove: "Премахни",
    none: "Няма добавени записи.",
    required: "задължително",
    optional: "по избор",
    atLeastOneLanguage: "поне един език",
    newVenue: "Нов обект",
    ready: "готов",
    incomplete: "липсват задължителни данни",
  },
  en: {
    title: "Native content & venues",
    intro: "Enter the real hotel content used by Guest runtime and AI. Languages come directly from the selected locales.",
    localesMissing: "Add at least one locale in the Rooms & locales step first.",
    wifi: "Wi‑Fi",
    wifiHelp: "Only guest-facing hotel access belongs here — never administrative or integration credentials.",
    ssid: "Wi‑Fi name / SSID",
    guestAccessCode: "Guest access code",
    hotelInfo: "Hotel information",
    hotelInfoHelp: "Policies, check-in/out, parking, emergency instructions, sections, and any other hotel information.",
    addInfo: "+ Add information",
    infoId: "ID",
    category: "Category",
    titleLabel: "Title",
    textLabel: "Text",
    venues: "Venues",
    venuesHelp: "Add restaurants, bars, pools, beach, SPA, fitness, kids club, entertainment, or any custom venue type.",
    venuesRequiredHelp: "Only Venue ID, Type and a Name in at least one selected language are required for each venue. Every other field is optional.",
    addVenue: "+ Add venue",
    venueId: "Venue ID",
    venueType: "Type",
    customType: "Other / custom",
    customTypeLabel: "Custom type",
    nameLabel: "Name",
    descriptionLabel: "Description",
    hoursLabel: "Opening hours / text",
    locationLabel: "Location",
    cuisineLabel: "Cuisine / food type",
    structuredHours: "Structured hours",
    opens: "Opens",
    closes: "Closes",
    reservation: "Reservations",
    reservationType: "Reservation type",
    reservationUrl: "Reservation URL",
    reservationPhone: "Phone",
    reservationWhatsapp: "WhatsApp",
    reservationEmail: "Email",
    requiresReservation: "Requires reservation",
    active: "Active content",
    aiVisible: "Visible to AI",
    remove: "Remove",
    none: "No entries added.",
    required: "required",
    optional: "optional",
    atLeastOneLanguage: "at least one language",
    newVenue: "New venue",
    ready: "ready",
    incomplete: "required data missing",
  },
} as const;

const input = "mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-cyan-500";
const small = "rounded-xl border border-cyan-400/30 px-3 py-2 text-xs text-cyan-100";

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
}

function draftKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function canonicalLocale(locale: string) {
  const raw = String(locale || "").trim();
  if (!raw) return "";
  try {
    return Intl.getCanonicalLocales(raw)[0] || raw;
  } catch {
    return raw;
  }
}

function localizedValue(map: LocalizedDraft, locale: string) {
  const canonical = canonicalLocale(locale);
  return map[canonical] ?? map[locale] ?? "";
}

function localizedMap(map: LocalizedDraft, locales: string[]) {
  return Object.fromEntries(
    locales
      .map((locale) => canonicalLocale(locale))
      .filter(Boolean)
      .map((locale) => [locale, String(map[locale] || "").trim()])
      .filter(([, value]) => Boolean(value)),
  );
}

function hasLocalizedValue(map: LocalizedDraft, locales: string[]) {
  return locales.some((locale) => Boolean(localizedValue(map, locale).trim()));
}

function isKnownVenueType(type: string) {
  return VENUE_TYPE_SUGGESTIONS.includes(type as (typeof VENUE_TYPE_SUGGESTIONS)[number]);
}

function isFoodVenueType(type: string) {
  return ["restaurant", "bar", "lounge"].includes(normalizeKey(type));
}

type NativeValidationIssue =
  | { section: "locales" }
  | { section: "info"; index: number; field: "id" | "title" | "text" }
  | { section: "venue"; index: number; field: "id" | "type" | "name" };

function findNativeSetupValidationIssue(draft: NativeSetupDraft, locales: string[]): NativeValidationIssue | null {
  if (!locales.length) return { section: "locales" };
  for (const [index, item] of draft.items.entries()) {
    if (!normalizeKey(item.id)) return { section: "info", index, field: "id" };
    if (!hasLocalizedValue(item.titleByLocale, locales)) return { section: "info", index, field: "title" };
    if (!hasLocalizedValue(item.textByLocale, locales)) return { section: "info", index, field: "text" };
  }
  for (const [index, venue] of draft.venues.entries()) {
    if (!normalizeKey(venue.id)) return { section: "venue", index, field: "id" };
    if (!normalizeKey(venue.type)) return { section: "venue", index, field: "type" };
    if (!hasLocalizedValue(venue.nameByLocale, locales)) return { section: "venue", index, field: "name" };
  }
  return null;
}

function validationIssueText(issue: NativeValidationIssue | null, lang: ControlPlaneLang) {
  if (!issue) return "";
  if (issue.section === "locales") {
    return lang === "bg" ? "Добави поне един език за гостите." : "Add at least one guest language.";
  }
  const number = issue.index + 1;
  if (issue.section === "info") {
    const field = issue.field === "id" ? "ID" : issue.field === "title" ? (lang === "bg" ? "заглавие" : "title") : (lang === "bg" ? "текст" : "text");
    return lang === "bg" ? `Хотелска информация #${number}: липсва ${field}.` : `Hotel information #${number}: ${field} is missing.`;
  }
  const field = issue.field === "id" ? "Venue ID" : issue.field === "type" ? (lang === "bg" ? "тип" : "type") : (lang === "bg" ? "име на поне един език" : "a name in at least one language");
  return lang === "bg" ? `Обект #${number}: липсва ${field}.` : `Venue #${number}: ${field} is missing.`;
}

export function createEmptyNativeSetupDraft(): NativeSetupDraft {
  return {
    wifiSsid: "",
    wifiGuestAccessCode: "",
    items: [],
    venues: [],
  };
}

export function validateNativeSetupDraft(draft: NativeSetupDraft, locales: string[]) {
  return findNativeSetupValidationIssue(draft, locales) === null;
}

export function buildFactoryNativeBlueprintInput(draft: NativeSetupDraft, locales: string[]) {
  return {
    nativeContent: {
      wifi: {
        ssid: draft.wifiSsid.trim(),
        guestAccessCode: draft.wifiGuestAccessCode.trim(),
      },
      items: draft.items.map((item, index) => ({
        id: normalizeKey(item.id),
        category: normalizeKey(item.category) || "hotel_info",
        sortOrder: index + 1,
        active: item.active,
        aiVisible: item.aiVisible,
        title: localizedMap(item.titleByLocale, locales),
        text: localizedMap(item.textByLocale, locales),
      })),
    },
    venues: draft.venues.map((venue, index) => ({
      id: normalizeKey(venue.id),
      type: normalizeKey(venue.type) || "other",
      sortOrder: index + 1,
      active: venue.active,
      aiVisible: venue.aiVisible,
      name: localizedMap(venue.nameByLocale, locales),
      description: localizedMap(venue.descriptionByLocale, locales),
      hours: localizedMap(venue.hoursByLocale, locales),
      location: localizedMap(venue.locationByLocale, locales),
      cuisine: localizedMap(venue.cuisineByLocale, locales),
      open: venue.open,
      close: venue.close,
      requiresReservation: venue.requiresReservation,
      reservationType: venue.reservationType,
      reservationUrl: venue.reservationUrl.trim(),
      reservationPhone: venue.reservationPhone.trim(),
      reservationWhatsapp: venue.reservationWhatsapp.trim(),
      reservationEmail: venue.reservationEmail.trim(),
    })),
  };
}

function LocalizedFields({
  locales,
  value,
  onChange,
  label,
  multiline = false,
  requiredAtLeastOne = false,
  optional = false,
  copy,
}: {
  locales: string[];
  value: LocalizedDraft;
  onChange: (next: LocalizedDraft) => void;
  label: string;
  multiline?: boolean;
  requiredAtLeastOne?: boolean;
  optional?: boolean;
  copy: (typeof COPY)[ControlPlaneLang];
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-neutral-300">{label}</p>
        {requiredAtLeastOne && <span className="rounded-full bg-rose-400/10 px-2 py-0.5 text-[10px] text-rose-200">{copy.required} · {copy.atLeastOneLanguage}</span>}
        {optional && <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400">{copy.optional}</span>}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {locales.map((rawLocale) => {
          const locale = canonicalLocale(rawLocale);
          const current = localizedValue(value, rawLocale);
          return (
            <label key={locale || rawLocale} className="text-xs text-neutral-400">
              {locale || rawLocale}
              {multiline ? (
                <textarea
                  rows={3}
                  value={current}
                  onChange={(event) => onChange({ ...value, [locale || rawLocale]: event.target.value })}
                  className={input}
                />
              ) : (
                <input
                  value={current}
                  onChange={(event) => onChange({ ...value, [locale || rawLocale]: event.target.value })}
                  className={input}
                />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function FactoryNativeContentStep({
  lang,
  locales,
  value,
  onChange,
}: {
  lang: ControlPlaneLang;
  locales: string[];
  value: NativeSetupDraft;
  onChange: (next: NativeSetupDraft) => void;
}) {
  const copy = COPY[lang];
  const [expandedVenueKey, setExpandedVenueKey] = useState<string | null>(() => value.venues[value.venues.length - 1]?.key ?? null);
  const validationIssue = findNativeSetupValidationIssue(value, locales);

  const patchInfo = (key: string, patch: Partial<HotelInfoDraft>) =>
    onChange({ ...value, items: value.items.map((item) => (item.key === key ? { ...item, ...patch } : item)) });
  const patchVenue = (key: string, patch: Partial<VenueDraft>) =>
    onChange({ ...value, venues: value.venues.map((venue) => (venue.key === key ? { ...venue, ...patch } : venue)) });

  function addVenue() {
    const key = draftKey("venue");
    setExpandedVenueKey(key);
    onChange({
      ...value,
      venues: [
        ...value.venues,
        {
          key,
          id: "",
          type: "restaurant",
          nameByLocale: {},
          descriptionByLocale: {},
          hoursByLocale: {},
          locationByLocale: {},
          cuisineByLocale: {},
          open: "",
          close: "",
          requiresReservation: false,
          reservationType: "none",
          reservationUrl: "",
          reservationPhone: "",
          reservationWhatsapp: "",
          reservationEmail: "",
          active: true,
          aiVisible: true,
        },
      ],
    });
  }

  function changeVenueType(venue: VenueDraft, nextType: string) {
    const normalized = normalizeKey(nextType);
    patchVenue(venue.key, {
      type: normalized,
      ...(!isFoodVenueType(normalized) ? { cuisineByLocale: {} } : {}),
    });
  }

  function removeVenue(key: string) {
    const nextVenues = value.venues.filter((candidate) => candidate.key !== key);
    if (expandedVenueKey === key) {
      setExpandedVenueKey(nextVenues[nextVenues.length - 1]?.key ?? null);
    }
    onChange({ ...value, venues: nextVenues });
  }

  if (!locales.length) {
    return (
      <div className="mt-6 space-y-3">
        <h2 className="text-xl font-semibold">{copy.title}</h2>
        <p className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
          {copy.localesMissing}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{copy.title}</h2>
        <p className="mt-1 text-sm text-neutral-400">{copy.intro}</p>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <h3 className="font-semibold">{copy.wifi}</h3>
        <p className="mt-1 text-xs text-neutral-400">{copy.wifiHelp}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-neutral-400">
            {copy.ssid}
            <input value={value.wifiSsid} onChange={(event) => onChange({ ...value, wifiSsid: event.target.value })} className={input} />
          </label>
          <label className="text-xs text-neutral-400">
            {copy.guestAccessCode}
            <input value={value.wifiGuestAccessCode} onChange={(event) => onChange({ ...value, wifiGuestAccessCode: event.target.value })} className={input} />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold">{copy.hotelInfo}</h3>
            <p className="mt-1 text-xs text-neutral-400">{copy.hotelInfoHelp}</p>
          </div>
          <button
            type="button"
            className={small}
            onClick={() =>
              onChange({
                ...value,
                items: [
                  ...value.items,
                  {
                    key: draftKey("hotel-info"),
                    id: "",
                    category: "hotel_info",
                    titleByLocale: {},
                    textByLocale: {},
                    active: true,
                    aiVisible: true,
                  },
                ],
              })
            }
          >
            {copy.addInfo}
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {value.items.map((item) => (
            <div key={item.key} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-neutral-400">
                  <span className="flex items-center gap-2">{copy.infoId}<span className="text-[10px] text-rose-200">{copy.required}</span></span>
                  <input value={item.id} onChange={(event) => patchInfo(item.key, { id: normalizeKey(event.target.value) })} placeholder="check_in_out" className={input} />
                </label>
                <label className="text-xs text-neutral-400">
                  <span className="flex items-center gap-2">{copy.category}<span className="text-[10px] text-neutral-500">{copy.optional}</span></span>
                  <input value={item.category} onChange={(event) => patchInfo(item.key, { category: normalizeKey(event.target.value) })} placeholder="policies" className={input} />
                </label>
              </div>
              <div className="mt-3 space-y-3">
                <LocalizedFields locales={locales} value={item.titleByLocale} onChange={(next) => patchInfo(item.key, { titleByLocale: next })} label={copy.titleLabel} requiredAtLeastOne copy={copy} />
                <LocalizedFields locales={locales} value={item.textByLocale} onChange={(next) => patchInfo(item.key, { textByLocale: next })} label={copy.textLabel} multiline requiredAtLeastOne copy={copy} />
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-neutral-300">
                <label><input type="checkbox" checked={item.active} onChange={(event) => patchInfo(item.key, { active: event.target.checked })} className="mr-2" />{copy.active}</label>
                <label><input type="checkbox" checked={item.aiVisible} onChange={(event) => patchInfo(item.key, { aiVisible: event.target.checked })} className="mr-2" />{copy.aiVisible}</label>
              </div>
              <button type="button" className="mt-3 text-xs text-rose-300" onClick={() => onChange({ ...value, items: value.items.filter((candidate) => candidate.key !== item.key) })}>{copy.remove}</button>
            </div>
          ))}
          {!value.items.length && <p className="text-xs text-neutral-500">{copy.none}</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold">{copy.venues}</h3>
            <p className="mt-1 text-xs text-neutral-400">{copy.venuesHelp}</p>
            <p className="mt-2 text-xs text-cyan-100/80">{copy.venuesRequiredHelp}</p>
          </div>
          <button type="button" className={small} onClick={addVenue}>{copy.addVenue}</button>
        </div>

        {validationIssue?.section === "venue" && (
          <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-xs text-rose-100">
            {validationIssueText(validationIssue, lang)}
          </p>
        )}

        <div className="mt-4 space-y-3">
          {value.venues.map((venue, index) => {
            const expanded = expandedVenueKey === venue.key;
            const complete = Boolean(normalizeKey(venue.id) && normalizeKey(venue.type) && hasLocalizedValue(venue.nameByLocale, locales));
            const firstName = locales.map((locale) => localizedValue(venue.nameByLocale, locale).trim()).find(Boolean);
            const displayName = firstName || venue.id || copy.newVenue;
            const typeChoice = isKnownVenueType(venue.type) ? venue.type : "__custom__";
            const foodVenue = isFoodVenueType(venue.type);

            return (
              <div key={venue.key} className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40">
                <button
                  type="button"
                  onClick={() => setExpandedVenueKey(expanded ? null : venue.key)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-neutral-900"
                  aria-expanded={expanded}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-100">{index + 1}. {displayName}</p>
                    <p className="mt-0.5 truncate text-xs text-neutral-500">{venue.type || copy.customType}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`rounded-full px-2 py-1 text-[10px] ${complete ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-100"}`}>
                      {complete ? copy.ready : copy.incomplete}
                    </span>
                    <span className="text-lg text-neutral-400" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-neutral-800 p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs text-neutral-400">
                        <span className="flex items-center gap-2">{copy.venueId}<span className="text-[10px] text-rose-200">{copy.required}</span></span>
                        <input value={venue.id} onChange={(event) => patchVenue(venue.key, { id: normalizeKey(event.target.value) })} placeholder="main_restaurant" className={input} />
                      </label>
                      <div>
                        <label className="text-xs text-neutral-400">
                          <span className="flex items-center gap-2">{copy.venueType}<span className="text-[10px] text-rose-200">{copy.required}</span></span>
                          <select
                            value={typeChoice}
                            onChange={(event) => {
                              const next = event.target.value;
                              changeVenueType(venue, next === "__custom__" ? "" : next);
                            }}
                            className={input}
                          >
                            {VENUE_TYPE_SUGGESTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
                            <option value="__custom__">{copy.customType}</option>
                          </select>
                        </label>
                        {typeChoice === "__custom__" && (
                          <label className="mt-2 block text-xs text-neutral-400">
                            {copy.customTypeLabel}
                            <input value={venue.type} onChange={(event) => changeVenueType(venue, event.target.value)} placeholder="rooftop_observatory" className={input} />
                          </label>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 space-y-3">
                      <LocalizedFields locales={locales} value={venue.nameByLocale} onChange={(next) => patchVenue(venue.key, { nameByLocale: next })} label={copy.nameLabel} requiredAtLeastOne copy={copy} />
                      <LocalizedFields locales={locales} value={venue.descriptionByLocale} onChange={(next) => patchVenue(venue.key, { descriptionByLocale: next })} label={copy.descriptionLabel} multiline optional copy={copy} />
                      <LocalizedFields locales={locales} value={venue.hoursByLocale} onChange={(next) => patchVenue(venue.key, { hoursByLocale: next })} label={copy.hoursLabel} optional copy={copy} />
                      <LocalizedFields locales={locales} value={venue.locationByLocale} onChange={(next) => patchVenue(venue.key, { locationByLocale: next })} label={copy.locationLabel} optional copy={copy} />
                      {foodVenue && (
                        <LocalizedFields locales={locales} value={venue.cuisineByLocale} onChange={(next) => patchVenue(venue.key, { cuisineByLocale: next })} label={copy.cuisineLabel} optional copy={copy} />
                      )}
                    </div>

                    <div className="mt-4 rounded-xl border border-neutral-800 p-3">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-neutral-300">{copy.structuredHours}</p>
                        <span className="text-[10px] text-neutral-500">{copy.optional}</span>
                      </div>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <label className="text-xs text-neutral-400">{copy.opens}<input type="time" value={venue.open} onChange={(event) => patchVenue(venue.key, { open: event.target.value })} className={input} /></label>
                        <label className="text-xs text-neutral-400">{copy.closes}<input type="time" value={venue.close} onChange={(event) => patchVenue(venue.key, { close: event.target.value })} className={input} /></label>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-neutral-800 p-3">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-neutral-300">{copy.reservation}</p>
                        <span className="text-[10px] text-neutral-500">{copy.optional}</span>
                      </div>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <label className="text-xs text-neutral-400">{copy.reservationType}<select value={venue.reservationType} onChange={(event) => patchVenue(venue.key, { reservationType: event.target.value as VenueDraft["reservationType"] })} className={input}>{RESERVATION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                        <label className="text-xs text-neutral-400">{copy.reservationUrl}<input value={venue.reservationUrl} onChange={(event) => patchVenue(venue.key, { reservationUrl: event.target.value })} placeholder="https://…" className={input} /></label>
                        <label className="text-xs text-neutral-400">{copy.reservationPhone}<input value={venue.reservationPhone} onChange={(event) => patchVenue(venue.key, { reservationPhone: event.target.value })} className={input} /></label>
                        <label className="text-xs text-neutral-400">{copy.reservationWhatsapp}<input value={venue.reservationWhatsapp} onChange={(event) => patchVenue(venue.key, { reservationWhatsapp: event.target.value })} className={input} /></label>
                        <label className="text-xs text-neutral-400">{copy.reservationEmail}<input type="email" value={venue.reservationEmail} onChange={(event) => patchVenue(venue.key, { reservationEmail: event.target.value })} className={input} /></label>
                      </div>
                      <label className="mt-3 block text-xs text-neutral-300"><input type="checkbox" checked={venue.requiresReservation} onChange={(event) => patchVenue(venue.key, { requiresReservation: event.target.checked })} className="mr-2" />{copy.requiresReservation}</label>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-neutral-300">
                      <label><input type="checkbox" checked={venue.active} onChange={(event) => patchVenue(venue.key, { active: event.target.checked })} className="mr-2" />{copy.active}</label>
                      <label><input type="checkbox" checked={venue.aiVisible} onChange={(event) => patchVenue(venue.key, { aiVisible: event.target.checked })} className="mr-2" />{copy.aiVisible}</label>
                    </div>
                    <button type="button" className="mt-3 text-xs text-rose-300" onClick={() => removeVenue(venue.key)}>{copy.remove}</button>
                  </div>
                )}
              </div>
            );
          })}
          {!value.venues.length && <p className="text-xs text-neutral-500">{copy.none}</p>}
        </div>
      </div>
    </div>
  );
}
