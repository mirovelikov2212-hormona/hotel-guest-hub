"use client";

// STAYHUB_SECTION_ICON_HELPERS
const SECTION_ICON_PREFIXES: Record<string, string> = {
  info: "ℹ️",
  information: "ℹ️",
  hotel_info: "ℹ️",
  animation: "🎭",
  activities: "🎭",
  ai: "🤖",
  concierge: "🤖",
  ai_concierge: "🤖",
  reception: "🏨",
  housekeeping: "🧺",
  maintenance: "🛠️",
  emergency: "🚨",
  outlets: "🍽️",
  facilities: "🏨",
  venues: "🏨",
  wifi: "📶",
  reviews: "⭐",
  social: "📱",
  follow: "📱",
  explore: "🗺️",
  nearby: "🗺️",
  world_cup: "🏆",
  worldcup: "🏆",
  fifa: "🏆",
};

function withSectionIcon(title: string, sectionKey?: string): string {
  const raw = String(title || "").trim();
  if (!raw) return raw;

  // Already starts with emoji/symbol icon.
  if (/^[\p{Extended_Pictographic}⭐ℹ️⚠️☎️🏨🧺🛠️🎭🤖📶🍽️🗺️🚨]/u.test(raw)) {
    return raw;
  }

  const key = String(sectionKey || "").toLowerCase().trim();
  const text = raw.toLowerCase();

  const icon =
    SECTION_ICON_PREFIXES[key] ||
    (text.includes("инфо") ||
    text.includes("info") ||
    text.includes("information") ||
    text.includes("informace")
      ? "ℹ️"
      : text.includes("анима") ||
        text.includes("animation") ||
        text.includes("animație") ||
        text.includes("animace") ||
        text.includes("animationen")
      ? "🎭"
      : text.includes("social") ||
        text.includes("последвайте") ||
        text.includes("follow") ||
        text.includes("facebook") ||
        text.includes("instagram") ||
        text.includes("tiktok")
      ? "📱"
      : text.includes("world cup") ||
        text.includes("световно") ||
        text.includes("weltmeisterschaft") ||
        text.includes("cupa mondial") ||
        text.includes("mistrovství světa")
      ? "🏆"
      : "");

  return icon ? `${icon} ${raw}` : raw;
}
// END_STAYHUB_SECTION_ICON_HELPERS


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StaffDepartment, StaffRequestType, StaffServiceTime, StaffRequestStatus } from "@/lib/staff/types";
import { usePathname, useSearchParams } from "next/navigation";
import type { HotelConfig, LangKey, HubSection, DepartmentKey, HubItem, RequestDef } from "@/lib/types";
import { normalizeStaffRequestType } from "@/lib/staff/request-type-utils";
import { persistQrContextFromUrl, trackHubEvent } from "@/lib/trackHubEvent";
import InstallAppButton from "@/components/InstallAppButton";
import {
  buildWhatsAppLink,
  isAfterCutoffLocal,
  isWithinHoursLocal,
  safeTelLink,
} from "@/lib/utils";
import { getRequestDefText } from "@/lib/request-defs";

function clsx(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

const reDate = /^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.(\d{4})$/; // DD.MM.YYYY
const reTime = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM

function askRequired(label: string, example: string, re: RegExp, invalidMsg: string) {
  while (true) {
    const v = (window.prompt(label, example) || "").trim();
    if (!v) return null;
    if (re.test(v)) return v;
    window.alert(invalidMsg);
  }
}

function timeToMinutes(value?: string) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function parseTimeRanges(value?: string) {
  const text = String(value || "")
    .replace(/[–—]/g, "-")
    .replace(/\s+to\s+/gi, "-")
    .replace(/\s+bis\s+/gi, "-")
    .replace(/\s+до\s+/gi, "-");

  const ranges: Array<{ start: number; end: number; label: string }> = [];
  const re = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const start = timeToMinutes(match[1]);
    const end = timeToMinutes(match[2]);
    if (start === null || end === null) continue;
    ranges.push({ start, end, label: `${match[1]} - ${match[2]}` });
  }

  return ranges;
}

function isWithinAnyTimeRange(value: string, ranges: Array<{ start: number; end: number }>) {
  const current = timeToMinutes(value);
  if (current === null) return false;

  return ranges.some(({ start, end }) => {
    if (start <= end) return current >= start && current <= end;
    return current >= start || current <= end;
  });
}

type VenueRow = {
  category?: string;
  type?: string;
  name: string;
  nameByLang?: Partial<Record<LangKey, string>>;
  active?: boolean;
  sortOrder?: number | string;
  icon?: string;

  shortDescription?: string;
  shortDescriptionByLang?: Partial<Record<LangKey, string>>;
  description?: string;
  descriptionByLang?: Partial<Record<LangKey, string>>;
  cuisine?: string;
  cuisineByLang?: Partial<Record<LangKey, string>>;
  hours?: string;
  hoursByLang?: Partial<Record<LangKey, string>>;
  open?: string;
  close?: string;
  menuUrl?: string;
  location?: string;
  locationByLang?: Partial<Record<LangKey, string>>;

  requiresReservation?: boolean;

  reservationType?: "whatsapp" | "phone" | "url" | "email" | "request" | "staff" | "none";
  reservationDepartment?: "reception" | "restaurant" | string;
  reservationUrl?: string;
  reservationPhone?: string;
  reservationWhatsapp?: string;
  reservationEmail?: string;
  reservationLabel?: string;
  reservationLabelByLang?: Partial<Record<LangKey, string>>;
  reservationMessage?: string;
  reservationMessageByLang?: Partial<Record<LangKey, string>>;
  reservationAskOccasion?: boolean;
  reservationHours?: string;

  programUrl?: string;
  programText?: string;
  programTextByLang?: Partial<Record<LangKey, string>>;
  ageGroup?: string;
  ageGroupByLang?: Partial<Record<LangKey, string>>;

  whatsapp?: string;
  phone?: string;
};

function normalizeCategory(v: VenueRow) {
  const raw = String(v.category || v.type || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

  const aliasMap: Record<string, string> = {
    restaurant: "restaurants",
    restaurants: "restaurants",
    bar: "bars",
    bars: "bars",
    kid: "kids",
    kids: "kids",
    kidsclub: "kids",
    kids_club: "kids",
    child: "kids",
    children: "kids",
    fitness: "gym",
    roomservice: "room_service",
    room_service: "room_service",
    room_services: "room_service",
    entertainment: "entertainment",
    game: "entertainment",
    games: "entertainment",
    gamesroom: "entertainment",
    games_room: "entertainment",
  };

  return aliasMap[raw] || raw || "other";
}

function getLanguageFallbackOrder(lang: LangKey | string): string[] {
  const current = String(lang || "").trim().toLowerCase();
  const alias = current === "cs" ? "cz" : current === "cz" ? "cs" : "";

  return Array.from(
    new Set([current, alias, "en", "bg", "de", "ro", "cs"].filter(Boolean))
  );
}

function getLocalizedValue(
  map: Partial<Record<LangKey, string>> | undefined,
  lang: LangKey | string,
  fallback = ""
): string {
  const values = map ?? {};

  for (const candidate of getLanguageFallbackOrder(lang)) {
    const value = String(values[candidate] || "").trim();
    if (value) return value;
  }

  return String(fallback || "").trim();
}

function getVenueText(venue: VenueRow, field: keyof VenueRow, lang: LangKey | string): string {
  const mapKey = `${String(field)}ByLang` as keyof VenueRow;
  return getLocalizedValue(
    venue[mapKey] as Partial<Record<LangKey, string>> | undefined,
    lang,
    String(venue[field] || "")
  );
}

function humanizeCategory(value: string) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (!cleaned) return "Other";

  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function categoryMeta(category: string) {
  const key = String(category || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

  const meta: Record<string, { title: string; icon: string }> = {
    restaurants: { title: "Restaurants", icon: "🍽️" },
    bars: { title: "Bars", icon: "🍸" },
    spa: { title: "Spa", icon: "🧖" },
    lounge: { title: "Lounge", icon: "🛋️" },
    kids: { title: "Kids Club", icon: "🧒" },
    pool: { title: "Pool", icon: "🏖️" },
    gym: { title: "Fitness", icon: "🏋️" },
    room_service: { title: "Room Service", icon: "🛎️" },
    entertainment: { title: "Entertainment", icon: "🎱" },
  };

  return meta[key] ?? { title: humanizeCategory(key), icon: "📍" };
}

function getBuiltinUiText(lang: LangKey | string, key: string) {
  const normalizedLang = String(lang || "").trim().toLowerCase();
  const targetLang = ["bg", "de", "en", "ro", "cs"].includes(normalizedLang)
    ? normalizedLang
    : "en";

  const copy: Record<string, Record<string, string>> = {
    bg: {
      install_app: "Инсталирай приложението",
      outlets_title: "Обекти",
      hours: "Работно време",
      cuisine: "Кухня",
      location: "Локация",
      age_group: "Възраст",
      program: "Програма",
      view_menu_pdf: "Виж менюто",
      view_program: "Виж програмата",
      reserve_now: "Резервирай",
      outlet_type_restaurants: "Ресторанти",
      outlet_type_bars: "Барове",
      outlet_type_spa: "Spa",
      outlet_type_lounge: "Lounge",
      outlet_type_kids: "Kids Club",
      outlet_type_pool: "Pool",
      outlet_type_gym: "Fitness",
      outlet_type_room_service: "Room Service",
      outlet_type_entertainment: "Развлечения",
      room_cleaning: "Почистване на стаята",
      extra_pillows: "Допълнителни възглавници",
      wake_up: "Събуждане",
      coffee_capsules: "Кафе капсули",
      pillow_menu: "Меню възглавници",
      special_occasion: "Специален повод",
      minibar: "Зареждане минибар",
      coffee_machine: "Кафе машина",
      ac_issue: "Климатик / отопление",
      water_issue: "Проблем с водата",
      something_broken: "Нещо е счупено",
      bathrobe: "Халат",
      slippers: "Чехли",
      baby_cot: "Бебешко легло",
      tv_issue: "Проблем с телевизора",
      light_not_working: "Проблем с осветлението",
      bathroom_issue: "Проблем в банята",
      door_lock_issue: "Проблем с вратата / ключалката",
      wifi_issue: "Проблем с Wi‑Fi",
      power_outlet_issue: "Проблем с контакт",
      safe_issue: "Проблем със сейфа",
      balcony_door_issue: "Проблем с балконската врата",
      minibar_not_cooling: "Минибарът не охлажда",
      reception_general: "Въпрос към рецепция",
      information: "Информация",
      luggage_help: "Помощ с багаж",
      paid_service_notice: "Платена услуга. Сумата ще бъде начислена към сметката на стаята.",
      laundry_paid_notice: "Услугата пране е платена. След потвърждение заявката ще бъде изпратена към housekeeping и начислена към сметката на стаята от рецепция.",
      minibar_paid_notice: "Зареждането на минибар е платена услуга. След потвърждение заявката ще бъде изпратена към housekeeping и начислена към сметката на стаята от рецепция.",
      something_broken_prompt: "Опишете какво е счупено или повредено:",
      something_broken_required: "Моля, опишете какво е счупено, за да може поддръжката да реагира правилно.",
      ai_intro: "Мога да помагам само с информация за хотела – ресторанти, барове, работно време, спа, детски кът, стая за игри, удобства и услуги в хотела.",
    },
    de: {
      install_app: "App installieren",
      outlets_title: "Einrichtungen",
      hours: "Öffnungszeiten",
      cuisine: "Küche",
      location: "Ort",
      age_group: "Alter",
      program: "Programm",
      view_menu_pdf: "Menü ansehen",
      view_program: "Programm ansehen",
      reserve_now: "Reservieren",
      outlet_type_restaurants: "Restaurants",
      outlet_type_bars: "Bars",
      outlet_type_spa: "Spa",
      outlet_type_lounge: "Lounge",
      outlet_type_kids: "Kids Club",
      outlet_type_pool: "Pool",
      outlet_type_gym: "Fitness",
      outlet_type_room_service: "Zimmerservice",
      outlet_type_entertainment: "Unterhaltung",
      room_cleaning: "Zimmerreinigung",
      extra_pillows: "Extra Kissen",
      wake_up: "Weckruf",
      coffee_capsules: "Kaffeekapseln",
      pillow_menu: "Kissenmenü",
      special_occasion: "Besonderer Anlass",
      minibar: "Minibar auffüllen",
      coffee_machine: "Kaffeemaschine",
      ac_issue: "Klima / Heizung",
      water_issue: "Wasserproblem",
      something_broken: "Etwas ist kaputt",
      bathrobe: "Bademantel",
      slippers: "Hausschuhe",
      baby_cot: "Babybett",
      tv_issue: "TV-Problem",
      light_not_working: "Problem mit der Beleuchtung",
      bathroom_issue: "Problem im Badezimmer",
      door_lock_issue: "Problem mit Tür / Schloss",
      wifi_issue: "WLAN-Problem",
      power_outlet_issue: "Problem mit Steckdose",
      safe_issue: "Problem mit Safe",
      balcony_door_issue: "Problem mit Balkontür",
      minibar_not_cooling: "Minibar kühlt nicht",
      reception_general: "Frage an die Rezeption",
      information: "ℹ️ Information",
      luggage_help: "Hilfe mit Gepäck",
      paid_service_notice: "Kostenpflichtiger Service. Der Betrag wird auf die Zimmerrechnung gebucht.",
      laundry_paid_notice: "Der Wäscheservice ist kostenpflichtig. Nach Bestätigung wird die Anfrage an Housekeeping gesendet und von der Rezeption auf die Zimmerrechnung gebucht.",
      minibar_paid_notice: "Das Auffüllen der Minibar ist kostenpflichtig. Nach Bestätigung wird die Anfrage an Housekeeping gesendet und von der Rezeption auf die Zimmerrechnung gebucht.",
      something_broken_prompt: "Bitte beschreiben Sie, was kaputt oder beschädigt ist:",
      something_broken_required: "Bitte beschreiben Sie, was kaputt ist, damit die Technik richtig reagieren kann.",
      ai_intro: "Ich kann nur mit Hotelinformationen helfen – Restaurants, Bars, Öffnungszeiten, Spa, Kinderclub, Spielzimmer, Einrichtungen und Hoteldienstleistungen.",
    },
    en: {
      install_app: "Install the app",
      outlets_title: "Facilities",
      hours: "Opening hours",
      cuisine: "Cuisine",
      location: "Location",
      age_group: "Age group",
      program: "Program",
      view_menu_pdf: "View menu",
      view_program: "View program",
      reserve_now: "Reserve",
      hotel_info_title: "ℹ️ Info",
      section_info_title: "ℹ️ Info",
      section_animation_title: "🎭 Animation",
      section_world_cup_title: "🏆 World Cup 2026",
      subsection_policies: "Policies",
      outlet_type_restaurants: "Restaurants",
      outlet_type_bars: "Bars",
      outlet_type_spa: "Spa",
      outlet_type_lounge: "Lounge",
      outlet_type_kids: "Kids Club",
      outlet_type_pool: "Pool",
      outlet_type_gym: "Fitness",
      outlet_type_room_service: "Room Service",
      outlet_type_entertainment: "Entertainment",
      room_cleaning: "Room cleaning",
      extra_pillows: "Extra pillows",
      wake_up: "Wake-up call",
      coffee_capsules: "Coffee capsules",
      pillow_menu: "Pillow menu",
      special_occasion: "Special occasion",
      minibar: "Refill minibar",
      coffee_machine: "Coffee machine",
      ac_issue: "AC / heating",
      water_issue: "Water issue",
      something_broken: "Something broken",
      bathrobe: "Bathrobe",
      slippers: "Slippers",
      baby_cot: "Baby cot",
      tv_issue: "TV issue",
      light_not_working: "Light issue",
      bathroom_issue: "Bathroom issue",
      door_lock_issue: "Door / lock issue",
      wifi_issue: "Wi‑Fi issue",
      power_outlet_issue: "Power outlet issue",
      safe_issue: "Safe issue",
      balcony_door_issue: "Balcony door issue",
      minibar_not_cooling: "Minibar not cooling",
      reception_general: "Question for reception",
      information: "ℹ️ Information",
      luggage_help: "Luggage assistance",
      paid_service_notice: "Paid service. The amount will be charged to the room account.",
      laundry_paid_notice: "Laundry service is a paid service. After confirmation, the request will be sent to housekeeping and charged to the room account by reception.",
      minibar_paid_notice: "Minibar refill is a paid service. After confirmation, the request will be sent to housekeeping and charged to the room account by reception.",
      something_broken_prompt: "Please describe what is broken or damaged:",
      something_broken_required: "Please describe what is broken so maintenance can respond properly.",
      ai_intro: "I can help only with hotel information – restaurants, bars, opening hours, spa, kids club, games room, facilities and hotel services.",
    },
    ro: {
      install_app: "Instalează aplicația",
      outlets_title: "Facilități",
      hours: "Program",
      cuisine: "Bucătărie",
      location: "Locație",
      age_group: "Vârstă",
      program: "Program",
      view_menu_pdf: "Vezi meniul",
      view_program: "Vezi programul",
      reserve_now: "Rezervă",
      hotel_info_title: "Informații",
      section_info_title: "Informații",
      section_animation_title: "🎭 Animație",
      section_world_cup_title: "🏆 Cupa Mondială 2026",
      subsection_policies: "Politici",
      outlet_type_restaurants: "Restaurante",
      outlet_type_bars: "Baruri",
      outlet_type_spa: "Spa",
      outlet_type_lounge: "Lounge",
      outlet_type_kids: "Kids Club",
      outlet_type_pool: "Piscină",
      outlet_type_gym: "Fitness",
      outlet_type_room_service: "Room Service",
      outlet_type_entertainment: "Divertisment",
      room_cleaning: "Curățenie cameră",
      extra_pillows: "Perne suplimentare",
      wake_up: "Apel de trezire",
      coffee_capsules: "Capsule de cafea",
      pillow_menu: "Meniu perne",
      special_occasion: "Ocazie specială",
      minibar: "Reumplere minibar",
      coffee_machine: "Aparat de cafea",
      ac_issue: "Aer condiționat / încălzire",
      water_issue: "Problemă cu apa",
      something_broken: "Ceva este stricat",
      bathrobe: "Halat de baie",
      slippers: "Papuci",
      baby_cot: "Pătuț pentru bebeluș",
      tv_issue: "Problemă cu televizorul",
      light_not_working: "Problemă cu lumina",
      bathroom_issue: "Problemă la baie",
      door_lock_issue: "Problemă cu ușa / încuietoarea",
      wifi_issue: "Problemă cu Wi‑Fi",
      power_outlet_issue: "Problemă cu priza",
      safe_issue: "Problemă cu seiful",
      balcony_door_issue: "Problemă cu ușa balconului",
      minibar_not_cooling: "Minibarul nu răcește",
      reception_general: "Întrebare pentru recepție",
      information: "Informații",
      luggage_help: "Asistență pentru bagaje",
      paid_service_notice: "Serviciu contra cost. Suma va fi adăugată la contul camerei.",
      laundry_paid_notice: "Serviciul de spălătorie este contra cost. După confirmare, solicitarea va fi trimisă la housekeeping și va fi adăugată la contul camerei de către recepție.",
      minibar_paid_notice: "Reumplerea minibarului este un serviciu contra cost. După confirmare, solicitarea va fi trimisă la housekeeping și va fi adăugată la contul camerei de către recepție.",
      something_broken_prompt: "Descrieți ce este stricat sau deteriorat:",
      something_broken_required: "Vă rugăm să descrieți ce este stricat, pentru ca echipa de întreținere să poată interveni corect.",
      ai_intro: "Pot ajuta doar cu informații despre hotel – restaurante, baruri, program de lucru, spa, club pentru copii, sală de jocuri, facilități și servicii ale hotelului.",
    },
    cs: {
      install_app: "Nainstalovat aplikaci",
      outlets_title: "Zařízení",
      hours: "Otevírací doba",
      cuisine: "Kuchyně",
      location: "Místo",
      age_group: "Věk",
      program: "Program",
      view_menu_pdf: "Zobrazit menu",
      view_program: "Zobrazit program",
      reserve_now: "Rezervovat",
      hotel_info_title: "Informace",
      section_info_title: "Informace",
      section_animation_title: "🎭 Animace",
      section_world_cup_title: "🏆 Mistrovství světa 2026",
      subsection_policies: "Zásady",
      outlet_type_restaurants: "Restaurace",
      outlet_type_bars: "Bary",
      outlet_type_spa: "Spa",
      outlet_type_lounge: "Lounge",
      outlet_type_kids: "Kids Club",
      outlet_type_pool: "Bazén",
      outlet_type_gym: "Fitness",
      outlet_type_room_service: "Room Service",
      outlet_type_entertainment: "Zábava",
      room_cleaning: "Úklid pokoje",
      extra_pillows: "Polštáře navíc",
      wake_up: "Buzení",
      coffee_capsules: "Kávové kapsle",
      pillow_menu: "Menu polštářů",
      special_occasion: "Zvláštní příležitost",
      minibar: "Doplnit minibar",
      coffee_machine: "Kávovar",
      ac_issue: "Klimatizace / topení",
      water_issue: "Problém s vodou",
      something_broken: "Něco je rozbité",
      bathrobe: "Župan",
      slippers: "Pantofle",
      baby_cot: "Dětská postýlka",
      tv_issue: "Problém s TV",
      light_not_working: "Problém s osvětlením",
      bathroom_issue: "Problém v koupelně",
      door_lock_issue: "Problém se dveřmi / zámkem",
      wifi_issue: "Problém s Wi‑Fi",
      power_outlet_issue: "Problém se zásuvkou",
      safe_issue: "Problém s trezorem",
      balcony_door_issue: "Problém s balkonovými dveřmi",
      minibar_not_cooling: "Minibar nechladí",
      reception_general: "Dotaz na recepci",
      information: "Informace",
      luggage_help: "Pomoc se zavazadly",
      paid_service_notice: "Placená služba. Částka bude připsána na účet pokoje.",
      laundry_paid_notice: "Prádelna je placená služba. Po potvrzení bude požadavek odeslán úklidu pokojů a recepce částku připíše na účet pokoje.",
      minibar_paid_notice: "Doplnění minibaru je placená služba. Po potvrzení bude požadavek odeslán úklidu pokojů a recepce částku připíše na účet pokoje.",
      something_broken_prompt: "Popište, co je rozbité nebo poškozené:",
      something_broken_required: "Popište prosím, co je rozbité, aby údržba mohla správně reagovat.",
      ai_intro: "Mohu pomoci pouze s informacemi o hotelu – restaurace, bary, otevírací doba, spa, dětský klub, herna, vybavení a hotelové služby.",
    },
  };

  return copy[targetLang]?.[key] || "";
}

function getCategoryDisplayTitle(category: string, tUI: (k: string) => any) {
  const key = `outlet_type_${category}`;
  const translated = String(tUI(key) || "").trim();

  if (translated && translated !== key) {
    return translated;
  }

  return categoryMeta(category).title;
}

type StoredGuestRequestRef = {
  id: string;
  room: string;
};

type GuestStatusRow = {
  id: string;
  room_number_snapshot: string | null;
  title: string;
  request_type: StaffRequestType;
  status: StaffRequestStatus;
  created_at: string;
};

type GuestStatusItem = {
  id: string;
  room: string;
  title: string;
  type: StaffRequestType;
  rawType?: string;
  status: StaffRequestStatus;
  createdAt: string;
};

type RequestDialogState = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
} | null;

type StoredGuestRoomState = {
  manualRoomInput: string;
  room: string;
  roomConfirmed: boolean;
};

const GUEST_REQUEST_REFS_STORAGE_KEY = "guesthub_guest_request_refs";

function getGuestRoomStateStorageKey(hotelSlug: string) {
  return `guesthub_room_state:${String(hotelSlug || "default").trim().toLowerCase()}`;
}

function readStoredGuestRoomState(hotelSlug: string): StoredGuestRoomState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getGuestRoomStateStorageKey(hotelSlug));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Record<string, unknown>;
    return {
      manualRoomInput: typeof candidate.manualRoomInput === "string" ? candidate.manualRoomInput : "",
      room: typeof candidate.room === "string" ? candidate.room : "",
      roomConfirmed: Boolean(candidate.roomConfirmed),
    };
  } catch {
    return null;
  }
}

function writeStoredGuestRoomState(hotelSlug: string, state: StoredGuestRoomState) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getGuestRoomStateStorageKey(hotelSlug),
      JSON.stringify(state)
    );
  } catch (error) {
    console.error("writeStoredGuestRoomState failed", error);
  }
}

function readStoredGuestRequestRefs(): StoredGuestRequestRef[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(GUEST_REQUEST_REFS_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is StoredGuestRequestRef => {
      if (!item || typeof item !== "object") return false;

      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.room === "string"
      );
    });
  } catch {
    return [];
  }
}

function writeStoredGuestRequestRefs(refs: StoredGuestRequestRef[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      GUEST_REQUEST_REFS_STORAGE_KEY,
      JSON.stringify(refs)
    );
  } catch (error) {
    console.error("writeStoredGuestRequestRefs failed", error);
  }
}

function pushStoredGuestRequestRef(
  ref: StoredGuestRequestRef
): StoredGuestRequestRef[] {
  const current = readStoredGuestRequestRefs();

  const next = [ref, ...current.filter((item) => item.id !== ref.id)].slice(
    0,
    20
  );

  writeStoredGuestRequestRefs(next);
  return next;
}

function mapGuestStatusRow(row: GuestStatusRow): GuestStatusItem {
  return {
    id: row.id,
    room: row.room_number_snapshot ?? "",
    title: row.title,
    type: row.request_type,
    rawType: row.request_type,
    status: row.status,
    createdAt: new Date(row.created_at).toLocaleString([], {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function getGuestRequestIcon(type: StaffRequestType | string): string {
  switch (String(type || "").trim().toLowerCase()) {
    case "towels":
      return "🧺";
    case "toilet_paper":
      return "🧻";
    case "extra_pillow":
      return "🛏️";
    case "extra_blanket":
      return "🛌";
    case "bathrobe":
      return "🥼";
    case "slippers":
      return "🩴";
    case "baby_cot":
      return "👶";
    case "iron":
      return "👔";
    case "laundry":
      return "🧺";
    case "room_cleaning_request":
    case "extra_cleaning":
      return "🧹";
    case "minibar":
    case "minibar_refill":
      return "🥤";
    case "coffee_capsules":
    case "coffee-capsules":
    case "capsules":
      return "☕";
    case "pillow_menu":
    case "pillow-menu":
      return "🛏️";
    case "late_checkout":
      return "🕒";
    case "wake_up_call":
      return "⏰";
    case "taxi":
      return "🚕";
    case "information":
    case "information_request":
      return "ℹ️";
    case "reservation_help":
    case "restaurant_reservation":
      return "🍽️";
    case "luggage_help":
      return "🧳";
    case "special_occasion":
      return "🎉";
    case "massage":
    case "massage_booking":
    case "spa_massage":
      return "💆";
    case "air_conditioning":
      return "❄️";
    case "no_hot_water":
      return "🚿";
    case "tv_issue":
      return "📺";
    case "light_issue":
    case "light_not_working":
      return "💡";
    case "bathroom_issue":
      return "🚽";
    case "door_lock_issue":
      return "🚪";
    case "wifi_issue":
      return "📶";
    case "power_outlet_issue":
      return "🔌";
    case "safe_issue":
      return "🔒";
    case "balcony_door_issue":
      return "🪟";
    case "minibar_not_cooling":
      return "🧊";
    case "coffee_machine":
      return "☕";
    case "other_technical_issue":
      return "🛠️";
    default:
      return "•";
  }
}

function formatGuestRequestLabel(type: StaffRequestType | string, label: string) {
  const text = String(label || "").trim();
  const icon = getGuestRequestIcon(type);

  if (!text) return icon === "•" ? "" : icon;
  if (!icon || icon === "•") return text;

  // Avoid duplicating icons when the label already starts with an emoji/symbol.
  if (/^[^\p{L}\p{N}]/u.test(text)) return text;

  return `${icon} ${text}`;
}

function cleanRequestTitle(value: string) {
  return value.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

function normalizeGuestRequestTitleForLookup(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9а-яё]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getGuestRequestLabelKey(type: StaffRequestType | string, storedTitle?: string) {
  const rawType = String(type || "").trim().toLowerCase();
  const normalizedTitle = normalizeGuestRequestTitleForLookup(storedTitle || "");
  const source = `${rawType} ${normalizedTitle}`.trim();

  if (!source) return "";

  const directTypeKeys: Record<string, string> = {
    towels: "towels",
    toilet_paper: "toilet_paper",
    extra_pillow: "extra_pillows",
    extra_pillows: "extra_pillows",
    extra_blanket: "blanket",
    bathrobe: "bathrobe",
    slippers: "slippers",
    baby_cot: "baby_cot",
    iron: "iron",
    minibar: "minibar",
    minibar_refill: "minibar",
    laundry: "laundry",
    late_checkout: "late_checkout",
    wake_up_call: "wake_up",
    taxi: "taxi",
    luggage_help: "luggage_help",
    reservation_help: "reserve_table",
    restaurant_reservation: "reserve_table",
    air_conditioning: "ac_issue",
    no_hot_water: "water_issue",
    tv_issue: "tv_issue",
    light_not_working: "light_not_working",
    bathroom_issue: "bathroom_issue",
    door_lock_issue: "door_lock_issue",
    wifi_issue: "wifi_issue",
    power_outlet_issue: "power_outlet_issue",
    safe_issue: "safe_issue",
    balcony_door_issue: "balcony_door_issue",
    minibar_not_cooling: "minibar_not_cooling",
    other_technical_issue: "something_broken",
  };

  if (directTypeKeys[rawType]) return directTypeKeys[rawType];

  const titlePatterns: Array<[RegExp, string]> = [
    [/(extra pillow|perna suplimentara|polstar navic|extra kissen|доп.*възглав|възглав)/i, "extra_pillows"],
    [/(wake up|trezire|buzeni|weckruf|събуждан)/i, "wake_up"],
    [/(bathrobe|halat|zupan|bademantel|халат)/i, "bathrobe"],
    [/(slippers|papuci|pantofle|hausschuhe|чехли)/i, "slippers"],
    [/(baby cot|patut|postyl|babybett|бебешко)/i, "baby_cot"],
    [/(toilet paper|hartie igienica|toaletni papir|toilettenpapier|тоалетна)/i, "toilet_paper"],
    [/(towels|prosoape|rucnik|handtuch|хавли)/i, "towels"],
    [/(blanket|patura|prikryvka|decke|одеял)/i, "blanket"],
    [/(laundry|spalatorie|pradelna|wasche|пране)/i, "laundry"],
    [/(minibar|минибар)/i, "minibar"],
    [/(coffee capsule|capsule|capsule cafea|kapsle|кафе капсул)/i, "coffee_capsules"],
    [/(pillow menu|meniu perne|menu polstaru|меню възглав)/i, "pillow_menu"],
    [/(late check|checkout|check out|check-out|късен)/i, "late_checkout"],
    [/(taxi|такси)/i, "taxi"],
    [/(special occasion|ocazie|prilezitost|специален повод)/i, "special_occasion"],
    [/(coffee machine|aparat de cafea|kavovar|kaffeemaschine|кафе машина)/i, "coffee_machine"],
    [/(water|apa|voda|wasser|водата)/i, "water_issue"],
    [/(air condition|climat|klima|климатик|отопление)/i, "ac_issue"],
    [/(broken|stricat|rozbite|kaputt|счупено|повредено)/i, "something_broken"],
  ];

  for (const [pattern, key] of titlePatterns) {
    if (pattern.test(source)) return key;
  }

  return "";
}

function getRequestDefButtonIcon(def: RequestDef): string {
  const explicitIcon = String(def.icon || "").trim();
  if (explicitIcon && explicitIcon.length <= 6 && !/[a-z0-9_-]/i.test(explicitIcon)) {
    return explicitIcon;
  }

  const raw = String(def.icon || def.requestType || def.id || "").trim().toLowerCase();
  const identity = [
    def.icon,
    def.requestType,
    def.id,
    ...Object.values(def.title ?? {}),
    ...Object.values(def.subtitle ?? {}),
    ...Object.values(def.description ?? {}),
    ...Object.values(def.policy ?? {}),
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");

  // Robust fallbacks for dynamic rows from Google Sheets where the icon/request key
  // may not exactly match the built-in IDs.
  if (/coffee|cafea|café|кафе|káv|kaffee|capsule|capsul|капсул|kapsl/.test(identity)) return "☕";
  if (/pillow|pern|kissen|polštář|възглав/.test(identity)) return "🛏️";
  if (/occasion|ocazie|příležitost|anlass|повод|birthday|anniversary|рожден|годишни/.test(identity)) return "🎉";
  if (/laundry|spălător|prádel|wäsche|пране/.test(identity)) return "🧺";
  if (/minibar|минибар/.test(identity)) return "🥤";
  if (/animation|animație|animace|анимац/.test(identity)) return "🎭";
  if (/world.?cup|fifa|cupa mondială|mistrovství světa|световно/.test(identity)) return "⚽";
  if (/charity|caritate|благотвор|wohltät|dobročin/.test(identity)) return "🤝";
  if (/towel|prosop|ručník|handtuch|хавли/.test(identity)) return "🧺";
  if (/sunbed|șezlong|lehát|liege|шезлонг/.test(identity)) return "🏖️";
  if (/massage|masaj|masáž|массаж|масаж|relax|релакс|spa/.test(identity)) return "💆";

  switch (raw) {
    case "towel":
    case "towels":
      return "🧺";
    case "toilet-paper":
    case "toilet_paper":
      return "🧻";
    case "pillow":
    case "extra_pillow":
      return "🛏️";
    case "blanket":
    case "extra_blanket":
      return "🛌";
    case "bath":
    case "bathrobe":
      return "🥼";
    case "shoe":
    case "slippers":
      return "🩴";
    case "baby":
    case "baby_cot":
      return "👶";
    case "iron":
      return "👔";
    case "laundry":
      return "🧺";
    case "cleaning":
    case "room_cleaning_request":
    case "extra_cleaning":
    case "sparkles":
      return "🧹";
    case "minibar":
    case "minibar_refill":
      return "🥤";
    case "coffee-capsules":
    case "coffee_capsules":
    case "capsules":
      return "☕";
    case "pillow-menu":
    case "pillow_menu":
      return "🛏️";
    case "clock":
    case "late_checkout":
      return "🕒";
    case "alarm-clock":
    case "wake_up_call":
      return "⏰";
    case "taxi":
      return "🚕";
    case "info":
    case "information":
    case "information_request":
      return "ℹ️";
    case "reservation":
    case "reservation_help":
    case "restaurant":
    case "restaurant_reservation":
      return "🍽️";
    case "luggage":
    case "luggage_help":
      return "🧳";
    case "special_occasion":
      return "🎉";
    case "massage":
    case "massage_booking":
    case "spa_massage":
      return "💆";
    case "air":
    case "air_conditioning":
      return "❄️";
    case "hot-water":
    case "no_hot_water":
      return "🚿";
    case "tv":
    case "tv_issue":
      return "📺";
    case "light":
    case "light_issue":
    case "light_not_working":
      return "💡";
    case "bathroom":
    case "bathroom_issue":
      return "🚽";
    case "lock":
    case "door_lock_issue":
      return "🚪";
    case "wifi":
    case "wifi_issue":
      return "📶";
    case "power":
    case "power_outlet_issue":
      return "🔌";
    case "safe":
    case "safe_issue":
      return "🔒";
    case "door":
    case "balcony-door":
    case "balcony_door_issue":
      return "🪟";
    case "coffee":
    case "coffee_machine":
      return "☕";
    case "tools":
    case "other_technical_issue":
      return "🛠️";
    case "alert":
      return "🚨";
    default: {
      const fallback = getGuestRequestIcon(String(def.requestType || def.id));
      return fallback === "•" ? "" : fallback;
    }
  }
}


function getRequestActionLabel(lang: LangKey): string {
  return lang === "bg"
    ? "Заяви"
    : lang === "de"
      ? "Anfragen"
      : lang === "ro"
        ? "Solicită"
        : lang === "cs"
          ? "Objednat"
          : "Request";
}

function readBooleanConfigValue(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return fallback;

  if (["yes", "true", "1", "on", "enabled", "ja", "да"].includes(text)) return true;
  if (["no", "false", "0", "off", "disabled", "nein", "не"].includes(text)) return false;

  return fallback;
}

function readNumberConfigValue(value: unknown, fallback: number) {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function normalizeRoomNumber(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, "");
}

const GUEST_LANGUAGE_STORAGE_KEY = "stayhub_guest_language";
const GUEST_INTRO_STORAGE_PREFIX = "stayhub_guest_intro_seen";
const SUPPORTED_GUEST_LANGS: LangKey[] = ["bg", "en", "de", "ro", "cs"];

function parseGuestLang(value: unknown): LangKey | null {
  const normalized = String(value || "").trim().toLowerCase();

  if (
    normalized === "bg" ||
    normalized === "de" ||
    normalized === "en" ||
    normalized === "ro" ||
    normalized === "cs"
  ) {
    return normalized as LangKey;
  }

  return null;
}

function normalizeGuestLang(value: unknown, fallback: LangKey = "bg"): LangKey {
  return parseGuestLang(value) ?? fallback;
}

function getBrowserPreferredGuestLang(): LangKey | null {
  if (typeof navigator === "undefined") return null;

  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ];

  for (const item of candidates) {
    const direct = parseGuestLang(item);
    if (direct) return direct;

    const prefix = String(item || "").split("-")[0];
    const byPrefix = parseGuestLang(prefix);
    if (byPrefix) return byPrefix;
  }

  return null;
}

function getInitialGuestLang(defaultLang?: string): LangKey {
  if (typeof window !== "undefined") {
    const urlLang = parseGuestLang(new URLSearchParams(window.location.search).get("lang"));

    if (urlLang) {
      try {
        window.localStorage.setItem(GUEST_LANGUAGE_STORAGE_KEY, urlLang);
      } catch { }
      return urlLang;
    }

    const savedLang = parseGuestLang(window.localStorage.getItem(GUEST_LANGUAGE_STORAGE_KEY));

    if (savedLang) {
      return savedLang;
    }

    const browserLang = getBrowserPreferredGuestLang();

    if (browserLang) {
      return browserLang;
    }
  }

  return normalizeGuestLang(defaultLang || "bg");
}

function getGuestIntroCopy(lang: LangKey, hotelName?: string) {
  const name = String(hotelName || "Hotel Aquamarine").trim();

  const copy: Record<LangKey, { title: string; body: string; button: string }> = {
    bg: {
      title: "Добре дошли в дигиталния консиерж",
      body: `Това е Вашият дигитален помощник по време на престоя в ${name}. Тук ще намерите информация за хотела, ресторанта, баровете, Wi-Fi, времето, анимацията и полезни места около хотела. Можете също да изпращате заявки към рецепция, housekeeping и техническа поддръжка. За да свържем услугата с Вашата стая, моля въведете номера на стаята си.`,
      button: "Разбрах, продължи",
    },
    en: {
      title: "Welcome to your digital concierge",
      body: `This is your digital assistant during your stay at ${name}. Here you can find hotel information, restaurant and bar details, Wi-Fi, weather, animation and useful places nearby. You can also send requests to reception, housekeeping and maintenance. To connect the service with your room, please enter your room number.`,
      button: "Got it, continue",
    },
    de: {
      title: "Willkommen bei Ihrem digitalen Concierge",
      body: `Dies ist Ihr digitaler Assistent während Ihres Aufenthalts im ${name}. Hier finden Sie Informationen zum Hotel, Restaurant, Bars, WLAN, Wetter, Animationsprogramm und hilfreichen Orten in der Umgebung. Außerdem können Sie Anfragen an Rezeption, Housekeeping und Technik senden. Damit wir den Service Ihrem Zimmer zuordnen können, geben Sie bitte Ihre Zimmernummer ein.`,
      button: "Verstanden, weiter",
    },
    ro: {
      title: "Bine ați venit la concierge-ul digital",
      body: `Acesta este asistentul digital pentru șederea dvs. la ${name}. Aici găsiți informații despre hotel, restaurant, baruri, Wi-Fi, vreme, animație și locuri utile din apropiere. De asemenea, puteți trimite solicitări către recepție, housekeeping și întreținere. Pentru a conecta serviciul cu camera dvs., vă rugăm să introduceți numărul camerei.`,
      button: "Am înțeles, continuă",
    },
    cs: {
      title: "Vítejte u svého digitálního concierge",
      body: `Toto je váš digitální asistent během pobytu v ${name}. Najdete zde informace o hotelu, restauraci, barech, Wi‑Fi, počasí, animaci a užitečných místech v okolí. Můžete také posílat požadavky na recepci, housekeeping a údržbu. Abychom službu přiřadili k vašemu pokoji, zadejte prosím číslo pokoje.`,
      button: "Rozumím, pokračovat",
    },
  };

  return copy[lang] ?? copy.bg;
}

function writeGuestLang(nextLang: LangKey) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(GUEST_LANGUAGE_STORAGE_KEY, nextLang);
  } catch (error) {
    console.error("writeGuestLang failed", error);
  }
}

export default function GuestHub({ config }: { config: HotelConfig }) {
  // Keep the first server/client render identical. Browser, URL and localStorage
  // language detection runs after hydration to avoid React hydration error #418.
  const [lang, setLangState] = useState<LangKey>(() =>
    normalizeGuestLang(config.languageDefault || "bg")
  );

  useEffect(() => {
    const nextLang = getInitialGuestLang(config.languageDefault);
    setLangState(nextLang);
    writeGuestLang(nextLang);
  }, [config.languageDefault]);

  const setLang = useCallback((nextLang: LangKey | string) => {
    const safeLang = normalizeGuestLang(nextLang);
    setLangState(safeLang);
    writeGuestLang(safeLang);
  }, []);
  const hubOpenTrackedRef = useRef(false);

  const [aiQ, setAiQ] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const AI_RESET_AFTER_MS = 5 * 60 * 1000;

  const appHiddenAtRef = useRef<number | null>(null);

  const clearAiState = useCallback(() => {
    setAiQ("");
    setAiAnswer("");
    setAiLoading(false);
  }, [setAiQ, setAiAnswer, setAiLoading]);

  const sp = useSearchParams();
  const qrRoom = normalizeRoomNumber(sp.get("room"));
  const forceGuestIntro = useMemo(() => {
    const value = String(sp.get("intro") || "").trim().toLowerCase();
    return ["1", "true", "yes", "show"].includes(value);
  }, [sp]);

  const guestLanguageOptions = useMemo(() => {
    const enabled = new Set((config.languages || []).map((item) => String(item).trim().toLowerCase()));
    const filtered = SUPPORTED_GUEST_LANGS.filter((item) => enabled.size === 0 || enabled.has(item));
    return filtered.length ? filtered : SUPPORTED_GUEST_LANGS;
  }, [config.languages]);

  const roomStateKey = useMemo(() => {
    if (typeof window === "undefined") return "";

    const pathMatch = window.location.pathname.match(/^\/h\/([^/]+)/i);
    if (pathMatch?.[1]) {
      return String(pathMatch[1]).trim().toLowerCase();
    }

    const host = window.location.hostname.toLowerCase();
    if (host.endsWith(".stayhub.app")) {
      const sub = host.split(".")[0];
      if (sub && sub !== "www") {
        return sub;
      }
    }

    return String(config.hotelSlug || "").trim().toLowerCase();
  }, [config.hotelSlug]);

  const [manualRoomInput, setManualRoomInput] = useState(qrRoom);
  const [room, setRoom] = useState("");
  const [roomConfirmed, setRoomConfirmed] = useState(false);
  const [ignoredQrRoom, setIgnoredQrRoom] = useState<string | null>(null);
  const [roomModal, setRoomModal] = useState<{
    mode: "confirm" | "switch";
    nextRoom: string;
    currentRoom?: string;
  } | null>(null);
  const [roomStateHydrated, setRoomStateHydrated] = useState(false);
  const [pendingRoomChangeFrom, setPendingRoomChangeFrom] = useState<string | null>(null);

  const [requestDialog, setRequestDialog] = useState<RequestDialogState>(null);
  const [guestRequestRefs, setGuestRequestRefs] = useState<StoredGuestRequestRef[]>(() => readStoredGuestRequestRefs());
  const [showGuestIntro, setShowGuestIntro] = useState(false);

  const guestIntroStorageKey = useMemo(() => {
    const scope = String(roomStateKey || config.hotelSlug || "default").trim().toLowerCase();
    return `${GUEST_INTRO_STORAGE_PREFIX}:${scope || "default"}`;
  }, [roomStateKey, config.hotelSlug]);

  const guestIntroCopy = useMemo(
    () => getGuestIntroCopy(lang, config.hotelName),
    [lang, config.hotelName]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (forceGuestIntro) {
      setShowGuestIntro(true);
      return;
    }

    try {
      const seen = window.localStorage.getItem(guestIntroStorageKey) === "1";
      setShowGuestIntro(!seen);
    } catch {
      setShowGuestIntro(true);
    }
  }, [forceGuestIntro, guestIntroStorageKey]);

  const closeGuestIntro = useCallback(() => {
    try {
      window.localStorage.setItem(guestIntroStorageKey, "1");
    } catch { }

    setShowGuestIntro(false);
  }, [guestIntroStorageKey]);

  const validRoomNumbers = useMemo(() => {
    const direct = Array.isArray((config as any).validRoomNumbers)
      ? (config as any).validRoomNumbers
      : [];
    const fromRooms = Array.isArray((config as any).hotelRooms)
      ? (config as any).hotelRooms.map((item: any) => item?.roomNumber)
      : [];

    return Array.from(
      new Set([...direct, ...fromRooms].map(normalizeRoomNumber).filter(Boolean))
    );
  }, [config]);

  const validRoomSet = useMemo(() => new Set(validRoomNumbers), [validRoomNumbers]);
  const hasStrictRoomList = validRoomSet.size > 0;

  const isKnownHotelRoom = useCallback(
    (candidate: unknown) => {
      const normalized = normalizeRoomNumber(candidate);
      if (!normalized) return false;
      if (!hasStrictRoomList) return true;
      return validRoomSet.has(normalized);
    },
    [hasStrictRoomList, validRoomSet]
  );

  useEffect(() => {
    if (!roomStateKey) return;

    const storedRoomState = readStoredGuestRoomState(roomStateKey);
    const storedRoom = normalizeRoomNumber(storedRoomState?.room);
    const storedConfirmed = Boolean(storedRoomState?.roomConfirmed);

    if (storedConfirmed && storedRoom && !isKnownHotelRoom(storedRoom)) {
      setManualRoomInput("");
      setRoom("");
      setRoomConfirmed(false);
      setIgnoredQrRoom(null);
      setRoomModal(null);
      setRoomStateHydrated(true);
      return;
    }

    if (!qrRoom) {
      if (storedConfirmed && storedRoom) {
        setManualRoomInput(storedRoom);
        setRoom(storedRoom);
        setRoomConfirmed(true);
      } else {
        setManualRoomInput("");
        setRoom("");
        setRoomConfirmed(false);
      }

      setIgnoredQrRoom(null);
      setRoomModal(null);
      setRoomStateHydrated(true);
      return;
    }

    if (storedConfirmed && storedRoom && storedRoom !== qrRoom) {
      setManualRoomInput(storedRoom);
      setRoom(storedRoom);
      setRoomConfirmed(true);

      if (ignoredQrRoom === qrRoom) {
        setRoomModal(null);
      } else {
        setRoomModal({
          mode: "switch",
          currentRoom: storedRoom,
          nextRoom: qrRoom,
        });
      }

      setRoomStateHydrated(true);
      return;
    }

    if (storedConfirmed && storedRoom === qrRoom) {
      setManualRoomInput(qrRoom);
      setRoom(qrRoom);
      setRoomConfirmed(true);
      setIgnoredQrRoom(null);
      setRoomModal(null);
      setRoomStateHydrated(true);
      return;
    }

    setManualRoomInput(qrRoom);
    setRoom("");
    setRoomConfirmed(false);
    setIgnoredQrRoom(null);
    setRoomModal({
      mode: "confirm",
      nextRoom: qrRoom,
    });
    setRoomStateHydrated(true);
  }, [roomStateKey, qrRoom, ignoredQrRoom, isKnownHotelRoom]);

  useEffect(() => {
    persistQrContextFromUrl();

    if (hubOpenTrackedRef.current) return;
    hubOpenTrackedRef.current = true;

    trackHubEvent({
      eventName: "hub_open",
      roomNumber: null,
      page: window.location.pathname,
    });
  }, []);

  useEffect(() => {
    if (!roomStateKey) return;
    if (!roomStateHydrated) return;
    if (roomModal?.mode === "switch") return;

    writeStoredGuestRoomState(roomStateKey, {
      manualRoomInput,
      room,
      roomConfirmed,
    });
  }, [roomStateKey, roomStateHydrated, manualRoomInput, room, roomConfirmed, roomModal]);

  const [guestRequests, setGuestRequests] = useState<GuestStatusItem[]>([]);
  const [guestRequestsLoading, setGuestRequestsLoading] = useState(false);
  const [showRequestSuccess, setShowRequestSuccess] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [submittingRequestLabel, setSubmittingRequestLabel] = useState("");
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [hotelScopeReady] = useState(true);
  const submittingRequestRef = useRef(false);
  const recentSubmissionRef = useRef<Record<string, number>>({});

  const rawConfig = ((config as any).rawConfig ?? {}) as Record<string, unknown>;

  const geoGuardEnabled = readBooleanConfigValue(
    (config as any).geoGuardEnabled ?? rawConfig.geoGuardEnabled,
    true
  );

  const testModeEnabled = readBooleanConfigValue(
    (config as any).testModeEnabled ?? rawConfig.testModeEnabled,
    false
  );

  const hotelLatitude = readNumberConfigValue(
    (config as any).hotelLatitude ??
      rawConfig.hotelLatitude ??
      (config as any).location?.lat ??
      (config as any).location?.latitude,
    Number.NaN
  );

  const hotelLongitude = readNumberConfigValue(
    (config as any).hotelLongitude ??
      rawConfig.hotelLongitude ??
      (config as any).location?.lng ??
      (config as any).location?.longitude ??
      (config as any).location?.lon,
    Number.NaN
  );

  const geoRadiusMeters = readNumberConfigValue(
    (config as any).geoGuardRadiusMeters ?? rawConfig.geoGuardRadiusMeters,
    350
  );

  const canUseGeoGuard =
    geoGuardEnabled &&
    !testModeEnabled &&
    Number.isFinite(hotelLatitude) &&
    Number.isFinite(hotelLongitude);

  const ensureGuestIsNearHotel = useCallback(async () => {
    if (!canUseGeoGuard) {
      setGeoMessage(null);
      return true;
    }

    const getGeoErrorMessage = () =>
      lang === "bg"
        ? "Това действие е позволено само в рамките на хотела. Разрешете достъп до местоположението и опитайте отново."
        : lang === "de"
          ? "Diese Funktion ist nur innerhalb des Hotelbereichs erlaubt. Bitte Standortfreigabe erlauben und erneut versuchen."
          : "This action is allowed only within the hotel area. Please allow location access and try again.";

    if (!("geolocation" in navigator)) {
      const msg = getGeoErrorMessage();
      setGeoMessage(msg);
      window.alert(msg);
      return false;
    }

    return await new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const distance = haversineMeters(
            hotelLatitude,
            hotelLongitude,
            position.coords.latitude,
            position.coords.longitude
          );

          const allowed = distance <= geoRadiusMeters;

          if (!allowed) {
            const msg =
              lang === "bg"
                ? "Това действие е позволено само в рамките на хотела."
                : lang === "de"
                  ? "Diese Funktion ist nur innerhalb des Hotelbereichs erlaubt."
                  : "This action is allowed only within the hotel area.";

            setGeoMessage(msg);
            window.alert(msg);
            resolve(false);
            return;
          }

          setGeoMessage(null);
          resolve(true);
        },
        () => {
          const msg = getGeoErrorMessage();
          setGeoMessage(msg);
          window.alert(msg);
          resolve(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 30000,
        }
      );
    });
  }, [canUseGeoGuard, geoRadiusMeters, hotelLatitude, hotelLongitude, lang]);

  useEffect(() => {
    if (!showRequestSuccess) return;

    const timeout = window.setTimeout(() => {
      setShowRequestSuccess(false);
    }, 5000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [showRequestSuccess]);

  const fallbackLangs = useMemo(() => {
    // Do not use the hotel's default language as a content fallback.
    // Example: Aquamarine default may be RO, but when the guest chooses BG,
    // missing BG text must not suddenly fall back to Romanian.
    const currentLang = normalizeGuestLang(lang);

    const preferred =
      currentLang === "ro"
        ? ["ro", "en", "bg", "de", "cs"]
        : currentLang === "cs"
          ? ["cs", "en", "bg", "de", "ro"]
          : [currentLang, "en", "bg", "de"];

    return Array.from(new Set(preferred)) as LangKey[];
  }, [lang]);

  const translateFromI18n = useCallback(
    (targetLang: LangKey, key: string) => {
      const current = config.i18n?.[String(targetLang)]?.[key];
      if (current && String(current).trim() && String(current).trim() !== key) {
        return String(current).trim();
      }

      const builtin = getBuiltinUiText(targetLang, key);
      if (builtin) return builtin;

      for (const fallback of fallbackLangs) {
        const value = config.i18n?.[String(fallback)]?.[key];
        if (value && String(value).trim() && String(value).trim() !== key) {
          return String(value).trim();
        }
      }

      return "";
    },
    [config.i18n, fallbackLangs]
  );

  const tUI = useCallback((key: string) => translateFromI18n(lang, key), [lang, translateFromI18n]);

  const opsLang = (config.opsLanguage ?? "bg") as LangKey;
  const tOPS = useCallback((key: string) => translateFromI18n(opsLang, key), [opsLang, translateFromI18n]);

  const helperEnabled = Boolean(config.staffHelperEnabled);
  const helperLang = (config.staffHelperLanguage ?? "en") as LangKey;
  const tHELP = useCallback((key: string) => translateFromI18n(helperLang, key), [helperLang, translateFromI18n]);

  const roomCopy = useMemo(() => {
    const copy = {
      bg: {
        roomBadge: "Стая {room}",
        cardTitle: "Потвърдете номера на стаята",
        cardText:
          "За да се отключат функциите на отделите, въведете и потвърдете номера на стаята си.",
        inputLabel: "Номер на стая",
        inputPlaceholder: "Напр. 204",
        confirmButton: "Потвърди стаята",
        confirmMessage: "Сигурни ли сте, че това е вашата стая?\nСтая {room}",
        confirmedState: "Потвърдена стая: {room}",
        changeRoom: "Смени стаята",
        changeRoomWarningTitle: "Смяна на стая",
        changeRoomWarningText:
          "Сменяйте активната стая само ако наистина сте преместени в друга стая. След това въведете и потвърдете новата стая.",
        changeRoomContinue: "Продължи",
        lockedNotice: "Заключените секции ще се отворят, когато въведете номера на стаята.",
        lockedSectionMessage:
          "Потвърдете номера на стаята, за да отключите тази секция.",
        missingRoomAlert: "Моля, въведете номер на стая.",
        invalidRoomAlert: "Моля, въведете валиден номер на стая от хотела.",
        missingRoomQrAlert:
          "Липсва номер на стая. Моля, сканирайте QR кода на стаята отново или въведете стаята ръчно.",
        requestSent: "Заявката е изпратена: {typeLabel}",
        requestAcceptedTitle: "Заявката е приета",
        requestAcceptedText:
          "Вашата заявка е приета и ще бъде обработена възможно най-скоро.",
        requestSendingTitle: "Изпращане на заявка",
        requestSendingText: "Моля, изчакайте. Изпращаме: {typeLabel}",
        requestFailed: "Неуспешно изпращане на заявката. Опитайте отново.",
        myRequestsTitle: "Моите заявки",
        myRequestsEmpty: "Все още няма изпратени заявки от това устройство.",
        myRequestsLoading: "Зареждане на статусите...",
        refreshRequests: "Обнови",
        status_new: "Приета",
        status_in_progress: "В обработка",
        status_completed: "Изпълнена",
        status_returned: "Приета",
        lockedActionAlert:
          "Първо потвърдете номера на стаята, за да отключите функциите.",
      },
      en: {
        roomBadge: "Room {room}",
        cardTitle: "Confirm your room number",
        cardText:
          "To unlock the department functions, enter and confirm your room number.",
        inputLabel: "Room number",
        inputPlaceholder: "Example: 204",
        confirmButton: "Confirm room",
        confirmMessage: "Are you sure this is your room?\nRoom {room}",
        confirmedState: "Confirmed room: {room}",
        changeRoom: "Change room",
        changeRoomWarningTitle: "Change room",
        changeRoomWarningText:
          "Change the active room only if you have actually been moved to another room. Then enter and confirm the new room.",
        changeRoomContinue: "Continue",
        lockedNotice: "Locked sections will open after you enter your room number.",
        lockedSectionMessage:
          "Confirm your room number to unlock this section.",
        missingRoomAlert: "Please enter a room number.",
        invalidRoomAlert: "Please enter a valid hotel room number.",
        missingRoomQrAlert:
          "Missing room number. Please rescan the room QR code or enter the room manually.",
        requestSent: "Request sent: {typeLabel}",
        requestAcceptedTitle: "Request received",
        requestAcceptedText:
          "Your request has been received and will be processed as soon as possible.",
        requestSendingTitle: "Sending request",
        requestSendingText: "Please wait. Sending: {typeLabel}",
        requestFailed: "Failed to send request. Please try again.",
        myRequestsTitle: "My requests",
        myRequestsEmpty: "No requests have been sent from this device yet.",
        myRequestsLoading: "Loading request statuses...",
        refreshRequests: "Refresh",
        status_new: "Received",
        status_in_progress: "In progress",
        status_completed: "Completed",
        status_returned: "Received",
        lockedActionAlert:
          "Please confirm your room number first to unlock the functions.",
      },
      de: {
        roomBadge: "Zimmer {room}",
        cardTitle: "Bitte Zimmernummer bestätigen",
        cardText:
          "Um die Funktionen der Abteilungen freizuschalten, geben Sie Ihre Zimmernummer ein und bestätigen Sie sie.",
        inputLabel: "Zimmernummer",
        inputPlaceholder: "Zum Beispiel: 204",
        confirmButton: "Zimmer bestätigen",
        confirmMessage: "Sind Sie sicher, dass dies Ihr Zimmer ist?\nZimmer {room}",
        confirmedState: "Bestätigtes Zimmer: {room}",
        changeRoom: "Zimmer ändern",
        changeRoomWarningTitle: "Zimmer ändern",
        changeRoomWarningText:
          "Ändern Sie das aktive Zimmer nur, wenn Sie tatsächlich in ein anderes Zimmer umgezogen sind. Geben Sie danach das neue Zimmer ein und bestätigen Sie es.",
        changeRoomContinue: "Weiter",
        lockedNotice: "Gesperrte Bereiche werden geöffnet, nachdem Sie Ihre Zimmernummer eingegeben haben.",
        lockedSectionMessage:
          "Bestätigen Sie Ihre Zimmernummer, um diesen Bereich freizuschalten.",
        missingRoomAlert: "Bitte geben Sie eine Zimmernummer ein.",
        invalidRoomAlert: "Bitte geben Sie eine gültige Hotelzimmernummer ein.",
        missingRoomQrAlert:
          "Zimmernummer fehlt. Bitte scannen Sie den QR-Code des Zimmers erneut oder geben Sie die Zimmernummer manuell ein.",
        requestSent: "Anfrage gesendet: {typeLabel}",
        requestAcceptedTitle: "Anfrage erhalten",
        requestAcceptedText:
          "Ihre Anfrage wurde erhalten und wird so schnell wie möglich bearbeitet.",
        requestSendingTitle: "Anfrage wird gesendet",
        requestSendingText: "Bitte warten. Es wird gesendet: {typeLabel}",
        requestFailed: "Anfrage konnte nicht gesendet werden. Bitte erneut versuchen.",
        myRequestsTitle: "Meine Anfragen",
        myRequestsEmpty: "Von diesem Gerät wurden noch keine Anfragen gesendet.",
        myRequestsLoading: "Status wird geladen...",
        refreshRequests: "Aktualisieren",
        status_new: "Erhalten",
        status_in_progress: "In Bearbeitung",
        status_completed: "Erledigt",
        status_returned: "Erhalten",
        lockedActionAlert:
          "Bitte bestätigen Sie zuerst Ihre Zimmernummer, um die Funktionen freizuschalten.",
      },
      ro: {
        roomBadge: "Camera {room}",
        cardTitle: "Confirmați numărul camerei",
        cardText: "Pentru a debloca funcțiile hotelului, introduceți și confirmați numărul camerei.",
        inputLabel: "Numărul camerei",
        inputPlaceholder: "Exemplu: 204",
        confirmButton: "Confirmă camera",
        confirmMessage: "Sunteți sigur că aceasta este camera dvs.?\nCamera {room}",
        confirmedState: "Cameră confirmată: {room}",
        changeRoom: "Schimbă camera",
        changeRoomWarningTitle: "Schimbare cameră",
        changeRoomWarningText: "Schimbați camera activă doar dacă ați fost mutat efectiv într-o altă cameră. Apoi introduceți și confirmați noua cameră.",
        changeRoomContinue: "Continuă",
        lockedNotice: "Secțiunile blocate se vor deschide după introducerea numărului camerei.",
        lockedSectionMessage: "Confirmați numărul camerei pentru a debloca această secțiune.",
        missingRoomAlert: "Vă rugăm să introduceți numărul camerei.",
        invalidRoomAlert: "Vă rugăm să introduceți un număr de cameră valid al hotelului.",
        missingRoomQrAlert: "Lipsește numărul camerei. Scanați din nou codul QR al camerei sau introduceți camera manual.",
        requestSent: "Solicitare trimisă: {typeLabel}",
        requestAcceptedTitle: "Solicitare primită",
        requestAcceptedText: "Solicitarea dvs. a fost primită și va fi procesată cât mai curând posibil.",
        requestSendingTitle: "Se trimite solicitarea",
        requestSendingText: "Vă rugăm să așteptați. Se trimite: {typeLabel}",
        requestFailed: "Solicitarea nu a putut fi trimisă. Încercați din nou.",
        myRequestsTitle: "Solicitările mele",
        myRequestsEmpty: "Nu au fost trimise solicitări de pe acest dispozitiv.",
        myRequestsLoading: "Se încarcă statusurile...",
        refreshRequests: "Reîmprospătează",
        status_new: "Primită",
        status_in_progress: "În procesare",
        status_completed: "Finalizată",
        status_returned: "Primită",
        lockedActionAlert: "Vă rugăm să confirmați mai întâi numărul camerei pentru a debloca funcțiile.",
      },
      cs: {
        roomBadge: "Pokoj {room}",
        cardTitle: "Potvrďte číslo pokoje",
        cardText: "Pro odemknutí funkcí hotelu zadejte a potvrďte číslo svého pokoje.",
        inputLabel: "Číslo pokoje",
        inputPlaceholder: "Např. 204",
        confirmButton: "Potvrdit pokoj",
        confirmMessage: "Jste si jistí, že je to váš pokoj?\nPokoj {room}",
        confirmedState: "Potvrzený pokoj: {room}",
        changeRoom: "Změnit pokoj",
        changeRoomWarningTitle: "Změna pokoje",
        changeRoomWarningText: "Aktivní pokoj měňte pouze tehdy, pokud jste byli skutečně přesunuti do jiného pokoje. Poté zadejte a potvrďte nový pokoj.",
        changeRoomContinue: "Pokračovat",
        lockedNotice: "Uzamčené sekce se otevřou po zadání čísla pokoje.",
        lockedSectionMessage: "Potvrďte číslo pokoje pro odemknutí této sekce.",
        missingRoomAlert: "Zadejte prosím číslo pokoje.",
        invalidRoomAlert: "Zadejte prosím platné číslo hotelového pokoje.",
        missingRoomQrAlert: "Chybí číslo pokoje. Naskenujte znovu QR kód pokoje nebo zadejte pokoj ručně.",
        requestSent: "Požadavek odeslán: {typeLabel}",
        requestAcceptedTitle: "Požadavek přijat",
        requestAcceptedText: "Váš požadavek byl přijat a bude zpracován co nejdříve.",
        requestSendingTitle: "Odesílání požadavku",
        requestSendingText: "Čekejte prosím. Odesílá se: {typeLabel}",
        requestFailed: "Požadavek se nepodařilo odeslat. Zkuste to znovu.",
        myRequestsTitle: "Moje požadavky",
        myRequestsEmpty: "Z tohoto zařízení zatím nebyly odeslány žádné požadavky.",
        myRequestsLoading: "Načítání stavů...",
        refreshRequests: "Obnovit",
        status_new: "Přijato",
        status_in_progress: "Zpracovává se",
        status_completed: "Dokončeno",
        status_returned: "Přijato",
        lockedActionAlert: "Nejprve potvrďte číslo pokoje, abyste odemkli funkce.",
      },
    } as const;

    if (lang === "bg" || lang === "en" || lang === "de" || lang === "ro" || lang === "cs") {
      return copy[lang];
    }

    return copy.en;
  }, [lang]);

  const roomPrefix = room ? `${roomCopy.roomBadge.replace("{room}", room)} - ` : "";

  const aiIntroText = useMemo(() => {
    const map = {
      bg:
        "Мога да помагам само с информация за хотела – ресторанти, барове, работно време, спа, детски кът, стая за игри, удобства и услуги в хотела.",
      en:
        "I can help only with hotel information – restaurants, bars, opening hours, spa, kids club, games room, facilities and hotel services.",
      de:
        "Ich kann nur mit Hotelinformationen helfen – Restaurants, Bars, Öffnungszeiten, Spa, Kinderclub, Spielzimmer, Einrichtungen und Hoteldienstleistungen.",
    } as const;

    const translated = String(tUI("ai_intro") || "").trim();

    if (translated && translated !== "ai_intro") {
      return translated;
    }

    return map[(lang as "bg" | "en" | "de")] || map.bg;
  }, [lang, tUI]);

  const guestStatusLabel = useCallback(
    (status: StaffRequestStatus) => {
      const key = `status_${status}` as const;
      return String((roomCopy as Record<string, string>)[key] || status);
    },
    [roomCopy]
  );

  const getGuestVisibleRequestTitle = useCallback(
    (item: GuestStatusItem) => {
      const labelKey = getGuestRequestLabelKey(item.rawType || item.type, item.title);
      const translated = labelKey ? String(tUI(labelKey) || "").trim() : "";
      if (translated && translated !== labelKey) return cleanRequestTitle(translated);

      return cleanRequestTitle(String(item.title || item.type || ""));
    },
    [tUI]
  );

  const activeGuestRequests = useMemo(
    () => guestRequests.filter((item) => item.status !== "completed"),
    [guestRequests]
  );

  const contact = config.contacts;
  const deptHours = config.departmentHours ?? {};

  const roomRequiredSectionIds = new Set([
    "reception",
    "housekeeping",
    "maintenance",
    "outlets",
    "activities",
    "ai",
  ]);

  const loadGuestRequests = useCallback(
    async (refsOverride?: StoredGuestRequestRef[], options?: { silent?: boolean }) => {
      const refs = refsOverride ?? guestRequestRefs;
      const ids = [...new Set(refs.map((item) => item.id).filter(Boolean))];

      if (!ids.length || !roomConfirmed || !room.trim() || !hotelScopeReady) {
        setGuestRequests([]);
        return;
      }

      const silent = Boolean(options?.silent);

      try {
        if (!silent) setGuestRequestsLoading(true);

        const query = new URLSearchParams({
          hotelSlug: String(config.hotelSlug ?? ""),
          room: String(room ?? ""),
          ids: ids.join(","),
        });

        const res = await fetch(`/api/guest/requests?${query.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = await res.json().catch(() => null);

        if (!res.ok || !payload?.ok) {
          throw new Error(payload?.error || "Failed to load guest requests");
        }

        const rows = ((payload.requests as Array<{ id: string; room: string; title: string; type: StaffRequestType | string; rawType?: string; status: StaffRequestStatus; createdAt: string; }> | undefined) ?? []).filter(
          (row) => row.room === room
        );

        const completedIds = new Set(rows.filter((row) => row.status === "completed").map((row) => row.id));
        const activeItems = rows.filter((row) => row.status !== "completed").map((row) => ({
          id: row.id,
          room: row.room,
          title: row.title,
          type: row.type,
          rawType: row.rawType,
          // "returned" is an internal staff routing state. Guests should only see that
          // the request is still received/pending, not that it was returned between departments.
          status: row.status === "returned" ? "new" : row.status,
          createdAt: row.createdAt,
        }));

        setGuestRequests(
          activeItems.map((item) => ({
            id: String(item.id),
            room: String(item.room),
            title: String(item.title),
            type: normalizeStaffRequestType(String(item.type || "")),
            rawType: String(item.rawType || item.type || ""),
            status: item.status,
            createdAt: String(item.createdAt),
          }))
        );

        if (completedIds.size) {
          const nextRefs = readStoredGuestRequestRefs().filter(
            (item) => !(item.room === room && completedIds.has(item.id))
          );
          writeStoredGuestRequestRefs(nextRefs);
          setGuestRequestRefs(nextRefs);
        }
      } catch (error) {
        console.error("loadGuestRequests failed", error);
      } finally {
        if (!silent) setGuestRequestsLoading(false);
      }
    },
    [config.hotelSlug, guestRequestRefs, hotelScopeReady, room, roomConfirmed]
  );

  useEffect(() => {
    const roomRefs = guestRequestRefs.filter((item) => item.room === room);

    if (!roomConfirmed || !room.trim() || !roomRefs.length || !hotelScopeReady) {
      setGuestRequests([]);
      return;
    }

    let cancelled = false;

    const safeLoad = async (silent = true) => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }

      try {
        await loadGuestRequests(roomRefs, { silent });
      } catch (error) {
        console.error("guest request refresh failed", error);
      }
    };

    void safeLoad(false);

    const interval = window.setInterval(() => {
      void safeLoad(true);
    }, 30000);

    const handleFocus = () => {
      void safeLoad(true);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void safeLoad(true);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [guestRequestRefs, hotelScopeReady, loadGuestRequests, room, roomConfirmed]);

  const ensureConfirmedRoom = () => {
    if (roomConfirmed && room.trim()) return true;
    window.alert(roomCopy.lockedActionAlert);
    return false;
  };

  const confirmManualRoom = async () => {
    const candidate = normalizeRoomNumber(manualRoomInput);

    if (!candidate) {
      window.alert(roomCopy.missingRoomAlert);
      return;
    }

    if (!isKnownHotelRoom(candidate)) {
      window.alert(roomCopy.invalidRoomAlert);
      setManualRoomInput(candidate);
      setRoom("");
      setRoomConfirmed(false);
      setRoomModal(null);
      return;
    }

    setManualRoomInput(candidate);
    setGeoMessage(null);

    const storedRoomState = readStoredGuestRoomState(roomStateKey);
    const storedRoom = normalizeRoomNumber(storedRoomState?.room);
    const storedConfirmed = Boolean(storedRoomState?.roomConfirmed);

    const activeRoom = normalizeRoomNumber(room || storedRoom);
    const hasConfirmedActiveRoom = Boolean((roomConfirmed || storedConfirmed) && activeRoom);

    if (hasConfirmedActiveRoom && activeRoom !== candidate) {
      setManualRoomInput(activeRoom);
      setRoom(activeRoom);
      setRoomConfirmed(true);
      setIgnoredQrRoom(null);
      setRoomModal({
        mode: "switch",
        currentRoom: activeRoom,
        nextRoom: candidate,
      });
      return;
    }

    setIgnoredQrRoom(null);
    setRoomModal({
      mode: "confirm",
      nextRoom: candidate,
    });
  };

  const isRoomSwitchConfirmation = roomModal?.mode === "switch";

  const acceptRoomConfirmation = () => {
    if (!roomModal?.nextRoom) return;

    const nextRoom = normalizeRoomNumber(roomModal.nextRoom);

    if (!isKnownHotelRoom(nextRoom)) {
      window.alert(roomCopy.invalidRoomAlert);
      setManualRoomInput(nextRoom);
      setRoom("");
      setRoomConfirmed(false);
      setRoomModal(null);
      setPendingRoomChangeFrom(null);
      return;
    }

    const previousRoom = roomModal.currentRoom || pendingRoomChangeFrom;
    const isRoomChange = Boolean(previousRoom && previousRoom !== nextRoom);

    setIgnoredQrRoom(null);
    setManualRoomInput(nextRoom);
    setRoom(nextRoom);
    setRoomConfirmed(true);
    setRoomModal(null);
    setPendingRoomChangeFrom(null);

    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}?room=${encodeURIComponent(nextRoom)}`
    );

    trackHubEvent({
      eventName: isRoomChange ? "room_changed" : "room_confirmed",
      roomNumber: nextRoom,
      page: window.location.pathname,
      extra: isRoomChange
        ? {
          fromRoom: previousRoom,
          toRoom: nextRoom,
        }
        : {},
    });
  };

  const cancelRoomConfirmation = () => {
    if (roomModal?.mode === "switch" && roomModal.currentRoom) {
      setIgnoredQrRoom(roomModal.nextRoom);
      setManualRoomInput(roomModal.currentRoom);
      setRoom(roomModal.currentRoom);
      setRoomConfirmed(true);
      setRoomModal(null);
      setPendingRoomChangeFrom(null);
      return;
    }

    const storedRoomState = readStoredGuestRoomState(roomStateKey);
    const storedRoom = normalizeRoomNumber(storedRoomState?.room);
    const storedConfirmed = Boolean(storedRoomState?.roomConfirmed);

    if (storedConfirmed && storedRoom) {
      setManualRoomInput(storedRoom);
      setRoom(storedRoom);
      setRoomConfirmed(true);
    } else {
      setManualRoomInput(qrRoom || "");
      setRoom("");
      setRoomConfirmed(false);
    }

    setPendingRoomChangeFrom(null);
    setRoomModal(null);
  };

  const openRequestDialog = ({
    title,
    message,
    confirmLabel,
    cancelLabel,
    onConfirm,
  }: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
  }) => {
    setRequestDialog({
      title,
      message,
      confirmLabel,
      cancelLabel,
      onConfirm,
    });
  };

  const closeRequestDialog = () => {
    setRequestDialog(null);
  };

  const confirmRequestDialog = () => {
    const action = requestDialog?.onConfirm;
    setRequestDialog(null);
    action?.();
  };

  const startRoomChangeFlow = () => {
    if (!roomConfirmed || !room) return;

    openRequestDialog({
      title: roomCopy.changeRoomWarningTitle,
      message: roomCopy.changeRoomWarningText,
      confirmLabel: roomCopy.changeRoomContinue,
      cancelLabel: lang === "bg" ? "Отказ" : lang === "de" ? "Abbrechen" : "Cancel",
      onConfirm: () => {
        trackHubEvent({
          eventName: "room_change_started",
          roomNumber: room,
          page: window.location.pathname,
          extra: {
            fromRoom: room,
          },
        });

        setPendingRoomChangeFrom(room);
        setManualRoomInput("");
        setRoom("");
        setRoomConfirmed(false);
        setIgnoredQrRoom(null);
        setRoomModal(null);

        window.history.replaceState({}, "", window.location.pathname);
      },
    });
  };

  const isDeptOpen = (dept: DepartmentKey) => {
    const h = deptHours?.[dept];
    if (!h?.open || !h?.close) return true;
    return isWithinHoursLocal(h.open, h.close);
  };

  const warnAndRouteIfClosed = (dept: DepartmentKey) => {
    if (isDeptOpen(dept)) return { dept, warned: false };
    return { dept: "reception" as const, warned: true };
  };

  const closedMsg =
    (tUI("dept_closed_to_reception") as string) ||
    "Отделът не работи в момента. Заявката ще бъде изпратена към рецепция.";

  const operationsProcessingWindowOpen = "07:00";
  const operationsProcessingWindowClose = config.housekeepingCutoff ?? "17:00";

  const afterOperationsCutoff = useMemo(() => {
    return !isWithinHoursLocal(
      operationsProcessingWindowOpen,
      operationsProcessingWindowClose
    );
  }, [operationsProcessingWindowClose]);

  const housekeepingRoutedToReception = afterOperationsCutoff;
  const maintenanceRoutedToReception = afterOperationsCutoff;

  const hkExtras =
    (config.housekeepingExtras as Array<{
      key: string;
      labelKey: string;
      messageKey: string;
    }> | undefined) ??
    [
      { key: "towels", labelKey: "towels", messageKey: "msg_towels" },
      { key: "toilet_paper", labelKey: "toilet_paper", messageKey: "msg_toilet_paper" },
      { key: "extra_pillow", labelKey: "extra_pillows", messageKey: "msg_extra_pillows" },
      { key: "blanket", labelKey: "blanket", messageKey: "msg_blanket" },
      { key: "bathrobe", labelKey: "bathrobe", messageKey: "msg_bathrobe" },
      { key: "slippers", labelKey: "slippers", messageKey: "msg_slippers" },
      { key: "baby_cot", labelKey: "baby_cot", messageKey: "msg_baby_cot" },
      { key: "iron", labelKey: "iron", messageKey: "msg_iron" },
      { key: "minibar", labelKey: "minibar", messageKey: "msg_minibar" },
      { key: "laundry", labelKey: "laundry", messageKey: "msg_laundry" },
    ];

  const housekeepingExtraActions: Record<
    string,
    | { mode: "info"; getMessage: (lang: LangKey) => string }
    | { mode: "request"; type: StaffRequestType | string; typeLabel: string; note?: string }
  > = {
    towels: {
      mode: "request",
      type: "towels",
      typeLabel: "Towels",
    },
    toilet_paper: {
      mode: "request",
      type: "toilet_paper",
      typeLabel: "Toilet paper",
    },
    extra_pillow: {
      mode: "request",
      type: "extra_pillow",
      typeLabel: "Extra pillows",
    },
    bathrobe: {
      mode: "request",
      type: "bathrobe",
      typeLabel: "Bathrobe",
    },
    slippers: {
      mode: "request",
      type: "slippers",
      typeLabel: "Slippers",
    },
    baby_cot: {
      mode: "request",
      type: "baby_cot",
      typeLabel: "Baby cot",
    },
    laundry: {
      mode: "request",
      type: "laundry",
      typeLabel: "Laundry",
    },
    iron: {
      mode: "request",
      type: "iron",
      typeLabel: "Iron",
    },
    minibar: {
      mode: "request",
      type: "minibar",
      typeLabel: "Minibar refill",
    },
    blanket: {
      mode: "request",
      type: "extra_blanket",
      typeLabel: "Extra blanket",
    },
  };
  const hiddenGuestRequestIds = new Set([
    "extra_cleaning",
    "cleaning",
    "room_cleaning",
    "room_cleaning_request",
    // These old REQUEST_DEFS placeholders are now maintained through HOTEL_INFO
    // to avoid duplicate cards in the Info section.
    "towel_policy",
    "sunbed_policy",
    "charity_shops",
  ]);

  const builtInRequestDefIds = useMemo(
    () =>
      new Set<string>([
        "late_checkout",
        "taxi",
        "wake_up_call",
        "information",
        "information_request",
        "luggage_help",
        "towels",
        "toilet_paper",
        "extra_pillow",
        "extra_pillows",
        "extra_blanket",
        "blanket",
        "bathrobe",
        "slippers",
        "baby_cot",
        "room_cleaning",
        "room_cleaning_request",
        "iron",
        "minibar",
        "minibar_refill",
        "laundry",
        "air_conditioning",
        "ac_issue",
        "no_hot_water",
        "water_issue",
        "tv_issue",
        "light_not_working",
        "light_issue",
        "bathroom_issue",
        "door_lock_issue",
        "wifi_issue",
        "power_outlet_issue",
        "safe_issue",
        "balcony_door_issue",
        "minibar_not_cooling",
        "coffee_machine",
        "other_technical_issue",
        "something_broken",
      ]),
    []
  );

  const requestDefs = useMemo(
    () =>
    (((config.requestDefs ?? []) as RequestDef[])
      .filter(
        (def) =>
          def &&
          def.id &&
          def.enabled !== false &&
          !hiddenGuestRequestIds.has(String(def.id).trim().toLowerCase())
      )
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))),
    [config.requestDefs]
  );

  const getRequestDefField = useCallback(
    (def: RequestDef, field: "title" | "subtitle" | "description" | "policy" | "success" | "staffLabel") =>
      getRequestDefText(def, lang, field, fallbackLangs),
    [fallbackLangs, lang]
  );

  const getTextMapValue = useCallback(
    (map?: Partial<Record<LangKey, string>>) => {
      if (!map) return "";

      const preferred = [String(lang || "").trim(), ...fallbackLangs.map((x) => String(x || "").trim())]
        .filter(Boolean);

      for (const key of preferred) {
        const value = map[key];
        if (value && String(value).trim()) return String(value).trim();
      }

      const first = Object.values(map).find((value) => String(value || "").trim());
      return first ? String(first).trim() : "";
    },
    [fallbackLangs, lang]
  );

  const getRequestDefOptions = useCallback(
    (def?: RequestDef | null, preferredLang: LangKey = lang) => {
      if (!def) return [] as string[];
      const maps = def.optionsByLang ?? {};
      const preferred = [
        String(preferredLang || "").trim(),
        ...fallbackLangs.map((x) => String(x || "").trim()),
      ].filter(Boolean);

      for (const key of preferred) {
        const values = maps[key];
        if (Array.isArray(values) && values.length) return values.map((item) => String(item).trim()).filter(Boolean);
      }

      const firstLocalized = Object.values(maps).find((values) => Array.isArray(values) && values.length);
      if (Array.isArray(firstLocalized) && firstLocalized.length) {
        return firstLocalized.map((item) => String(item).trim()).filter(Boolean);
      }

      return (def.options ?? []).map((item) => String(item).trim()).filter(Boolean);
    },
    [fallbackLangs, lang]
  );

  const getRequestDefOptionImages = useCallback((def?: RequestDef | null) => {
    if (!def) return [] as string[];
    return (def.optionImageUrls ?? [])
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }, []);

  const getRequestDefOptionInfo = useCallback(
    (def?: RequestDef | null, preferredLang: LangKey = lang) => {
      if (!def) return [] as string[];
      const maps = (def as RequestDef & { optionInfoByLang?: Partial<Record<LangKey, string[]>> }).optionInfoByLang ?? {};
      const preferred = [
        String(preferredLang || "").trim(),
        ...fallbackLangs.map((x) => String(x || "").trim()),
      ].filter(Boolean);

      for (const key of preferred) {
        const values = maps[key];
        if (Array.isArray(values) && values.length) return values.map((item) => String(item).trim()).filter(Boolean);
      }

      const firstLocalized = Object.values(maps).find((values) => Array.isArray(values) && values.length);
      if (Array.isArray(firstLocalized) && firstLocalized.length) {
        return firstLocalized.map((item) => String(item).trim()).filter(Boolean);
      }

      return [] as string[];
    },
    [fallbackLangs, lang]
  );

  const getRequestDefMessage = useCallback(
    (def?: RequestDef | null) => {
      if (!def) return "";

      const junkValues = new Set(["true", "false", "yes", "no", "eur", "bgn", "usd", "none"]);

      return [
        getRequestDefField(def, "description"),
        getRequestDefField(def, "policy"),
        getRequestDefField(def, "subtitle"),
      ]
        .map((item) => String(item || "").trim())
        .filter((item) => item && !junkValues.has(item.toLowerCase()))
        .join("\n\n");
    },
    [getRequestDefField]
  );

  const getRequestDefTitle = useCallback(
    (def?: RequestDef | null) => {
      if (!def) return "";
      const title = String(getRequestDefField(def, "title") || "").trim();
      const junkValues = new Set(["true", "false", "yes", "no", "eur", "bgn", "usd", "none"]);
      if (!title || junkValues.has(title.toLowerCase())) return "";
      return title;
    },
    [getRequestDefField]
  );

  const getRequestDefHref = useCallback(
    (def?: RequestDef | null) => {
      if (!def) return "";

      const direct = String(def.pdfUrl || def.externalUrl || def.linkUrl || "").trim();
      if (direct) return direct;

      // Repair protection: if a Google Sheets row was shifted, the URL may have landed in description/policy.
      const text = getRequestDefMessage(def);
      const match = text.match(/https?:\/\/\S+/i);
      return match ? match[0] : "";
    },
    [getRequestDefMessage]
  );

  const isRenderableRequestDef = useCallback(
    (def?: RequestDef | null) => {
      if (!def || def.enabled === false || def.guestVisible === false) return false;

      const title = getRequestDefTitle(def);
      const message = getRequestDefMessage(def);
      const href = getRequestDefHref(def);
      const type = String(def.type || "").trim().toLowerCase();

      if (!title && !message && !href) return false;

      // Link/PDF/external sections should not be shown until they have a real link.
      if ((type === "pdf" || type === "external_link" || type === "link") && !href) return false;

      return true;
    },
    [getRequestDefHref, getRequestDefMessage, getRequestDefTitle]
  );

  const requestDefsByCategory = useMemo(() => {
    return requestDefs.reduce<Record<string, RequestDef[]>>((acc, def) => {
      const category = String(def.category || "general").trim().toLowerCase();
      if (!acc[category]) acc[category] = [];
      acc[category].push(def);
      return acc;
    }, {});
  }, [requestDefs]);

  const requestDefIds = useMemo(
    () =>
      new Set(
        requestDefs
          .map((def) => String(def.id || def.requestType || "").trim().toLowerCase())
          .filter((id) => id && !builtInRequestDefIds.has(id))
      ),
    [builtInRequestDefIds, requestDefs]
  );
  const hasReceptionDefs = (requestDefsByCategory["reception"] ?? []).length > 0;
  const hasHousekeepingDefs = (requestDefsByCategory["housekeeping"] ?? []).length > 0;
  const hasMaintenanceDefs = (requestDefsByCategory["maintenance"] ?? []).length > 0;

  const lateCheckoutDef = useMemo(
    () => requestDefs.find((def) => def.id === "late_checkout"),
    [requestDefs]
  );
  const minibarDef = useMemo(
    () => requestDefs.find((def) => def.id === "minibar_refill" || def.id === "minibar"),
    [requestDefs]
  );
  const minibarInfoDef = useMemo(
    () => requestDefs.find((def) => def.id === "minibar_notice" || (def.id === "minibar" && def.type !== "request")),
    [requestDefs]
  );
  const wakeUpDef = useMemo(
    () => requestDefs.find((def) => def.id === "wake_up_call"),
    [requestDefs]
  );

  const lateCheckoutInfo = String(
    getRequestDefMessage(lateCheckoutDef) ||
    (config as any).lateCheckoutInfo ||
    tUI("late_checkout_info") ||
    (lang === "bg"
      ? "Късният check-out се предлага срещу допълнително заплащане. Точните условия и цена се потвърждават от рецепция."
      : lang === "de"
        ? "Late Check-out wird gegen Aufpreis angeboten. Die genauen Konditionen und der Preis werden von der Rezeption bestätigt."
        : "Late checkout is available for an additional charge. Final conditions and pricing are confirmed by reception.")
  ).trim();

  const minibarNotice = String(
    getRequestDefMessage(minibarInfoDef || minibarDef) ||
    (config as any).minibarNotice ||
    tUI("minibar_notice") ||
    ""
  ).trim();

  const wakeUpSlots = useMemo(() => {
    const fromDef = (wakeUpDef?.options ?? []).map((item) => String(item).trim()).filter(Boolean);
    if (fromDef.length) return fromDef;

    return String(
      (config as any).wakeUpSlots || "05:00,05:30,06:00,06:30,07:00,07:30,08:00"
    )
      .split(/[|,]/)
      .map((x) => x.trim())
      .filter(Boolean);
  }, [config, wakeUpDef]);

  const requestDefAiServices = useMemo(() => {
    const sectionLabels = {
      housekeeping: String(tUI("housekeeping_title") || "Housekeeping"),
      reception: String(tUI("reception_title") || "Reception"),
      maintenance: String(tUI("maintenance_title") || "Maintenance"),
    };

    const routeLabelByLang = {
      bg: (section: string) => `Изпратете заявката от секцията ${section} в хъба.`,
      en: (section: string) => `Send the request from the ${section} section in the hub.`,
      de: (section: string) => `Senden Sie die Anfrage über den Bereich ${section} im Hub.`,
    } as const;

    const slotLabelByLang = {
      bg: (slots: string) => `Налични часове: ${slots}.`,
      en: (slots: string) => `Available times: ${slots}.`,
      de: (slots: string) => `Verfügbare Zeiten: ${slots}.`,
    } as const;

    const currentLang = (lang === "bg" || lang === "en" || lang === "de") ? lang : "en";

    return requestDefs
      .filter((def) => def.aiVisible !== false && def.guestVisible !== false)
      .map((def) => {
        const label = getRequestDefField(def, "title") || def.id.replace(/_/g, " ");
        const baseMessage = getRequestDefMessage(def);
        const dept = String(def.targetDepartment || def.category || "").trim().toLowerCase();
        const section = (
          dept === "housekeeping"
            ? sectionLabels.housekeeping
            : dept === "reception"
              ? sectionLabels.reception
              : dept === "maintenance"
                ? sectionLabels.maintenance
                : ""
        );

        const extras: string[] = [];

        if (def.type === "request" && section) {
          extras.push(routeLabelByLang[currentLang](section));
        }

        const localizedOptions = getRequestDefOptions(def);

        if ((def.requestKind === "time_slot" || (def.requiresTime && def.timeMode === "slots")) && localizedOptions.length) {
          extras.push(slotLabelByLang[currentLang](localizedOptions.join(", ")));
        }

        return {
          key: def.id,
          label,
          description: [baseMessage, ...extras].map((item) => String(item || "").trim()).filter(Boolean).join("\n\n"),
          active: def.enabled !== false,
          category: def.category,
          keywords: [
            def.id,
            def.id.replace(/_/g, " "),
            ...def.keywords,
            ...localizedOptions,
          ].filter(Boolean),
        };
      });
  }, [getRequestDefField, getRequestDefMessage, getRequestDefOptions, lang, requestDefs, tUI]);

  const aiServices = useMemo(() => {
    const sectionLabels = {
      housekeeping: String(tUI("housekeeping_title") || "Housekeeping"),
      reception: String(tUI("reception_title") || "Reception"),
      maintenance: String(tUI("maintenance_title") || "Maintenance"),
    };

    const copy = {
      bg: {
        requestFrom: (label: string, section: string) =>
          `Да, можете да заявите ${label.toLowerCase()} от секцията ${section} в хъба.`,
        laundry:
          "За услугата пране, моля, обърнете се към рецепция.",
        lateCheckout:
          lateCheckoutInfo ||
          "Късният check-out се предлага срещу допълнително заплащане. Точните условия и цена се потвърждават от рецепция.",
        wakeUp: `Можете да заявите събуждане от секцията ${sectionLabels.reception}. Налични часове: ${wakeUpSlots.join(", ")}.`,
        minibar: minibarNotice
          ? `${minibarNotice} Можете да заявите зареждане от секцията ${sectionLabels.housekeeping}.`
          : `Можете да заявите зареждане на минибара от секцията ${sectionLabels.housekeeping}.`,
        taxi: `Можете да заявите такси от секцията ${sectionLabels.reception}.`,
        ac: `Можете да подадете сигнал за проблем с климатика от секцията ${sectionLabels.maintenance}.`,
        hotWater: `Можете да подадете сигнал за липса на топла вода от секцията ${sectionLabels.maintenance}.`,
        broken: `Можете да подадете сигнал за технически проблем от секцията ${sectionLabels.maintenance}.`,
      },
      en: {
        requestFrom: (label: string, section: string) =>
          `Yes, you can request ${label.toLowerCase()} from the ${section} section in the hub.`,
        laundry:
          "For laundry service, please contact reception.",
        lateCheckout:
          lateCheckoutInfo ||
          "Late checkout is available for an additional charge. Final conditions and pricing are confirmed by reception.",
        wakeUp: `You can request a wake-up call from the ${sectionLabels.reception} section. Available times: ${wakeUpSlots.join(", ")}.`,
        minibar: minibarNotice
          ? `${minibarNotice} You can request minibar refill from the ${sectionLabels.housekeeping} section.`
          : `You can request minibar refill from the ${sectionLabels.housekeeping} section.`,
        taxi: `You can request a taxi from the ${sectionLabels.reception} section.`,
        ac: `You can report an air-conditioning issue from the ${sectionLabels.maintenance} section.`,
        hotWater: `You can report a hot water issue from the ${sectionLabels.maintenance} section.`,
        broken: `You can report a technical issue from the ${sectionLabels.maintenance} section.`,
      },
      de: {
        requestFrom: (label: string, section: string) =>
          `Ja, Sie können ${label.toLowerCase()} über den Bereich ${section} im Hub anfragen.`,
        laundry:
          "Für den Wäscheservice wenden Sie sich bitte an die Rezeption.",
        lateCheckout:
          lateCheckoutInfo ||
          "Late Check-out wird gegen Aufpreis angeboten. Die genauen Konditionen und der Preis werden von der Rezeption bestätigt.",
        wakeUp: `Sie können einen Weckruf über den Bereich ${sectionLabels.reception} anfragen. Verfügbare Zeiten: ${wakeUpSlots.join(", ")}.`,
        minibar: minibarNotice
          ? `${minibarNotice} Sie können eine Minibar-Auffüllung über den Bereich ${sectionLabels.housekeeping} anfragen.`
          : `Sie können eine Minibar-Auffüllung über den Bereich ${sectionLabels.housekeeping} anfragen.`,
        taxi: `Sie können ein Taxi über den Bereich ${sectionLabels.reception} anfragen.`,
        ac: `Sie können ein Problem mit der Klimaanlage über den Bereich ${sectionLabels.maintenance} melden.`,
        hotWater: `Sie können fehlendes Warmwasser über den Bereich ${sectionLabels.maintenance} melden.`,
        broken: `Sie können ein technisches Problem über den Bereich ${sectionLabels.maintenance} melden.`,
      },
      ro: {
        requestFrom: (label: string, section: string) =>
          `Da, puteți solicita ${label.toLowerCase()} din secțiunea ${section} din hub.`,
        laundry:
          "Serviciul de spălătorie este contra cost. Pentru detalii, vă rugăm să contactați recepția.",
        lateCheckout:
          lateCheckoutInfo ||
          "Late check-out este disponibil contra cost. Condițiile finale și prețul sunt confirmate de recepție.",
        wakeUp: `Puteți solicita un apel de trezire din secțiunea ${sectionLabels.reception}. Ore disponibile: ${wakeUpSlots.join(", ")}.`,
        minibar: minibarNotice
          ? `${minibarNotice} Puteți solicita reumplerea minibarului din secțiunea ${sectionLabels.housekeeping}.`
          : `Puteți solicita reumplerea minibarului din secțiunea ${sectionLabels.housekeeping}.`,
        taxi: `Puteți solicita un taxi din secțiunea ${sectionLabels.reception}.`,
        ac: `Puteți raporta o problemă cu aerul condiționat din secțiunea ${sectionLabels.maintenance}.`,
        hotWater: `Puteți raporta o problemă cu apa caldă din secțiunea ${sectionLabels.maintenance}.`,
        broken: `Puteți raporta o problemă tehnică din secțiunea ${sectionLabels.maintenance}.`,
      },
      cs: {
        requestFrom: (label: string, section: string) =>
          `Ano, ${label.toLowerCase()} můžete požádat v sekci ${section} v hubu.`,
        laundry:
          "Prádelna je placená služba. Pro podrobnosti kontaktujte recepci.",
        lateCheckout:
          lateCheckoutInfo ||
          "Pozdní check-out je k dispozici za příplatek. Konečné podmínky a cenu potvrdí recepce.",
        wakeUp: `Buzení si můžete vyžádat v sekci ${sectionLabels.reception}. Dostupné časy: ${wakeUpSlots.join(", ")}.`,
        minibar: minibarNotice
          ? `${minibarNotice} Doplnění minibaru můžete požádat v sekci ${sectionLabels.housekeeping}.`
          : `Doplnění minibaru můžete požádat v sekci ${sectionLabels.housekeeping}.`,
        taxi: `Taxi si můžete objednat v sekci ${sectionLabels.reception}.`,
        ac: `Problém s klimatizací můžete nahlásit v sekci ${sectionLabels.maintenance}.`,
        hotWater: `Problém s teplou vodou můžete nahlásit v sekci ${sectionLabels.maintenance}.`,
        broken: `Technický problém můžete nahlásit v sekci ${sectionLabels.maintenance}.`,
      },
    } as const;

    const c = copy[(lang === "bg" || lang === "en" || lang === "de" || lang === "ro" || lang === "cs") ? lang : "en"];

    const legacyServices = [
      {
        key: "towels",
        label: String(tUI("towels") || "Towels"),
        description: c.requestFrom(String(tUI("towels") || "Towels"), sectionLabels.housekeeping),
        active: true,
      },
      {
        key: "toilet_paper",
        label: String(tUI("toilet_paper") || "Toilet paper"),
        description: c.requestFrom(String(tUI("toilet_paper") || "Toilet paper"), sectionLabels.housekeeping),
        active: true,
      },
      {
        key: "extra_pillow",
        label: String(tUI("extra_pillows") || "Extra pillow"),
        description: c.requestFrom(String(tUI("extra_pillows") || "Extra pillow"), sectionLabels.housekeeping),
        active: true,
      },
      {
        key: "extra_blanket",
        label: String(tUI("blanket") || "Extra blanket"),
        description: c.requestFrom(String(tUI("blanket") || "Extra blanket"), sectionLabels.housekeeping),
        active: true,
      },
      {
        key: "iron",
        label: String(tUI("iron") || "Iron"),
        description: c.requestFrom(String(tUI("iron") || "Iron"), sectionLabels.housekeeping),
        active: true,
      },
      {
        key: "minibar",
        label: String(tUI("minibar") || "Minibar"),
        description: c.minibar,
        active: true,
      },
      {
        key: "laundry",
        label: String(tUI("laundry") || "Laundry"),
        description: c.laundry,
        active: true,
      },
      {
        key: "late_checkout",
        label: String(tUI("late_checkout") || "Late checkout"),
        description: c.lateCheckout,
        active: true,
      },
      {
        key: "wake_up_call",
        label: String(tUI("wake_up") || "Wake-up call"),
        description: c.wakeUp,
        active: true,
      },
      {
        key: "taxi",
        label: String(tUI("taxi") || "Taxi"),
        description: c.taxi,
        active: true,
      },
      {
        key: "air_conditioning",
        label: String(tUI("ac_issue") || "Air conditioning issue"),
        description: c.ac,
        active: true,
      },
      {
        key: "no_hot_water",
        label: String(tUI("water_issue") || "No hot water"),
        description: c.hotWater,
        active: true,
      },
      {
        key: "other_technical_issue",
        label: String(tUI("something_broken") || "Technical issue"),
        description: c.broken,
        active: true,
      },
    ];

    const existingKeys = new Set(requestDefAiServices.map((service) => service.key));
    return [
      ...requestDefAiServices,
      ...legacyServices.filter((service) => !existingKeys.has(service.key)),
    ];
  }, [lang, lateCheckoutInfo, minibarNotice, requestDefAiServices, tUI, wakeUpSlots]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        appHiddenAtRef.current = Date.now();
        return;
      }

      const hiddenAt = appHiddenAtRef.current;
      if (!hiddenAt) return;

      const elapsed = Date.now() - hiddenAt;
      if (elapsed >= AI_RESET_AFTER_MS) {
        clearAiState();
      }

      appHiddenAtRef.current = null;
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearAiState]);

  function confirmInfoBlock(message: string, onConfirm: () => void) {
    if (!message) {
      onConfirm();
      return;
    }

    openRequestDialog({
      title:
        String(tUI("info_title") || "").trim() ||
        (lang === "bg" ? "Информация" : lang === "de" ? "ℹ️ Information" : "ℹ️ Information"),
      message,
      confirmLabel:
        String(tUI("continue_request") || "").trim() ||
        (lang === "bg" ? "Продължи" : lang === "de" ? "Weiter" : "Continue"),
      cancelLabel:
        lang === "bg" ? "Отказ" : lang === "de" ? "Abbrechen" : "Cancel",
      onConfirm,
    });
  }

  function chooseWakeUpSlot(options = wakeUpSlots) {
    if (!options.length) return null;

    const list = options
      .map((slot, index) => `${index + 1}. ${slot}`)
      .join("\n");

    const picked = (window.prompt(
      `${String(
        tUI("wake_up_select") || "Изберете час за събуждане:"
      )}\n\n${list}`,
      options[0]
    ) || "").trim();

    if (!picked) return null;

    if (options.includes(picked)) return picked;

    const numericIndex = Number(picked);
    if (
      Number.isInteger(numericIndex) &&
      numericIndex >= 1 &&
      numericIndex <= options.length
    ) {
      return options[numericIndex - 1];
    }

    window.alert(
      String(tUI("wake_up_invalid") || "Невалиден час за събуждане.")
    );
    return null;
  }

  const chooseLateCheckoutSlot = () => {
    const answer = window.prompt(
      lang === "bg"
        ? "Изберете час за късен check-out: 13:00 или 14:00"
        : lang === "de"
          ? "Wählen Sie die Uhrzeit für Late Check-out: 13:00 oder 14:00"
          : "Choose late check-out time: 13:00 or 14:00",
      "13:00"
    );

    if (!answer) return null;

    const normalized = answer.trim();
    if (normalized === "13:00" || normalized === "14:00") return normalized;

    window.alert(
      lang === "bg"
        ? "Моля, въведете само 13:00 или 14:00."
        : lang === "de"
          ? "Bitte geben Sie nur 13:00 oder 14:00 ein."
          : "Please enter only 13:00 or 14:00."
    );

    return null;
  };

  function promptRequestNote(def: RequestDef) {
    const promptLabel =
      getRequestDefField(def, "subtitle") ||
      tUI("request_note_prompt") ||
      "Add details (optional):";

    return (window.prompt(String(promptLabel), "") || "").trim();
  }

  function promptRequestQuantity(def: RequestDef) {
    const min = def.minQty ?? 1;
    const max = def.maxQty ?? 10;
    const raw = (window.prompt(
      String(tUI("request_quantity_prompt") || `Quantity (${min}-${max}):`),
      String(min)
    ) || "").trim();

    if (!raw) return null;

    const qty = Number(raw);
    if (!Number.isFinite(qty) || qty < min || qty > max) {
      window.alert(String(tUI("request_quantity_invalid") || `Please enter a number between ${min} and ${max}.`));
      return null;
    }

    return qty;
  }

  function buildRequestDefNote(def: RequestDef, infoMessage: string) {
    const noteParts: string[] = [];
    const shouldAskLateCheckoutTime = def.id === "late_checkout" && !def.requiresTime;

    const localizedOptions = getRequestDefOptions(def);
    const bgOptions = getRequestDefOptions(def, "bg");

    if ((def.requestKind === "time_slot" || (def.requiresTime && def.timeMode === "slots")) && localizedOptions.length) {
      const slot = chooseWakeUpSlot(localizedOptions);
      if (!slot) return null;
      noteParts.push(`${String(tUI("wake_up_selected") || "Selected time")}: ${slot}`);
    } else if ((def.requiresTime && def.timeMode === "free") || shouldAskLateCheckoutTime) {
      const timeLabel = def.id === "late_checkout"
        ? (
          tUI("late_checkout_time_prompt") ||
          (lang === "bg"
            ? "Желан час за късен чек-аут:"
            : lang === "de"
              ? "Gewünschte Uhrzeit für den späten Check-out:"
              : "Desired late checkout time:")
        )
        : String(tUI("prompt_time") || "Time:");

      const timeExample = def.id === "late_checkout"
        ? (lang === "bg" ? "13:00" : lang === "de" ? "13:00" : "13:00")
        : String(tUI("example_time") || "07:00");

      const pickedTime = askRequired(
        String(timeLabel),
        String(timeExample),
        reTime,
        String(tUI("invalid_time") || "Invalid time")
      );

      if (!pickedTime) return null;

      const selectedLabel = def.id === "late_checkout"
        ? (
          tUI("late_checkout_selected_time") ||
          (lang === "bg"
            ? "Желан час за напускане"
            : lang === "de"
              ? "Gewünschte Check-out-Zeit"
              : "Desired checkout time")
        )
        : String(tUI("label_time") || "Time");

      noteParts.push(`${String(selectedLabel)}: ${pickedTime}`);
    }

    if (def.requestKind === "selection" && localizedOptions.length) {
      const list = localizedOptions.map((option, index) => `${index + 1}. ${option}`).join("\n");
      const picked = (window.prompt(
        `${String(tUI("request_option_prompt") || "Choose an option:")}\n\n${list}`,
        localizedOptions[0]
      ) || "").trim();

      if (!picked) return null;

      const numericIndex = Number(picked);
      const selectedIndex = Number.isInteger(numericIndex) && numericIndex >= 1 && numericIndex <= localizedOptions.length
        ? numericIndex - 1
        : localizedOptions.findIndex((option) => option.toLowerCase() === picked.toLowerCase());

      const selected = selectedIndex >= 0 ? localizedOptions[selectedIndex] : picked;
      const bgSelected = selectedIndex >= 0 ? (bgOptions[selectedIndex] || "") : "";

      noteParts.push(`${String(tUI("label_option") || "Option")}: ${selected}`);
      if (bgSelected && bgSelected !== selected) {
        noteParts.push(`Оперативно BG: ${bgSelected}`);
      }
    }

    if (def.requiresQuantity || def.requestKind === "quantity") {
      const qty = promptRequestQuantity(def);
      if (qty == null) return null;
      noteParts.push(`${String(tUI("label_quantity") || tUI("label_people") || "Quantity")}: ${qty}`);
    }

    if (getRequestDefEffectiveRequiresBilling(def)) {
      const priceText = [getRequestDefEffectivePrice(def), getRequestDefEffectiveCurrency(def)].map((item) => String(item || "").trim()).filter(Boolean).join(" ");
      noteParts.push(
        priceText
          ? `${String(tUI("billing_note") || "Paid service / charge to room")}: ${priceText}`
          : String(tUI("billing_note") || "Paid service / charge to room")
      );
    }

    if (def.requiresNote) {
      const note = promptRequestNote(def);
      if (note) noteParts.push(note);
    }

    const composed = noteParts.map((item) => item.trim()).filter(Boolean).join("\n").trim();
    if (composed) return composed;

    if (def.id === "late_checkout" || def.id === "minibar") {
      return infoMessage || undefined;
    }

    return undefined;
  }

  function getRequestDefDepartmentOverride(def: RequestDef): StaffDepartment | undefined {
    const department = String(def.targetDepartment || "").trim().toLowerCase();

    if (department === "reception" || department === "housekeeping" || department === "maintenance" || department === "restaurant") {
      return department as StaffDepartment;
    }

    return undefined;
  }

  function getRequestDefEffectivePrice(def: RequestDef) {
    if (def.id === "late_checkout") return def.price || "25,00";
    return def.price;
  }

  function getRequestDefEffectiveCurrency(def: RequestDef) {
    if (def.id === "late_checkout") return def.currency || "€";
    return def.currency;
  }

  function getRequestDefEffectiveRequiresBilling(def: RequestDef) {
    return Boolean(def.requiresBilling || def.price || def.id === "late_checkout");
  }

  function getRequestDefEffectiveNotifyDepartments(def: RequestDef) {
    const departments = Array.isArray(def.notifyDepartments) ? def.notifyDepartments : [];
    if (def.id !== "late_checkout") return departments;

    return Array.from(new Set([...departments, "reception"]));
  }

  function handleRequestDefClick(def: RequestDef) {
    const infoMessage = getRequestDefMessage(def);
    const title = getRequestDefTitle(def) || def.id.replace(/_/g, " ");

    if (def.type !== "request" || def.requestKind === "info_only") {
      openRequestDialog({
        title,
        message: infoMessage || title,
        confirmLabel:
          lang === "bg" ? "Затвори" : lang === "de" ? "Schließen" : lang === "ro" ? "Închide" : lang === "cs" ? "Zavřít" : "Close",
      });
      return;
    }

    if (!ensureConfirmedRoom()) return;

    const continueSubmit = () => {
      const note = buildRequestDefNote(def, infoMessage);
      if (note === null) return;

      submitGuestRequest({
        type: String(def.requestType || def.id),
        typeLabel: title,
        note: note || undefined,
        departmentOverride: getRequestDefDepartmentOverride(def),
        notifyDepartments: getRequestDefEffectiveNotifyDepartments(def),
        requiresBilling: getRequestDefEffectiveRequiresBilling(def),
        price: getRequestDefEffectivePrice(def),
        currency: getRequestDefEffectiveCurrency(def),
        sourceRequestDef: def.id,
      });
    };

    if (infoMessage && def.confirmationMode !== "instant") {
      confirmInfoBlock(infoMessage, continueSubmit);
      return;
    }

    continueSubmit();
  }


  function askBrokenItemDescription() {
    const promptLabel = String(tUI("something_broken_prompt") || "Please describe what is broken or damaged:");
    const requiredMessage = String(tUI("something_broken_required") || "Please describe what is broken so maintenance can respond properly.");

    while (true) {
      const value = (window.prompt(promptLabel, "") || "").trim();
      if (!value) {
        window.alert(requiredMessage);
        return null;
      }
      return value;
    }
  }


  function parseMoneyValue(value?: string | null): number | null {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const match = raw.match(/(\d+(?:[,.]\d{1,2})?)/);
    if (!match) return null;
    const parsed = Number(match[1].replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatMoneyValue(value: number, currency?: string | null): string {
    const amount = value.toFixed(2).replace(".", ",");
    return [amount, String(currency || "€").trim()].filter(Boolean).join(" ");
  }

  function extractPriceFromText(value?: string | null): { price: string; currency: string } | null {
    const raw = String(value || "").trim();
    if (!raw) return null;

    // Prefer amounts next to a currency symbol. If a service contains duration + price
    // (e.g. "30 min. — 35,00 €"), picking the first number would incorrectly use 30.
    const currencyMatch = raw.match(/(\d+(?:[,.]\d{1,2})?)\s*(€|EUR)/i);
    if (currencyMatch) {
      return {
        price: currencyMatch[1].replace(".", ","),
        currency: currencyMatch[2].toUpperCase() === "EUR" ? "€" : currencyMatch[2],
      };
    }

    // Fallback: use the last numeric value in the option text. This handles
    // "Full body massage — 60 min. — 60,00" better than using the duration.
    const matches = Array.from(raw.matchAll(/\d+(?:[,.]\d{1,2})?/g));
    const last = matches[matches.length - 1];
    if (!last) return null;

    return {
      price: last[0].replace(".", ","),
      currency: raw.includes("€") ? "€" : "",
    };
  }

  function getQtyUnitLabel() {
    if (lang === "bg") return "бр.";
    if (lang === "de") return "Stk.";
    if (lang === "ro") return "buc.";
    if (lang === "cs") return "ks";
    return "pcs";
  }

  function getRequestDefPriceHint(def: RequestDef) {
    const price = String(def.price || "").trim();
    const currency = String(def.currency || "").trim();
    if (!price) return "";

    const suffix = def.requestKind === "quantity" || def.requiresQuantity
      ? (lang === "bg" ? " / бр." : lang === "de" ? " / Stk." : lang === "ro" ? " / buc." : lang === "cs" ? " / ks" : " each")
      : "";

    return [price, currency].filter(Boolean).join(" ") + suffix;
  }

  function getQuantityChoices(def: RequestDef) {
    const min = Math.max(1, Number(def.minQty ?? 1));
    const max = Math.max(min, Number(def.maxQty ?? 10));
    const cappedMax = Math.min(max, 20);
    return Array.from({ length: cappedMax - min + 1 }, (_, index) => min + index);
  }

  function getQuantityButtonLabel(def: RequestDef, qty: number) {
    const unitPrice = parseMoneyValue(def.price);
    const currency = String(def.currency || "€").trim();
    const base = `${qty} ${getQtyUnitLabel()}`;
    if (!unitPrice) return base;
    return `${base} — ${formatMoneyValue(unitPrice * qty, currency)}`;
  }

  function isMassageRequestDef(def?: RequestDef | null) {
    const id = String(def?.id || "").trim().toLowerCase();
    const requestType = String(def?.requestType || "").trim().toLowerCase();
    return id === "massage_booking" || requestType === "massage_booking";
  }


  function getMassageServiceDurationMinutes(value?: string | null): number {
    const raw = String(value || "").trim();
    const match = raw.match(/(\d{1,3})\s*(?:мин\.?|min\.?|Min\.?|minutes?|Minuten?)/i);
    if (!match) return 0;
    const minutes = Number(match[1]);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  }

  function getSpaBookingRanges(): Array<{ start: number; end: number }> {
    const spaVenue = rawVenueRows.find((venue) => {
      const category = normalizeCategory(venue);
      const name = String(venue.name || "").toLowerCase();
      return category === "spa" || name.includes("spa") || name.includes("спа");
    });

    const explicitRanges = parseTimeRanges(spaVenue?.reservationHours || spaVenue?.hours || "");
    if (explicitRanges.length) return explicitRanges;

    const open = timeToMinutes(spaVenue?.open) ?? timeToMinutes("09:00") ?? 9 * 60;
    const close = timeToMinutes(spaVenue?.close) ?? timeToMinutes("19:00") ?? 19 * 60;

    return [{ start: open, end: close }];
  }

  function getSpaBookingHoursLabel(): string {
    const spaVenue = rawVenueRows.find((venue) => {
      const category = normalizeCategory(venue);
      const name = String(venue.name || "").toLowerCase();
      return category === "spa" || name.includes("spa") || name.includes("спа");
    });

    return (
      String(spaVenue?.reservationHours || spaVenue?.hours || "").trim() ||
      [String(spaVenue?.open || "09:00").trim(), String(spaVenue?.close || "19:00").trim()].filter(Boolean).join(" - ") ||
      "09:00 - 19:00"
    );
  }

  function isMassageTimeWithinWorkingHours(time: string, durationMinutes: number): boolean {
    const start = timeToMinutes(time);
    if (start === null) return false;

    const end = durationMinutes > 0 ? start + durationMinutes : start;
    return getSpaBookingRanges().some((range) => start >= range.start && end <= range.end);
  }

  function getMassageOutsideHoursMessage(durationMinutes: number): string {
    const hours = getSpaBookingHoursLabel();
    const base =
      lang === "de"
        ? `Massagen können nur während der Spa-Öffnungszeiten gebucht werden: ${hours}.`
        : lang === "en"
          ? `Massages can only be booked during Spa opening hours: ${hours}.`
          : lang === "ro"
            ? `Masajele pot fi rezervate doar în programul Spa: ${hours}.`
            : lang === "cs"
              ? `Masáže lze rezervovat pouze během otevírací doby Spa: ${hours}.`
              : `Масажите могат да се резервират само в работното време на СПА центъра: ${hours}.`;

    const finish =
      durationMinutes > 0
        ? lang === "de"
          ? " Bitte wählen Sie eine Uhrzeit, damit die Therapie innerhalb der Öffnungszeiten endet."
          : lang === "en"
            ? " Please choose a time so the therapy finishes within opening hours."
            : lang === "ro"
              ? " Vă rugăm să alegeți o oră astfel încât terapia să se încheie în timpul programului."
              : lang === "cs"
                ? " Zvolte prosím čas tak, aby terapie skončila v rámci otevírací doby."
                : " Моля изберете час, така че терапията да приключи в рамките на работното време."
        : "";

    return base + finish;
  }

  function submitRequestDefSelectionOption(def: RequestDef, option: string, optionIndex: number) {
    if (!ensureConfirmedRoom()) return;

    const title = getRequestDefTitle(def) || def.id.replace(/_/g, " ");
    const bgOptions = getRequestDefOptions(def, "bg");
    const bgSelected = optionIndex >= 0 ? String(bgOptions[optionIndex] || "").trim() : "";
    const selectedForOps = bgSelected || String(option || "").trim();
    const noteParts = selectedForOps ? [`Избрана услуга: ${selectedForOps}`] : [];

    // Keep the guest-facing selection only as secondary context when it differs.
    // Staff Hub will still show the operational Bulgarian option first.
    if (bgSelected && option && bgSelected !== option) {
      noteParts.push(`Избор на госта: ${option}`);
    }

    if (isMassageRequestDef(def)) {
      let date: string | null = null;

      while (!date) {
        date = askRequired(
          String(tUI("prompt_date") || "Дата:"),
          String(tUI("example_date") || "15.06.2026"),
          reDate,
          String(tUI("invalid_date") || "Невалидна дата")
        );

        if (date === null) return;

        const m = reDate.exec(date);
        if (!m) {
          window.alert(String(tUI("invalid_date") || "Невалидна дата"));
          date = null;
          continue;
        }

        const dd = Number(m[1]);
        const mm = Number(m[2]);
        const yyyy = Number(m[3]);
        const picked = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
        const today = new Date();
        const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);

        if (
          picked.getFullYear() !== yyyy ||
          picked.getMonth() !== mm - 1 ||
          picked.getDate() !== dd ||
          picked < today0
        ) {
          window.alert(String(tUI("invalid_date") || "Невалидна дата"));
          date = null;
        }
      }

      const durationMinutes = getMassageServiceDurationMinutes(selectedForOps || option);
      let time: string | null = null;

      while (!time) {
        const pickedTime = askRequired(
          String(tUI("prompt_time") || "Час:"),
          String(tUI("example_time") || "15:00"),
          reTime,
          String(tUI("invalid_time") || "Невалиден час")
        );

        if (!pickedTime) return;

        if (!isMassageTimeWithinWorkingHours(pickedTime, durationMinutes)) {
          window.alert(getMassageOutsideHoursMessage(durationMinutes));
          continue;
        }

        time = pickedTime;
      }

      noteParts.push(`Дата: ${date}`);
      noteParts.push(`Час: ${time}`);
      noteParts.push(`Работно време на СПА: ${getSpaBookingHoursLabel()}`);
      noteParts.push("Рецепцията трябва да потвърди наличността за избраната дата и час.");
    }

    const extractedPrice = extractPriceFromText(option) || extractPriceFromText(bgSelected);
    const requestPrice = String(def.price || extractedPrice?.price || "").trim();
    const requestCurrency = String(def.currency || extractedPrice?.currency || "").trim();

    submitGuestRequest({
      type: String(def.requestType || def.id),
      typeLabel: title,
      note: noteParts.join("\n"),
      departmentOverride: getRequestDefDepartmentOverride(def),
      notifyDepartments: def.notifyDepartments,
      requiresBilling: def.requiresBilling,
      price: requestPrice,
      currency: requestCurrency,
      sourceRequestDef: def.id,
    });
  }

  function submitRequestDefQuantityChoice(def: RequestDef, qty: number) {
    if (!ensureConfirmedRoom()) return;

    const title = getRequestDefTitle(def) || def.id.replace(/_/g, " ");
    const unitPrice = parseMoneyValue(def.price);
    const currency = String(def.currency || "€").trim();
    const total = unitPrice ? unitPrice * qty : null;
    const noteParts = [`Количество: ${qty}`];

    if (total !== null) {
      noteParts.push(`Обща цена: ${formatMoneyValue(total, currency)}`);
    }

    submitGuestRequest({
      type: String(def.requestType || def.id),
      typeLabel: title,
      note: noteParts.join("\n"),
      departmentOverride: getRequestDefDepartmentOverride(def),
      notifyDepartments: def.notifyDepartments,
      requiresBilling: def.requiresBilling,
      price: total !== null ? total.toFixed(2).replace(".", ",") : def.price,
      currency,
      sourceRequestDef: def.id,
    });
  }

  function buildRequestDefItems(category: string): HubItem[] {
    const normalizedCategory = String(category || "").trim().toLowerCase();
    const defsForCategory = requestDefsByCategory[normalizedCategory] ?? [];
    const defs = normalizedCategory === "spa"
      ? [
        ...defsForCategory,
        ...requestDefs.filter((def) => {
          const id = String(def.id || "").trim().toLowerCase();
          const requestType = String(def.requestType || "").trim().toLowerCase();
          const defCategory = String(def.category || "").trim().toLowerCase();
          return (id === "massage_booking" || requestType === "massage_booking") && defCategory !== "spa";
        }),
      ].filter((def, index, arr) => arr.findIndex((x) => String(x.id || x.requestType) === String(def.id || def.requestType)) === index)
      : defsForCategory;

    return defs
      .filter((def) => {
        const defId = String(def.id || "").trim().toLowerCase();
        const requestType = String(def.requestType || "").trim().toLowerCase();

        // Core hotel operations are rendered below as stable built-in actions.
        // Google Sheets may still contain old rows for them, but they must not hide
        // the full standard department menus or create duplicates.
        if (builtInRequestDefIds.has(defId) || builtInRequestDefIds.has(requestType)) {
          return false;
        }

        // Massage requests are shown inside Outlets → Spa Center, not under Reception.
        if (normalizedCategory === "reception" && (defId === "massage_booking" || requestType === "massage_booking")) {
          return false;
        }

        return isRenderableRequestDef(def);
      })
      .map((def) => {
        const title = getRequestDefTitle(def) || def.id.replace(/_/g, " ");
        const icon = getRequestDefButtonIcon(def);
        const label = icon ? `${icon} ${title}` : title;
        const href = getRequestDefHref(def);

        if (def.type === "request" && (def.requestKind === "selection" || def.requestKind === "quantity" || def.requiresQuantity)) {
          return {
            label,
            kind: "request_def" as const,
            requestDef: def,
          } as any;
        }

        if (href && (def.type === "pdf" || def.type === "external_link" || def.type === "link")) {
          return {
            label,
            kind: "link" as const,
            href,
            newTab: true,
          };
        }

        return {
          label,
          kind: "link" as const,
          onClick: () => handleRequestDefClick(def),
        };
      });
  }
  const taxiProviders = config.taxiProviders ?? [];

  const rawVenueRows = (((config as any).venueRows ?? []) as Array<VenueRow>).filter(
    (v) => v && (v.name || getVenueText(v, "name", lang)) && (v.type || v.category) && v.active !== false
  );

  const groupedOutlets = useMemo(() => {
    const grouped = rawVenueRows.reduce<Record<string, VenueRow[]>>((acc, row) => {
      const category = normalizeCategory(row);
      if (!acc[category]) acc[category] = [];
      acc[category].push(row);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([category, venues]) => ({
        category,
        meta: categoryMeta(category),
        venues: [...venues].sort(
          (a, b) => Number(a.sortOrder ?? 999) - Number(b.sortOrder ?? 999)
        ),
      }))
      .sort((a, b) => {
        const aMin = Math.min(...a.venues.map((x) => Number(x.sortOrder ?? 999)));
        const bMin = Math.min(...b.venues.map((x) => Number(x.sortOrder ?? 999)));
        return aMin - bMin;
      });
  }, [rawVenueRows]);

  const outletsSection =
    groupedOutlets.length > 0
      ? {
        id: "outlets",
        title: `🍴 ${String(tUI("outlets_title") || "Outlets")}`,
        items: [],
      }
      : null;

  const spaRequestDefItems = buildRequestDefItems("spa");

  const buildStaffMessage = (msgKey: string, filledOPS?: string, filledHELP?: string) => {
    const baseOPS = filledOPS ?? String(tOPS(msgKey));
    const main = `${roomPrefix}${baseOPS}`;

    if (!helperEnabled) return main;

    const baseHELP = filledHELP ?? String(tHELP(msgKey));
    const helperLine = `${roomPrefix}${baseHELP}`;
    return `${main}\n\nEN: ${helperLine}`;
  };

  const openWhatsApp = (to?: string, message = "", showClosedWarning = false) => {
    const target = String(to || contact.reception?.whatsapp || "").trim();

    if (!target) {
      window.alert("липсва WhatsApp номер за контакт");
      return;
    }

    if (showClosedWarning) window.alert(closedMsg);
    window.location.href = buildWhatsAppLink(target, message);
  };

  const getDeptWhatsapp = (dept: DepartmentKey | "reception") =>
    String(contact?.[dept]?.whatsapp || contact?.reception?.whatsapp || "").trim();

  const getDeptPhone = (dept: DepartmentKey | "reception") =>
    String(contact?.[dept]?.phone || contact?.reception?.phone || "").trim();


  const sendHousekeeping = (msgKey: string) => {
    if (!ensureConfirmedRoom()) return;
    const routed = warnAndRouteIfClosed("housekeeping");
    const to =
      routed.dept === "reception"
        ? getDeptWhatsapp("reception")
        : getDeptWhatsapp("housekeeping");
    openWhatsApp(to, buildStaffMessage(msgKey), routed.warned);
  };

  const sendEvents = (msgKey: string) => {
    if (!ensureConfirmedRoom()) return;
    const routed = warnAndRouteIfClosed("events");
    const to =
      routed.dept === "reception"
        ? getDeptWhatsapp("reception")
        : getDeptWhatsapp("events");
    openWhatsApp(to, buildStaffMessage(msgKey), routed.warned);
  };

  const housekeepingRequestTypes = new Set<string>([
    "towels",
    "toilet_paper",
    "extra_pillow",
    "extra_blanket",
    "bathrobe",
    "slippers",
    "baby_cot",
    "iron",
    "minibar",
    "laundry",
    "other_housekeeping",
  ]);

  const maintenanceRequestTypes = new Set<string>([
    "air_conditioning",
    "no_hot_water",
    "tv_issue",
    "light_not_working",
    "bathroom_issue",
    "door_lock_issue",
    "wifi_issue",
    "power_outlet_issue",
    "safe_issue",
    "balcony_door_issue",
    "minibar_not_cooling",
    "other_technical_issue",
  ]);

  const submitGuestRequest = async ({
    type,
    typeLabel,
    note,
    serviceTime = "now",
    departmentOverride: explicitDepartmentOverride,
    notifyDepartments,
    requiresBilling,
    price,
    currency,
    sourceRequestDef,
  }: {
    type: StaffRequestType | string;
    typeLabel: string;
    note?: string;
    serviceTime?: StaffServiceTime;
    departmentOverride?: StaffDepartment;
    notifyDepartments?: string[];
    requiresBilling?: boolean;
    price?: string;
    currency?: string;
    sourceRequestDef?: string;
  }) => {
    const roomValue = room.trim();
    const signatureLabel = cleanRequestTitle(typeLabel).toLowerCase() || String(type || "request");
    const signature = `${roomValue}::${type}::${signatureLabel}`;
    const now = Date.now();
    const lastAt = recentSubmissionRef.current[signature] ?? 0;

    if (submittingRequestRef.current) return;

    if (!roomValue) {
      window.alert(roomCopy.missingRoomQrAlert);
      return;
    }

    if (!ensureConfirmedRoom()) return;

    const nearHotel = await ensureGuestIsNearHotel();
    if (!nearHotel) return;

    if (!hotelScopeReady) {
      window.alert(roomCopy.requestFailed);
      return;
    }

    const hasSameActiveRequest = guestRequests.some(
      (item) =>
        item.room === roomValue &&
        item.type === type &&
        cleanRequestTitle(item.title).toLowerCase() === signatureLabel &&
        item.status !== "completed"
    );

    if (hasSameActiveRequest) {
      setShowRequestSuccess(true);
      return;
    }

    // Stop ultra-fast duplicate taps for the same room + request type
    if (now - lastAt < 5000) return;

    try {
      submittingRequestRef.current = true;
      recentSubmissionRef.current[signature] = now;

      const safeTypeLabel = cleanRequestTitle(typeLabel);
      setSubmittingRequest(true);
      setSubmittingRequestLabel(safeTypeLabel);

      const normalizedType = String(type);

      // Keep the original operational department in the request.
      // After-hours handover to reception is calculated dynamically in Staff Hub,
      // so the request can return to housekeeping/maintenance after 07:00 if still open.
      const departmentOverride = explicitDepartmentOverride;

      const res = await fetch("/api/guest/request-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelSlug: config.hotelSlug,
          room: roomValue,
          type,
          typeLabel: safeTypeLabel,
          serviceTime,
          note,
          departmentOverride,
          notifyDepartments,
          requiresBilling,
          price,
          currency,
          sourceRequestDef,
          guestLanguage: String(lang),
        }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok || !payload?.ok || !payload?.request) {
        throw new Error(payload?.error || "Failed to create request");
      }

      const created = payload.request as {
        id: string;
        room: string;
        typeLabel: string;
        status: StaffRequestStatus;
        createdAt: string;
      };

      const nextRefs = pushStoredGuestRequestRef({
        id: created.id,
        room: created.room,
      });

      setGuestRequestRefs(nextRefs);

      setGuestRequests((prev) => [
        {
          id: created.id,
          room: created.room,
          title: cleanRequestTitle(created.typeLabel),
          type: normalizeStaffRequestType(String(type || "")),
          status: created.status,
          createdAt: created.createdAt,
        },
        ...prev.filter((item) => item.id !== created.id),
      ]);

      const trackedSection =
        departmentOverride ??
        (housekeepingRequestTypes.has(normalizedType)
          ? "housekeeping"
          : maintenanceRequestTypes.has(normalizedType)
            ? "maintenance"
            : "reception");

      trackHubEvent({
        eventName: "request_submitted",
        roomNumber: roomValue,
        section: trackedSection,
        label: normalizedType,
        value: safeTypeLabel,
        page: window.location.pathname,
        extra: {
          requestId: created.id,
          serviceTime,
        },
      });

      setShowRequestSuccess(true);
    } catch (error) {
      console.error("submitGuestRequest failed", error);
      delete recentSubmissionRef.current[signature];
      window.alert(roomCopy.requestFailed);
    } finally {
      submittingRequestRef.current = false;
      setSubmittingRequest(false);
      setSubmittingRequestLabel("");
    }
  };

  const askAI = async () => {
    if (!aiQ.trim()) return;
    if (!ensureConfirmedRoom()) return;

    try {
      setAiLoading(true);
      setAiAnswer("");

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: aiQ,
          lang: String(lang),
          hotelSlug: config.hotelSlug,
          hotel: {
            hotelName: config.hotelName,
            locationQuery: config.location?.query,
            wifi: config.wifi,
            departmentHours: config.departmentHours,
            reviews: config.reviews,
            socialLinks: config.socialLinks,
            venueRows: (config as any).venueRows ?? [],
            hotelInfoItems: (config as any).hotelInfoItems ?? [],
            hubSections: sections.map((section) => ({
              id: String(section.id || ""),
              title: String(section.title || ""),
              items: section.items
                .map((item: any) => ({
                  label: typeof item?.label === "string" ? item.label : "",
                  info: typeof item?.info === "string" ? item.info : "",
                  kind: typeof item?.kind === "string" ? item.kind : "",
                  href: typeof item?.href === "string" ? item.href : "",
                  url: typeof item?.url === "string" ? item.url : "",
                }))
                .filter((item: any) => item.label || item.info || item.href || item.url),
            })),
            services: aiServices,
          },
        }),
      });

      const data = await res.json();

      if (!data?.ok) {
        setAiAnswer(String(tUI("ai_error") || "Възникна грешка при обработката."));
        return;
      }

      setAiAnswer(String(data.answer || tUI("ai_no_info") || "Все още нямам тази информация за хотела."));
    } catch {
      setAiAnswer(String(tUI("ai_error") || "Възникна грешка при обработката."));
    } finally {
      setAiLoading(false);
    }
  };

  const getVenueReservationDepartment = (venue: VenueRow): "reception" | "restaurant" => {
    const explicit = String(venue.reservationDepartment || "").trim().toLowerCase();

    if (explicit === "restaurant") return "restaurant";
    if (explicit === "reception") return "reception";

    const category = normalizeCategory(venue);

    if (category === "restaurants" || category === "bars") {
      return "restaurant";
    }

    return "reception";
  };

  const shouldCreateStaffVenueRequest = (venue: VenueRow) => {
    const type = String(venue.reservationType || "").trim().toLowerCase();
    const category = normalizeCategory(venue);

    if (type === "request" || type === "staff") return true;
    if (type === "url" || type === "phone" || type === "email" || type === "whatsapp" || type === "none") return false;

    // Spa, kids club, games room and pool reservations are operational requests,
    // so they should stay inside StayHub and show the guest a confirmation.
    return ["spa", "kids", "entertainment", "pool"].includes(category);
  };

  const getVenueReservationTitle = (venueName: string) => {
    if (lang === "de") return `Reservierung: ${venueName}`;
    if (lang === "en") return `Reservation: ${venueName}`;
    return `Резервация: ${venueName}`;
  };

  const sendVenueReservation = (venue: VenueRow) => {
    if (!ensureConfirmedRoom()) return;

    const venueName = venue?.name || "";

    const people = (window.prompt(String(tUI("prompt_people") || "Брой хора:"), "4") || "").trim();
    if (!people) return;

    let date: string | null = null;

    while (!date) {
      date = askRequired(
        String(tUI("prompt_date")),
        String(tUI("example_date")),
        reDate,
        String(tUI("invalid_date"))
      );
      if (date === null) return;
    }

    const m = reDate.exec(date);
    if (!m) return;

    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);

    const picked = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
    const today = new Date();
    const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);

    if (
      picked.getFullYear() !== yyyy ||
      picked.getMonth() !== mm - 1 ||
      picked.getDate() !== dd
    ) {
      alert(String(tUI("invalid_date")));
      return;
    }

    if (picked < today0) {
      alert(String(tUI("invalid_date")));
      return;
    }

    const reservationRanges = parseTimeRanges(venue.reservationHours || venue.hours);

    let time: string | null = null;

    while (!time) {
      const pickedTime = askRequired(
        String(tUI("prompt_time")),
        String(tUI("example_time")),
        reTime,
        String(tUI("invalid_time"))
      );

      if (!pickedTime) return;

      const hasReservationRanges = reservationRanges.length > 0;
      const hasOpenClose = Boolean(venue?.open && venue?.close);

      const ok = hasReservationRanges
        ? isWithinAnyTimeRange(pickedTime, reservationRanges)
        : hasOpenClose
          ? isWithinAnyTimeRange(pickedTime, [
            {
              start: timeToMinutes(venue.open) ?? 0,
              end: timeToMinutes(venue.close) ?? 24 * 60 - 1,
            },
          ])
          : true;

      if (!ok) {
        const hoursLabel =
          venue.reservationHours ||
          venue.hours ||
          (hasOpenClose ? `${venue.open} - ${venue.close}` : "");

        alert(
          `${String(tUI("invalid_reservation_time") || "Избраният час е извън работното време.")}
` +
          `${String(tUI("reservation_outside_hours") || "Работното време е: {hours}").replace(
            "{hours}",
            hoursLabel
          )}`
        );
        continue;
      }

      time = pickedTime;
    }

    let occasion = "";
    const shouldAskOccasion = venue.reservationAskOccasion === true;

    if (shouldAskOccasion) {
      const noOccasion = window.confirm(
        String(
          tUI("confirm_no_occasion") ||
          "Има ли повод?\nOK = Без повод\nCancel = Ще напиша повод"
        )
      );

      if (noOccasion) {
        occasion = String(tUI("no_occasion") || "Без повод");
      } else {
        occasion = (
          window.prompt(
            String(tUI("prompt_occasion") || "Повод (напр. рожден ден):"),
            "Birthday"
          ) || ""
        ).trim();

        if (!occasion) occasion = String(tUI("no_occasion") || "Без повод");
      }
    }

    const opsParts = [
      `${String(tOPS("restaurant_label") || "Outlet")}: ${venueName}`,
      `${String(tOPS("label_people") || "Брой хора")}: ${people}`,
      `${String(tOPS("label_date") || "Дата")}: ${date}`,
      `${String(tOPS("label_time") || "Час")}: ${time}`,
    ];

    const helpParts = [
      `Outlet: ${venueName}`,
      `People: ${people}`,
      `Date: ${date}`,
      `Time: ${time}`,
    ];

    if (shouldAskOccasion && occasion) {
      opsParts.push(`${String(tOPS("label_occasion") || "Повод")}: ${occasion}`);
      helpParts.push(`Occasion: ${occasion}`);
    }

    const opsMsg = opsParts.join("\n");
    const helpMsg = helpParts.join("\n");

    const msg = helperEnabled
      ? `${roomPrefix}${opsMsg}\n\nEN: ${roomPrefix}${helpMsg}`
      : `${roomPrefix}${opsMsg}`;

    const type = String(venue.reservationType || "").trim().toLowerCase();

    if (shouldCreateStaffVenueRequest(venue)) {
      const departmentOverride = getVenueReservationDepartment(venue);
      const requestType: StaffRequestType = departmentOverride === "restaurant"
        ? "restaurant_reservation"
        : "reservation_help";

      void submitGuestRequest({
        type: requestType,
        typeLabel: getVenueReservationTitle(venueName),
        note: helperEnabled ? `${opsMsg}

EN: ${helpMsg}` : opsMsg,
        serviceTime: "today",
        departmentOverride,
      });
      return;
    }

    if (type === "url" && venue.reservationUrl) {
      window.open(String(venue.reservationUrl), "_blank", "noopener,noreferrer");
      return;
    }

    if (type === "phone" && venue.reservationPhone) {
      const phone = String(venue.reservationPhone || "").trim();
      if (!phone) return;
      window.location.href = safeTelLink(phone);
      return;
    }

    if (type === "email" && venue.reservationEmail) {
      const subject = encodeURIComponent(`${config.hotelName} - ${venueName} reservation`);
      const body = encodeURIComponent(msg);
      window.location.href = `mailto:${venue.reservationEmail}?subject=${subject}&body=${body}`;
      return;
    }

    if (type === "whatsapp" && venue.reservationWhatsapp) {
      const wa = String(venue.reservationWhatsapp || "").trim();
      if (!wa) return;
      window.location.href = buildWhatsAppLink(wa, msg);
      return;
    }

    const routed = warnAndRouteIfClosed("restaurant");
    const to =
      routed.dept === "reception"
        ? getDeptWhatsapp("reception")
        : getDeptWhatsapp("restaurant");

    openWhatsApp(to, msg, routed.warned);
  };

  const openVenueReservation = (venue: VenueRow) => {
    if (!ensureConfirmedRoom()) return;

    const type = String(venue.reservationType || "").trim().toLowerCase();

    if (type === "none") return;

    const usesReservationForm =
      type === "whatsapp" ||
      type === "email" ||
      type === "phone" ||
      type === "request" ||
      type === "staff" ||
      shouldCreateStaffVenueRequest(venue);

    if (usesReservationForm) {
      sendVenueReservation(venue);
      return;
    }

    if (type === "url" && venue.reservationUrl) {
      window.open(String(venue.reservationUrl), "_blank", "noopener,noreferrer");
      return;
    }

    sendVenueReservation(venue);
  };

  const hotelInfoItems = useMemo(
    () =>
      ((((config as any).hotelInfoItems ?? []) as Array<any>)
        .filter((item) => item && item.active !== false)
        .sort((a, b) => (Number(a?.sortOrder ?? 999) - Number(b?.sortOrder ?? 999)))),
    [config]
  );

  const getHotelInfoText = useCallback(
    (item: any, field: "title" | "text") => {
      const source = item?.[field] ?? {};

      const preferred = [String(lang || "").trim(), ...fallbackLangs.map((x) => String(x || "").trim())]
        .filter(Boolean);

      for (const key of preferred) {
        const value = source?.[key];
        if (value && String(value).trim()) return String(value).trim();
      }

      return "";
    },
    [fallbackLangs, lang]
  );

  const getHotelInfoIdentity = useCallback(
    (item: any) => {
      return [
        item?.key,
        item?.id,
        item?.category,
        item?.section,
        getHotelInfoText(item, "title"),
      ]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
        .join(" ");
    },
    [getHotelInfoText]
  );

  const isHotelInfoGroup = useCallback(
    (item: any, group: "wifi" | "emergency" | "explore" | "reviews" | "animation" | "world_cup") => {
      const identity = getHotelInfoIdentity(item);

      if (group === "wifi") {
        return /\bwi[-\s]?fi\b|wifi|wlan/.test(identity);
      }

      if (group === "emergency") {
        return /emergency|urgent|спеш|notfall|urgență|nouz/.test(identity);
      }

      if (group === "explore") {
        return /attraction|nearby|restaurant.+near|pharmacy|аптек|забележ|umgebung|atrac|zajímav/.test(identity);
      }

      if (group === "reviews") {
        return /review|google|tripadvisor|отзив|bewertung|recenzie|recenze/.test(identity);
      }

      if (group === "animation") {
        return /animation|анимац|animație|animace|animations/.test(identity);
      }

      if (group === "world_cup") {
        return /world.?cup|fifa|световно|mondial|ms ve fotbale|wm 2026/.test(identity);
      }

      return false;
    },
    [getHotelInfoIdentity]
  );

  const toHotelInfoHubItem = useCallback(
    (item: any): HubItem => ({
      label: `${item?.icon ? `${String(item.icon).trim()} ` : ""}${getHotelInfoText(item, "title")}`.trim(),
      kind: "info" as const,
      info: getHotelInfoText(item, "text"),
    }),
    [getHotelInfoText]
  );

  const toAnimationHubItem = useCallback(
    (item: any): HubItem => {
      const currentLang = (["bg", "de", "en", "ro", "cs"].includes(String(lang || "")) ? lang : "en") as LangKey;
      const defaults: Record<LangKey, { title: string; text: string }> = {
        bg: {
          title: "🎭 Анимация",
          text: "Информация от нашия аниматорски екип.",
        },
        de: {
          title: "Animationsprogramm",
          text: "Informationen von unserem Animationsteam.",
        },
        en: {
          title: "Animation program",
          text: "Information from our animation team.",
        },
        ro: {
          title: "Program de animație",
          text: "Informații de la echipa noastră de animație.",
        },
        cs: {
          title: "Animační program",
          text: "Informace od našeho animačního týmu.",
        },
      };

      const titleMap = item?.title ?? {};
      const textMap = item?.text ?? {};
      const title = String(titleMap?.[currentLang] || "").trim() || defaults[currentLang].title;
      const info = String(textMap?.[currentLang] || "").trim() || defaults[currentLang].text;
      const icon = String(item?.icon || "🎭").trim();

      return {
        label: `${icon ? `${icon} ` : ""}${title}`.trim(),
        kind: "info" as const,
        info,
      };
    },
    [lang]
  );

  const hotelInfoSection = useMemo(() => {
    const infoRequestDefItems = buildRequestDefItems("info");
    const infoItems = hotelInfoItems
      .filter(
        (item) =>
          !isHotelInfoGroup(item, "wifi") &&
          !isHotelInfoGroup(item, "emergency") &&
          !isHotelInfoGroup(item, "explore") &&
          !isHotelInfoGroup(item, "reviews") &&
          !isHotelInfoGroup(item, "animation") &&
          !isHotelInfoGroup(item, "world_cup")
      )
      .map(toHotelInfoHubItem)
      .filter((item) => item.label || (item.kind === "info" && Boolean(item.info)));

    const items = [...infoItems, ...infoRequestDefItems];

    if (!items.length) return null;

    return {
      id: "info",
      title:
        String(tUI("hotel_info_title") || tUI("section_info_title") || "").trim() ||
        (lang === "bg" ? "ℹ️ Инфо" : lang === "de" ? "ℹ️ Info" : lang === "ro" ? "Informații" : lang === "cs" ? "Informace" : "ℹ️ Info"),
      items,
    } satisfies HubSection;
  }, [buildRequestDefItems, hotelInfoItems, isHotelInfoGroup, lang, tUI, toAnimationHubItem]);

  const animationSection = useMemo(() => {
    const hotelAnimationItems = hotelInfoItems
      .filter((item) => isHotelInfoGroup(item, "animation"))
      .map(toAnimationHubItem)
      .filter((item) => item.label || (item.kind === "info" && Boolean(item.info)));

    const requestAnimationItems = buildRequestDefItems("animation");
    const items = [...hotelAnimationItems, ...requestAnimationItems];

    if (!items.length) return null;

    return {
      id: "animation",
      title: String(tUI("section_animation_title") || "").trim() ||
        (lang === "bg" ? "🎭 Анимация" : lang === "de" ? "🎭 Animation" : lang === "ro" ? "🎭 Animație" : lang === "cs" ? "🎭 Animace" : "🎭 Animation"),
      items,
    } satisfies HubSection;
  }, [buildRequestDefItems, hotelInfoItems, isHotelInfoGroup, lang, tUI, toHotelInfoHubItem]);

  const dynamicRequestDefSections = useMemo(() => {
    // Keep the guest hub compact. Only temporary campaign/program sections become top-level.
    // Info/reception/housekeeping/maintenance items are rendered inside their core sections.
    const topLevelCategories = new Set(["world_cup"]);

    return Object.entries(requestDefsByCategory)
      .filter(([category]) => topLevelCategories.has(category))
      .map(([category, defs]) => {
        const visibleDefs = defs.filter((def) => isRenderableRequestDef(def));
        const firstDef = visibleDefs[0] ?? defs[0];
        const sectionTitle =
          getTextMapValue(firstDef?.sectionTitle) ||
          String(tUI(`section_${category}_title`) || "").trim() ||
          humanizeCategory(category);

        return {
          id: category,
          title: sectionTitle,
          items: buildRequestDefItems(category),
        } satisfies HubSection;
      })
      .filter((section) => section.items.length > 0);
  }, [buildRequestDefItems, getTextMapValue, isRenderableRequestDef, requestDefsByCategory, tUI]);

  const housekeepingTitle = tUI("housekeeping_title");
  const housekeepingTitleAfter = tUI("housekeeping_title_after");
  const housekeepingAfterNote = tUI("housekeeping_after_note");

  const brandBackground = String(config.theme?.background || "#202627");
  const brandPrimary = String(config.theme?.primary || "#3C8476");
  const brandAction = String(config.theme?.secondary || config.theme?.accent || "#43B5A1");
  const brandAccent = String(config.theme?.accent || brandAction);
  const brandSurface = String((config.theme as any)?.surface || "#1D2425");
  const brandSoft = String((config.theme as any)?.soft || "#E7F3F0");
  const brandMuted = String((config.theme as any)?.muted || "#707070");
  const brandText = String(config.theme?.text || "#F5F5F5");

  const themeStyle = {
    "--stayhub-bg": brandBackground,
    "--stayhub-primary": brandPrimary,
    "--stayhub-action": brandAction,
    "--stayhub-accent": brandAccent,
    "--stayhub-surface": brandSurface,
    "--stayhub-card": brandSurface,
    "--stayhub-soft": brandSoft,
    "--stayhub-muted": brandMuted,
    "--stayhub-text": brandText,
    "--stayhub-on-primary": brandText,
    "--stayhub-border": "color-mix(in srgb, var(--stayhub-soft) 16%, transparent)",
    backgroundColor: brandBackground,
    color: brandText,
  } as any;

  const wifiSection = (config.wifi?.ssid || config.wifi?.password)
    ? ({
      id: "wifi",
      title: String(tUI("wifi_title") || "WiFi"),
      items: [
        {
          label: String(tUI("wifi_show") || tUI("wifi_title") || "WiFi"),
          kind: "info" as const,
          info: `${tUI("wifi_network")}: ${config.wifi.ssid || "-"}
${tUI("wifi_password")}: ${config.wifi.password || "-"}`,
        },
      ],
    } satisfies HubSection)
    : null;

  const hotelAreaSearchQuery = String(
    [config.hotelName, config.location?.query]
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join(", ") ||
    "Hotel Aquamarine Kranevo, Kranevo, Bulgaria"
  ).replace(/,\s*Bulgaria,\s*Bulgaria$/i, ", Bulgaria");

  const mapsSearchUrl = (query: string) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

  const nearbyAnchorQuery = hotelAreaSearchQuery || "Hotel Aquamarine Kranevo, Kranevo, Bulgaria";
  const nearbyAttractionsQuery =
    `landmarks museums historical sites and tourist attractions within 20 km of ${nearbyAnchorQuery}`;
  const nearbyRestaurantsQuery = `restaurants near ${nearbyAnchorQuery}`;
  const nearbyPharmacyQuery = `pharmacy near ${nearbyAnchorQuery}`;

  const exploreSection = hotelAreaSearchQuery
    ? ({
      id: "explore",
      title: String(tUI("explore_title") || "Explore nearby"),
      items: [
        {
          label: String(tUI("attractions_nearby") || "Attractions nearby"),
          kind: "link" as const,
          href: mapsSearchUrl(nearbyAttractionsQuery),
          newTab: true,
        },
        {
          label: String(tUI("restaurants_nearby") || "Restaurants nearby"),
          kind: "link" as const,
          href: mapsSearchUrl(nearbyRestaurantsQuery),
          newTab: true,
        },
        {
          label: String(tUI("pharmacy") || "Pharmacy"),
          kind: "link" as const,
          href: mapsSearchUrl(nearbyPharmacyQuery),
          newTab: true,
        },
      ],
    } satisfies HubSection)
    : null;

  const reviewIntroLabel = String(
    tUI("reviews_intro") ||
    (lang === "bg"
      ? "Харесва ли Ви престоят? Ще се радваме да споделите Вашето мнение."
      : lang === "de"
        ? "Gefällt Ihnen Ihr Aufenthalt? Wir freuen uns über Ihre Bewertung."
        : lang === "ro"
          ? "Vă place sejurul? Ne-ar bucura să ne lăsați o recenzie."
          : lang === "cs"
            ? "Líbí se Vám pobyt? Budeme rádi za Vaše hodnocení."
            : "Enjoying your stay? We would be grateful for your review.")
  );

  const reviewIntroText = reviewIntroLabel.replace(/\?\s+/, "?\n");

  const reviewsSection = (config.reviews?.google || config.reviews?.tripadvisor || config.reviews?.booking)
    ? ({
      id: "reviews",
      title: withSectionIcon(String(tUI("reviews_title") || "Reviews"), "reviews"),
      items: [
        {
          label: "",
          kind: "info" as const,
          info: reviewIntroText,
        },
        ...(config.reviews?.google
          ? [
            {
              label: String(tUI("leave_google_review") || "Google Review"),
              kind: "link" as const,
              href: config.reviews.google,
              newTab: true,
            },
          ]
          : []),
        ...(config.reviews?.tripadvisor
          ? [
            {
              label: String(tUI("leave_tripadvisor_review") || "TripAdvisor Review"),
              kind: "link" as const,
              href: config.reviews.tripadvisor,
              newTab: true,
            },
          ]
          : []),
        ...(config.reviews?.booking
          ? [
            {
              label: String(tUI("leave_booking_review") || "Booking.com"),
              kind: "link" as const,
              href: config.reviews.booking,
              newTab: true,
            },
          ]
          : []),
      ],
    } satisfies HubSection)
    : null;

  const socialCopy = {
    bg: { title: "Последвайте ни", intro: "Следете ни в социалните мрежи за новини, снимки и специални предложения." },
    en: { title: "Follow us", intro: "Follow us on social media for news, photos and special offers." },
    de: { title: "Folgen Sie uns", intro: "Folgen Sie uns in den sozialen Medien für Neuigkeiten, Fotos und Angebote." },
    ro: { title: "Urmăriți-ne", intro: "Urmăriți-ne pe rețelele sociale pentru noutăți, fotografii și oferte speciale." },
    cs: { title: "Sledujte nás", intro: "Sledujte nás na sociálních sítích pro novinky, fotografie a speciální nabídky." },
  } as const;
  const socialLang = (lang === "bg" || lang === "en" || lang === "de" || lang === "ro" || lang === "cs") ? lang : "en";
  const socialLinks = config.socialLinks ?? {};
  const socialIntro = String(tUI("social_intro") || socialCopy[socialLang].intro);
  const socialSection = (socialLinks.facebook || socialLinks.instagram || socialLinks.tiktok || socialLinks.youtube)
    ? ({
      id: "social",
      title: withSectionIcon(String(tUI("social_title") || socialCopy[socialLang].title), "social"),
      items: [
        {
          label: "",
          kind: "info" as const,
          info: socialIntro,
        },
        ...(socialLinks.facebook ? [{ label: "Facebook", kind: "link" as const, href: socialLinks.facebook, newTab: true }] : []),
        ...(socialLinks.instagram ? [{ label: "Instagram", kind: "link" as const, href: socialLinks.instagram, newTab: true }] : []),
        ...(socialLinks.tiktok ? [{ label: "TikTok", kind: "link" as const, href: socialLinks.tiktok, newTab: true }] : []),
        ...(socialLinks.youtube ? [{ label: "YouTube", kind: "link" as const, href: socialLinks.youtube, newTab: true }] : []),
      ],
    } satisfies HubSection)
    : null;

  const emergencySection = getDeptPhone("reception")
    ? ({
      id: "emergency",
      title: `🚨 ${String(tUI("emergency_title") || "Emergency")}`,
      items: [
        {
          label: String(tUI("emergency_call") || "Call reception"),
          kind: "link" as const,
          href: safeTelLink(getDeptPhone("reception")),
        },
      ],
    } satisfies HubSection)
    : null;

  const sections: HubSection[] = [
    ...(wifiSection ? [wifiSection] : []),
    ...(hotelInfoSection ? [hotelInfoSection] : []),
    {
      id: "reception",
      title: tUI("reception_title") || "Reception",
      items: [
        ...buildRequestDefItems("reception"),
        ...(!requestDefIds.has("luggage_help")
          ? [
            {
              label: formatGuestRequestLabel("luggage_help", String(tUI("luggage_help") || "Luggage assistance")),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "luggage_help",
                  typeLabel: String(tUI("luggage_help") || "Luggage assistance"),
                }),
            },
          ]
          : []),
        ...(!requestDefIds.has("late_checkout")
          ? [
            {
              label: formatGuestRequestLabel("late_checkout", String(tUI("late_checkout") || "Late checkout")),
              kind: "link" as const,
              onClick: () => {
                if (!ensureConfirmedRoom()) return;

                const slot = chooseLateCheckoutSlot();
                if (!slot) return;

                const submitAction = () => {
                  submitGuestRequest({
                    type: "late_checkout",
                    typeLabel: String(tUI("late_checkout") || "Late checkout"),
                    note: `${String(tUI("late_checkout") || "Late checkout")}: ${slot}${lateCheckoutInfo ? `\n${lateCheckoutInfo}` : ""}\n${String(tUI("billing_note") || "Paid service / charge to room")}: 25,00 €`,
                    notifyDepartments: ["reception"],
                    requiresBilling: true,
                    price: "25,00",
                    currency: "€",
                    sourceRequestDef: "late_checkout",
                  });
                };

                if (lateCheckoutInfo) {
                  confirmInfoBlock(lateCheckoutInfo, submitAction);
                  return;
                }

                submitAction();
              },
            },
          ]
          : []),
        ...(!requestDefIds.has("taxi")
          ? [
            {
              label: formatGuestRequestLabel("taxi", String(tUI("taxi") || "Taxi")),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "taxi",
                  typeLabel: "Taxi",
                }),
            },
          ]
          : []),
        ...(!requestDefIds.has("wake_up_call")
          ? [
            {
              label: formatGuestRequestLabel("wake_up_call", String(tUI("wake_up") || "Wake-up call")),
              kind: "link" as const,
              onClick: () => {
                if (!ensureConfirmedRoom()) return;

                const slot = chooseWakeUpSlot();
                if (!slot) return;

                submitGuestRequest({
                  type: "wake_up_call",
                  typeLabel: String(tUI("wake_up") || "Wake-up call"),
                  note: `${String(tUI("wake_up_selected") || "Selected time")}: ${slot}`,
                });
              },
            },
          ]
          : []),
      ],
    },
    {
      id: "housekeeping",
      title: housekeepingRoutedToReception ? housekeepingTitleAfter : housekeepingTitle,
      subtitle: housekeepingRoutedToReception ? housekeepingAfterNote : undefined,
      items: [
        ...buildRequestDefItems("housekeeping"),
        ...(!requestDefIds.has("towels")
          ? [
            {
              label: formatGuestRequestLabel("towels", String(tUI("towels") || "Towels")),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "towels",
                  typeLabel: "Towels",
                }),
            },
          ]
          : []),
        ...(!requestDefIds.has("toilet_paper")
          ? [
            {
              label: formatGuestRequestLabel("toilet_paper", String(tUI("toilet_paper") || "Toilet paper")),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "toilet_paper",
                  typeLabel: "Toilet paper",
                }),
            },
          ]
          : []),
        ...(!requestDefIds.has("extra_pillow")
          ? [
            {
              label: formatGuestRequestLabel("extra_pillow", String(tUI("extra_pillows") || "Extra pillows")),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "extra_pillow",
                  typeLabel: "Extra pillow",
                }),
            },
          ]
          : []),
        ...hkExtras
          .filter((x) => !["towels", "toilet_paper", "extra_pillow"].includes(String(x.key || "").trim().toLowerCase()))
          .filter((x) => !requestDefIds.has(x.key === "blanket" ? "extra_blanket" : x.key === "minibar" ? "minibar_refill" : x.key))
          .map((x) => {
            const action = housekeepingExtraActions[x.key];

            if (action?.mode === "info") {
              return {
                label: formatGuestRequestLabel(x.key, String(tUI(x.labelKey) || x.labelKey)),
                kind: "link" as const,
                onClick: () => {
                  if (!ensureConfirmedRoom()) return;

                  openRequestDialog({
                    title: String(tUI(x.labelKey) || x.labelKey),
                    message: action.getMessage(lang),
                    confirmLabel:
                      lang === "bg" ? "Затвори" : lang === "de" ? "Schließen" : lang === "ro" ? "Închide" : lang === "cs" ? "Zavřít" : "Close",
                  });
                },
              };
            }

            if (action?.mode === "request") {
              return {
                label: formatGuestRequestLabel(action.type, String(tUI(x.labelKey) || action.typeLabel)),
                kind: "link" as const,
                onClick: () => {
                  if (!ensureConfirmedRoom()) return;

                  const paidNotice =
                    x.key === "minibar"
                      ? String(minibarNotice || tUI("minibar_paid_notice") || "Paid service. The amount will be charged to the room account.")
                      : x.key === "laundry"
                        ? String(tUI("laundry_paid_notice") || "Paid service. The amount will be charged to the room account.")
                        : "";

                  const submitAction = () => {
                    submitGuestRequest({
                      type: action.type,
                      typeLabel: String(tUI(x.labelKey) || action.typeLabel),
                      note: paidNotice || action.note,
                      notifyDepartments: ["minibar", "laundry", "coffee_capsules", "pillow_menu"].includes(String(x.key)) ? ["reception"] : undefined,
                      requiresBilling: ["minibar", "laundry", "coffee_capsules", "pillow_menu"].includes(String(x.key)) ? true : undefined,
                    });
                  };

                  if (paidNotice) {
                    confirmInfoBlock(paidNotice, submitAction);
                    return;
                  }

                  submitAction();
                },
              };
            }

            return {
              label: formatGuestRequestLabel(x.key, String(tUI(x.labelKey) || x.labelKey)),
              kind: "link" as const,
              onClick: () => sendHousekeeping(x.messageKey),
            };
          }),
      ],
    },
    {
      id: "maintenance",
      title: tUI("maintenance_title") || "Maintenance",
      items: [
        ...buildRequestDefItems("maintenance"),
        ...(!requestDefIds.has("air_conditioning")
          ? [
            {
              label: formatGuestRequestLabel("air_conditioning", String(tUI("ac_issue") || "Air conditioning issue")),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "air_conditioning",
                  typeLabel: "Air conditioning issue",
                }),
            },
          ]
          : []),
        ...(!requestDefIds.has("no_hot_water")
          ? [
            {
              label: formatGuestRequestLabel("no_hot_water", String(tUI("water_issue") || "No hot water")),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "no_hot_water",
                  typeLabel: "No hot water",
                }),
            },
          ]
          : []),
        ...(!requestDefIds.has("tv_issue")
          ? [
            {
              label: formatGuestRequestLabel("tv_issue", String(tUI("tv_issue") || "TV issue")),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "tv_issue",
                  typeLabel: String(tUI("tv_issue") || "TV issue"),
                }),
            },
          ]
          : []),
        ...(!requestDefIds.has("light_not_working")
          ? [
            {
              label: formatGuestRequestLabel("light_not_working", String(tUI("light_not_working") || tUI("light_issue") || "Light issue")),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "light_not_working",
                  typeLabel: String(tUI("light_not_working") || tUI("light_issue") || "Light issue"),
                }),
            },
          ]
          : []),
        ...(!requestDefIds.has("bathroom_issue")
          ? [
            {
              label: formatGuestRequestLabel("bathroom_issue", String(tUI("bathroom_issue") || "Bathroom issue")),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "bathroom_issue",
                  typeLabel: String(tUI("bathroom_issue") || "Bathroom issue"),
                }),
            },
          ]
          : []),
        ...(!requestDefIds.has("door_lock_issue")
          ? [
            {
              label: formatGuestRequestLabel("door_lock_issue", String(tUI("door_lock_issue") || "Door / lock issue")),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "door_lock_issue",
                  typeLabel: String(tUI("door_lock_issue") || "Door / lock issue"),
                }),
            },
          ]
          : []),
        ...(!requestDefIds.has("wifi_issue")
          ? [
            {
              label: formatGuestRequestLabel("wifi_issue", String(tUI("wifi_issue") || "Wi-Fi issue")),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "wifi_issue",
                  typeLabel: String(tUI("wifi_issue") || "Wi-Fi issue"),
                }),
            },
          ]
          : []),
        ...(!requestDefIds.has("power_outlet_issue")
          ? [
            {
              label: formatGuestRequestLabel("power_outlet_issue", String(tUI("power_outlet_issue") || "Power outlet issue")),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "power_outlet_issue",
                  typeLabel: String(tUI("power_outlet_issue") || "Power outlet issue"),
                }),
            },
          ]
          : []),
        ...(!requestDefIds.has("safe_issue")
          ? [
            {
              label: formatGuestRequestLabel("safe_issue", String(tUI("safe_issue") || "Safe issue")),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "safe_issue",
                  typeLabel: String(tUI("safe_issue") || "Safe issue"),
                }),
            },
          ]
          : []),
        ...(!requestDefIds.has("balcony_door_issue")
          ? [
            {
              label: formatGuestRequestLabel("balcony_door_issue", String(tUI("balcony_door_issue") || "Balcony door issue")),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "balcony_door_issue",
                  typeLabel: String(tUI("balcony_door_issue") || "Balcony door issue"),
                }),
            },
          ]
          : []),
        ...(!requestDefIds.has("minibar_not_cooling")
          ? [
            {
              label: formatGuestRequestLabel("minibar_not_cooling", String(tUI("minibar_not_cooling") || "Minibar not cooling")),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "minibar_not_cooling",
                  typeLabel: String(tUI("minibar_not_cooling") || "Minibar not cooling"),
                }),
            },
          ]
          : []),
        ...(!requestDefIds.has("coffee_machine")
          ? [
            {
              label: formatGuestRequestLabel("coffee_machine", String(tUI("coffee_machine") || "Coffee machine")),
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "other_technical_issue",
                  typeLabel: "Coffee machine issue",
                  note: "Guest reported a coffee machine issue.",
                }),
            },
          ]
          : []),
        ...(!requestDefIds.has("other_technical_issue")
          ? [
            {
              label: formatGuestRequestLabel("other_technical_issue", String(tUI("something_broken") || "Something broken")),
              kind: "link" as const,
              onClick: () => {
                if (!ensureConfirmedRoom()) return;

                const description = askBrokenItemDescription();
                if (!description) return;

                submitGuestRequest({
                  type: "other_technical_issue",
                  typeLabel: String(tUI("something_broken") || "Something broken"),
                  note: description,
                });
              },
            },
          ]
          : []),
      ],
    },
    ...(outletsSection ? [outletsSection] : []),
    ...(animationSection ? [animationSection] : []),
    ...dynamicRequestDefSections,
    ...(exploreSection ? [exploreSection] : []),
    ...(reviewsSection ? [reviewsSection] : []),
    ...(socialSection ? [socialSection] : []),
    {
      id: "ai",
      title: "🤖 " + tUI("ai_title"),
      items: [
        {
          label: tUI("ai_open"),
          kind: "custom",
        } as any,
      ],
    },
    ...(emergencySection ? [emergencySection] : []),
  ].filter((section) => section.id === "outlets" || (section.items && section.items.length > 0));

  return (
    <div className="mx-auto min-h-screen max-w-md" style={themeStyle}>
      <div className="relative">
        <div className="relative h-[220px] sm:h-[260px] md:h-[300px] w-full overflow-hidden bg-neutral-800">
          <img
            src={config.coverImage}
            alt={config.hotelName}
            className="h-full w-full object-cover"
            style={{ objectPosition: config.coverImagePosition || "center center" }}
          />
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-neutral-950/20 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold leading-tight text-white drop-shadow-md">{config.hotelName}</h1>
              <p className="mt-1 text-sm text-neutral-200">{tUI("hero_subtitle")}</p>

              {room ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-full bg-neutral-900/70 px-3 py-1 text-xs font-semibold text-neutral-100 ring-1 ring-neutral-700">
                    {roomCopy.roomBadge.replace("{room}", room)}
                  </div>
                  <button
                    type="button"
                    onClick={startRoomChangeFlow}
                    className="inline-flex rounded-full bg-neutral-900/70 px-3 py-1 text-xs font-semibold text-neutral-100 ring-1 ring-neutral-700 transition hover:bg-neutral-900/90"
                  >
                    {roomCopy.changeRoom}
                  </button>
                </div>
              ) : null}
            </div>

            <select
              value={String(lang)}
              onChange={(e) => setLang(e.target.value as LangKey)}
              className="rounded-xl bg-neutral-900/70 px-3 py-2 text-sm text-neutral-100 outline-none ring-1 ring-neutral-700"
              aria-label="Language"
            >
              {config.languages.map((l) => (
                <option key={String(l)} value={String(l)}>
                  {String(l).toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-3 px-4">
        <InstallAppButton
          lang={lang}
          label={String(tUI("install_app") || "Инсталирай приложението")}
        />
      </div>

      {showGuestIntro ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl stayhub-intro-modal p-5 shadow-2xl">
            <div className="text-xl font-semibold leading-tight stayhub-intro-title">
              {guestIntroCopy.title}
            </div>

            <p className="mt-3 whitespace-pre-line text-sm leading-6 stayhub-intro-body">
              {guestIntroCopy.body}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {guestLanguageOptions.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  className={clsx(
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition stayhub-language-pill",
                    lang === code ? "stayhub-language-pill-active" : ""
                  )}
                >
                  {String(code).toUpperCase()}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={closeGuestIntro}
              className="mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold transition hover:opacity-95 active:scale-[0.99]"
              style={{ backgroundColor: "var(--stayhub-action)", color: "var(--stayhub-text)" }}
            >
              {guestIntroCopy.button}
            </button>
          </div>
        </div>
      ) : null}

      {/* room switch banner removed - handled only by modal */}

      {!roomConfirmed ? (
        <div className="mt-3 px-4">
          <div className="rounded-2xl stayhub-panel stayhub-room-panel p-4">
            <h2 className="text-base font-semibold" style={{ color: "#202627" }}>{roomCopy.cardTitle}</h2>
            <p className="mt-2 text-sm leading-6" style={{ color: "#202627" }}>{roomCopy.cardText}</p>

            <div className="mt-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "#202627" }}>
                {roomCopy.inputLabel}
              </label>
              <input
                value={manualRoomInput}
                onChange={(e) => {
                  setManualRoomInput(e.target.value);
                  setRoomConfirmed(false);
                  setRoom("");
                  setIgnoredQrRoom(null);
                  setRoomModal(null);
                }}
                placeholder={roomCopy.inputPlaceholder}
                inputMode="numeric"
                autoComplete="off"
                className="w-full rounded-xl stayhub-card px-4 py-3 text-sm outline-none placeholder:text-[color:var(--stayhub-muted)]"
              />
            </div>

            <button
              type="button"
              onClick={confirmManualRoom}
              className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-semibold transition hover:opacity-95 active:scale-[0.99]"
              style={{ backgroundColor: "var(--stayhub-action)", color: "var(--stayhub-text)" }}
            >
              {roomCopy.confirmButton}
            </button>

            {geoMessage ? (
              <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-3 text-sm text-amber-100">
                {geoMessage}
              </div>
            ) : null}

            <div className="mt-3 rounded-xl stayhub-card px-3 py-3 text-sm text-[color:var(--stayhub-soft)]">
              {roomCopy.lockedNotice}
            </div>
          </div>
        </div>
      ) : null}

      {submittingRequest || showRequestSuccess ? (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 w-[min(92vw,560px)] -translate-x-1/2 px-4">
          {submittingRequest ? (
            <div className="rounded-2xl border border-sky-400/25 bg-sky-400/10 px-4 py-4 text-sky-50 shadow-2xl backdrop-blur">
              <div className="text-sm font-semibold">{roomCopy.requestSendingTitle}</div>
              <p className="mt-1 text-sm leading-6 text-sky-100/90">
                {roomCopy.requestSendingText.replace("{typeLabel}", submittingRequestLabel || "...")}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-4 text-emerald-50 shadow-2xl backdrop-blur">
              <div className="text-sm font-semibold">{roomCopy.requestAcceptedTitle}</div>
              <p className="mt-1 text-sm leading-6 text-emerald-100/90">
                {roomCopy.requestAcceptedText}
              </p>
            </div>
          )}
        </div>
      ) : null}

      {roomModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-950 p-5 shadow-2xl">
            <div className="text-lg font-semibold text-white">
              {isRoomSwitchConfirmation
                ? lang === "bg"
                  ? "Смяна на стая"
                  : lang === "de"
                    ? "Zimmer wechseln"
                    : "Switch room"
                : lang === "bg"
                  ? "Потвърждение на стая"
                  : lang === "de"
                    ? "Zimmer bestätigen"
                    : "Confirm room"}
            </div>

            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-neutral-200">
              {isRoomSwitchConfirmation && roomModal.currentRoom
                ? lang === "bg"
                  ? `В момента устройството е активно за стая ${roomModal.currentRoom}. Сменяйте стаята само ако наистина сте преместени в друга стая. Сигурни ли сте, че искате да преминете към стая ${roomModal.nextRoom}?`
                  : lang === "de"
                    ? `Dieses Gerät ist aktuell für Zimmer ${roomModal.currentRoom} aktiv. Wechseln Sie das Zimmer nur, wenn Sie tatsächlich in ein anderes Zimmer umgezogen sind. Sind Sie sicher, dass Sie zu Zimmer ${roomModal.nextRoom} wechseln möchten?`
                    : `This device is currently active for room ${roomModal.currentRoom}. Change the room only if you have actually been moved to another room. Are you sure you want to switch to room ${roomModal.nextRoom}?`
                : roomCopy.confirmMessage.replace("{room}", roomModal.nextRoom)}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={cancelRoomConfirmation}
                className="rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-sm font-semibold text-white"
              >
                {lang === "bg" ? "Отказ" : lang === "de" ? "Abbrechen" : "Cancel"}
              </button>

              <button
                type="button"
                onClick={acceptRoomConfirmation}
                className="rounded-xl px-4 py-3 text-sm font-semibold"
                style={{ backgroundColor: "var(--stayhub-action)", color: "var(--stayhub-text)" }}
              >
                {isRoomSwitchConfirmation
                  ? lang === "bg"
                    ? "Смени стаята"
                    : lang === "de"
                      ? "Zimmer wechseln"
                      : "Switch room"
                  : lang === "bg"
                    ? "Потвърди"
                    : lang === "de"
                      ? "Bestätigen"
                      : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {requestDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-950 p-5 shadow-2xl">
            <div className="text-lg font-semibold text-white">
              {requestDialog.title}
            </div>

            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-neutral-200">
              {requestDialog.message}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {requestDialog.cancelLabel ? (
                <button
                  type="button"
                  onClick={closeRequestDialog}
                  className="rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-sm font-semibold text-white"
                >
                  {requestDialog.cancelLabel}
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={requestDialog.onConfirm ? confirmRequestDialog : closeRequestDialog}
                className="rounded-xl px-4 py-3 text-sm font-semibold"
                style={{ backgroundColor: "var(--stayhub-action)", color: "var(--stayhub-text)" }}
              >
                {requestDialog.confirmLabel ||
                  (lang === "bg" ? "Добре" : lang === "de" ? "OK" : "OK")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {roomConfirmed && activeGuestRequests.length > 0 ? (
        <div className="mt-3 px-4">
          <div className="rounded-2xl stayhub-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-white">{roomCopy.myRequestsTitle}</h2>
              <button
                type="button"
                onClick={() => void loadGuestRequests()}
                disabled={guestRequestsLoading}
                className="stayhub-refresh-button rounded-xl px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {guestRequestsLoading ? roomCopy.myRequestsLoading : roomCopy.refreshRequests}
              </button>
            </div>

            {activeGuestRequests.length > 0 ? (
              <div className="mt-3 space-y-2">
                {activeGuestRequests.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl stayhub-card px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-white">
                          <span className="text-base leading-none">{getGuestRequestIcon(item.rawType || item.type)}</span>
                          <span>{getGuestVisibleRequestTitle(item)}</span>
                        </div>
                        <div className="mt-1 text-xs text-neutral-400">
                          {roomCopy.roomBadge.replace("{room}", item.room)} • {item.createdAt}
                        </div>
                      </div>

                      <StatusBadge label={guestStatusLabel(item.status)} status={item.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="p-4 pb-10">
        <div className="space-y-3">
          {sections.map((sec) => {
            const isLocked = !roomConfirmed && roomRequiredSectionIds.has(sec.id);

            if (isLocked) {
              return (
                <LockedSectionCard
                  key={sec.id}
                  title={String(sec.title)}
                  message={roomCopy.lockedSectionMessage}
                />
              );
            }

            return sec.id === "outlets" ? (
              <OutletsAccordion
                key={sec.id}
                section={sec}
                groups={groupedOutlets}
                tUI={tUI}
                lang={lang}
                onReserve={openVenueReservation}
                spaRequestItems={spaRequestDefItems}
                submittingRequest={submittingRequest}
                handleRequestDefClick={handleRequestDefClick}
                getRequestDefTitle={getRequestDefTitle}
                getRequestDefMessage={getRequestDefMessage}
                getRequestDefOptions={getRequestDefOptions}
                getRequestDefOptionImages={getRequestDefOptionImages}
                getRequestDefOptionInfo={getRequestDefOptionInfo}
                getRequestDefPriceHint={getRequestDefPriceHint}
                getQuantityChoices={getQuantityChoices}
                getQuantityButtonLabel={getQuantityButtonLabel}
                submitRequestDefQuantityChoice={submitRequestDefQuantityChoice}
                submitRequestDefSelectionOption={submitRequestDefSelectionOption}
              />
            ) : (
              <Accordion
                key={sec.id}
                section={sec}
                tUI={tUI}
                aiQ={aiQ}
                setAiQ={setAiQ}
                aiA={aiAnswer}
                aiLoading={aiLoading}
                askAI={askAI}
                aiIntroText={aiIntroText}
                submittingRequest={submittingRequest}
                lang={lang}
                handleRequestDefClick={handleRequestDefClick}
                getRequestDefTitle={getRequestDefTitle}
                getRequestDefMessage={getRequestDefMessage}
                getRequestDefOptions={getRequestDefOptions}
                getRequestDefOptionImages={getRequestDefOptionImages}
                getRequestDefOptionInfo={getRequestDefOptionInfo}
                getRequestDefPriceHint={getRequestDefPriceHint}
                getQuantityChoices={getQuantityChoices}
                getQuantityButtonLabel={getQuantityButtonLabel}
                submitRequestDefQuantityChoice={submitRequestDefQuantityChoice}
                submitRequestDefSelectionOption={submitRequestDefSelectionOption}
                onCloseAi={clearAiState}
              />
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs text-neutral-400">{tUI("notice")}</p>
      </div>
    </div>
  );
}

function Accordion({
  section,
  tUI,
  aiQ,
  setAiQ,
  aiA,
  aiLoading,
  askAI,
  aiIntroText,
  submittingRequest,
  lang,
  handleRequestDefClick,
  getRequestDefTitle,
  getRequestDefMessage,
  getRequestDefOptions,
  getRequestDefOptionImages,
  getRequestDefOptionInfo,
  getRequestDefPriceHint,
  getQuantityChoices,
  getQuantityButtonLabel,
  submitRequestDefQuantityChoice,
  submitRequestDefSelectionOption,
  onCloseAi,
}: {
  section: HubSection;
  tUI: (k: string) => any;
  aiQ: string;
  setAiQ: (v: string) => void;
  aiA: string;
  aiLoading: boolean;
  askAI: () => void;
  aiIntroText: string;
  submittingRequest: boolean;
  lang: LangKey;
  handleRequestDefClick: (def: RequestDef) => void;
  getRequestDefTitle: (def?: RequestDef | null) => string;
  getRequestDefMessage: (def?: RequestDef | null) => string;
  getRequestDefOptions: (def?: RequestDef | null, preferredLang?: LangKey) => string[];
  getRequestDefOptionImages: (def?: RequestDef | null) => string[];
  getRequestDefOptionInfo: (def?: RequestDef | null) => string[];
  getRequestDefPriceHint: (def: RequestDef) => string;
  getQuantityChoices: (def: RequestDef) => number[];
  getQuantityButtonLabel: (def: RequestDef, qty: number) => string;
  submitRequestDefQuantityChoice: (def: RequestDef, qty: number) => void;
  submitRequestDefSelectionOption: (def: RequestDef, option: string, optionIndex: number) => void;
  onCloseAi?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [openRequestDefId, setOpenRequestDefId] = useState<string | null>(null);

  return (
    <div className="rounded-2xl overflow-hidden stayhub-section-shell">
      <button
        type="button"
        onClick={() =>
          setOpen((prev) => {
            const next = !prev;

            if (section.id === "ai" && !next) {
              onCloseAi?.();
            }

            return next;
          })
        }
        className="w-full px-4 py-4 text-left stayhub-section-header flex items-center justify-between gap-3"
      >
        <div>
          <div className="text-base font-semibold">{withSectionIcon(section.title, (section as any).id || (section as any).key || (section as any).type || (section as any).section)}</div>
          {section.subtitle ? (
            <div className="mt-1 text-xs font-medium opacity-80">
              {section.subtitle}
            </div>
          ) : null}
        </div>
        <div className="text-lg">▾</div>
      </button>

      {open ? (
        <div className="stayhub-section-body px-4 py-4">
          <div className="grid grid-cols-1 gap-2">
            {section.id === "ai" ? (
              <div className="grid grid-cols-1 gap-2">
                {!aiQ.trim() ? (
                  <div className="rounded-xl stayhub-card p-3 text-sm leading-6">
                    {aiIntroText}
                  </div>
                ) : null}

                <textarea
                  value={aiQ}
                  onChange={(e) => setAiQ(e.target.value)}
                  placeholder={String(
                    tUI("ai_placeholder") || "Попитай нещо за хотела..."
                  )}
                  className="min-h-[90px] w-full rounded-xl stayhub-card p-3 text-sm outline-none placeholder:text-[color:var(--stayhub-muted)]"
                />

                <button
                  type="button"
                  onClick={askAI}
                  disabled={aiLoading || !aiQ.trim()}
                  className={clsx(
                    "rounded-xl px-3 py-3 text-left text-sm font-semibold",
                    "stayhub-action-card",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "active:scale-[0.99] transition"
                  )}
                >
                  {aiLoading
                    ? String(tUI("ai_loading") || "Мисля...")
                    : String(tUI("ai_send") || "Изпрати")}
                </button>

                {aiA ? (
                  <div className="whitespace-pre-wrap rounded-xl stayhub-card p-3 text-sm">
                    {aiA}
                  </div>
                ) : null}
              </div>
            ) : section.items.length ? (
              section.items.map((it, idx) => {
                if (it.kind === "info") {
                  return (
                    <div
                      key={idx}
                      className="rounded-xl stayhub-card p-3 text-sm"
                    >
                      {it.label ? (
                        <div className="font-semibold text-white">{it.label}</div>
                      ) : null}
                      <div className={clsx("whitespace-pre-wrap", it.label ? "mt-1 text-neutral-300" : "text-neutral-100")}>
                        {it.info}
                      </div>
                    </div>
                  );
                }

                const requestDefItem = it as any;
                if (requestDefItem.kind === "request_def" && requestDefItem.requestDef) {
                  const def = requestDefItem.requestDef as RequestDef;
                  const title = getRequestDefTitle(def) || String(requestDefItem.label || def.id.replace(/_/g, " "));
                  const icon = getRequestDefButtonIcon(def);
                  const message = getRequestDefMessage(def);
                  const priceHint = getRequestDefPriceHint(def);
                  const localizedOptions = getRequestDefOptions(def);
                  const optionImages = getRequestDefOptionImages(def);
                  const optionInfos = getRequestDefOptionInfo(def);
                  const isQuantity = def.requestKind === "quantity" || def.requiresQuantity;
                  const quickKey = `${String(def.id || def.requestType || "request")}-${idx}`;
                  const isQuickOpen = openRequestDefId === quickKey;

                  return (
                    <div key={quickKey} className="rounded-xl stayhub-card overflow-hidden text-sm">
                      <button
                        type="button"
                        onClick={() => setOpenRequestDefId(isQuickOpen ? null : quickKey)}
                        className="w-full px-3 py-3 text-left flex items-center justify-between gap-3"
                      >
                        <span className="font-semibold text-white">
                          {icon ? `${icon} ` : ""}{title}
                        </span>
                        <span className="text-white/80">▾</span>
                      </button>

                      {isQuickOpen ? (
                        <div className="px-3 pb-3">
                          {message ? (
                            <div className="whitespace-pre-wrap text-[color:var(--stayhub-text)]/90">
                              {message}
                            </div>
                          ) : null}

                          {priceHint ? (
                            <div className="mt-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ backgroundColor: "var(--stayhub-action)", color: "var(--stayhub-text)" }}>
                              {lang === "bg" ? "Цена" : lang === "de" ? "Preis" : lang === "ro" ? "Preț" : lang === "cs" ? "Cena" : "Price"}: {priceHint}
                            </div>
                          ) : null}

                          {isQuantity ? (
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              {getQuantityChoices(def).map((qty) => (
                                <button
                                  key={qty}
                                  type="button"
                                  disabled={submittingRequest}
                                  onClick={() => submitRequestDefQuantityChoice(def, qty)}
                                  className="rounded-xl px-3 py-2 text-left text-xs font-semibold stayhub-action-card active:scale-[0.99] transition disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {getQuantityButtonLabel(def, qty)}
                                </button>
                              ))}
                            </div>
                          ) : localizedOptions.length ? (
                            optionImages.length ? (
                              <div className="mt-3 grid grid-cols-1 gap-3">
                                {localizedOptions.map((option, optionIndex) => {
                                  const imageUrl = optionImages[optionIndex] || "";
                                  const optionInfo = optionInfos[optionIndex] || "";

                                  return (
                                    <button
                                      key={`${def.id}-${optionIndex}`}
                                      type="button"
                                      disabled={submittingRequest}
                                      onClick={() => submitRequestDefSelectionOption(def, option, optionIndex)}
                                      className="w-full overflow-hidden rounded-2xl p-3 text-left text-xs font-semibold stayhub-action-card active:scale-[0.99] transition disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {imageUrl ? (
                                        <img
                                          src={imageUrl}
                                          alt={option}
                                          loading="lazy"
                                          className="mb-3 h-32 w-full rounded-xl bg-white/90 object-contain p-2"
                                        />
                                      ) : null}
                                      <div className="text-sm font-semibold">{option}</div>
                                      {optionInfo ? (
                                        <div className="mt-2 whitespace-pre-wrap text-[12px] font-medium leading-5 opacity-85">
                                          {optionInfo}
                                        </div>
                                      ) : null}
                                      <div className="mt-1 text-[11px] font-bold uppercase tracking-wide opacity-80">
                                        {getRequestActionLabel(lang)}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="mt-3 space-y-2">
                                {localizedOptions.map((option, optionIndex) => (
                                  <button
                                    key={`${def.id}-${optionIndex}`}
                                    type="button"
                                    disabled={submittingRequest}
                                    onClick={() => submitRequestDefSelectionOption(def, option, optionIndex)}
                                    className="w-full rounded-xl px-3 py-2 text-left text-xs font-semibold stayhub-action-card active:scale-[0.99] transition disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {option}
                                  </button>
                                ))}
                              </div>
                            )
                          ) : (
                            <button
                              type="button"
                              disabled={submittingRequest}
                              onClick={() => handleRequestDefClick(def)}
                              className="mt-3 w-full rounded-xl px-3 py-2 text-left text-xs font-semibold stayhub-action-card active:scale-[0.99] transition disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {lang === "bg" ? "Изпрати заявка" : lang === "de" ? "Anfrage senden" : lang === "ro" ? "Trimite solicitarea" : lang === "cs" ? "Odeslat požadavek" : "Send request"}
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                if (it.kind === "link" && it.onClick) {
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={it.onClick}
                      disabled={submittingRequest}
                      className={clsx(
                        "rounded-xl px-3 py-3 text-left text-sm font-semibold ring-1 transition",
                        submittingRequest
                          ? "cursor-not-allowed stayhub-action-card opacity-70"
                          : "stayhub-action-card active:scale-[0.99]"
                      )}
                    >
                      {it.label}
                    </button>
                  );
                }

                if (it.kind === "link" && it.href) {
                  return (
                    <a
                      key={idx}
                      href={it.href}
                      target={it.newTab || it.href.startsWith("http") ? "_blank" : undefined}
                      rel="noreferrer"
                      className="rounded-xl px-3 py-3 text-sm font-semibold stayhub-action-card active:scale-[0.99] transition"
                    >
                      {it.label}
                    </a>
                  );
                }

                return (
                  <div
                    key={idx}
                    className="rounded-xl stayhub-card p-3 text-sm text-[color:var(--stayhub-muted)]"
                  >
                    {it.label}
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-neutral-300">(Няма опции)</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({
  label,
  status,
}: {
  label: string;
  status: StaffRequestStatus;
}) {
  const classes: Record<StaffRequestStatus, string> = {
    new: "border-amber-400/30 bg-amber-400/15 text-amber-200",
    in_progress: "border-sky-400/30 bg-sky-400/15 text-sky-200",
    completed: "border-emerald-400/30 bg-emerald-400/15 text-emerald-200",
    returned: "border-rose-400/30 bg-rose-400/15 text-rose-200",
  };

  return (
    <div
      className={clsx(
        "rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap",
        classes[status]
      )}
    >
      {label}
    </div>
  );
}

function LockedSectionCard({
  title,
}: {
  title: string;
  message?: string;
}) {
  return (
    <div
      className="rounded-2xl border px-4 py-4 shadow-sm"
      style={{
        backgroundColor: "#F5F5F5",
        borderColor: "#202627",
        color: "#202627",
      }}
      aria-disabled="true"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-base font-semibold" style={{ color: "#202627" }}>
          {title}
        </div>
        <div
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm"
          style={{ borderColor: "#202627", color: "#202627" }}
          aria-label="Locked"
          title="Locked"
        >
          🔒
        </div>
      </div>
    </div>
  );
}

function OutletsAccordion({
  section,
  groups,
  tUI,
  lang,
  onReserve,
  spaRequestItems,
  submittingRequest,
  handleRequestDefClick,
  getRequestDefTitle,
  getRequestDefMessage,
  getRequestDefOptions,
  getRequestDefOptionImages,
  getRequestDefOptionInfo,
  getRequestDefPriceHint,
  getQuantityChoices,
  getQuantityButtonLabel,
  submitRequestDefQuantityChoice,
  submitRequestDefSelectionOption,
}: {
  section: HubSection;
  lang: LangKey;
  groups: Array<{
    category: string;
    meta: { title: string; icon: string };
    venues: VenueRow[];
  }>;
  tUI: (k: string) => any;
  onReserve: (venue: VenueRow) => void;
  spaRequestItems: HubItem[];
  submittingRequest: boolean;
  handleRequestDefClick: (def: RequestDef) => void;
  getRequestDefTitle: (def?: RequestDef | null) => string;
  getRequestDefMessage: (def?: RequestDef | null) => string;
  getRequestDefOptions: (def?: RequestDef | null, preferredLang?: LangKey) => string[];
  getRequestDefOptionImages: (def?: RequestDef | null) => string[];
  getRequestDefOptionInfo: (def?: RequestDef | null) => string[];
  getRequestDefPriceHint: (def: RequestDef) => string;
  getQuantityChoices: (def: RequestDef) => number[];
  getQuantityButtonLabel: (def: RequestDef, qty: number) => string;
  submitRequestDefQuantityChoice: (def: RequestDef, qty: number) => void;
  submitRequestDefSelectionOption: (def: RequestDef, option: string, optionIndex: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [openVenue, setOpenVenue] = useState<string | null>(null);
  const [openSpaRequestDefId, setOpenSpaRequestDefId] = useState<string | null>(null);
  const pathname = usePathname();

  const guestUiStateKey = useMemo(
    () => `guesthub-ui:${pathname}`,
    [pathname]
  );

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(guestUiStateKey);
      if (!raw) return;

      const saved = JSON.parse(raw);

      if (typeof saved.open === "boolean") setOpen(saved.open);
      if (typeof saved.openCategory === "string" || saved.openCategory === null) {
        setOpenCategory(saved.openCategory);
      }
      if (typeof saved.openVenue === "string" || saved.openVenue === null) {
        setOpenVenue(saved.openVenue);
      }
    } catch { }
  }, [guestUiStateKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        guestUiStateKey,
        JSON.stringify({
          open,
          openCategory,
          openVenue,
        })
      );
    } catch { }
  }, [guestUiStateKey, open, openCategory, openVenue]);

  const renderSpaRequestDefItem = (item: HubItem, index: number) => {
    const requestDefItem = item as any;
    if (requestDefItem.kind !== "request_def" || !requestDefItem.requestDef) return null;

    const def = requestDefItem.requestDef as RequestDef;
    const title = getRequestDefTitle(def) || String(requestDefItem.label || def.id.replace(/_/g, " "));
    const icon = getRequestDefButtonIcon(def);
    const message = getRequestDefMessage(def);
    const priceHint = getRequestDefPriceHint(def);
    const localizedOptions = getRequestDefOptions(def);
    const optionImages = getRequestDefOptionImages(def);
    const optionInfos = getRequestDefOptionInfo(def);
    const isQuantity = def.requestKind === "quantity" || def.requiresQuantity;
    const quickKey = `spa-${String(def.id || def.requestType || "request")}-${index}`;
    const isQuickOpen = openSpaRequestDefId === quickKey;

    return (
      <div key={quickKey} className="rounded-xl stayhub-card overflow-hidden text-sm">
        <button
          type="button"
          onClick={() => setOpenSpaRequestDefId(isQuickOpen ? null : quickKey)}
          className="w-full px-3 py-3 text-left flex items-center justify-between gap-3"
        >
          <span className="font-semibold text-white">{icon ? `${icon} ` : ""}{title}</span>
          <span className="text-white/80">▾</span>
        </button>

        {isQuickOpen ? (
          <div className="px-3 pb-3">
            {message ? (
              <div className="whitespace-pre-wrap text-[color:var(--stayhub-text)]/90">
                {message}
              </div>
            ) : null}

            {priceHint ? (
              <div className="mt-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ backgroundColor: "var(--stayhub-action)", color: "var(--stayhub-text)" }}>
                {lang === "bg" ? "Цена" : lang === "de" ? "Preis" : lang === "ro" ? "Preț" : lang === "cs" ? "Cena" : "Price"}: {priceHint}
              </div>
            ) : null}

            {isQuantity ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {getQuantityChoices(def).map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    disabled={submittingRequest}
                    onClick={() => submitRequestDefQuantityChoice(def, qty)}
                    className="rounded-xl px-3 py-2 text-left text-xs font-semibold stayhub-action-card active:scale-[0.99] transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {getQuantityButtonLabel(def, qty)}
                  </button>
                ))}
              </div>
            ) : localizedOptions.length ? (
              optionImages.length ? (
                <div className="mt-3 grid grid-cols-1 gap-3">
                  {localizedOptions.map((option, optionIndex) => {
                    const imageUrl = optionImages[optionIndex] || "";
                    const optionInfo = optionInfos[optionIndex] || "";

                    return (
                      <button
                        key={`${def.id}-${optionIndex}`}
                        type="button"
                        disabled={submittingRequest}
                        onClick={() => submitRequestDefSelectionOption(def, option, optionIndex)}
                        className="w-full overflow-hidden rounded-2xl p-3 text-left text-xs font-semibold stayhub-action-card active:scale-[0.99] transition disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={option}
                            loading="lazy"
                            className="mb-3 h-32 w-full rounded-xl bg-white/90 object-contain p-2"
                          />
                        ) : null}
                        <div className="text-sm font-semibold">{option}</div>
                        {optionInfo ? (
                          <div className="mt-2 whitespace-pre-wrap text-[12px] font-medium leading-5 opacity-85">
                            {optionInfo}
                          </div>
                        ) : null}
                        <div className="mt-1 text-[11px] font-bold uppercase tracking-wide opacity-80">
                          {getRequestActionLabel(lang)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {localizedOptions.map((option, optionIndex) => (
                    <button
                      key={`${def.id}-${optionIndex}`}
                      type="button"
                      disabled={submittingRequest}
                      onClick={() => submitRequestDefSelectionOption(def, option, optionIndex)}
                      className="w-full rounded-xl px-3 py-2 text-left text-xs font-semibold stayhub-action-card active:scale-[0.99] transition disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )
            ) : (
              <button
                type="button"
                disabled={submittingRequest}
                onClick={() => handleRequestDefClick(def)}
                className="mt-3 w-full rounded-xl px-3 py-2 text-left text-xs font-semibold stayhub-action-card active:scale-[0.99] transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {lang === "bg" ? "Изпрати заявка" : lang === "de" ? "Anfrage senden" : lang === "ro" ? "Trimite solicitarea" : lang === "cs" ? "Odeslat požadavek" : "Send request"}
              </button>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const renderVenueDetails = (venue: VenueRow) => {
    const hoursText =
      String(venue.hoursByLang?.[String(lang)] || "").trim() ||
      venue.hours ||
      (venue.open || venue.close ? `${venue.open || "?"} - ${venue.close || "?"}` : "");
    const description = getVenueText(venue, "description", lang);
    const cuisine = getVenueText(venue, "cuisine", lang);
    const location = getVenueText(venue, "location", lang);
    const ageGroup = getVenueText(venue, "ageGroup", lang);
    const programText = getVenueText(venue, "programText", lang);
    const reservationLabel = getVenueText(venue, "reservationLabel", lang) || String(tUI("reserve_now") || "Reserve");

    return (
      <div className="space-y-2">
        {description ? (
          <div className="rounded-xl stayhub-card p-3 text-sm">
            {description}
          </div>
        ) : null}

        {cuisine ? (
          <div className="rounded-xl stayhub-card p-3 text-sm">
            <span className="font-semibold">{String(tUI("cuisine") || "Cuisine")}:</span>{" "}
            {cuisine}
          </div>
        ) : null}

        {hoursText ? (
          <div className="rounded-xl stayhub-card p-3 text-sm">
            <div className="font-semibold">{String(tUI("hours") || "Hours")}:</div>
            <div className="mt-1 whitespace-pre-line">
              {hoursText}
            </div>
          </div>
        ) : null}

        {location ? (
          <div className="rounded-xl stayhub-card p-3 text-sm">
            <span className="font-semibold">{String(tUI("location") || "Location")}:</span>{" "}
            {location}
          </div>
        ) : null}

        {ageGroup ? (
          <div className="rounded-xl stayhub-card p-3 text-sm">
            <span className="font-semibold">{String(tUI("age_group") || "Age group")}:</span>{" "}
            {ageGroup}
          </div>
        ) : null}

        {programText ? (
          <div className="rounded-xl stayhub-card p-3 text-sm">
            <span className="font-semibold">{String(tUI("program") || "Program")}:</span>{" "}
            {programText}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2 pt-1">
          {venue.menuUrl ? (
            <a
              href={venue.menuUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl px-3 py-3 text-sm font-semibold stayhub-action-card transition"
            >
              {String(tUI("view_menu_pdf") || "View menu")}
            </a>
          ) : null}

          {venue.programUrl ? (
            <a
              href={venue.programUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl px-3 py-3 text-sm font-semibold stayhub-action-card transition"
            >
              {String(tUI("view_program") || "View program")}
            </a>
          ) : null}

          {normalizeCategory(venue) !== "spa" &&
            String(venue.reservationType || "").toLowerCase() !== "none" &&
            (venue.reservationType ||
              venue.reservationUrl ||
              venue.reservationPhone ||
              venue.reservationWhatsapp ||
              venue.reservationEmail ||
              venue.requiresReservation) ? (
            <button
              type="button"
              onClick={() => onReserve(venue)}
              className="rounded-xl px-3 py-3 text-left text-sm font-semibold stayhub-action-card active:scale-[0.99] transition"
            >
              {reservationLabel}
            </button>
          ) : null}
        </div>

        {normalizeCategory(venue) === "spa" && spaRequestItems.length ? (
          <div className="space-y-2 pt-1">
            {spaRequestItems.map((item, index) => renderSpaRequestDefItem(item, index))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="rounded-2xl overflow-hidden stayhub-section-shell">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-4 text-left stayhub-section-header flex items-center justify-between gap-3"
      >
        <div className="text-base font-semibold">{withSectionIcon(section.title, (section as any).id || (section as any).key || (section as any).type || (section as any).section)}</div>
        <div className="text-lg">▾</div>
      </button>

      {open ? (
        <div className="stayhub-section-body px-4 py-4">
          <div className="space-y-3">
            {groups.map((group) => {
              if (!group.venues.length) return null;

              const catKey = group.category;
              const catOpen = openCategory === catKey;
              const singleVenue = group.venues.length === 1 ? group.venues[0] : null;
              const groupIcon = singleVenue?.icon || group.meta.icon;
              const groupTitle = singleVenue ? getVenueText(singleVenue, "name", lang) : getCategoryDisplayTitle(catKey, tUI);
              const groupSubtitle = singleVenue ? getVenueText(singleVenue, "shortDescription", lang) : "";

              return (
                <div
                  key={catKey}
                  className="rounded-2xl stayhub-panel overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpenCategory(catOpen ? null : catKey);
                      setOpenVenue(null);
                    }}
                    className="w-full px-3 py-3 text-left flex items-center justify-between gap-3 stayhub-card-header"
                  >
                    <div>
                      <div className="font-semibold text-white">
                        {groupIcon} {groupTitle}
                      </div>
                      {groupSubtitle ? (
                        <div className="mt-1 text-xs text-neutral-300">{groupSubtitle}</div>
                      ) : null}
                    </div>
                    <div className="text-neutral-300">▾</div>
                  </button>

                  {catOpen ? (
                    singleVenue ? (
                      <div className="p-3">{renderVenueDetails(singleVenue)}</div>
                    ) : (
                      <div className="space-y-2 p-3">
                        {group.venues.map((venue, idx) => {
                          const venueKey = `${catKey}-${venue.name || getVenueText(venue, "name", lang)}-${idx}`;
                          const venueOpen = openVenue === venueKey;
                          const venueName = getVenueText(venue, "name", lang) || venue.name;
                          const venueTitle = venue.icon ? `${venue.icon} ${venueName}` : venueName;
                          const venueSubtitle = getVenueText(venue, "shortDescription", lang);

                          return (
                            <div
                              key={venueKey}
                              className="rounded-xl overflow-hidden stayhub-card"
                            >
                              <button
                                type="button"
                                onClick={() => setOpenVenue(venueOpen ? null : venueKey)}
                                className="w-full px-3 py-3 text-left flex items-center justify-between gap-3"
                              >
                                <div>
                                  <div className="font-semibold text-white">{venueTitle}</div>
                                  {venueSubtitle ? (
                                    <div className="mt-1 text-xs text-neutral-300">
                                      {venueSubtitle}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="text-neutral-300">▾</div>
                              </button>

                              {venueOpen ? (
                                <div className="px-3 pb-3">{renderVenueDetails(venue)}</div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
