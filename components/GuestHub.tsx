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
  weather: "🌤️",
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

const LINK_ICON_PREFIXES: Record<string, string> = {
  google: "⭐",
  tripadvisor: "⭐",
  booking: "🛏️",
  facebook: "📘",
  instagram: "📸",
  tiktok: "🎵",
  youtube: "▶️",
};

function withLinkIcon(label: string, linkKey: keyof typeof LINK_ICON_PREFIXES): string {
  const raw = String(label || "").trim();
  if (!raw) return raw;

  // Avoid duplicating icons when the text already starts with an emoji/symbol.
  if (/^[\p{Extended_Pictographic}⭐▶️]/u.test(raw)) {
    return raw;
  }

  return `${LINK_ICON_PREFIXES[linkKey]} ${raw}`;
}


function stripLeadingVisualIcon(value: string): string {
  return String(value || "")
    .replace(/^[\p{Extended_Pictographic}\u2600-\u27BF\uFE0F\s]+/u, "")
    .trim();
}

function getPremiumWelcomeTitle(lang: LangKey | string): string {
  const key = String(lang || "").toLowerCase();

  if (key === "bg") return "Добре дошли";
  if (key === "de") return "Willkommen";
  if (key === "ro") return "Bine ați venit";
  if (key === "cs") return "Vítejte";
  if (key === "ru") return "Добро пожаловать";

  return "Welcome";
}

const PREMIUM_ICON_ASSET_BASE = "/icons/guesthub-premium";

function getPremiumIconAsset(id?: string): string | null {
  const key = String(id || "").toLowerCase().trim();

  if (!key) return null;
  if (key.includes("reception") || key.includes("рецепц")) return "reception-premium-v4.png";
  if (key.includes("housekeeping") || key.includes("хаус")) return "housekeeping-premium-v4.png";
  if (key.includes("maintenance") || key.includes("technical") || key.includes("техн")) return "maintenance.png";
  if (key.includes("emergency") || key.includes("спеш")) return "emergency-call.png";
  if (key.includes("contact") || key.includes("свържи")) return "contact.png";
  if (key.includes("policy") || key.includes("policies") || key.includes("политик")) return "policy.png";
  if (key.includes("restaurant") || key.includes("ресторан") || key.includes("food")) return "restaurant.png";
  if (key.includes("bar") || key.includes("бар")) return "bars.png";
  if (key.includes("kids") || key.includes("kid") || key.includes("child") || key.includes("kinder") || key.includes("детск") || key.includes("pool") || key.includes("басейн") || key.includes("piscin") || key.includes("bazén") || key.includes("бассейн")) return "entertainment.png";
  if (key.includes("animation") || key.includes("entertainment") || key.includes("забав")) return "entertainment.png";
  if (key.includes("massage") || key.includes("spa") || key.includes("масаж")) return "massage.png";
  if (key.includes("pillow") || key.includes("възглав")) return "pillow.png";
  if (key.includes("coffee") || key.includes("каф")) return "coffee.png";
  if (key.includes("weather") || key.includes("врем")) return "weather.png";
  if (key.includes("review") || key.includes("social") || key.includes("отзив")) return "reviews.png";
  if (key.includes("explore") || key.includes("nearby") || key.includes("около")) return "nearby.png";
  if (key === "ai" || key.includes("ai_concierge") || key.includes("concierge") || key.includes("robot") || key.includes("консиерж")) return "ai-concierge.png";
  if (key.includes("install") || key.includes("download") || key.includes("изтегли")) return "install.png";
  if (key.includes("notification") || key.includes("извести")) return "notifications.png";
  if (key.includes("phone") || key.includes("call") || key.includes("обади")) return "phone.png";
  if (key === "info" || key.includes("information") || key.includes("инфо")) return "info.png";

  return null;
}

function PremiumSectionIcon({ id }: { id?: string }) {
  const key = String(id || "").toLowerCase();
  const asset = getPremiumIconAsset(id);

  if (asset) {
    return (
      <img
        src={`${PREMIUM_ICON_ASSET_BASE}/${asset}?v=20260719-final-icons`}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
        className="stayhub-premium-icon-image stayhub-premium-icon-brand"
      />
    );
  }

  const commonProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.55,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (key.includes("wifi") || key.includes("wi-fi")) {
    return (
      <svg {...commonProps}>
        <path d="M5 12.5a10 10 0 0 1 14 0" />
        <path d="M8.4 15.8a5.1 5.1 0 0 1 7.2 0" />
        <path d="M12 19h.01" />
      </svg>
    );
  }

  if (key.includes("housekeeping") || key.includes("хаус")) {
    return (
      <svg {...commonProps}>
        <path d="M7 21h10" />
        <path d="M9 21V9a3 3 0 0 1 6 0v12" />
        <path d="M5 12h14" />
        <path d="M6 12l1.2 6" />
        <path d="M18 12l-1.2 6" />
      </svg>
    );
  }

  if (key.includes("maintenance") || key.includes("поддр") || key.includes("техничес")) {
    return (
      <svg {...commonProps}>
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.9-.8-.8-2.9 2.4-2.4Z" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <circle cx="12" cy="12" r="7.8" />
      <path d="M12 8h.01" />
      <path d="M11.1 11.6H12v5.1h1" />
    </svg>
  );
}

// END_STAYHUB_SECTION_ICON_HELPERS


import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { StaffDepartment, StaffRequestType, StaffServiceTime, StaffRequestStatus } from "@/lib/staff/types";
import { usePathname, useSearchParams } from "next/navigation";
import type { HotelConfig, LangKey, HubSection, DepartmentKey, HubItem, RequestDef } from "@/lib/types";
import { normalizeStaffRequestType } from "@/lib/staff/request-type-utils";
import { persistQrContextFromUrl, trackHubEvent, type TrackHubPayload } from "@/lib/trackHubEvent";
import InstallAppButton from "@/components/InstallAppButton";
import MassageBookingSection, {
  prefetchMassageBookingData,
  type ConfirmedMassageBookingCard,
} from "@/components/MassageBookingSection";
import Day3GuestSurvey from "@/components/Day3GuestSurvey";
import GuestSurveyPushControls from "@/components/GuestSurveyPushControls";
import LocalizedStayDatePicker from "@/components/LocalizedStayDatePicker";
import {
  GUEST_STAY_DEVICE_STORAGE_KEY,
  addDaysToStayDateKey,
  getStayLengthNights,
  normalizeLateCheckoutTime,
  normalizeStayDateKey,
  type GuestStaySummary,
} from "@/lib/guest-stays/shared";
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
  id?: string;
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
    new Set([current, alias, "en", "bg", "de", "ro", "cs", "ru"].filter(Boolean))
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

const RESTAURANT_HOURS_TITLE_BY_LANG: Record<string, string> = {
  bg: "Ресторант – работно време",
  en: "Restaurant – opening hours",
  de: "Restaurant – Öffnungszeiten",
  ro: "Restaurant – program",
  cs: "Restaurace – otevírací doba",
  ru: "Ресторан — часы работы",
};

const RESTAURANT_MEAL_LABELS_BY_LANG: Record<string, string[]> = {
  bg: ["Закуска", "Обяд", "Следобедна закуска", "Вечеря"],
  en: ["Breakfast", "Lunch", "Afternoon snack", "Dinner"],
  de: ["Frühstück", "Mittagessen", "Nachmittagssnack", "Abendessen"],
  ro: ["Mic dejun", "Prânz", "Gustare de după-amiază", "Cină"],
  cs: ["Snídaně", "Oběd", "Odpolední svačina", "Večeře"],
  ru: ["Завтрак", "Обед", "Полдник", "Ужин"],
};

const GAME_ROOM_PRICING_BY_LANG: Record<string, string> = {
  bg: "Билярдът и тенисът на маса се ползват срещу 5,00 € на час. Останалите игри в залата са безплатни.",
  en: "Billiards and table tennis cost 5.00 € per hour. All other games in the games room are free of charge.",
  de: "Billard und Tischtennis kosten 5,00 € pro Stunde. Alle anderen Spiele im Spielraum sind kostenlos.",
  ro: "Biliardul și tenisul de masă costă 5,00 € pe oră. Celelalte jocuri din sala de jocuri sunt gratuite.",
  cs: "Kulečník a stolní tenis stojí 5,00 € za hodinu. Ostatní hry v herně jsou zdarma.",
  ru: "Бильярд и настольный теннис стоят 5,00 € в час. Остальные игры в игровой комнате бесплатны.",
};

function formatRestaurantHoursForLanguage(rawValue: string, lang: LangKey | string): string {
  const normalized = String(rawValue || "")
    .replace(/\s*\|\s*/g, "\n")
    .replace(/\\n/g, "\n")
    .trim();

  const ranges = normalized.match(/\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}/g) || [];
  if (ranges.length < 4) return normalized;

  const languageKey = ["bg", "en", "de", "ro", "cs", "ru"].includes(String(lang)) ? String(lang) : "en";
  const labels = RESTAURANT_MEAL_LABELS_BY_LANG[languageKey] || RESTAURANT_MEAL_LABELS_BY_LANG.en;
  return labels.map((label, index) => `${label}: ${ranges[index]}`).join("\n");
}


const RU_BUILTIN_UI: Record<string, string> = {
  install_app: "Установить приложение",
  outlets_title: "Объекты и услуги",
  hours: "Часы работы",
  cuisine: "Кухня",
  location: "Расположение",
  age_group: "Возраст",
  program: "Программа",
  view_menu_pdf: "Посмотреть меню",
  view_program: "Посмотреть программу",
  reserve_now: "Забронировать",
  hotel_info_title: "ℹ️ Информация",
  section_info_title: "ℹ️ Информация",
  section_animation_title: "🎭 Анимация",
  section_world_cup_title: "🏆 Чемпионат мира 2026",
  subsection_policies: "Правила",
  outlet_type_restaurants: "Рестораны",
  outlet_type_bars: "Бары",
  outlet_type_spa: "СПА",
  outlet_type_lounge: "Лаунж",
  outlet_type_kids: "Детский клуб",
  outlet_type_pool: "Бассейн",
  outlet_type_gym: "Фитнес",
  outlet_type_room_service: "Обслуживание номеров",
  outlet_type_entertainment: "Развлечения",
  room_cleaning: "Уборка номера",
  extra_pillows: "Дополнительные подушки",
  wake_up: "Звонок-будильник",
  coffee_capsules: "Кофейные капсулы",
  pillow_menu: "Меню подушек",
  special_occasion: "Особый повод",
  minibar: "Пополнение мини-бара",
  coffee_machine: "Проблем с кофемашиной",
  ac_issue: "Кондиционер / отопление",
  water_issue: "Проблема с водой",
  something_broken: "Что-то сломано",
  bathrobe: "Халат",
  slippers: "Тапочки",
  baby_cot: "Детская кроватка",
  tv_issue: "Проблема с телевизором",
  light_not_working: "Проблема с освещением",
  bathroom_issue: "Проблема в ванной",
  door_lock_issue: "Проблема с дверью / замком",
  wifi_issue: "Проблема с Wi‑Fi",
  power_outlet_issue: "Проблема с розеткой",
  safe_issue: "Проблема с сейфом",
  balcony_door_issue: "Проблема с балконной дверью",
  minibar_not_cooling: "Мини-бар не охлаждает",
  reception_general: "Вопрос на рецепцию",
  information: "Информация",
  luggage_help: "Помощь с багажом",
  paid_service_notice: "Платная услуга. Сумма может быть начислена на счёт номера.",
  laundry_paid_notice: "Услуга прачечной платная. После подтверждения запрос будет отправлен в housekeeping, а рецепция сможет начислить сумму на счёт номера.",
  minibar_paid_notice: "Пополнение мини-бара — платная услуга. После подтверждения запрос будет отправлен в housekeeping, а рецепция сможет начислить сумму на счёт номера.",
  something_broken_prompt: "Опишите, что сломано или повреждено:",
  something_broken_required: "Пожалуйста, опишите неисправность, чтобы техническая служба могла правильно отреагировать.",
  ai_intro: "Я могу помочь только с информацией об отеле: рестораны, бары, часы работы, СПА, детский клуб, игровая комната, удобства и услуги отеля.",
  weather_title: "Погода",
  weather_loading: "Загрузка прогноза...",
  weather_error: "Не удалось загрузить прогноз. Попробуйте позже.",
  ai_error: "Не удалось обработать запрос. Попробуйте ещё раз.",
  ai_loading: "Думаю...",
  ai_no_info: "У меня пока нет этой информации об отеле.",
  ai_open: "Открыть AI-консьержа",
  ai_placeholder: "Задайте вопрос об отеле...",
  ai_send: "Отправить",
  ai_title: "AI-консьерж",
  attractions_nearby: "Достопримечательности рядом",
  billing_note: "Платная услуга / начисление на номер",
  blanket: "Дополнительное одеяло",
  confirm_no_occasion: "Есть особый повод?\nOK = Без повода\nCancel = Указать повод",
  continue_request: "Продолжить",
  dept_closed_to_reception: "Сейчас этот отдел не работает. Запрос будет отправлен на рецепцию.",
  emergency_call: "Позвонить на рецепцию",
  emergency_title: "Экстренная помощь",
  example_date: "15.06.2026",
  example_time: "15:00",
  explore_title: "Рядом с отелем",
  hero_subtitle: "Всё необходимое для комфортного отдыха",
  housekeeping_title: "Уборка номера",
  housekeeping_title_after: "Уборка номера",
  info_title: "Информация",
  invalid_date: "Неверная дата",
  invalid_reservation_time: "Выбранное время находится вне часов работы.",
  invalid_time: "Неверное время",
  iron: "Утюг и гладильная доска",
  label_option: "Выбор",
  label_people: "Количество гостей",
  label_quantity: "Количество",
  label_time: "Время",
  late_checkout: "Поздний выезд",
  late_checkout_info: "Поздний выезд предоставляется за дополнительную плату. Условия и стоимость подтверждает рецепция.",
  late_checkout_selected_time: "Выбранное время позднего выезда",
  late_checkout_time_prompt: "Выберите время позднего выезда: 13:00 или 14:00",
  laundry: "Прачечная",
  leave_booking_review: "Отзыв на Booking.com",
  leave_google_review: "Отзыв в Google",
  leave_tripadvisor_review: "Отзыв на TripAdvisor",
  light_issue: "Проблема с освещением",
  maintenance_title: "Техническая служба",
  minibar_notice: "Пополнение мини-бара — платная услуга, которая может быть начислена на счёт номера.",
  no_occasion: "Без повода",
  notice: "Ваш запрос будет отправлен непосредственно соответствующему отделу отеля.",
  pharmacy: "Аптека рядом",
  prompt_date: "Дата:",
  prompt_occasion: "Повод (например, день рождения):",
  prompt_people: "Количество гостей:",
  prompt_time: "Время:",
  reception_title: "Рецепция",
  request_note_prompt: "Добавьте подробности (необязательно):",
  request_option_prompt: "Выберите вариант:",
  request_quantity_invalid: "Введите допустимое количество.",
  request_quantity_prompt: "Количество:",
  reservation_outside_hours: "Часы работы: {hours}",
  restaurants_nearby: "Рестораны рядом",
  reviews_intro: "Вам нравится отдых? Будем благодарны за ваш отзыв.",
  reviews_title: "Отзывы",
  social_intro: "Следите за новостями и предложениями отеля в социальных сетях.",
  social_title: "Следите за нами",
  taxi: "Такси",
  toilet_paper: "Туалетная бумага",
  towels: "Дополнительные полотенца",
  wake_up_invalid: "Выберите допустимое время звонка-будильника.",
  wake_up_select: "Выберите время звонка-будильника:",
  wake_up_selected: "Выбранное время",
  wifi_network: "Сеть Wi‑Fi",
  wifi_password: "Пароль",
  wifi_show: "Показать данные Wi‑Fi",
  wifi_title: "Wi‑Fi",
};

const GUEST_NAV_COPY: Record<string, {
  quickServices: string;
  hotelStay: string;
  foodEntertainment: string;
  reviewsSocial: string;
  more: string;
  askAi: string;
  close: string;
  housekeeping: string;
}> = {
  bg: {
    quickServices: "Бързи услуги",
    hotelStay: "Хотел и престой",
    foodEntertainment: "Храна и забавления",
    reviewsSocial: "Отзиви и социални мрежи",
    more: "Още услуги",
    askAi: "Попитайте AI",
    close: "Затвори",
    housekeeping: "Камериерки",
  },
  en: {
    quickServices: "Quick services",
    hotelStay: "Hotel & stay",
    foodEntertainment: "Food & entertainment",
    reviewsSocial: "Reviews & social media",
    more: "More services",
    askAi: "Ask AI",
    close: "Close",
    housekeeping: "Housekeeping",
  },
  de: {
    quickServices: "Schnellzugriff",
    hotelStay: "Hotel & Aufenthalt",
    foodEntertainment: "Essen & Unterhaltung",
    reviewsSocial: "Bewertungen & Social Media",
    more: "Weitere Services",
    askAi: "AI fragen",
    close: "Schließen",
    housekeeping: "Housekeeping",
  },
  ro: {
    quickServices: "Servicii rapide",
    hotelStay: "Hotel și sejur",
    foodEntertainment: "Mâncare și divertisment",
    reviewsSocial: "Recenzii și rețele sociale",
    more: "Mai multe servicii",
    askAi: "Întreabă AI",
    close: "Închide",
    housekeeping: "Curățenie",
  },
  cs: {
    quickServices: "Rychlé služby",
    hotelStay: "Hotel a pobyt",
    foodEntertainment: "Jídlo a zábava",
    reviewsSocial: "Hodnocení a sociální sítě",
    more: "Další služby",
    askAi: "Zeptat se AI",
    close: "Zavřít",
    housekeeping: "Úklid pokoje",
  },
  ru: {
    quickServices: "Быстрые услуги",
    hotelStay: "Отель и проживание",
    foodEntertainment: "Еда и развлечения",
    reviewsSocial: "Отзывы и соцсети",
    more: "Другие услуги",
    askAi: "Спросить AI",
    close: "Закрыть",
    housekeeping: "Уборка номера",
  },
};

function getGuestNavCopy(lang: LangKey | string) {
  const safeLang = ["bg", "en", "de", "ro", "cs", "ru"].includes(String(lang))
    ? String(lang)
    : "en";
  return GUEST_NAV_COPY[safeLang] || GUEST_NAV_COPY.en;
}

const PREMIUM_SECTION_COPY: Record<string, {
  hotelInfo: string;
  onlineReception: string;
  onlineHousekeeping: string;
  onlineMaintenance: string;
  otherEntertainment: string;
  coffeeMachineIssue: string;
}> = {
  bg: {
    hotelInfo: "Информация за хотела",
    onlineReception: "Онлайн рецепция",
    onlineHousekeeping: "Онлайн хаускипинг",
    onlineMaintenance: "Онлайн технически отдел",
    otherEntertainment: "Други Забавления",
    coffeeMachineIssue: "Проблем с кафе машината",
  },
  en: {
    hotelInfo: "Hotel information",
    onlineReception: "Online reception",
    onlineHousekeeping: "Online housekeeping",
    onlineMaintenance: "Online technical support",
    otherEntertainment: "Other entertainment",
    coffeeMachineIssue: "Coffee machine issue",
  },
  de: {
    hotelInfo: "Hotelinformationen",
    onlineReception: "Online-Rezeption",
    onlineHousekeeping: "Online-Housekeeping",
    onlineMaintenance: "Online-Technikservice",
    otherEntertainment: "Weitere Unterhaltung",
    coffeeMachineIssue: "Problem mit der Kaffeemaschine",
  },
  ro: {
    hotelInfo: "Informații despre hotel",
    onlineReception: "Recepție online",
    onlineHousekeeping: "Housekeeping online",
    onlineMaintenance: "Serviciu tehnic online",
    otherEntertainment: "Alte distracții",
    coffeeMachineIssue: "Problemă cu aparatul de cafea",
  },
  cs: {
    hotelInfo: "Informace o hotelu",
    onlineReception: "Online recepce",
    onlineHousekeeping: "Online housekeeping",
    onlineMaintenance: "Online technická podpora",
    otherEntertainment: "Další zábava",
    coffeeMachineIssue: "Problém s kávovarem",
  },
  ru: {
    hotelInfo: "Информация об отеле",
    onlineReception: "Онлайн-рецепция",
    onlineHousekeeping: "Онлайн-хаускипинг",
    onlineMaintenance: "Онлайн-техническая служба",
    otherEntertainment: "Другие развлечения",
    coffeeMachineIssue: "Проблем с кофемашиной",
  },
};

function getPremiumSectionCopy(lang: LangKey | string) {
  const safeLang = ["bg", "en", "de", "ro", "cs", "ru"].includes(String(lang))
    ? String(lang)
    : "en";
  return PREMIUM_SECTION_COPY[safeLang] || PREMIUM_SECTION_COPY.en;
}

/* STAYHUB_PREMIUM_SERVICE_TITLES_START */
type PremiumServiceTitleKey =
  | "hotelPolicy"
  | "bookMassage"
  | "sleepPillows"
  | "orderCoffeeCapsules";

const PREMIUM_SERVICE_TITLES: Record<
  LangKey,
  Record<PremiumServiceTitleKey, string>
> = {
  bg: {
    hotelPolicy: "Политика на хотела",
    bookMassage: "Резервирай масаж",
    sleepPillows: "Възглавници за пълноценен сън",
    orderCoffeeCapsules: "Поръчай кафе капсули",
  },
  en: {
    hotelPolicy: "Hotel policy",
    bookMassage: "Book a massage",
    sleepPillows: "Pillows for restful sleep",
    orderCoffeeCapsules: "Order coffee capsules",
  },
  de: {
    hotelPolicy: "Hotelrichtlinien",
    bookMassage: "Massage reservieren",
    sleepPillows: "Kissen für erholsamen Schlaf",
    orderCoffeeCapsules: "Kaffeekapseln bestellen",
  },
  ro: {
    hotelPolicy: "Politica hotelului",
    bookMassage: "Rezervă un masaj",
    sleepPillows: "Perne pentru un somn odihnitor",
    orderCoffeeCapsules: "Comandă capsule de cafea",
  },
  cs: {
    hotelPolicy: "Pravidla hotelu",
    bookMassage: "Rezervovat masáž",
    sleepPillows: "Polštáře pro kvalitní spánek",
    orderCoffeeCapsules: "Objednat kávové kapsle",
  },
  ru: {
    hotelPolicy: "Правила отеля",
    bookMassage: "Забронировать массаж",
    sleepPillows: "Подушки для полноценного сна",
    orderCoffeeCapsules: "Заказать кофейные капсулы",
  },
};

function getPremiumServiceTitle(
  lang: LangKey | string,
  key: PremiumServiceTitleKey
): string {
  const safeLang = (["bg", "en", "de", "ro", "cs", "ru"].includes(String(lang))
    ? String(lang)
    : "en") as LangKey;

  return PREMIUM_SERVICE_TITLES[safeLang]?.[key] || PREMIUM_SERVICE_TITLES.en[key];
}
/* STAYHUB_PREMIUM_SERVICE_TITLES_END */

/* STAYHUB_ROOM_SWITCH_COPY_START */
type RoomSwitchCopy = {
  title: string;
  description: string;
  cancel: string;
  confirm: string;
};

const ROOM_SWITCH_COPY: Record<LangKey, RoomSwitchCopy> = {
  bg: {
    title: "Смяна на стаята",
    description:
      "Въведете новия номер на стаята и го потвърдете два пъти през защитния прозорец.",
    cancel: "Отказ",
    confirm: "Потвърди новата стая",
  },
  en: {
    title: "Change room",
    description:
      "Enter the new room number and confirm the change in the security window.",
    cancel: "Cancel",
    confirm: "Confirm new room",
  },
  de: {
    title: "Zimmer wechseln",
    description:
      "Geben Sie die neue Zimmernummer ein und bestätigen Sie den Wechsel im Sicherheitsfenster.",
    cancel: "Abbrechen",
    confirm: "Neues Zimmer bestätigen",
  },
  ro: {
    title: "Schimbă camera",
    description:
      "Introduceți noul număr al camerei și confirmați schimbarea în fereastra de securitate.",
    cancel: "Anulează",
    confirm: "Confirmă noua cameră",
  },
  cs: {
    title: "Změnit pokoj",
    description:
      "Zadejte nové číslo pokoje a potvrďte změnu v bezpečnostním okně.",
    cancel: "Zrušit",
    confirm: "Potvrdit nový pokoj",
  },
  ru: {
    title: "Смена номера",
    description:
      "Введите новый номер комнаты и подтвердите смену в защищённом окне.",
    cancel: "Отмена",
    confirm: "Подтвердить новый номер",
  },
};

function getRoomSwitchCopy(lang: LangKey | string): RoomSwitchCopy {
  const safeLang = (["bg", "en", "de", "ro", "cs", "ru"].includes(String(lang))
    ? String(lang)
    : "en") as LangKey;

  return ROOM_SWITCH_COPY[safeLang] || ROOM_SWITCH_COPY.en;
}
/* STAYHUB_ROOM_SWITCH_COPY_END */


type GuestWeatherDay = {
  date: string;
  weatherCode: number | null;
  temperatureMax: number | null;
  temperatureMin: number | null;
  rainChance: number | null;
};

type GuestWeatherPayload = {
  ok: boolean;
  place?: string;
  timezone?: string;
  provider?: "google_weather" | "open_meteo";
  attribution?: string;
  sourceUrl?: string;
  updatedAt?: string;
  current?: {
    temperature: number | null;
    apparentTemperature: number | null;
    humidity: number | null;
    weatherCode: number | null;
    cloudCover: number | null;
    windSpeed: number | null;
    windDirection: number | null;
    precipitation: number | null;
  };
  daily?: GuestWeatherDay[];
};

const WEATHER_GUEST_COPY: Record<string, {
  title: string;
  loading: string;
  error: string;
  now: string;
  feels: string;
  humidity: string;
  clouds: string;
  wind: string;
  rain: string;
  today: string;
  tomorrow: string;
  updated: string;
  localTime: string;
  source: string;
}> = {
  bg: { title: "Времето", loading: "Зареждане на прогнозата...", error: "Прогнозата временно не е достъпна.", now: "Сега", feels: "усеща се като", humidity: "Влажност", clouds: "Облачност", wind: "Вятър", rain: "Вероятност за валеж", today: "Днес", tomorrow: "Утре", updated: "Времето се актуализира на всеки 10 минути.", localTime: "Местно време", source: "Източник" },
  en: { title: "Weather", loading: "Loading forecast...", error: "The forecast is temporarily unavailable.", now: "Now", feels: "feels like", humidity: "Humidity", clouds: "Cloud cover", wind: "Wind", rain: "Chance of rain", today: "Today", tomorrow: "Tomorrow", updated: "Weather data is updated every 10 minutes.", localTime: "Local time", source: "Source" },
  de: { title: "Wetter", loading: "Wetter wird geladen...", error: "Die Wettervorhersage ist vorübergehend nicht verfügbar.", now: "Aktuell", feels: "gefühlt", humidity: "Luftfeuchtigkeit", clouds: "Bewölkung", wind: "Wind", rain: "Regenwahrscheinlichkeit", today: "Heute", tomorrow: "Morgen", updated: "Die Wetterdaten werden alle 10 Minuten aktualisiert.", localTime: "Ortszeit", source: "Quelle" },
  ro: { title: "Vremea", loading: "Se încarcă prognoza...", error: "Prognoza nu este disponibilă momentan.", now: "Acum", feels: "se simte ca", humidity: "Umiditate", clouds: "Nebulozitate", wind: "Vânt", rain: "Probabilitate de ploaie", today: "Astăzi", tomorrow: "Mâine", updated: "Datele meteo se actualizează la fiecare 10 minute.", localTime: "Ora locală", source: "Sursă" },
  cs: { title: "Počasí", loading: "Načítání předpovědi...", error: "Předpověď je dočasně nedostupná.", now: "Nyní", feels: "pocitově", humidity: "Vlhkost", clouds: "Oblačnost", wind: "Vítr", rain: "Pravděpodobnost deště", today: "Dnes", tomorrow: "Zítra", updated: "Údaje o počasí se aktualizují každých 10 minut.", localTime: "Místní čas", source: "Zdroj" },
  ru: { title: "Погода", loading: "Загрузка прогноза...", error: "Прогноз временно недоступен.", now: "Сейчас", feels: "ощущается как", humidity: "Влажность", clouds: "Облачность", wind: "Ветер", rain: "Вероятность осадков", today: "Сегодня", tomorrow: "Завтра", updated: "Данные о погоде обновляются каждые 10 минут.", localTime: "Местное время", source: "Источник" },
};

function weatherConditionLabel(code: number | null | undefined, lang: LangKey | string) {
  const key = Number(code);
  const condition = key === 0 ? "clear"
    : key === 1 || key === 2 ? "partly"
      : key === 3 ? "cloudy"
        : key === 45 || key === 48 ? "fog"
          : key >= 51 && key <= 67 ? "rain"
            : key >= 71 && key <= 77 ? "snow"
              : key >= 80 && key <= 82 ? "showers"
                : key >= 95 ? "storm"
                  : "mixed";

  const labels: Record<string, Record<string, string>> = {
    clear: { bg: "ясно", en: "clear", de: "klar", ro: "senin", cs: "jasno", ru: "ясно" },
    partly: { bg: "частично облачно", en: "partly cloudy", de: "teilweise bewölkt", ro: "parțial noros", cs: "polojasno", ru: "переменная облачность" },
    cloudy: { bg: "облачно", en: "cloudy", de: "bewölkt", ro: "noros", cs: "zataženo", ru: "облачно" },
    fog: { bg: "мъгла", en: "fog", de: "Nebel", ro: "ceață", cs: "mlha", ru: "туман" },
    rain: { bg: "дъжд", en: "rain", de: "Regen", ro: "ploaie", cs: "déšť", ru: "дождь" },
    snow: { bg: "сняг", en: "snow", de: "Schnee", ro: "ninsoare", cs: "sníh", ru: "снег" },
    showers: { bg: "превалявания", en: "showers", de: "Schauer", ro: "averse", cs: "přeháňky", ru: "ливни" },
    storm: { bg: "гръмотевична буря", en: "thunderstorm", de: "Gewitter", ro: "furtună", cs: "bouřka", ru: "гроза" },
    mixed: { bg: "променливо", en: "variable", de: "wechselhaft", ro: "variabil", cs: "proměnlivo", ru: "переменная погода" },
  };

  const safeLang = ["bg", "en", "de", "ro", "cs", "ru"].includes(String(lang)) ? String(lang) : "en";
  return labels[condition]?.[safeLang] || labels[condition]?.en || "";
}

function weatherConditionIcon(code: number | null | undefined) {
  const value = Number(code);
  if (value === 0) return "☀️";
  if (value === 1 || value === 2) return "🌤️";
  if (value === 3) return "☁️";
  if (value === 45 || value === 48) return "🌫️";
  if (value >= 51 && value <= 67) return "🌧️";
  if (value >= 71 && value <= 77) return "❄️";
  if (value >= 80 && value <= 82) return "🌦️";
  if (value >= 95) return "⛈️";
  return "🌤️";
}

function compassDirection(degrees: number | null | undefined, lang: LangKey | string) {
  if (!Number.isFinite(Number(degrees))) return "";
  const directions: Record<string, string[]> = {
    bg: ["С", "СИ", "И", "ЮИ", "Ю", "ЮЗ", "З", "СЗ"],
    en: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
    de: ["N", "NO", "O", "SO", "S", "SW", "W", "NW"],
    ro: ["N", "NE", "E", "SE", "S", "SV", "V", "NV"],
    cs: ["S", "SV", "V", "JV", "J", "JZ", "Z", "SZ"],
    ru: ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"],
  };
  const safeLang = ["bg", "en", "de", "ro", "cs", "ru"].includes(String(lang)) ? String(lang) : "en";
  const index = Math.round((((Number(degrees) % 360) + 360) % 360) / 45) % 8;
  return directions[safeLang]?.[index] || "";
}

function getBuiltinUiText(lang: LangKey | string, key: string) {
  const normalizedLang = String(lang || "").trim().toLowerCase();
  const targetLang = ["bg", "de", "en", "ro", "cs", "ru"].includes(normalizedLang)
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
      coffee_machine: "Проблем с кафе машината",
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
      ai_title: "AI консултант",
      ai_placeholder: "Задайте въпрос за хотела...",
      ai_send: "Изпрати",
      ai_loading: "Мисля...",
      ai_no_info: "Все още нямам тази информация за хотела.",
      ai_error: "Не успях да обработя въпроса. Опитайте отново.",
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
      coffee_machine: "Problem mit der Kaffeemaschine",
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
      ai_title: "AI-Concierge",
      ai_placeholder: "Fragen Sie etwas zum Hotel...",
      ai_send: "Senden",
      ai_loading: "Ich denke...",
      ai_no_info: "Ich habe diese Hotelinformation noch nicht.",
      ai_error: "Die Anfrage konnte nicht verarbeitet werden. Bitte erneut versuchen.",
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
      coffee_machine: "Coffee machine issue",
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
      ai_title: "AI Concierge",
      ai_placeholder: "Ask a question about the hotel...",
      ai_send: "Send",
      ai_loading: "Thinking...",
      ai_no_info: "I do not have that hotel information yet.",
      ai_error: "I could not process the question. Please try again.",
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
      coffee_machine: "Problemă cu aparatul de cafea",
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
      ai_title: "Concierge AI",
      ai_placeholder: "Întrebați ceva despre hotel...",
      ai_send: "Trimite",
      ai_loading: "Mă gândesc...",
      ai_no_info: "Nu am încă această informație despre hotel.",
      ai_error: "Nu am putut procesa întrebarea. Încercați din nou.",
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
      coffee_machine: "Problém s kávovarem",
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
      ai_title: "AI concierge",
      ai_placeholder: "Zeptejte se na hotel...",
      ai_send: "Odeslat",
      ai_loading: "Přemýšlím...",
      ai_no_info: "Tuto informaci o hotelu zatím nemám.",
      ai_error: "Dotaz se nepodařilo zpracovat. Zkuste to znovu.",
    },
  };

  return targetLang === "ru" ? RU_BUILTIN_UI[key] || "" : copy[targetLang]?.[key] || "";
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

type StoredGuestMassageBooking = ConfirmedMassageBookingCard & {
  id: string;
  requestId?: string;
  manualSheetChanged?: boolean;
  changeNotice?: string | null;
  originalServiceName?: string | null;
  currentSheetServiceName?: string | null;
  currentSheetRoomMarker?: string | null;
};

type GuestMassageServerBooking = {
  requestId?: string;
  hotelSlug?: string;
  room?: string;
  serviceId?: string;
  serviceName?: string;
  date?: string;
  time?: string;
  durationMinutes?: number | null;
  price?: number | null;
  currency?: string | null;
  confirmedAt?: string;
  manualSheetChanged?: boolean;
  changeNotice?: string | null;
  originalServiceName?: string | null;
  currentSheetServiceName?: string | null;
  currentSheetRoomMarker?: string | null;
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
  onCancel?: () => void;
} | null;

type GuestRequestSubmissionInput = {
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
  lateCheckoutRequestedTime?: string;
};

type StoredGuestRoomState = {
  manualRoomInput: string;
  room: string;
  roomConfirmed: boolean;
  checkInDate: string;
  checkOutDate: string;
  stayId: string;
  stayDeviceId: string;
  deviceToken: string;
  effectiveCheckOutAt: string;
};

const GUEST_REQUEST_REFS_STORAGE_KEY = "guesthub_guest_request_refs";

const GUEST_MASSAGE_BOOKINGS_STORAGE_KEY = "guesthub_massage_bookings_v1";

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
      checkInDate: normalizeStayDateKey(candidate.checkInDate),
      checkOutDate: normalizeStayDateKey(candidate.checkOutDate),
      stayId: typeof candidate.stayId === "string" ? candidate.stayId : "",
      stayDeviceId: typeof candidate.stayDeviceId === "string" ? candidate.stayDeviceId : "",
      deviceToken: typeof candidate.deviceToken === "string" ? candidate.deviceToken : "",
      effectiveCheckOutAt: typeof candidate.effectiveCheckOutAt === "string" ? candidate.effectiveCheckOutAt : "",
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

function getOrCreateGuestStayDeviceToken() {
  if (typeof window === "undefined") return "";
  try {
    const existing = String(window.localStorage.getItem(GUEST_STAY_DEVICE_STORAGE_KEY) || "").trim();
    if (existing) return existing;
    const next = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `staydev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(GUEST_STAY_DEVICE_STORAGE_KEY, next);
    return next;
  } catch {
    return `staydev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }
}

function getDateKeyInClientTimezone(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
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

function massageBookingId(input: Pick<ConfirmedMassageBookingCard, "hotelSlug" | "room" | "serviceId" | "date" | "time">) {
  return [
    String(input.hotelSlug || "").trim().toLowerCase(),
    String(input.room || "").trim(),
    String(input.serviceId || "").trim().toLowerCase(),
    String(input.date || "").trim(),
    String(input.time || "").trim(),
  ].join("|");
}

function readStoredGuestMassageBookings(): StoredGuestMassageBooking[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(GUEST_MASSAGE_BOOKINGS_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is StoredGuestMassageBooking => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Record<string, unknown>;

      return (
        typeof candidate.id === "string" &&
        typeof candidate.hotelSlug === "string" &&
        typeof candidate.room === "string" &&
        typeof candidate.serviceId === "string" &&
        typeof candidate.serviceName === "string" &&
        typeof candidate.date === "string" &&
        typeof candidate.dateLabel === "string" &&
        typeof candidate.time === "string"
      );
    });
  } catch {
    return [];
  }
}

function writeStoredGuestMassageBookings(bookings: StoredGuestMassageBooking[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      GUEST_MASSAGE_BOOKINGS_STORAGE_KEY,
      JSON.stringify(bookings.slice(0, 20))
    );
  } catch (error) {
    console.error("writeStoredGuestMassageBookings failed", error);
  }
}

function getMassageBookingStartMs(booking: Pick<StoredGuestMassageBooking, "date" | "time">) {
  const [year, month, day] = String(booking.date || "").split("-").map(Number);
  const match = String(booking.time || "").trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!year || !month || !day || !match) return Number.NaN;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const value = new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();

  return Number.isFinite(value) ? value : Number.NaN;
}

function isStoredMassageBookingExpired(booking: StoredGuestMassageBooking, now = Date.now()) {
  const startMs = getMassageBookingStartMs(booking);
  if (!Number.isFinite(startMs)) return false;

  const durationMs = Math.max(0, Number(booking.durationMinutes || 0)) * 60_000;
  const keepAfterEndMs = 6 * 60 * 60_000;

  return now > startMs + durationMs + keepAfterEndMs;
}

function pruneStoredGuestMassageBookings(bookings = readStoredGuestMassageBookings()) {
  const now = Date.now();
  const next = bookings.filter((booking) => !isStoredMassageBookingExpired(booking, now));

  if (next.length !== bookings.length) {
    writeStoredGuestMassageBookings(next);
  }

  return next;
}

function upsertStoredGuestMassageBooking(booking: ConfirmedMassageBookingCard) {
  const normalized: StoredGuestMassageBooking = {
    ...booking,
    hotelSlug: String(booking.hotelSlug || "").trim().toLowerCase(),
    room: String(booking.room || "").trim(),
    serviceId: String(booking.serviceId || "").trim().toLowerCase(),
    id: massageBookingId(booking),
  };

  const current = pruneStoredGuestMassageBookings();
  const next = [normalized, ...current.filter((item) => item.id !== normalized.id)].slice(0, 20);
  writeStoredGuestMassageBookings(next);

  return next;
}

function replaceStoredGuestMassageBookingsForRoom(input: {
  hotelSlug: string;
  room: string;
  bookings: StoredGuestMassageBooking[];
}) {
  const normalizedHotelSlug = String(input.hotelSlug || "").trim().toLowerCase();
  const normalizedRoom = String(input.room || "").trim();
  const incoming = input.bookings.map((booking) => ({
    ...booking,
    hotelSlug: normalizedHotelSlug,
    room: String(booking.room || normalizedRoom).trim(),
    serviceId: String(booking.serviceId || "massage").trim().toLowerCase(),
    id: massageBookingId({
      hotelSlug: normalizedHotelSlug,
      room: String(booking.room || normalizedRoom).trim(),
      serviceId: String(booking.serviceId || "massage").trim().toLowerCase(),
      date: booking.date,
      time: booking.time,
    }),
  }));

  const current = pruneStoredGuestMassageBookings();
  const next = [
    ...incoming,
    ...current.filter(
      (item) =>
        String(item.hotelSlug || "").trim().toLowerCase() !== normalizedHotelSlug ||
        String(item.room || "").trim() !== normalizedRoom
    ),
  ].slice(0, 20);

  writeStoredGuestMassageBookings(next);
  return next;
}

function formatGuestMassageDateLabel(dateIso: string, lang: LangKey) {
  const match = String(dateIso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(dateIso || "").trim();

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (Number.isNaN(date.getTime())) return String(dateIso || "").trim();

  const localeByLang: Record<LangKey, string> = {
    bg: "bg-BG",
    en: "en-GB",
    de: "de-DE",
    ro: "ro-RO",
    cs: "cs-CZ",
    ru: "ru-RU",
  };

  return new Intl.DateTimeFormat(localeByLang[lang] || "bg-BG", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function getMassageReservationCopy(lang: LangKey) {
  if (lang === "en") {
    return {
      title: "Upcoming massage",
      confirmed: "Confirmed booking",
      room: "Room",
      duration: "Duration",
      price: "Price",
      minutes: "min",
      reminderSoon: "Reminder: your massage starts in less than 1 hour.",
      reminderNow: "Your massage appointment is now or has just started.",
    };
  }

  if (lang === "de") {
    return {
      title: "Bevorstehende Massage",
      confirmed: "Bestätigte Buchung",
      room: "Zimmer",
      duration: "Dauer",
      price: "Preis",
      minutes: "Min.",
      reminderSoon: "Erinnerung: Ihre Massage beginnt in weniger als 1 Stunde.",
      reminderNow: "Ihr Massagetermin ist jetzt oder hat gerade begonnen.",
    };
  }

  if (lang === "ro") {
    return {
      title: "Masaj programat",
      confirmed: "Rezervare confirmată",
      room: "Cameră",
      duration: "Durată",
      price: "Preț",
      minutes: "min.",
      reminderSoon: "Memento: masajul începe în mai puțin de 1 oră.",
      reminderNow: "Programarea pentru masaj este acum sau tocmai a început.",
    };
  }

  if (lang === "cs") {
    return {
      title: "Nadcházející masáž",
      confirmed: "Potvrzená rezervace",
      room: "Pokoj",
      duration: "Délka",
      price: "Cena",
      minutes: "min.",
      reminderSoon: "Připomínka: vaše masáž začíná za méně než 1 hodinu.",
      reminderNow: "Vaše masáž je nyní nebo právě začala.",
    };
  }

  if (lang === "ru") {
    return {
      title: "Предстоящий массаж",
      confirmed: "Бронирование подтверждено",
      room: "Номер",
      duration: "Продолжительность",
      price: "Цена",
      minutes: "мин.",
      reminderSoon: "Напоминание: ваш массаж начнётся менее чем через 1 час.",
      reminderNow: "Ваш массаж сейчас или только что начался.",
    };
  }

  return {
    title: "Предстоящ масаж",
    confirmed: "Потвърдена резервация",
    room: "Стая",
    duration: "Продължителност",
    price: "Цена",
    minutes: "мин.",
    reminderSoon: "Напомняне: Вашият масаж започва след по-малко от 1 час.",
    reminderNow: "Вашият масаж е сега или току-що е започнал.",
  };
}

function getMassageReservationReminder(booking: StoredGuestMassageBooking, lang: LangKey) {
  const startMs = getMassageBookingStartMs(booking);
  if (!Number.isFinite(startMs)) return "";

  const now = Date.now();
  const diffMs = startMs - now;
  const durationMs = Math.max(20, Number(booking.durationMinutes || 20)) * 60_000;
  const copy = getMassageReservationCopy(lang);

  if (diffMs >= 0 && diffMs <= 60 * 60_000) return copy.reminderSoon;
  if (diffMs < 0 && Math.abs(diffMs) <= durationMs) return copy.reminderNow;

  return "";
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

function formatGuestRequestLabel(_type: StaffRequestType | string, label: string) {
  return stripLeadingVisualIcon(String(label || ""));
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
          : lang === "ru"
            ? "Отправить запрос"
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
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return fallback;

  const parsed = Number(normalized);
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

type AiChatAction = {
  kind: "request_def" | "venue";
  targetId: string;
  matchedId: string;
  label: string;
};

type AiChatMessage = {
  role: "user" | "assistant";
  content: string;
  actions?: AiChatAction[];
};

const GUEST_LANGUAGE_STORAGE_KEY = "stayhub_guest_language";
const GUEST_INTRO_STORAGE_PREFIX = "stayhub_guest_intro_seen";
const GUEST_INTRO_VERSION = "classic-v3";
const SUPPORTED_GUEST_LANGS: LangKey[] = ["bg", "en", "de", "ro", "cs", "ru"];

function parseGuestLang(value: unknown): LangKey | null {
  const normalized = String(value || "").trim().toLowerCase();

  if (
    normalized === "bg" ||
    normalized === "de" ||
    normalized === "en" ||
    normalized === "ro" ||
    normalized === "cs" ||
    normalized === "ru"
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
      body: `Dies ist Ihr digitaler Assistent während Ihres Aufenthalts im ${name}. Hier finden Sie Informationen zum Hotel, Restaurant, zu den Bars, WLAN, Wetter, Animationsprogramm und hilfreichen Orten in der Umgebung. Außerdem können Sie Anfragen an Rezeption, Housekeeping und Technik senden. Damit wir den Service Ihrem Zimmer zuordnen können, geben Sie bitte Ihre Zimmernummer ein.`,
      button: "Verstanden, weiter",
    },
    ro: {
      title: "Bine ați venit la concierge-ul digital",
      body: `Acesta este asistentul digital pentru șederea dvs. la ${name}. Aici găsiți informații despre hotel, restaurant, baruri, Wi-Fi, vreme, animație și locuri utile din apropiere. De asemenea, puteți trimite solicitări către recepție, housekeeping și mentenanță. Pentru a conecta serviciul cu camera dvs., vă rugăm să introduceți numărul camerei.`,
      button: "Am înțeles, continuă",
    },
    cs: {
      title: "Vítejte u svého digitálního concierge",
      body: `Toto je váš digitální asistent během pobytu v ${name}. Najdete zde informace o hotelu, restauraci, barech, Wi‑Fi, počasí, animaci a užitečných místech v okolí. Můžete také posílat požadavky na recepci, housekeeping a údržbu. Abychom službu přiřadili k vašemu pokoji, zadejte prosím číslo pokoje.`,
      button: "Rozumím, pokračovat",
    },
    ru: {
      title: "Добро пожаловать в цифровой консьерж",
      body: `Это ваш цифровой помощник во время пребывания в ${name}. Здесь вы найдёте информацию об отеле, ресторане, барах, Wi‑Fi, погоде, анимации и полезных местах поблизости. Вы также можете отправлять запросы на ресепшен, в housekeeping и техническую службу. Чтобы связать услугу с вашим номером, пожалуйста, введите номер комнаты.`,
      button: "Понятно, продолжить",
    },
  };

  return copy[lang] ?? copy.bg;
}

function getDepartmentSectionIntro(
  lang: LangKey,
  department: "reception" | "housekeeping" | "maintenance"
) {
  const copy: Record<
    LangKey,
    Record<"reception" | "housekeeping" | "maintenance", string>
  > = {
    bg: {
      reception:
        "Тук можете да заявите такси, късен check-out, събуждане и помощ с багаж. Изберете конкретната услуга от списъка. Ако необходимото не е налично, моля обърнете се към рецепция.",
      housekeeping:
        "Тук можете да заявите конкретни нужди за стаята – кърпи, тоалетна хартия, възглавница, одеяло, халат, чехли, бебешка кошара, ютия, минибар или пране. Ако необходимото не е в списъка, моля обърнете се към рецепция.",
      maintenance:
        "Тук можете да изпратите конкретен технически проблем директно към поддръжката – климатик, топла вода, телевизор, осветление, баня и други неизправности.",
    },
    en: {
      reception:
        "Here you can request a taxi, late check-out, a wake-up call or luggage assistance. Choose the specific service from the list. If what you need is not available, please contact reception.",
      housekeeping:
        "Here you can request specific room items and services – towels, toilet paper, a pillow, a blanket, a bathrobe, slippers, a baby cot, an iron, minibar service or laundry. If what you need is not listed, please contact reception.",
      maintenance:
        "Here you can send a specific technical problem directly to maintenance – air conditioning, hot water, TV, lighting, bathroom issues and other faults.",
    },
    de: {
      reception:
        "Hier können Sie ein Taxi, einen späten Check-out, einen Weckruf oder Hilfe mit dem Gepäck anfordern. Wählen Sie den passenden Service aus der Liste. Wenn Ihr Anliegen nicht aufgeführt ist, wenden Sie sich bitte an die Rezeption.",
      housekeeping:
        "Hier können Sie konkrete Wünsche für Ihr Zimmer senden – Handtücher, Toilettenpapier, Kissen, Decke, Bademantel, Hausschuhe, Babybett, Bügeleisen, Minibarservice oder Wäsche. Wenn Ihr Wunsch nicht aufgeführt ist, wenden Sie sich bitte an die Rezeption.",
      maintenance:
        "Hier können Sie ein konkretes technisches Problem direkt an die Technik senden – Klimaanlage, Warmwasser, Fernseher, Beleuchtung, Badezimmer und andere Störungen.",
    },
    ro: {
      reception:
        "Aici puteți solicita un taxi, check-out târziu, apel de trezire sau ajutor cu bagajele. Alegeți serviciul concret din listă. Dacă ceea ce vă trebuie nu este disponibil, vă rugăm să contactați recepția.",
      housekeeping:
        "Aici puteți solicita lucruri și servicii concrete pentru cameră – prosoape, hârtie igienică, pernă, pătură, halat, papuci, pătuț pentru bebeluș, fier de călcat, minibar sau spălătorie. Dacă ceea ce vă trebuie nu este în listă, vă rugăm să contactați recepția.",
      maintenance:
        "Aici puteți trimite direct către mentenanță o problemă tehnică concretă – aer condiționat, apă caldă, televizor, iluminat, baie și alte defecțiuni.",
    },
    cs: {
      reception:
        "Zde si můžete objednat taxi, pozdní check-out, buzení nebo pomoc se zavazadly. Vyberte konkrétní službu ze seznamu. Pokud zde potřebnou možnost nenajdete, obraťte se prosím na recepci.",
      housekeeping:
        "Zde si můžete vyžádat konkrétní vybavení a služby pro pokoj – ručníky, toaletní papír, polštář, přikrývku, župan, pantofle, dětskou postýlku, žehličku, minibar nebo praní. Pokud potřebná možnost není v seznamu, obraťte se prosím na recepci.",
      maintenance:
        "Zde můžete odeslat konkrétní technický problém přímo údržbě – klimatizace, teplá voda, televize, osvětlení, koupelna a další závady.",
    },
    ru: {
      reception:
        "Здесь можно заказать такси, поздний выезд, звонок-будильник или помощь с багажом. Выберите конкретную услугу из списка. Если нужной услуги нет, пожалуйста, обратитесь на ресепшен.",
      housekeeping:
        "Здесь можно заказать конкретные принадлежности и услуги для номера – полотенца, туалетную бумагу, подушку, одеяло, халат, тапочки, детскую кроватку, утюг, мини-бар или прачечную. Если нужного пункта нет в списке, пожалуйста, обратитесь на ресепшен.",
      maintenance:
        "Здесь можно отправить конкретную техническую проблему напрямую в техническую службу – кондиционер, горячая вода, телевизор, освещение, ванная комната и другие неисправности.",
    },
  };

  return copy[lang]?.[department] ?? copy.bg[department];
}

function normalizeAiAcknowledgement(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function getLocalAiAcknowledgement(question: string, lang: LangKey) {
  const normalized = normalizeAiAcknowledgement(question);
  if (!normalized || normalized.length > 40) return "";

  const phrases: Record<LangKey, string[]> = {
    bg: ["супер", "благодаря", "мерси", "ясно", "разбрах", "добре", "ок", "страхотно", "чудесно"],
    en: ["great", "thanks", "thank you", "perfect", "okay", "ok", "got it", "super"],
    de: ["super", "danke", "vielen dank", "perfekt", "okay", "ok", "verstanden", "alles klar"],
    ro: ["super", "multumesc", "mersi", "perfect", "bine", "ok", "am inteles"],
    cs: ["super", "dekuji", "diky", "perfektni", "skvele", "ok", "rozumim"],
    ru: ["супер", "спасибо", "отлично", "понятно", "хорошо", "ок", "благодарю"],
  };

  const replies: Record<LangKey, string> = {
    bg: "Радвам се, че помогнах. Можете да попитате още нещо за хотела.",
    en: "Glad I could help. You can ask me another question about the hotel.",
    de: "Gern geschehen. Sie können mir gern noch eine Frage zum Hotel stellen.",
    ro: "Cu plăcere. Puteți să mă întrebați și altceva despre hotel.",
    cs: "Rádo se stalo. Můžete se zeptat na cokoli dalšího o hotelu.",
    ru: "Рад, что помог. Вы можете задать ещё один вопрос об отеле.",
  };

  const isAcknowledgement = phrases[lang].some(
    (phrase) => normalizeAiAcknowledgement(phrase) === normalized
  );

  return isAcknowledgement ? replies[lang] : "";
}

function isDisallowedGenericDepartmentRequest(def: RequestDef) {
  const category = String(def.category || "").trim().toLowerCase();
  if (category !== "reception" && category !== "housekeeping") return false;

  const idText = normalizeAiAcknowledgement(
    [def.id, def.requestType, def.section, def.subsection].filter(Boolean).join(" ")
  );

  if (
    idText === "other" ||
    idText === "other request" ||
    idText === `${category} other` ||
    idText === `other ${category}` ||
    idText === `${category} other request` ||
    idText === `other request ${category}`
  ) {
    return true;
  }

  const localizedText = normalizeAiAcknowledgement(
    [
      ...Object.values(def.title || {}),
      ...Object.values(def.subtitle || {}),
      ...Object.values(def.description || {}),
    ]
      .filter(Boolean)
      .join(" ")
  );

  const genericLabels = [
    "other request",
    "another request",
    "general request",
    "custom request",
    "друга заявка",
    "друго искане",
    "друго желание",
    "andere anfrage",
    "sonstige anfrage",
    "weitere anfrage",
    "alta solicitare",
    "alta cerere",
    "jiny pozadavek",
    "jina zadost",
    "другая заявка",
    "другой запрос",
    "другое пожелание",
  ];

  return genericLabels.some((label) => localizedText.includes(normalizeAiAcknowledgement(label)));
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
  const guestHubPathname = usePathname();
  const isAquamarineHub = /\/h\/aquamarine(?:-test)?(?:\/|$)/i.test(guestHubPathname);
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
    void trackHubEvent({
      eventName: "language_changed",
      eventCategory: "preference",
      section: "language",
      sectionKey: "language",
      label: "language",
      value: String(safeLang),
      language: String(safeLang),
    });
  }, []);
  const hubOpenTrackedRef = useRef(false);

  const [aiQ, setAiQ] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiHistory, setAiHistory] = useState<AiChatMessage[]>([]);
  const aiConversationRef = useRef<HTMLDivElement | null>(null);
  const aiRequestSeqRef = useRef(0);
  const [openQuickServiceId, setOpenQuickServiceId] = useState<string | null>(null);
  const [showRoomSwitchCard, setShowRoomSwitchCard] = useState(false);
  const [aiRequestNavigation, setAiRequestNavigation] = useState<{
    targetId: string;
    sectionId: string;
    groupId: string | null;
    nonce: number;
  } | null>(null);
  const [guestSectionsCollapseToken, setGuestSectionsCollapseToken] = useState(0);

  const collapseGuestHubSectionsAfterAction = useCallback(() => {
    setOpenQuickServiceId(null);
    setAiRequestNavigation(null);
    setGuestSectionsCollapseToken((value) => value + 1);
  }, []);

  const AI_RESET_AFTER_MS = 5 * 60 * 1000;

  const appHiddenAtRef = useRef<number | null>(null);

  const clearAiState = useCallback(() => {
    aiRequestSeqRef.current += 1;
    setAiQ("");
    setAiAnswer("");
    setAiLoading(false);
    setAiHistory([]);
  }, []);

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
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [activeStayId, setActiveStayId] = useState("");
  const [stayDeviceId, setStayDeviceId] = useState("");
  const [stayDeviceToken, setStayDeviceToken] = useState("");
  const [effectiveCheckOutAt, setEffectiveCheckOutAt] = useState("");
  const [stayConfirming, setStayConfirming] = useState(false);
  const stayExpiredNotifiedRef = useRef(false);
  const [ignoredQrRoom, setIgnoredQrRoom] = useState<string | null>(null);
  const [roomModal, setRoomModal] = useState<{
    mode: "confirm" | "switch";
    nextRoom: string;
    currentRoom?: string;
    source?: "url_param" | "manual_input" | "manual_input_switch" | "url_param_switch";
  } | null>(null);
  const roomPromptTrackedRef = useRef<Set<string>>(new Set());
  const [roomStateHydrated, setRoomStateHydrated] = useState(false);
  const [pendingRoomChangeFrom, setPendingRoomChangeFrom] = useState<string | null>(null);

  const [requestDialog, setRequestDialog] = useState<RequestDialogState>(null);
  const [guestRequestRefs, setGuestRequestRefs] = useState<StoredGuestRequestRef[]>(() => readStoredGuestRequestRefs());
  const [guestMassageBookings, setGuestMassageBookings] = useState<StoredGuestMassageBooking[]>(() => pruneStoredGuestMassageBookings());
  const [showGuestIntro, setShowGuestIntro] = useState(false);

  const guestIntroStorageKey = useMemo(() => {
    const scope = String(roomStateKey || config.hotelSlug || "default").trim().toLowerCase();
    return `${GUEST_INTRO_STORAGE_PREFIX}:${GUEST_INTRO_VERSION}:${scope || "default"}`;
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
  const testRoomSet = useMemo(
    () => new Set((config.testRoomNumbers || []).map(normalizeRoomNumber).filter(Boolean)),
    [config.testRoomNumbers],
  );
  const isDateExemptTestRoom = useCallback(
    (candidate: unknown) => testRoomSet.has(normalizeRoomNumber(candidate)),
    [testRoomSet],
  );

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
    const storedCheckInDate = normalizeStayDateKey(storedRoomState?.checkInDate);
    const storedCheckOutDate = normalizeStayDateKey(storedRoomState?.checkOutDate);
    const storedStayId = String(storedRoomState?.stayId || "").trim();
    const storedStayDeviceId = String(storedRoomState?.stayDeviceId || "").trim();
    const storedDeviceToken = String(storedRoomState?.deviceToken || "").trim() || getOrCreateGuestStayDeviceToken();
    const hasCompleteStay = Boolean(
      storedRoomState?.roomConfirmed &&
      storedRoom &&
      storedCheckInDate &&
      storedCheckOutDate &&
      storedStayId &&
      storedStayDeviceId &&
      storedDeviceToken
    );

    setCheckInDate(storedCheckInDate);
    setCheckOutDate(storedCheckOutDate);
    setActiveStayId(storedStayId);
    setStayDeviceId(storedStayDeviceId);
    setStayDeviceToken(storedDeviceToken);
    setEffectiveCheckOutAt(String(storedRoomState?.effectiveCheckOutAt || ""));

    if (hasCompleteStay && !isKnownHotelRoom(storedRoom)) {
      setManualRoomInput("");
      setRoom("");
      setRoomConfirmed(false);
      setActiveStayId("");
      setStayDeviceId("");
      setIgnoredQrRoom(null);
      setRoomModal(null);
      setRoomStateHydrated(true);
      return;
    }

    if (!qrRoom) {
      if (hasCompleteStay) {
        setManualRoomInput(storedRoom);
        setRoom(storedRoom);
        setRoomConfirmed(true);
      } else {
        setManualRoomInput(storedRoom || "");
        setRoom("");
        setRoomConfirmed(false);
      }

      setIgnoredQrRoom(null);
      setRoomModal(null);
      setRoomStateHydrated(true);
      return;
    }

    if (hasCompleteStay && storedRoom !== qrRoom) {
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
          source: "url_param_switch",
        });
      }

      setRoomStateHydrated(true);
      return;
    }

    if (hasCompleteStay && storedRoom === qrRoom) {
      setManualRoomInput(qrRoom);
      setRoom(qrRoom);
      setRoomConfirmed(true);
      setIgnoredQrRoom(null);
      setRoomModal(null);
      setRoomStateHydrated(true);
      return;
    }

    // A room number from the QR is only a prefill. The guest must still enter
    // the stay dates so the device can be linked to the correct hotel stay.
    setManualRoomInput(qrRoom);
    setRoom("");
    setRoomConfirmed(false);
    setActiveStayId("");
    setStayDeviceId("");
    setEffectiveCheckOutAt("");
    setIgnoredQrRoom(null);
    setRoomModal(null);
    setRoomStateHydrated(true);
  }, [roomStateKey, qrRoom, ignoredQrRoom, isKnownHotelRoom]);

  useEffect(() => {
    persistQrContextFromUrl();

    if (hubOpenTrackedRef.current) return;
    hubOpenTrackedRef.current = true;

    void trackHubEvent({
      eventName: "hub_open",
      eventCategory: "session",
      roomNumber: qrRoom || undefined,
      roomSource: qrRoom ? "url_param" : undefined,
      language: String(lang),
      page: window.location.pathname + window.location.search,
    });
  }, [qrRoom, lang]);

  const trackGuestEvent = useCallback((payload: TrackHubPayload) => {
    void trackHubEvent({
      ...payload,
      roomNumber: payload.roomNumber ?? (roomConfirmed && room ? room : undefined),
      roomConfirmed: payload.roomConfirmed ?? (roomConfirmed && Boolean(room)),
      roomSource: payload.roomSource ?? (roomConfirmed && room ? "confirmed" : undefined),
      language: payload.language ?? String(lang),
      stayId: (payload.stayId ?? activeStayId) || undefined,
      stayDeviceId: (payload.stayDeviceId ?? stayDeviceId) || undefined,
      page: payload.page ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined),
    });
  }, [activeStayId, lang, room, roomConfirmed, stayDeviceId]);

  useEffect(() => {
    if (!roomModal?.nextRoom) return;

    const key = `${roomModal.mode}:${roomModal.currentRoom || ""}:${roomModal.nextRoom}:${roomModal.source || ""}`;
    if (roomPromptTrackedRef.current.has(key)) return;
    roomPromptTrackedRef.current.add(key);

    trackGuestEvent({
      eventName: "room_confirm_prompt_shown",
      eventCategory: "room",
      section: "room",
      sectionKey: "room",
      label: roomModal.mode,
      value: roomModal.nextRoom,
      roomNumber: roomModal.nextRoom,
      roomConfirmed: false,
      roomSource: roomModal.source || "manual_input",
      extra: {
        currentRoom: roomModal.currentRoom || null,
        nextRoom: roomModal.nextRoom,
      },
    });
  }, [roomModal, trackGuestEvent]);

  useEffect(() => {
    if (!roomStateKey) return;
    if (!roomStateHydrated) return;
    if (roomModal?.mode === "switch") return;

    writeStoredGuestRoomState(roomStateKey, {
      manualRoomInput,
      room,
      roomConfirmed,
      checkInDate,
      checkOutDate,
      stayId: activeStayId,
      stayDeviceId,
      deviceToken: stayDeviceToken,
      effectiveCheckOutAt,
    });
  }, [
    activeStayId,
    checkInDate,
    checkOutDate,
    effectiveCheckOutAt,
    manualRoomInput,
    room,
    roomConfirmed,
    roomModal,
    roomStateHydrated,
    roomStateKey,
    stayDeviceId,
    stayDeviceToken,
  ]);

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

  const hotelTimezone = String(
    (config as any).timezone ??
      (config as any).hotelTimezone ??
      rawConfig.timezone ??
      rawConfig.hotelTimezone ??
      "Europe/Sofia"
  ).trim() || "Europe/Sofia";

  const hotelTodayDateKey = getDateKeyInClientTimezone(hotelTimezone);


  const [weatherData, setWeatherData] = useState<GuestWeatherPayload | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState(false);
  const [weatherClock, setWeatherClock] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setWeatherClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let refreshTimer: number | undefined;

    const loadWeather = async () => {
      try {
        setWeatherLoading(true);
        const params = new URLSearchParams();
        if (Number.isFinite(hotelLatitude)) params.set("lat", String(hotelLatitude));
        if (Number.isFinite(hotelLongitude)) params.set("lon", String(hotelLongitude));
        if (config.location?.query) params.set("query", String(config.location.query));
        if (config.hotelName) params.set("place", String(config.hotelName));
        params.set("tz", hotelTimezone);

        const response = await fetch(`/api/weather?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = (await response.json()) as GuestWeatherPayload;
        if (!response.ok || !payload?.ok) throw new Error("weather_unavailable");

        setWeatherData(payload);
        setWeatherError(false);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        console.error("Guest weather load failed", error);
        setWeatherError(true);
      } finally {
        setWeatherLoading(false);
      }
    };

    void loadWeather();
    refreshTimer = window.setInterval(() => void loadWeather(), 10 * 60_000);

    return () => {
      controller.abort();
      if (refreshTimer) window.clearInterval(refreshTimer);
    };
  }, [config.hotelName, config.location?.query, hotelLatitude, hotelLongitude, hotelTimezone]);

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
          : lang === "ru"
            ? "Эта функция доступна только на территории отеля. Разрешите доступ к местоположению и попробуйте снова."
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
                  : lang === "ru"
                    ? "Эта функция доступна только на территории отеля."
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
        ? ["ro", "en", "bg", "de", "cs", "ru"]
        : currentLang === "cs"
          ? ["cs", "en", "bg", "de", "ro", "ru"]
          : currentLang === "ru"
            ? ["ru", "en", "bg", "de", "ro", "cs"]
            : [currentLang, "en", "bg", "de", "ro", "cs", "ru"];

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

  const stayCopy = useMemo(() => {
    const copy = {
      bg: {
        checkInLabel: "Дата на настаняване",
        checkOutLabel: "Дата на напускане",
        stayHelp: "Настаняване след 15:00 · Напускане до 12:00",
        missingDates: "Моля, въведете датите на настаняване и напускане.",
        invalidDates: "Датата на напускане трябва да е след датата на настаняване.",
        currentStayOnly: "Въведете датите на текущия си престой.",
        stayTooLong: "Проверете датите на престоя. Максималният период е 30 нощувки.",
        confirmLine: "Престой: {checkIn} – {checkOut}",
        confirmedLine: "{checkIn} – {checkOut}",
        confirming: "Потвърждаване…",
        confirmFailed: "Престоят не беше потвърден. Моля, проверете данните и опитайте отново.",
        stayConflict: "За тази стая вече има активен престой с припокриващи се дати. Проверете датите или се свържете с рецепцията.",
        expired: "Предишният престой е приключил. Моля, въведете данните за текущия престой.",
        testRoomNoDates: "Тестова стая — не се изискват дати на престой.",
      },
      en: {
        checkInLabel: "Check-in date",
        checkOutLabel: "Check-out date",
        stayHelp: "Check-in after 15:00 · Check-out by 12:00",
        missingDates: "Please enter your check-in and check-out dates.",
        invalidDates: "The check-out date must be after the check-in date.",
        currentStayOnly: "Please enter the dates of your current stay.",
        stayTooLong: "Please check the stay dates. The maximum period is 30 nights.",
        confirmLine: "Stay: {checkIn} – {checkOut}",
        confirmedLine: "{checkIn} – {checkOut}",
        confirming: "Confirming…",
        confirmFailed: "The stay could not be confirmed. Please check the details and try again.",
        stayConflict: "This room already has an active stay with overlapping dates. Please check the dates or contact Reception.",
        expired: "The previous stay has ended. Please enter the details of the current stay.",
        testRoomNoDates: "Test room — stay dates are not required.",
      },
      de: {
        checkInLabel: "Anreisedatum",
        checkOutLabel: "Abreisedatum",
        stayHelp: "Check-in ab 15:00 · Check-out bis 12:00",
        missingDates: "Bitte geben Sie Anreise- und Abreisedatum ein.",
        invalidDates: "Das Abreisedatum muss nach dem Anreisedatum liegen.",
        currentStayOnly: "Bitte geben Sie die Daten Ihres aktuellen Aufenthalts ein.",
        stayTooLong: "Bitte prüfen Sie die Aufenthaltsdaten. Maximal sind 30 Nächte möglich.",
        confirmLine: "Aufenthalt: {checkIn} – {checkOut}",
        confirmedLine: "{checkIn} – {checkOut}",
        confirming: "Wird bestätigt…",
        confirmFailed: "Der Aufenthalt konnte nicht bestätigt werden. Bitte prüfen Sie die Angaben.",
        stayConflict: "Für dieses Zimmer gibt es bereits einen aktiven Aufenthalt mit überschneidenden Daten. Bitte prüfen Sie die Daten oder kontaktieren Sie die Rezeption.",
        expired: "Der vorherige Aufenthalt ist beendet. Bitte geben Sie die Daten des aktuellen Aufenthalts ein.",
        testRoomNoDates: "Testzimmer — Aufenthaltsdaten sind nicht erforderlich.",
      },
      ro: {
        checkInLabel: "Data sosirii",
        checkOutLabel: "Data plecării",
        stayHelp: "Cazare după 15:00 · Eliberare până la 12:00",
        missingDates: "Introduceți datele sosirii și plecării.",
        invalidDates: "Data plecării trebuie să fie după data sosirii.",
        currentStayOnly: "Introduceți datele sejurului curent.",
        stayTooLong: "Verificați datele sejurului. Perioada maximă este de 30 de nopți.",
        confirmLine: "Sejur: {checkIn} – {checkOut}",
        confirmedLine: "{checkIn} – {checkOut}",
        confirming: "Se confirmă…",
        confirmFailed: "Sejurul nu a putut fi confirmat. Verificați datele și încercați din nou.",
        stayConflict: "Pentru această cameră există deja un sejur activ cu date care se suprapun. Verificați datele sau contactați recepția.",
        expired: "Sejurul anterior s-a încheiat. Introduceți datele sejurului curent.",
        testRoomNoDates: "Cameră de test — datele sejurului nu sunt necesare.",
      },
      cs: {
        checkInLabel: "Datum příjezdu",
        checkOutLabel: "Datum odjezdu",
        stayHelp: "Ubytování po 15:00 · Odjezd do 12:00",
        missingDates: "Zadejte datum příjezdu a odjezdu.",
        invalidDates: "Datum odjezdu musí být po datu příjezdu.",
        currentStayOnly: "Zadejte data aktuálního pobytu.",
        stayTooLong: "Zkontrolujte data pobytu. Maximální délka je 30 nocí.",
        confirmLine: "Pobyt: {checkIn} – {checkOut}",
        confirmedLine: "{checkIn} – {checkOut}",
        confirming: "Potvrzování…",
        confirmFailed: "Pobyt se nepodařilo potvrdit. Zkontrolujte údaje a zkuste to znovu.",
        stayConflict: "Pro tento pokoj již existuje aktivní pobyt s překrývajícími se daty. Zkontrolujte data nebo kontaktujte recepci.",
        expired: "Předchozí pobyt skončil. Zadejte údaje aktuálního pobytu.",
        testRoomNoDates: "Testovací pokoj — data pobytu nejsou vyžadována.",
      },
      ru: {
        checkInLabel: "Дата заезда",
        checkOutLabel: "Дата выезда",
        stayHelp: "Заселение после 15:00 · Выезд до 12:00",
        missingDates: "Введите даты заезда и выезда.",
        invalidDates: "Дата выезда должна быть позже даты заезда.",
        currentStayOnly: "Введите даты текущего проживания.",
        stayTooLong: "Проверьте даты проживания. Максимальный срок — 30 ночей.",
        confirmLine: "Проживание: {checkIn} – {checkOut}",
        confirmedLine: "{checkIn} – {checkOut}",
        confirming: "Подтверждение…",
        confirmFailed: "Не удалось подтвердить проживание. Проверьте данные и повторите попытку.",
        stayConflict: "Для этого номера уже существует активное проживание с пересекающимися датами. Проверьте даты или свяжитесь с рецепцией.",
        expired: "Предыдущее проживание завершено. Введите данные текущего проживания.",
        testRoomNoDates: "Тестовый номер — даты проживания не требуются.",
      },
    } as const;
    return copy[lang as keyof typeof copy] || copy.en;
  }, [lang]);

  useEffect(() => {
    if (!roomStateHydrated || !roomConfirmed || !activeStayId || !stayDeviceId || !stayDeviceToken) return;

    let cancelled = false;
    const refreshStay = async () => {
      try {
        const response = await fetch("/api/guest/stay/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            hotelSlug: String(config.hotelSlug || roomStateKey || "aquamarin"),
            stayId: activeStayId,
            stayDeviceId,
            deviceToken: stayDeviceToken,
          }),
        });
        const payload = await response.json().catch(() => null) as { ok?: boolean; stay?: GuestStaySummary } | null;
        if (cancelled || !response.ok || !payload?.ok || !payload.stay) return;

        setEffectiveCheckOutAt(payload.stay.effectiveCheckOutAt);
        if (payload.stay.active) return;

        setRoomConfirmed(false);
        setRoom("");
        setActiveStayId("");
        setStayDeviceId("");
        setEffectiveCheckOutAt("");
        setManualRoomInput(qrRoom || "");
        if (!stayExpiredNotifiedRef.current) {
          stayExpiredNotifiedRef.current = true;
          window.alert(stayCopy.expired);
        }
      } catch (error) {
        console.error("guest stay status refresh failed", error);
      }
    };

    void refreshStay();
    const handleFocus = () => void refreshStay();
    const interval = window.setInterval(() => void refreshStay(), 5 * 60_000);
    window.addEventListener("focus", handleFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [
    activeStayId,
    config.hotelSlug,
    qrRoom,
    roomConfirmed,
    roomStateHydrated,
    roomStateKey,
    stayCopy.expired,
    stayDeviceId,
    stayDeviceToken,
  ]);


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
      ru: {
        roomBadge: "Номер {room}",
        cardTitle: "Подтвердите номер комнаты",
        cardText: "Чтобы открыть функции отеля, введите и подтвердите номер комнаты.",
        inputLabel: "Номер комнаты",
        inputPlaceholder: "Например: 204",
        confirmButton: "Подтвердить номер",
        confirmMessage: "Вы уверены, что это ваш номер?\nНомер {room}",
        confirmedState: "Подтверждённый номер: {room}",
        changeRoom: "Сменить номер",
        changeRoomWarningTitle: "Смена номера",
        changeRoomWarningText: "Меняйте активный номер только в том случае, если вас действительно переселили. Затем введите и подтвердите новый номер.",
        changeRoomContinue: "Продолжить",
        lockedNotice: "Закрытые разделы откроются после ввода номера комнаты.",
        lockedSectionMessage: "Подтвердите номер комнаты, чтобы открыть этот раздел.",
        missingRoomAlert: "Пожалуйста, введите номер комнаты.",
        invalidRoomAlert: "Пожалуйста, введите действительный номер комнаты отеля.",
        missingRoomQrAlert: "Номер комнаты отсутствует. Отсканируйте QR-код ещё раз или введите номер вручную.",
        requestSent: "Запрос отправлен: {typeLabel}",
        requestAcceptedTitle: "Запрос принят",
        requestAcceptedText: "Ваш запрос принят и будет обработан как можно скорее.",
        requestSendingTitle: "Отправка запроса",
        requestSendingText: "Пожалуйста, подождите. Отправляется: {typeLabel}",
        requestFailed: "Не удалось отправить запрос. Попробуйте ещё раз.",
        myRequestsTitle: "Мои запросы",
        myRequestsEmpty: "С этого устройства ещё не было отправлено запросов.",
        myRequestsLoading: "Загрузка статусов...",
        refreshRequests: "Обновить",
        status_new: "Принят",
        status_in_progress: "В работе",
        status_completed: "Выполнен",
        status_returned: "Принят",
        lockedActionAlert: "Сначала подтвердите номер комнаты, чтобы открыть функции.",
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

    if (lang === "bg" || lang === "en" || lang === "de" || lang === "ro" || lang === "cs" || lang === "ru") {
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
      ru:
        "Я могу помочь только с информацией об отеле: рестораны, бары, часы работы, СПА, детский клуб, игровая комната, удобства и услуги отеля.",
      ro:
        "Pot ajuta doar cu informații despre hotel: restaurante, baruri, program, spa, club pentru copii, sală de jocuri, facilități și servicii ale hotelului.",
      cs:
        "Mohu pomoci pouze s informacemi o hotelu: restaurace, bary, otevírací doba, spa, dětský klub, herna, vybavení a hotelové služby.",
    } as const;

    const translated = String(tUI("ai_intro") || "").trim();

    if (translated && translated !== "ai_intro") {
      return translated;
    }

    return map[(lang as "bg" | "en" | "de" | "ru" | "ro" | "cs")] || map.bg;
  }, [lang, tUI]);

  const aiChatCopy = useMemo(() => {
    const copy = {
      bg: { newConversation: "Нов разговор", followUp: "Попитайте още…" },
      en: { newConversation: "New conversation", followUp: "Ask another question…" },
      de: { newConversation: "Neues Gespräch", followUp: "Weitere Frage stellen…" },
      ro: { newConversation: "Conversație nouă", followUp: "Puneți o altă întrebare…" },
      cs: { newConversation: "Nová konverzace", followUp: "Zeptejte se dál…" },
      ru: { newConversation: "Новый разговор", followUp: "Задайте ещё вопрос…" },
    } as const;
    return copy[(lang as keyof typeof copy)] || copy.en;
  }, [lang]);

  const aiActionCopy = useMemo(() => {
    const copy = {
      bg: { request: "Заяви", order: "Поръчай", choose: "Избери", reserve: "Резервирай" },
      en: { request: "Request", order: "Order", choose: "Choose", reserve: "Reserve" },
      de: { request: "Anfragen", order: "Bestellen", choose: "Auswählen", reserve: "Reservieren" },
      ro: { request: "Solicită", order: "Comandă", choose: "Alege", reserve: "Rezervă" },
      cs: { request: "Požádat", order: "Objednat", choose: "Vybrat", reserve: "Rezervovat" },
      ru: { request: "Запросить", order: "Заказать", choose: "Выбрать", reserve: "Забронировать" },
    } as const;
    return copy[(lang as keyof typeof copy)] || copy.en;
  }, [lang]);

  useEffect(() => {
    const container = aiConversationRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [aiHistory, aiLoading, aiPanelOpen]);

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

  const preStayUnlockedSectionIds = new Set(["hotel_policies", "emergency"]);

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

  const validateGuestStayDates = useCallback((roomCandidate: unknown) => {
    if (isDateExemptTestRoom(roomCandidate)) {
      return { checkInDate: "", checkOutDate: "", datesRequired: false as const };
    }

    const normalizedCheckIn = normalizeStayDateKey(checkInDate);
    const normalizedCheckOut = normalizeStayDateKey(checkOutDate);

    if (!normalizedCheckIn || !normalizedCheckOut) {
      window.alert(stayCopy.missingDates);
      return null;
    }

    const nights = getStayLengthNights(normalizedCheckIn, normalizedCheckOut);
    if (nights < 1) {
      window.alert(stayCopy.invalidDates);
      return null;
    }
    if (nights > 30) {
      window.alert(stayCopy.stayTooLong);
      return null;
    }
    if (normalizedCheckIn > hotelTodayDateKey || normalizedCheckOut < hotelTodayDateKey) {
      window.alert(stayCopy.currentStayOnly);
      return null;
    }

    return { checkInDate: normalizedCheckIn, checkOutDate: normalizedCheckOut, datesRequired: true as const };
  }, [checkInDate, checkOutDate, hotelTodayDateKey, isDateExemptTestRoom, stayCopy]);

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

    if (!validateGuestStayDates(candidate)) return;

    setManualRoomInput(candidate);
    setGeoMessage(null);

    const storedRoomState = readStoredGuestRoomState(roomStateKey);
    const storedRoom = normalizeRoomNumber(storedRoomState?.room);
    const storedConfirmed = Boolean(storedRoomState?.roomConfirmed && storedRoomState?.stayId);

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
        source: "manual_input_switch",
      });
      return;
    }

    setIgnoredQrRoom(null);
    setRoomModal({
      mode: "confirm",
      nextRoom: candidate,
      source: "manual_input",
    });
  };

  const isRoomSwitchConfirmation = roomModal?.mode === "switch";

  const acceptRoomConfirmation = async () => {
    if (!roomModal?.nextRoom || stayConfirming) return;

    const nextRoom = normalizeRoomNumber(roomModal.nextRoom);
    const dates = validateGuestStayDates(nextRoom);
    if (!dates) return;

    if (!isKnownHotelRoom(nextRoom)) {
      window.alert(roomCopy.invalidRoomAlert);
      setManualRoomInput(nextRoom);
      setRoom("");
      setRoomConfirmed(false);
      setRoomModal(null);
      setPendingRoomChangeFrom(null);
      return;
    }

    const deviceToken = stayDeviceToken || getOrCreateGuestStayDeviceToken();
    if (!deviceToken) {
      window.alert(stayCopy.confirmFailed);
      return;
    }

    try {
      setStayConfirming(true);
      const response = await fetch("/api/guest/stay/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelSlug: String(config.hotelSlug || hotelContentSlug || "aquamarin"),
          room: nextRoom,
          ...(dates.datesRequired
            ? {
                checkInDate: dates.checkInDate,
                checkOutDate: dates.checkOutDate,
              }
            : {}),
          deviceToken,
          language: String(lang),
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; stay?: GuestStaySummary; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.stay) {
        throw new Error(payload?.error || "STAY_CONFIRM_FAILED");
      }

      const confirmedStay = payload.stay;
      const previousRoom = roomModal.currentRoom || pendingRoomChangeFrom;
      const isRoomChange = Boolean(previousRoom && previousRoom !== nextRoom);

      setIgnoredQrRoom(null);
      setManualRoomInput(nextRoom);
      setRoom(nextRoom);
      setRoomConfirmed(true);
      setCheckInDate(confirmedStay.checkInDate);
      setCheckOutDate(confirmedStay.checkOutDate);
      setActiveStayId(confirmedStay.id);
      setStayDeviceId(confirmedStay.stayDeviceId);
      setStayDeviceToken(confirmedStay.deviceToken);
      setEffectiveCheckOutAt(confirmedStay.effectiveCheckOutAt);
      setRoomModal(null);
      setPendingRoomChangeFrom(null);
      setShowRoomSwitchCard(false);

      const confirmedRoomUrl = new URL(window.location.href);
      confirmedRoomUrl.searchParams.set("room", nextRoom);
      window.history.replaceState(
        window.history.state,
        "",
        `${confirmedRoomUrl.pathname}${confirmedRoomUrl.search}${confirmedRoomUrl.hash}`
      );

      trackGuestEvent({
        eventName: isRoomChange ? "room_changed" : "room_confirmed",
        eventCategory: "room",
        section: "room",
        sectionKey: "room",
        label: isRoomChange ? "room_changed" : "room_confirmed",
        value: nextRoom,
        roomNumber: nextRoom,
        roomConfirmed: true,
        roomSource: "confirmed",
        stayId: confirmedStay.id,
        stayDeviceId: confirmedStay.stayDeviceId,
        extra: {
          fromRoom: isRoomChange ? previousRoom : null,
          toRoom: nextRoom,
          modalSource: roomModal.source || null,
          checkInDate: confirmedStay.checkInDate,
          checkOutDate: confirmedStay.checkOutDate,
          effectiveCheckOutAt: confirmedStay.effectiveCheckOutAt,
          datesRequired: confirmedStay.datesRequired,
        },
      });
    } catch (error) {
      console.error("guest stay confirmation failed", error);
      const errorCode = error instanceof Error ? error.message : "STAY_CONFIRM_FAILED";
      const errorMessage =
        errorCode === "STAY_DATES_CONFLICT"
          ? stayCopy.stayConflict
          : errorCode === "STAY_ENDED"
            ? stayCopy.expired
            : errorCode === "STAY_NOT_CURRENT"
              ? stayCopy.currentStayOnly
              : errorCode === "STAY_TOO_OLD"
                ? stayCopy.stayTooLong
                : errorCode === "INVALID_STAY_DATES"
                  ? stayCopy.invalidDates
                  : errorCode === "MISSING_STAY_FIELDS"
                    ? stayCopy.missingDates
                    : stayCopy.confirmFailed;
      window.alert(errorMessage);
    } finally {
      setStayConfirming(false);
    }
  };

  const cancelRoomConfirmation = () => {
    if (roomModal?.nextRoom) {
      trackGuestEvent({
        eventName: roomModal.mode === "switch" ? "room_change_cancelled" : "room_confirm_rejected",
        eventCategory: "room",
        section: "room",
        sectionKey: "room",
        label: roomModal.mode,
        value: roomModal.nextRoom,
        roomNumber: roomModal.nextRoom,
        roomConfirmed: false,
        roomSource: roomModal.source || "manual_input",
        extra: {
          currentRoom: roomModal.currentRoom || null,
          nextRoom: roomModal.nextRoom,
        },
      });
    }

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
    onCancel,
  }: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  }) => {
    setOpenQuickServiceId(null);
    setRequestDialog({
      title,
      message,
      confirmLabel,
      cancelLabel,
      onConfirm,
      onCancel,
    });
  };

  const closeRequestDialog = () => {
    const action = requestDialog?.onCancel;
    setRequestDialog(null);
    action?.();
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
      cancelLabel: lang === "bg" ? "Отказ" : lang === "de" ? "Abbrechen" : lang === "ru" ? "Отмена" : "Cancel",
      onConfirm: () => {
        trackGuestEvent({
          eventName: "room_change_started",
          eventCategory: "room",
          section: "room",
          sectionKey: "room",
          label: "room_change_started",
          value: room,
          roomNumber: room,
          roomConfirmed: true,
          roomSource: "confirmed",
          extra: {
            fromRoom: room,
          },
        });

        setPendingRoomChangeFrom(room);
        setManualRoomInput("");
        setRoom("");
        setRoomConfirmed(false);
        if (isDateExemptTestRoom(room)) {
          setCheckInDate("");
          setCheckOutDate("");
        }
        setIgnoredQrRoom(null);
        setRoomModal(null);

        const roomChangeUrl = new URL(window.location.href);
        roomChangeUrl.searchParams.delete("room");

        window.history.replaceState(
          window.history.state,
          "",
          `${roomChangeUrl.pathname}${roomChangeUrl.search}${roomChangeUrl.hash}`
        );
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
          !hiddenGuestRequestIds.has(String(def.id).trim().toLowerCase()) &&
          !isDisallowedGenericDepartmentRequest(def)
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
      const rawMessage = [
        getRequestDefField(def, "description"),
        getRequestDefField(def, "policy"),
        getRequestDefField(def, "subtitle"),
      ]
        .map((item) => String(item || "").trim())
        .filter((item) => item && !junkValues.has(item.toLowerCase()))
        .join("\n\n");

      const defId = String(def.id || "").trim().toLowerCase();
      const requestType = String(def.requestType || "").trim().toLowerCase();
      const currentHotelSlug = String((config as any)?.hotelSlug || "").trim().toLowerCase();
      const isAquamarine =
        ["aquamarin", "aquamarine"].includes(currentHotelSlug) ||
        /aquamarine/i.test(String(config.hotelName || ""));
      const isCoffeeCapsules = defId === "coffee_capsules" || requestType === "coffee_capsules";

      // Keep old descriptive texts from Google Sheets consistent with the
      // current Aquamarine unit price until the sheet cache is refreshed.
      if (isAquamarine && isCoffeeCapsules) {
        return rawMessage.replace(/2(?:[.,]00)\s*(€|EUR)/gi, "2,05 €");
      }

      return rawMessage;
    },
    [config, getRequestDefField]
  );

  const getRequestDefTitle = useCallback(
    (def?: RequestDef | null) => {
      if (!def) return "";

      const defId = String(def.id || "").trim().toLowerCase();
      const requestType = String(def.requestType || "").trim().toLowerCase();
      if (defId === "coffee_machine" || requestType === "coffee_machine") {
        return getPremiumSectionCopy(lang).coffeeMachineIssue;
      }

      const title = String(getRequestDefField(def, "title") || "").trim();
      const junkValues = new Set(["true", "false", "yes", "no", "eur", "bgn", "usd", "none"]);
      if (!title || junkValues.has(title.toLowerCase())) return "";
      return title;
    },
    [getRequestDefField, lang]
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
        : lang === "ru"
          ? "Поздний выезд предоставляется за дополнительную плату. Точные условия и стоимость подтверждаются на рецепции."
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
      ru: (section: string) => `Отправьте запрос через раздел ${section} в хабе.`,
    } as const;

    const slotLabelByLang = {
      bg: (slots: string) => `Налични часове: ${slots}.`,
      en: (slots: string) => `Available times: ${slots}.`,
      de: (slots: string) => `Verfügbare Zeiten: ${slots}.`,
      ru: (slots: string) => `Доступное время: ${slots}.`,
    } as const;

    const currentLang = (lang === "bg" || lang === "en" || lang === "de" || lang === "ru") ? lang : "en";

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
          subsection: def.subsection,
          targetDepartment: def.targetDepartment,
          type: def.type,
          sectionTitle: getTextMapValue(def.sectionTitle),
          options: localizedOptions,
          price: String(def.price || ""),
          currency: String(def.currency || ""),
          pdfUrl: String(def.pdfUrl || ""),
          externalUrl: String(def.externalUrl || ""),
          linkUrl: String(def.linkUrl || ""),
          keywords: [
            def.id,
            def.id.replace(/_/g, " "),
            def.requestType || "",
            def.category || "",
            def.subsection || "",
            def.targetDepartment || "",
            ...def.keywords,
            ...localizedOptions,
          ].filter(Boolean),
        };
      });
  }, [getRequestDefField, getRequestDefMessage, getRequestDefOptions, getTextMapValue, lang, requestDefs, tUI]);

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
      ru: {
        requestFrom: (label: string, section: string) =>
          `Да, вы можете заказать ${label.toLowerCase()} в разделе ${section} хаба.`,
        laundry:
          "Для услуги прачечной, пожалуйста, обратитесь на рецепцию.",
        lateCheckout:
          lateCheckoutInfo ||
          "Поздний выезд предоставляется за дополнительную плату. Окончательные условия и стоимость подтверждает рецепция.",
        wakeUp: `Вы можете заказать звонок-будильник в разделе ${sectionLabels.reception}. Доступное время: ${wakeUpSlots.join(", ")}.`,
        minibar: minibarNotice
          ? `${minibarNotice} Пополнение мини-бара можно заказать в разделе ${sectionLabels.housekeeping}.`
          : `Пополнение мини-бара можно заказать в разделе ${sectionLabels.housekeeping}.`,
        taxi: `Такси можно заказать в разделе ${sectionLabels.reception}.`,
        ac: `О проблеме с кондиционером можно сообщить в разделе ${sectionLabels.maintenance}.`,
        hotWater: `Об отсутствии горячей воды можно сообщить в разделе ${sectionLabels.maintenance}.`,
        broken: `О технической неисправности можно сообщить в разделе ${sectionLabels.maintenance}.`,
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

    const c = copy[(lang === "bg" || lang === "en" || lang === "de" || lang === "ro" || lang === "cs" || lang === "ru") ? lang : "en"];

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
        key: "bathrobe",
        label: String(tUI("bathrobe") || "Bathrobe"),
        description: c.requestFrom(String(tUI("bathrobe") || "Bathrobe"), sectionLabels.housekeeping),
        active: true,
      },
      {
        key: "slippers",
        label: String(tUI("slippers") || "Slippers"),
        description: c.requestFrom(String(tUI("slippers") || "Slippers"), sectionLabels.housekeeping),
        active: true,
      },
      {
        key: "baby_cot",
        label: String(tUI("baby_cot") || "Baby cot"),
        description: c.requestFrom(String(tUI("baby_cot") || "Baby cot"), sectionLabels.housekeeping),
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
      ...[
        ["tv_issue", "tv_issue", "TV issue"],
        ["light_not_working", "light_not_working", "Light issue"],
        ["bathroom_issue", "bathroom_issue", "Bathroom issue"],
        ["door_lock_issue", "door_lock_issue", "Door / lock issue"],
        ["wifi_issue", "wifi_issue", "Wi-Fi issue"],
        ["power_outlet_issue", "power_outlet_issue", "Power outlet issue"],
        ["safe_issue", "safe_issue", "Safe issue"],
        ["balcony_door_issue", "balcony_door_issue", "Balcony door issue"],
        ["minibar_not_cooling", "minibar_not_cooling", "Minibar not cooling"],
        ["coffee_machine", "coffee_machine", "Coffee machine issue"],
      ].map(([key, labelKey, fallback]) => ({
        key,
        label: String(tUI(labelKey) || fallback),
        description: c.broken,
        active: true,
      })),
      {
        key: "other_technical_issue",
        label: String(tUI("something_broken") || "Technical issue"),
        description: c.broken,
        active: true,
      },
    ];

    const legacyDepartments: Record<string, "housekeeping" | "reception" | "maintenance"> = {
      towels: "housekeeping",
      toilet_paper: "housekeeping",
      extra_pillow: "housekeeping",
      extra_blanket: "housekeeping",
      bathrobe: "housekeeping",
      slippers: "housekeeping",
      baby_cot: "housekeeping",
      iron: "housekeeping",
      minibar: "housekeeping",
      laundry: "housekeeping",
      late_checkout: "reception",
      wake_up_call: "reception",
      taxi: "reception",
      air_conditioning: "maintenance",
      no_hot_water: "maintenance",
      tv_issue: "maintenance",
      light_not_working: "maintenance",
      bathroom_issue: "maintenance",
      door_lock_issue: "maintenance",
      wifi_issue: "maintenance",
      power_outlet_issue: "maintenance",
      safe_issue: "maintenance",
      balcony_door_issue: "maintenance",
      minibar_not_cooling: "maintenance",
      coffee_machine: "maintenance",
      other_technical_issue: "maintenance",
    };

    const routedLegacyServices = legacyServices.map((service) => ({
      ...service,
      category: legacyDepartments[service.key] || "",
      targetDepartment: legacyDepartments[service.key] || "",
      type: "request",
    }));

    const existingKeys = new Set(requestDefAiServices.map((service) => service.key));
    return [
      ...requestDefAiServices,
      ...routedLegacyServices.filter((service) => !existingKeys.has(service.key)),
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
        (lang === "bg" ? "Информация" : lang === "de" ? "ℹ️ Information" : lang === "ru" ? "ℹ️ Информация" : "ℹ️ Information"),
      message,
      confirmLabel:
        String(tUI("continue_request") || "").trim() ||
        (lang === "bg" ? "Продължи" : lang === "de" ? "Weiter" : lang === "ru" ? "Продолжить" : "Continue"),
      cancelLabel:
        lang === "bg" ? "Отказ" : lang === "de" ? "Abbrechen" : lang === "ru" ? "Отмена" : "Cancel",
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
          : lang === "ru"
            ? "Выберите время позднего выезда: 13:00 или 14:00"
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
          : lang === "ru"
            ? "Пожалуйста, введите только 13:00 или 14:00."
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
              : lang === "ru"
                ? "Желаемое время позднего выезда:"
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
              : lang === "ru"
                ? "Желаемое время выезда"
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

  function isAquamarineCoffeeCapsulesRequest(def: RequestDef) {
    const defId = String(def.id || "").trim().toLowerCase();
    const requestType = String(def.requestType || "").trim().toLowerCase();
    const currentHotelSlug = String((config as any)?.hotelSlug || "").trim().toLowerCase();
    const isAquamarine =
      ["aquamarin", "aquamarine"].includes(currentHotelSlug) ||
      /aquamarine/i.test(String(config.hotelName || ""));

    return isAquamarine && (defId === "coffee_capsules" || requestType === "coffee_capsules");
  }

  function getRequestDefEffectivePrice(def: RequestDef) {
    if (isAquamarineCoffeeCapsulesRequest(def)) return "2,05";
    if (def.id === "late_checkout") return def.price || "25,00";
    return def.price;
  }

  function getRequestDefEffectiveCurrency(def: RequestDef) {
    if (isAquamarineCoffeeCapsulesRequest(def)) return "€";
    if (def.id === "late_checkout") return def.currency || "€";
    return def.currency;
  }

  function getRequestDefEffectiveRequiresBilling(def: RequestDef) {
    return Boolean(def.requiresBilling || getRequestDefEffectivePrice(def) || def.id === "late_checkout");
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
          lang === "bg" ? "Затвори" : lang === "de" ? "Schließen" : lang === "ro" ? "Închide" : lang === "cs" ? "Zavřít" : lang === "ru" ? "Закрыть" : "Close",
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
    if (lang === "ru") return "шт.";
    return "pcs";
  }

  function getRequestDefPriceHint(def: RequestDef) {
    const price = String(getRequestDefEffectivePrice(def) || "").trim();
    const currency = String(getRequestDefEffectiveCurrency(def) || "").trim();
    if (!price) return "";

    const suffix = def.requestKind === "quantity" || def.requiresQuantity
      ? (lang === "bg" ? " / бр." : lang === "de" ? " / Stk." : lang === "ro" ? " / buc." : lang === "cs" ? " / ks" : lang === "ru" ? " / шт." : " each")
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
    const unitPrice = parseMoneyValue(getRequestDefEffectivePrice(def));
    const currency = String(getRequestDefEffectiveCurrency(def) || "€").trim();
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
              : lang === "ru"
                ? `Массаж можно забронировать только в часы работы СПА: ${hours}.`
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
                : lang === "ru"
                  ? " Пожалуйста, выберите время так, чтобы процедура завершилась в часы работы."
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
    const requestPrice = String(getRequestDefEffectivePrice(def) || extractedPrice?.price || "").trim();
    const requestCurrency = String(getRequestDefEffectiveCurrency(def) || extractedPrice?.currency || "").trim();

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
    const effectivePrice = getRequestDefEffectivePrice(def);
    const unitPrice = parseMoneyValue(effectivePrice);
    const currency = String(getRequestDefEffectiveCurrency(def) || "€").trim();
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
      price: total !== null ? total.toFixed(2).replace(".", ",") : effectivePrice,
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
          requestDef: def,
        } as any;
      });
  }


  function buildStandaloneRequestDefHubItem(def: RequestDef): HubItem {
    const title = getRequestDefTitle(def) || String(def.id || def.requestType || "request").replace(/_/g, " ");
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
      requestDef: def,
    } as any;
  }

  function findRequestDefByIds(ids: string[]): RequestDef | null {
    const normalizedIds = new Set(ids.map((id) => String(id || "").trim().toLowerCase()).filter(Boolean));

    return requestDefs.find((def) => {
      const defId = String(def.id || "").trim().toLowerCase();
      const requestType = String(def.requestType || "").trim().toLowerCase();
      return normalizedIds.has(defId) || normalizedIds.has(requestType);
    }) || null;
  }

  const taxiProviders = config.taxiProviders ?? [];

  const hotelContentSlug = String((config as any)?.hotelSlug || "").trim().toLowerCase();
  const isAquamarineHotel =
    ["aquamarin", "aquamarine"].includes(hotelContentSlug) ||
    /aquamarine/i.test(String(config.hotelName || ""));

  const rawVenueRows = (((config as any).venueRows ?? []) as Array<VenueRow>)
    .filter(
      (v) => v && (v.name || getVenueText(v, "name", lang)) && (v.type || v.category) && v.active !== false
    )
    .map((venue) => {
      if (!isAquamarineHotel) return venue;

      const venueIdentity = [
        venue.type,
        venue.category,
        venue.name,
        ...Object.values(venue.nameByLang || {}),
        venue.shortDescription,
        ...Object.values(venue.shortDescriptionByLang || {}),
      ]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
        .join(" ");

      const isGamesRoom = /games?.?room|игрална|spielzimmer|sal[ăa] de jocuri|herna/i.test(venueIdentity);
      if (!isGamesRoom) return venue;

      const descriptionByLang = { ...(venue.descriptionByLang || {}) };
      for (const languageKey of ["bg", "en", "de", "ro", "cs", "ru"]) {
        const existing = String(descriptionByLang[languageKey] || "").trim();
        const pricing = GAME_ROOM_PRICING_BY_LANG[languageKey];
        if (!pricing || /5(?:[.,]00)?\s*€/.test(existing)) continue;
        descriptionByLang[languageKey] = [existing, pricing].filter(Boolean).join("\n\n");
      }

      const fallbackDescription = String(venue.description || "").trim();
      const fallbackPricing = GAME_ROOM_PRICING_BY_LANG.en;

      return {
        ...venue,
        description:
          fallbackDescription && /5(?:[.,]00)?\s*€/.test(fallbackDescription)
            ? fallbackDescription
            : [fallbackDescription, fallbackPricing].filter(Boolean).join("\n\n"),
        descriptionByLang,
      };
    });

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

  const massageBookingDef = requestDefs.find((def) => isMassageRequestDef(def)) || null;
  const massageBookingPreviewVisible =
    Boolean(massageBookingDef) && Boolean(hotelContentSlug) && isAquamarineHotel;

  useEffect(() => {
    if (!massageBookingPreviewVisible || !hotelContentSlug) return;

    void prefetchMassageBookingData(hotelContentSlug).catch(() => {
      // The on-demand flow remains available if background prefetch fails.
    });
  }, [hotelContentSlug, massageBookingPreviewVisible]);

  const activeGuestMassageBookings = useMemo(() => {
    if (!roomConfirmed || !room.trim()) return [];

    const normalizedHotelSlug = String(hotelContentSlug || config.hotelSlug || "").trim().toLowerCase();
    const normalizedRoom = String(room || "").trim();

    return guestMassageBookings
      .filter(
        (booking) =>
          String(booking.hotelSlug || "").trim().toLowerCase() === normalizedHotelSlug &&
          String(booking.room || "").trim() === normalizedRoom &&
          !isStoredMassageBookingExpired(booking)
      )
      .sort((a, b) => getMassageBookingStartMs(a) - getMassageBookingStartMs(b));
  }, [config.hotelSlug, guestMassageBookings, hotelContentSlug, room, roomConfirmed]);

  const handleMassageBookingConfirmed = useCallback(
    (booking: ConfirmedMassageBookingCard) => {
      const normalizedHotelSlug = String(hotelContentSlug || config.hotelSlug || booking.hotelSlug || "")
        .trim()
        .toLowerCase();

      const next = upsertStoredGuestMassageBooking({
        ...booking,
        hotelSlug: normalizedHotelSlug,
      });

      setGuestMassageBookings(next);
      collapseGuestHubSectionsAfterAction();
      setShowRequestSuccess(true);
    },
    [collapseGuestHubSectionsAfterAction, config.hotelSlug, hotelContentSlug]
  );

  const handleMassageBookingSubmissionChange = useCallback(
    (submitting: boolean, serviceLabel?: string) => {
      setSubmittingRequest(submitting);
      setSubmittingRequestLabel(submitting ? String(serviceLabel || "") : "");

      if (submitting) {
        setShowRequestSuccess(false);
      }
    },
    []
  );

  const refreshGuestMassageBookingsFromServer = useCallback(async () => {
    if (!roomConfirmed || !room.trim() || !activeStayId || !stayDeviceId) return;

    const normalizedHotelSlug = String(hotelContentSlug || config.hotelSlug || "")
      .trim()
      .toLowerCase();

    if (!normalizedHotelSlug) return;

    try {
      const params = new URLSearchParams({
        hotelSlug: normalizedHotelSlug,
        action: "active_bookings",
        room: room.trim(),
        stayId: activeStayId,
        stayDeviceId,
      });

      const response = await fetch(`/api/guest/massages?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        bookings?: GuestMassageServerBooking[];
      } | null;

      if (!response.ok || !payload?.ok || !Array.isArray(payload.bookings)) return;

      const serverBookings: StoredGuestMassageBooking[] = payload.bookings
        .map((booking) => {
          const date = String(booking.date || "").trim();
          const time = String(booking.time || "").trim();
          const serviceId = String(booking.serviceId || "massage").trim().toLowerCase();
          const serviceNameValue = String(booking.serviceName || "").trim();
          const bookingRoom = String(booking.room || room).trim();

          if (!date || !time || !serviceNameValue || !bookingRoom) return null;

          const normalized: StoredGuestMassageBooking = {
            id: massageBookingId({
              hotelSlug: normalizedHotelSlug,
              room: bookingRoom,
              serviceId,
              date,
              time,
            }),
            requestId: booking.requestId,
            hotelSlug: normalizedHotelSlug,
            room: bookingRoom,
            serviceId,
            serviceName: serviceNameValue,
            date,
            dateLabel: formatGuestMassageDateLabel(date, lang),
            time,
            durationMinutes: Number(booking.durationMinutes || 0),
            price: Number(booking.price || 0),
            currency: String(booking.currency || "EUR"),
            confirmedAt: String(booking.confirmedAt || new Date().toISOString()),
            manualSheetChanged: Boolean(booking.manualSheetChanged),
            changeNotice: booking.changeNotice || null,
            originalServiceName: booking.originalServiceName || null,
            currentSheetServiceName: booking.currentSheetServiceName || null,
            currentSheetRoomMarker: booking.currentSheetRoomMarker || null,
          };

          return normalized;
        })
        .filter((booking): booking is StoredGuestMassageBooking => Boolean(booking))
        .filter((booking) => !isStoredMassageBookingExpired(booking));

      const next = replaceStoredGuestMassageBookingsForRoom({
        hotelSlug: normalizedHotelSlug,
        room: room.trim(),
        bookings: serverBookings,
      });

      setGuestMassageBookings(next);
    } catch (error) {
      console.error("Guest massage booking sync failed", error);
    }
  }, [activeStayId, config.hotelSlug, hotelContentSlug, lang, room, roomConfirmed, stayDeviceId]);

  useEffect(() => {
    setGuestMassageBookings(pruneStoredGuestMassageBookings());
  }, [room, roomConfirmed]);

  useEffect(() => {
    if (!roomConfirmed || !room.trim() || !activeStayId || !stayDeviceId) return;

    void refreshGuestMassageBookingsFromServer();
    const timer = window.setInterval(() => {
      void refreshGuestMassageBookingsFromServer();
    }, 2 * 60_000);

    return () => window.clearInterval(timer);
  }, [activeStayId, refreshGuestMassageBookingsFromServer, room, roomConfirmed, stayDeviceId]);

  // Aquamarine's Spa Center keeps only its venue information and working hours.
  // Massage selection moves into the separate top-level “Book a massage” section below.
  const spaRequestDefItems =
    massageBookingPreviewVisible && isAquamarineHotel
      ? []
      : buildRequestDefItems("spa");

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

  const performGuestRequestSubmission = async ({
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
    lateCheckoutRequestedTime,
  }: GuestRequestSubmissionInput) => {
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
      collapseGuestHubSectionsAfterAction();
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

      const trackedSection =
        explicitDepartmentOverride ??
        (housekeepingRequestTypes.has(normalizedType)
          ? "housekeeping"
          : maintenanceRequestTypes.has(normalizedType)
            ? "maintenance"
            : "reception");

      trackGuestEvent({
        eventName: "request_submit_clicked",
        eventCategory: "request",
        section: trackedSection,
        sectionKey: trackedSection,
        itemKey: normalizedType,
        buttonKey: "submit_request",
        label: normalizedType,
        value: safeTypeLabel,
        roomNumber: roomValue,
        roomConfirmed: true,
        roomSource: "confirmed",
        extra: {
          serviceTime,
          sourceRequestDef: sourceRequestDef || null,
          stayId: activeStayId || null,
          stayDeviceId: stayDeviceId || null,
          lateCheckoutRequestedTime: lateCheckoutRequestedTime || null,
        },
      });

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
          lateCheckoutRequestedTime: lateCheckoutRequestedTime || null,
          stayId: activeStayId || null,
          stayDeviceId: stayDeviceId || null,
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

      trackGuestEvent({
        eventName: "request_created",
        eventCategory: "request",
        section: trackedSection,
        sectionKey: trackedSection,
        itemKey: normalizedType,
        buttonKey: "submit_request",
        label: normalizedType,
        value: safeTypeLabel,
        requestId: created.id,
        roomNumber: roomValue,
        roomConfirmed: true,
        roomSource: "confirmed",
        extra: {
          requestId: created.id,
          serviceTime,
          sourceRequestDef: sourceRequestDef || null,
          stayId: activeStayId || null,
          stayDeviceId: stayDeviceId || null,
          lateCheckoutRequestedTime: lateCheckoutRequestedTime || null,
        },
      });

      collapseGuestHubSectionsAfterAction();
      setShowRequestSuccess(true);
    } catch (error) {
      console.error("submitGuestRequest failed", error);
      trackGuestEvent({
        eventName: "request_failed",
        eventCategory: "request",
        section: "request",
        sectionKey: "request",
        itemKey: String(type || "request"),
        buttonKey: "submit_request",
        label: String(type || "request"),
        value: cleanRequestTitle(typeLabel),
        roomNumber: roomValue,
        roomConfirmed: true,
        roomSource: "confirmed",
        extra: {
          serviceTime,
          sourceRequestDef: sourceRequestDef || null,
          stayId: activeStayId || null,
          stayDeviceId: stayDeviceId || null,
          lateCheckoutRequestedTime: lateCheckoutRequestedTime || null,
        },
      });
      delete recentSubmissionRef.current[signature];
      window.alert(roomCopy.requestFailed);
    } finally {
      submittingRequestRef.current = false;
      setSubmittingRequest(false);
      setSubmittingRequestLabel("");
    }
  };


  const getRequestConfirmationCopy = () => {
    if (lang === "bg") {
      return {
        title: "Потвърдете заявката",
        room: "Стая",
        service: "Услуга",
        details: "Детайли",
        option: "Избор",
        quantity: "Количество",
        total: "Обща цена",
        date: "Дата",
        time: "Час",
        price: "Цена",
        paidNotice: "Тази услуга е платена и може да бъде начислена към стаята.",
        question: "Сигурни ли сте, че искате да изпратите тази заявка?",
        cancel: "ОТКАЗ",
        confirm: "ПОТВЪРДИ И ИЗПРАТИ",
      };
    }

    if (lang === "de") {
      return {
        title: "Anfrage bestätigen",
        room: "Zimmer",
        service: "Leistung",
        details: "Details",
        option: "Auswahl",
        quantity: "Menge",
        total: "Gesamtpreis",
        date: "Datum",
        time: "Uhrzeit",
        price: "Preis",
        paidNotice: "Diese Leistung ist kostenpflichtig und kann dem Zimmerkonto belastet werden.",
        question: "Möchten Sie diese Anfrage wirklich senden?",
        cancel: "ABBRECHEN",
        confirm: "BESTÄTIGEN UND SENDEN",
      };
    }

    if (lang === "ro") {
      return {
        title: "Confirmați solicitarea",
        room: "Camera",
        service: "Serviciu",
        details: "Detalii",
        option: "Selecție",
        quantity: "Cantitate",
        total: "Preț total",
        date: "Data",
        time: "Ora",
        price: "Preț",
        paidNotice: "Acest serviciu este contra cost și poate fi adăugat în contul camerei.",
        question: "Sigur doriți să trimiteți această solicitare?",
        cancel: "ANULEAZĂ",
        confirm: "CONFIRMĂ ȘI TRIMITE",
      };
    }

    if (lang === "ru") {
      return {
        title: "Подтвердите запрос",
        room: "Номер",
        service: "Услуга",
        details: "Подробности",
        option: "Выбор",
        quantity: "Количество",
        total: "Общая стоимость",
        date: "Дата",
        time: "Время",
        price: "Цена",
        paidNotice: "Это платная услуга, сумма может быть начислена на счёт номера.",
        question: "Вы уверены, что хотите отправить этот запрос?",
        cancel: "ОТМЕНА",
        confirm: "ПОДТВЕРДИТЬ И ОТПРАВИТЬ",
      };
    }

    if (lang === "cs") {
      return {
        title: "Potvrďte požadavek",
        room: "Pokoj",
        service: "Služba",
        details: "Podrobnosti",
        option: "Výběr",
        quantity: "Množství",
        total: "Celková cena",
        date: "Datum",
        time: "Čas",
        price: "Cena",
        paidNotice: "Tato služba je placená a může být připsána na účet pokoje.",
        question: "Opravdu chcete tento požadavek odeslat?",
        cancel: "ZRUŠIT",
        confirm: "POTVRDIT A ODESLAT",
      };
    }

    return {
      title: "Confirm request",
      room: "Room",
      service: "Service",
      details: "Details",
      option: "Selection",
      quantity: "Quantity",
      total: "Total price",
      date: "Date",
      time: "Time",
      price: "Price",
      paidNotice: "This is a paid service and may be charged to the room account.",
      question: "Are you sure you want to send this request?",
      cancel: "CANCEL",
      confirm: "CONFIRM AND SEND",
    };
  };

  const buildGuestRequestConfirmationDetails = (note: string | undefined) => {
    const copy = getRequestConfirmationCopy();
    const rawLines = String(note || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const hasGuestChoice = rawLines.some((line) => /^Избор на госта\s*:/i.test(line));

    return rawLines
      .filter((line) => !/^Оперативно BG\s*:/i.test(line))
      .filter((line) => !/^Рецепцията трябва да потвърди/i.test(line))
      .filter((line) => !/^Работно време на СПА\s*:/i.test(line))
      .filter((line) => !(hasGuestChoice && /^Избрана услуга\s*:/i.test(line)))
      .map((line) =>
        line
          .replace(/^Избор на госта\s*:/i, `${copy.option}:`)
          .replace(/^Избрана услуга\s*:/i, `${copy.option}:`)
          .replace(/^Количество\s*:/i, `${copy.quantity}:`)
          .replace(/^Обща цена\s*:/i, `${copy.total}:`)
          .replace(/^Дата\s*:/i, `${copy.date}:`)
          .replace(/^Час\s*:/i, `${copy.time}:`)
      )
      .join("\n");
  };

  const submitGuestRequest = (input: GuestRequestSubmissionInput) => {
    const roomValue = room.trim();
    const sourceRequestDefKey = String(input.sourceRequestDef || "").trim().toLowerCase();
    const sourceRequestDef = sourceRequestDefKey
      ? requestDefs.find((def) => String(def.id || "").trim().toLowerCase() === sourceRequestDefKey)
      : undefined;
    const requestDefLabel = sourceRequestDef ? getRequestDefTitle(sourceRequestDef) : "";
    const titleDerivedKey = getGuestRequestLabelKey("", input.typeLabel);
    const typeDerivedKey = getGuestRequestLabelKey(input.type, input.typeLabel);
    const translatedLabel = [sourceRequestDefKey, titleDerivedKey, typeDerivedKey]
      .map((key) => (key ? String(tUI(key) || "").trim() : ""))
      .find(Boolean);
    // Prefer the canonical label translated for the guest's currently selected
    // language. REQUEST_DEFS may contain an English fallback title even when the
    // rest of the confirmation dialog is BG/RO/DE/CS.
    const safeTypeLabel = cleanRequestTitle(
      translatedLabel || requestDefLabel || input.typeLabel
    );

    if (submittingRequestRef.current) return;

    if (!roomValue) {
      window.alert(roomCopy.missingRoomQrAlert);
      return;
    }

    if (!ensureConfirmedRoom()) return;

    const normalizedType = String(input.type || "request");
    const trackedSection =
      input.departmentOverride ??
      (housekeepingRequestTypes.has(normalizedType)
        ? "housekeeping"
        : maintenanceRequestTypes.has(normalizedType)
          ? "maintenance"
          : "reception");
    const copy = getRequestConfirmationCopy();
    const billableRequestKeys = new Set([
      "coffee_capsules",
      "pillow_menu",
      "minibar",
      "minibar_refill",
      "laundry",
      "late_checkout",
    ]);
    const isBillable = Boolean(
      input.requiresBilling ||
      String(input.price || "").trim() ||
      billableRequestKeys.has(normalizedType.toLowerCase()) ||
      billableRequestKeys.has(String(input.sourceRequestDef || "").trim().toLowerCase())
    );
    const details = buildGuestRequestConfirmationDetails(input.note);
    const priceText = [input.price, input.currency]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ");
    const messageParts = [
      `${copy.room}: ${roomValue}`,
      `${copy.service}: ${safeTypeLabel}`,
    ];

    if (details) {
      messageParts.push("", `${copy.details}:`, details);
    }

    if (isBillable) {
      if (priceText) messageParts.push("", `${copy.price}: ${priceText}`);
      messageParts.push(copy.paidNotice);
    }

    messageParts.push("", copy.question);

    trackGuestEvent({
      eventName: "request_confirm_prompt_shown",
      eventCategory: "request",
      section: trackedSection,
      sectionKey: trackedSection,
      itemKey: normalizedType,
      buttonKey: "request_confirm_prompt",
      label: normalizedType,
      value: safeTypeLabel,
      roomNumber: roomValue,
      roomConfirmed: true,
      roomSource: "confirmed",
      extra: {
        serviceTime: input.serviceTime || "now",
        sourceRequestDef: input.sourceRequestDef || null,
        requiresBilling: isBillable,
      },
    });

    openRequestDialog({
      title: copy.title,
      message: messageParts.join("\n"),
      confirmLabel: copy.confirm,
      cancelLabel: copy.cancel,
      onCancel: () => {
        trackGuestEvent({
          eventName: "request_confirm_cancelled",
          eventCategory: "request",
          section: trackedSection,
          sectionKey: trackedSection,
          itemKey: normalizedType,
          buttonKey: "cancel_request",
          label: normalizedType,
          value: safeTypeLabel,
          roomNumber: roomValue,
          roomConfirmed: true,
          roomSource: "confirmed",
          extra: {
            serviceTime: input.serviceTime || "now",
            sourceRequestDef: input.sourceRequestDef || null,
          },
        });
      },
      onConfirm: () => {
        trackGuestEvent({
          eventName: "request_confirmed",
          eventCategory: "request",
          section: trackedSection,
          sectionKey: trackedSection,
          itemKey: normalizedType,
          buttonKey: "confirm_and_send",
          label: normalizedType,
          value: safeTypeLabel,
          roomNumber: roomValue,
          roomConfirmed: true,
          roomSource: "confirmed",
          extra: {
            serviceTime: input.serviceTime || "now",
            sourceRequestDef: input.sourceRequestDef || null,
            requiresBilling: isBillable,
          },
        });

        const lateCheckoutRequestedTime = input.lateCheckoutRequestedTime || (
          normalizedType.toLowerCase() === "late_checkout" ||
          String(input.sourceRequestDef || "").trim().toLowerCase() === "late_checkout"
            ? normalizeLateCheckoutTime(input.note)
            : ""
        );

        void performGuestRequestSubmission({
          ...input,
          typeLabel: safeTypeLabel,
          lateCheckoutRequestedTime: lateCheckoutRequestedTime || undefined,
        });
      },
    });
  };


  function getAiVenueStableId(venue: VenueRow, index: number) {
    const explicit = String(venue.id || "").trim();
    if (explicit) return explicit;

    const slug = String(venue.name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    return slug || `venue_${index}`;
  }

  function buildAiActions(matchedIds: unknown): AiChatAction[] {
    if (!Array.isArray(matchedIds)) return [];

    const actions: AiChatAction[] = [];
    const seen = new Set<string>();

    for (const rawMatchedId of matchedIds.map(String)) {
      const matchedId = String(rawMatchedId || "").trim();
      if (!matchedId || seen.has(matchedId)) continue;

      if (matchedId.startsWith("service:") || matchedId.startsWith("info:")) {
        const prefix = matchedId.startsWith("service:") ? "service:" : "info:";
        const targetId = matchedId.slice(prefix.length);
        const def = requestDefs.find((item) => {
          const defId = String(item.id || "").trim();
          const requestType = String(item.requestType || "").trim();
          return defId === targetId || requestType === targetId;
        });

        const normalizedId = targetId.toLowerCase();
        const isPaidOrReservable = Boolean(
          def && (getRequestDefEffectiveRequiresBilling(def) || normalizedId.includes("massage"))
        );

        if (
          !def ||
          def.type !== "request" ||
          !def.enabled ||
          !def.guestVisible ||
          !isPaidOrReservable
        ) {
          continue;
        }

        const actionTargetId = String(def.id || targetId).trim();
        const title = getRequestDefTitle(def) || actionTargetId.replace(/_/g, " ");
        const verb =
          normalizedId.includes("massage")
            ? aiActionCopy.reserve
            : def.requestKind === "selection"
              ? aiActionCopy.choose
              : def.requestKind === "quantity" || def.requiresQuantity
                ? aiActionCopy.order
                : aiActionCopy.request;

        actions.push({
          kind: "request_def",
          targetId: actionTargetId,
          matchedId,
          label: `${verb} ${title}`.trim(),
        });
        seen.add(matchedId);
        continue;
      }

      if (matchedId.startsWith("venue:")) {
        const targetId = matchedId.slice("venue:".length);
        const venue = rawVenueRows.find((item, index) => getAiVenueStableId(item, index) === targetId);
        if (!venue) continue;

        const reservationType = String(venue.reservationType || "").trim().toLowerCase();
        const hasReservationAction =
          venue.requiresReservation === true ||
          ["request", "staff", "url", "phone", "email", "whatsapp"].includes(reservationType);

        if (!hasReservationAction) continue;

        const title = getVenueText(venue, "name", lang) || String(venue.name || targetId);
        const configuredLabel = String(
          venue.reservationLabelByLang?.[lang] ||
          venue.reservationLabel ||
          ""
        ).trim();

        actions.push({
          kind: "venue",
          targetId,
          matchedId,
          label: configuredLabel || `${aiActionCopy.reserve} ${title}`.trim(),
        });
        seen.add(matchedId);
      }
    }

    return actions.slice(0, 3);
  }

  function getAiRequestNavigationTarget(def: RequestDef) {
    const targetId = String(def.id || def.requestType || "").trim();
    const matchesDef = (candidate?: RequestDef | null) => {
      if (!candidate) return false;
      const candidateId = String(candidate.id || "").trim();
      const candidateType = String(candidate.requestType || "").trim();
      return candidateId === targetId || candidateType === targetId;
    };

    if (massageBookingPreviewVisible && isMassageRequestDef(def)) {
      return { sectionId: "massage_booking", groupId: null };
    }

    const isSpaRequest = spaRequestDefItems.some((item) =>
      matchesDef((item as any)?.requestDef as RequestDef | undefined)
    );

    if (isSpaRequest) {
      return { sectionId: "outlets", groupId: "food_entertainment" };
    }

    const matchingSection = sections.find((section) =>
      section.items.some((item) =>
        matchesDef((item as any)?.requestDef as RequestDef | undefined)
      )
    );

    const fallbackSectionId = String(def.category || def.targetDepartment || "")
      .trim()
      .toLowerCase();
    const sectionId = String(matchingSection?.id || fallbackSectionId || "").trim();

    if (["wifi", "reception", "housekeeping", "maintenance"].includes(sectionId)) {
      return { sectionId, groupId: null };
    }

    if (["info", "weather"].includes(sectionId)) {
      return { sectionId, groupId: "hotel_stay" };
    }

    if (["outlets", "animation", "world_cup"].includes(sectionId)) {
      return { sectionId, groupId: "food_entertainment" };
    }

    if (["reviews", "social"].includes(sectionId)) {
      return { sectionId, groupId: "reviews_social" };
    }

    return { sectionId, groupId: "more_services" };
  }

  function handleAiAction(action: AiChatAction) {
    trackGuestEvent({
      eventName: "ai_action_clicked",
      eventCategory: "ai",
      section: "ai",
      sectionKey: "ai",
      itemKey: action.targetId,
      buttonKey: action.kind,
      label: action.label,
      value: action.matchedId,
    });

    setAiPanelOpen(false);

    window.setTimeout(() => {
      if (action.kind === "request_def") {
        const def = requestDefs.find((item) => {
          const id = String(item.id || "").trim();
          const requestType = String(item.requestType || "").trim();
          return id === action.targetId || requestType === action.targetId;
        });

        if (!def) return;

        const navigationTarget = getAiRequestNavigationTarget(def);
        if (!navigationTarget.sectionId) return;

        if (["wifi", "reception", "housekeeping", "maintenance"].includes(navigationTarget.sectionId)) {
          setOpenQuickServiceId(navigationTarget.sectionId);
        }

        setAiRequestNavigation((previous) => ({
          targetId: String(def.id || def.requestType || action.targetId).trim(),
          sectionId: navigationTarget.sectionId,
          groupId: navigationTarget.groupId,
          nonce: (previous?.nonce || 0) + 1,
        }));
        return;
      }

      const venue = rawVenueRows.find((item, index) => getAiVenueStableId(item, index) === action.targetId);
      if (venue) openVenueReservation(venue);
    }, 0);
  }

  const askAI = async () => {
    const questionText = aiQ.trim();
    if (!questionText || aiLoading) return;
    if (!ensureConfirmedRoom()) return;

    trackGuestEvent({
      eventName: "ai_question_sent",
      eventCategory: "ai",
      section: "ai",
      sectionKey: "ai",
      buttonKey: "ai_send",
      label: "question_length",
      value: String(questionText.length),
      extra: {
        questionLength: questionText.length,
      },
    });

    const historyForRequest = aiHistory
      .slice(-6)
      .map(({ role, content }) => ({ role, content }));
    const requestSeq = ++aiRequestSeqRef.current;
    setAiQ("");
    setAiAnswer("");
    setAiHistory((previous) => [
      ...previous,
      { role: "user" as const, content: questionText },
    ].slice(-6));

    const localAcknowledgement = getLocalAiAcknowledgement(questionText, lang);
    if (localAcknowledgement) {
      setAiAnswer(localAcknowledgement);
      setAiHistory((previous) => [
        ...previous,
        { role: "assistant" as const, content: localAcknowledgement },
      ].slice(-6));

      trackGuestEvent({
        eventName: "ai_answer_shown",
        eventCategory: "ai",
        section: "ai",
        sectionKey: "ai",
        label: "answer_length",
        value: String(localAcknowledgement.length),
        extra: {
          answerLength: localAcknowledgement.length,
          aiEngine: "local_acknowledgement",
          aiFallbackUsed: false,
          aiMatchedIds: [],
          aiIntent: "acknowledgement",
          aiInputTokens: 0,
          aiOutputTokens: 0,
          aiLatencyMs: 0,
          aiCacheHit: false,
        },
      });
      return;
    }

    try {
      setAiLoading(true);

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questionText,
          lang: String(lang),
          hotelSlug: config.hotelSlug,
          history: historyForRequest,
        }),
      });

      const data = await res.json();
      if (requestSeq !== aiRequestSeqRef.current) return;

      if (!data?.ok) {
        trackGuestEvent({
          eventName: "ai_error",
          eventCategory: "ai",
          section: "ai",
          sectionKey: "ai",
          label: "api_not_ok",
          value: "false",
        });
        const errorText = String(tUI("ai_error") || "Възникна грешка при обработката.");
        setAiAnswer(errorText);
        setAiHistory((previous) => [
          ...previous,
          { role: "assistant" as const, content: errorText },
        ].slice(-6));
        return;
      }

      const answerText = String(data.answer || tUI("ai_no_info") || "Все още нямам тази информация за хотела.");
      const actions = buildAiActions(data?.diagnostics?.matchedIds);
      setAiAnswer(answerText);
      setAiHistory((previous) => [
        ...previous,
        { role: "assistant" as const, content: answerText, actions },
      ].slice(-6));

      if (actions.length) {
        trackGuestEvent({
          eventName: "ai_action_shown",
          eventCategory: "ai",
          section: "ai",
          sectionKey: "ai",
          label: "action_count",
          value: String(actions.length),
          extra: {
            actions: actions.map((action) => ({
              kind: action.kind,
              targetId: action.targetId,
              matchedId: action.matchedId,
            })),
          },
        });
      }

      trackGuestEvent({
        eventName: "ai_answer_shown",
        eventCategory: "ai",
        section: "ai",
        sectionKey: "ai",
        label: "answer_length",
        value: String(answerText.length),
        extra: {
          answerLength: answerText.length,
          aiEngine: String(data?.diagnostics?.engine || "unknown"),
          aiFallbackUsed: Boolean(data?.diagnostics?.fallbackUsed),
          aiMatchedIds: Array.isArray(data?.diagnostics?.matchedIds)
            ? data.diagnostics.matchedIds.slice(0, 8)
            : [],
          aiIntent: String(data?.diagnostics?.intent || ""),
          aiInputTokens: Number(data?.diagnostics?.inputTokens || 0),
          aiOutputTokens: Number(data?.diagnostics?.outputTokens || 0),
          aiLatencyMs: Number(data?.diagnostics?.latencyMs || 0),
          aiCacheHit: Boolean(data?.diagnostics?.cacheHit),
        },
      });
    } catch {
      if (requestSeq !== aiRequestSeqRef.current) return;
      trackGuestEvent({
        eventName: "ai_error",
        eventCategory: "ai",
        section: "ai",
        sectionKey: "ai",
        label: "request_failed",
        value: "false",
      });
      const errorText = String(tUI("ai_error") || "Възникна грешка при обработката.");
      setAiAnswer(errorText);
      setAiHistory((previous) => [
        ...previous,
        { role: "assistant" as const, content: errorText },
      ].slice(-6));
    } finally {
      if (requestSeq === aiRequestSeqRef.current) setAiLoading(false);
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
    if (lang === "ru") return `Бронирование: ${venueName}`;
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
      trackGuestEvent({
        eventName: "external_link_clicked",
        eventCategory: "reservation",
        section: "outlets",
        sectionKey: "outlets",
        itemKey: normalizeCategory(venue),
        buttonKey: "reservation_url",
        label: venueName,
        value: "url",
        extra: { href: venue.reservationUrl },
      });
      window.open(String(venue.reservationUrl), "_blank", "noopener,noreferrer");
      return;
    }

    if (type === "phone" && venue.reservationPhone) {
      const phone = String(venue.reservationPhone || "").trim();
      if (!phone) return;
      trackGuestEvent({
        eventName: "phone_link_clicked",
        eventCategory: "reservation",
        section: "outlets",
        sectionKey: "outlets",
        itemKey: normalizeCategory(venue),
        buttonKey: "reservation_phone",
        label: venueName,
        value: "phone",
      });
      window.location.href = safeTelLink(phone);
      return;
    }

    if (type === "email" && venue.reservationEmail) {
      const subject = encodeURIComponent(`${config.hotelName} - ${venueName} reservation`);
      const body = encodeURIComponent(msg);
      trackGuestEvent({
        eventName: "email_link_clicked",
        eventCategory: "reservation",
        section: "outlets",
        sectionKey: "outlets",
        itemKey: normalizeCategory(venue),
        buttonKey: "reservation_email",
        label: venueName,
        value: "email",
      });
      window.location.href = `mailto:${venue.reservationEmail}?subject=${subject}&body=${body}`;
      return;
    }

    if (type === "whatsapp" && venue.reservationWhatsapp) {
      const wa = String(venue.reservationWhatsapp || "").trim();
      if (!wa) return;
      trackGuestEvent({
        eventName: "whatsapp_link_clicked",
        eventCategory: "reservation",
        section: "outlets",
        sectionKey: "outlets",
        itemKey: normalizeCategory(venue),
        buttonKey: "reservation_whatsapp",
        label: venueName,
        value: "whatsapp",
      });
      window.location.href = buildWhatsAppLink(wa, msg);
      return;
    }

    const routed = warnAndRouteIfClosed("restaurant");
    const to =
      routed.dept === "reception"
        ? getDeptWhatsapp("reception")
        : getDeptWhatsapp("restaurant");

    trackGuestEvent({
      eventName: "whatsapp_link_clicked",
      eventCategory: "reservation",
      section: "outlets",
      sectionKey: "outlets",
      itemKey: normalizeCategory(venue),
      buttonKey: "reservation_whatsapp_fallback",
      label: venueName,
      value: routed.dept,
    });

    openWhatsApp(to, msg, routed.warned);
  };

  const openVenueReservation = (venue: VenueRow) => {
    if (!ensureConfirmedRoom()) return;

    const type = String(venue.reservationType || "").trim().toLowerCase();
    const venueName = getVenueText(venue, "name", lang) || venue.name || "venue";

    trackGuestEvent({
      eventName: "venue_reservation_clicked",
      eventCategory: "reservation",
      section: "outlets",
      sectionKey: "outlets",
      itemKey: normalizeCategory(venue),
      buttonKey: "reserve",
      label: venueName,
      value: type || "reservation",
    });

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
      trackGuestEvent({
        eventName: "external_link_clicked",
        eventCategory: "reservation",
        section: "outlets",
        sectionKey: "outlets",
        itemKey: normalizeCategory(venue),
        buttonKey: "reservation_url",
        label: venueName,
        value: "url",
        extra: { href: venue.reservationUrl },
      });
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
    (item: any, group: "wifi" | "emergency" | "explore" | "reviews" | "animation" | "world_cup" | "policy") => {
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

      if (group === "policy") {
        return /policy|политик|правил|towel|кърп|хавли|beach|плаж|sunbed|шезлон|umbrella|чадър|prosoape|șezlong|plaj|ručník|pláž|lehát|полотенц|пляж|шезлонг/.test(identity);
      }

      return false;
    },
    [getHotelInfoIdentity]
  );

  const coffeeCapsulesRequestDef = requestDefs.find((def) => {
    const id = String(def.id || "").trim().toLowerCase();
    const requestType = String(def.requestType || "").trim().toLowerCase();
    return id === "coffee_capsules" || requestType === "coffee_capsules";
  });

  const coffeeCapsulesPrice = coffeeCapsulesRequestDef
    ? String(getRequestDefEffectivePrice(coffeeCapsulesRequestDef) || "2,05").trim()
    : "2,05";
  const coffeeCapsulesCurrency = coffeeCapsulesRequestDef
    ? String(getRequestDefEffectiveCurrency(coffeeCapsulesRequestDef) || "€").trim() || "€"
    : "€";

  const mainRestaurantVenue = [...rawVenueRows]
    .filter((venue) => normalizeCategory(venue) === "restaurants")
    .sort((a, b) => Number(a.sortOrder ?? 999) - Number(b.sortOrder ?? 999))[0];

  const restaurantHoursSource = String(
    mainRestaurantVenue?.hoursByLang?.[String(lang)] ||
      mainRestaurantVenue?.hoursByLang?.bg ||
      mainRestaurantVenue?.hours ||
      (mainRestaurantVenue?.open || mainRestaurantVenue?.close
        ? `${mainRestaurantVenue?.open || "?"} - ${mainRestaurantVenue?.close || "?"}`
        : "")
  ).trim();

  const restaurantHoursText = formatRestaurantHoursForLanguage(restaurantHoursSource, lang);

  const toHotelInfoHubItem = useCallback(
    (item: any): HubItem => {
      const identity = getHotelInfoIdentity(item);
      let icon = item?.icon ? String(item.icon).trim() : "";
      let title = getHotelInfoText(item, "title");
      let info = getHotelInfoText(item, "text");

      if (isAquamarineHotel) {
        const stableKey = String(item?.key || item?.id || "").trim().toLowerCase();
        const isRestaurantHoursInfo =
          ["breakfast", "breakfast_hours", "info_breakfast"].includes(stableKey) ||
          /(^|\s)(breakfast|закуска|frühstück|mic dejun|snídaně)(\s|$)/i.test(identity);

        if (isRestaurantHoursInfo && restaurantHoursText) {
          const languageKey = ["bg", "en", "de", "ro", "cs", "ru"].includes(String(lang)) ? String(lang) : "en";
          icon = "🍽️";
          title = RESTAURANT_HOURS_TITLE_BY_LANG[languageKey] || RESTAURANT_HOURS_TITLE_BY_LANG.en;
          info = restaurantHoursText;
        }

        const isCoffeeCapsulesInfo =
          stableKey === "coffee_capsules" ||
          /coffee.?capsule|кафе.?капсул|kaffeekapsel|capsule de cafea|kávové kapsle/i.test(identity);

        if (isCoffeeCapsulesInfo && info) {
          const displayPrice = `${coffeeCapsulesPrice} ${coffeeCapsulesCurrency}`.trim();
          const replaced = info.replace(/\d+(?:[.,]\d{1,2})?\s*(?:€|EUR)/i, displayPrice);
          info = replaced === info && !info.includes(displayPrice) ? `${info} ${displayPrice}`.trim() : replaced;
        }
      }

      return {
        label: `${icon ? `${icon} ` : ""}${title}`.trim(),
        kind: "info" as const,
        info,
      };
    },
    [
      coffeeCapsulesCurrency,
      coffeeCapsulesPrice,
      getHotelInfoIdentity,
      getHotelInfoText,
      isAquamarineHotel,
      lang,
      restaurantHoursText,
    ]
  );

  const toAnimationHubItem = useCallback(
    (item: any): HubItem => {
      const currentLang = (["bg", "de", "en", "ro", "cs", "ru"].includes(String(lang || "")) ? lang : "en") as LangKey;
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
        ru: {
          title: "Анимационная программа",
          text: "Информация от нашей команды аниматоров.",
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

  const premiumSectionCopy = getPremiumSectionCopy(lang);

  const hotelInfoSection = useMemo(() => {
    const isAllowedHotelInfoIdentity = (identity: string) =>
      /check[\s-]?(?:in|out)|arrival|departure|настан|напуск|anreise|abreise|cazare|plecare|ubytov|odjezd|заезд|выезд|parking|паркинг|parkplatz|parcare|parkování|парков|animation|анимац|animație|animace|gift|charity|кауза|подар|благотвор|spende|cadou|charit/i.test(identity);

    const infoRequestDefItems = buildRequestDefItems("info").filter((item) => {
      const def = (item as any)?.requestDef as RequestDef | undefined;
      if (!def) return false;

      const identity = [
        def.id,
        def.requestType,
        getRequestDefField(def, "title"),
        getRequestDefField(def, "description"),
        getRequestDefField(def, "policy"),
      ]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
        .join(" ");

      return isAllowedHotelInfoIdentity(identity);
    });

    const infoItems = hotelInfoItems
      .filter((item) => isAllowedHotelInfoIdentity(getHotelInfoIdentity(item)))
      .map(toHotelInfoHubItem)
      .filter((item) => item.label || (item.kind === "info" && Boolean(item.info)));

    const items = [...infoItems, ...infoRequestDefItems];

    if (!items.length) return null;

    return {
      id: "info",
      title: premiumSectionCopy.hotelInfo,
      items,
    } satisfies HubSection;
  }, [
    buildRequestDefItems,
    getHotelInfoIdentity,
    getRequestDefField,
    hotelInfoItems,
    premiumSectionCopy.hotelInfo,
    toHotelInfoHubItem,
  ]);
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
        (lang === "bg" ? "🎭 Анимация" : lang === "de" ? "🎭 Animation" : lang === "ro" ? "🎭 Animație" : lang === "cs" ? "🎭 Animace" : lang === "ru" ? "🎭 Анимация" : "🎭 Animation"),
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

  const guestNavCopy = getGuestNavCopy(lang);
  const roomSwitchCopy = getRoomSwitchCopy(lang);
  const getCurrentGuestUiText = (key: string) => {
    const value = config.i18n?.[String(lang)]?.[key];
    return value && String(value).trim() && String(value).trim() !== key
      ? String(value).trim()
      : "";
  };
  const guestNavigationLabel = (key: string, fallback: string) =>
    getCurrentGuestUiText(key) || fallback;


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

  const recommendedPlaceLang = (["bg", "en", "de", "ro", "cs", "ru"].includes(String(lang))
    ? String(lang)
    : "en") as LangKey;

  const aquamarineRecommendedPlaceLabels: Record<
    LangKey,
    { delMar: string; izvora: string }
  > = {
    bg: {
      delMar: "Del Mar Fish Restaurant & BBQ",
      izvora: "Ресторант Извора",
    },
    en: {
      delMar: "Del Mar Fish Restaurant & BBQ",
      izvora: "Restaurant Izvora",
    },
    de: {
      delMar: "Del Mar Fish Restaurant & BBQ",
      izvora: "Restaurant Izvora",
    },
    ro: {
      delMar: "Del Mar Fish Restaurant & BBQ",
      izvora: "Restaurant Izvora",
    },
    cs: {
      delMar: "Del Mar Fish Restaurant & BBQ",
      izvora: "Restaurace Izvora",
    },
    ru: {
      delMar: "Del Mar Fish Restaurant & BBQ",
      izvora: "Ресторан «Извора»",
    },
  };

  const aquamarineRecommendedPlaces: HubItem[] = isAquamarineHotel
    ? [
        {
          label: `📍 ${aquamarineRecommendedPlaceLabels[recommendedPlaceLang].delMar}`,
          kind: "link" as const,
          href: "https://www.facebook.com/p/Del-Mar-Fish-Restaurant-BBQ-100040199001878/",
          newTab: true,
        },
        {
          label: `📍 ${aquamarineRecommendedPlaceLabels[recommendedPlaceLang].izvora}`,
          kind: "link" as const,
          href: "https://izvora-kranevo.com/",
          newTab: true,
        },
      ]
    : [];

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
        ...aquamarineRecommendedPlaces,
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

  const weatherLang = ["bg", "en", "de", "ro", "cs", "ru"].includes(String(lang))
    ? String(lang)
    : "en";
  const weatherCopy = WEATHER_GUEST_COPY[weatherLang] || WEATHER_GUEST_COPY.en;
  const weatherLocale: Record<string, string> = {
    bg: "bg-BG",
    en: "en-GB",
    de: "de-DE",
    ro: "ro-RO",
    cs: "cs-CZ",
    ru: "ru-RU",
  };
  const weatherCurrent = weatherData?.current;
  const weatherLocalTime = (() => {
    try {
      return new Intl.DateTimeFormat(weatherLocale[weatherLang] || "en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: weatherData?.timezone || "Europe/Sofia",
      }).format(new Date(weatherClock));
    } catch {
      return new Date(weatherClock).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  })();

  const weatherDayLabel = (date: string, index: number) => {
    if (index === 0) return weatherCopy.today;
    if (index === 1) return weatherCopy.tomorrow;

    try {
      return new Intl.DateTimeFormat(weatherLocale[weatherLang] || "en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
      }).format(new Date(`${date}T12:00:00`));
    } catch {
      return date;
    }
  };

  const weatherInfo = (() => {
    if (weatherLoading && !weatherData) return weatherCopy.loading;
    if (weatherError && !weatherData) return weatherCopy.error;
    if (!weatherData?.ok || !weatherCurrent) return weatherCopy.error;

    const currentCode = weatherCurrent.weatherCode;
    const temperature = weatherCurrent.temperature;
    const apparent = weatherCurrent.apparentTemperature;
    const windDirection = compassDirection(weatherCurrent.windDirection, weatherLang);
    const lines = [
      `${weatherCopy.localTime}: ${weatherLocalTime}`,
      `${weatherCopy.now}: ${weatherConditionIcon(currentCode)} ${weatherConditionLabel(currentCode, weatherLang)}${temperature != null ? ` · ${Math.round(temperature)}°C` : ""}${apparent != null ? ` (${weatherCopy.feels}: ${Math.round(apparent)}°C)` : ""}`,
      weatherCurrent.humidity != null ? `${weatherCopy.humidity}: ${Math.round(weatherCurrent.humidity)}%` : "",
      weatherCurrent.cloudCover != null ? `${weatherCopy.clouds}: ${Math.round(weatherCurrent.cloudCover)}%` : "",
      weatherCurrent.windSpeed != null ? `${weatherCopy.wind}: ${Math.round(weatherCurrent.windSpeed)} km/h${windDirection ? ` ${windDirection}` : ""}` : "",
      weatherData.daily?.[0]?.rainChance != null ? `${weatherCopy.rain}: ${Math.round(weatherData.daily[0].rainChance as number)}%` : "",
      "",
      ...(weatherData.daily || []).slice(0, 3).map((day, index) => {
        const min = day.temperatureMin != null ? `${Math.round(day.temperatureMin)}°` : "–";
        const max = day.temperatureMax != null ? `${Math.round(day.temperatureMax)}°` : "–";
        const rain = day.rainChance != null ? ` · ${weatherCopy.rain}: ${Math.round(day.rainChance)}%` : "";
        return `${weatherDayLabel(day.date, index)}: ${weatherConditionIcon(day.weatherCode)} ${weatherConditionLabel(day.weatherCode, weatherLang)} · ${min}/${max}${rain}`;
      }),
      weatherCopy.updated,
      weatherData.attribution ? `${weatherCopy.source}: ${weatherData.attribution}` : "",
    ].filter((line, index, all) => line !== "" || (index > 0 && all[index - 1] !== ""));

    return lines.join("\n").trim();
  })();

  const weatherSection: HubSection = {
    id: "weather",
    title: String(tUI("weather_title") || weatherCopy.title),
    items: [
      {
        label: weatherCurrent?.temperature != null
          ? `${weatherConditionIcon(weatherCurrent.weatherCode)} ${Math.round(weatherCurrent.temperature)}°C · ${weatherConditionLabel(weatherCurrent.weatherCode, weatherLang)}`
          : "",
        kind: "info",
        info: weatherInfo,
      },
    ],
  };

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
            : lang === "ru"
              ? "Вам нравится отдых? Будем благодарны за ваш отзыв."
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
              label: withLinkIcon(String(tUI("leave_google_review") || "Google Review"), "google"),
              kind: "link" as const,
              href: config.reviews.google,
              newTab: true,
            },
          ]
          : []),
        ...(config.reviews?.tripadvisor
          ? [
            {
              label: withLinkIcon(String(tUI("leave_tripadvisor_review") || "TripAdvisor Review"), "tripadvisor"),
              kind: "link" as const,
              href: config.reviews.tripadvisor,
              newTab: true,
            },
          ]
          : []),
        ...(config.reviews?.booking
          ? [
            {
              label: withLinkIcon(String(tUI("leave_booking_review") || "Booking.com"), "booking"),
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
    ru: { title: "Подписывайтесь на нас", intro: "Следите за нами в социальных сетях, чтобы узнавать новости, смотреть фотографии и специальные предложения." },
  } as const;
  const socialLang = (lang === "bg" || lang === "en" || lang === "de" || lang === "ro" || lang === "cs" || lang === "ru") ? lang : "en";
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
        ...(socialLinks.facebook ? [{ label: withLinkIcon("Facebook", "facebook"), kind: "link" as const, href: socialLinks.facebook, newTab: true }] : []),
        ...(socialLinks.instagram ? [{ label: withLinkIcon("Instagram", "instagram"), kind: "link" as const, href: socialLinks.instagram, newTab: true }] : []),
        ...(socialLinks.tiktok ? [{ label: withLinkIcon("TikTok", "tiktok"), kind: "link" as const, href: socialLinks.tiktok, newTab: true }] : []),
        ...(socialLinks.youtube ? [{ label: withLinkIcon("YouTube", "youtube"), kind: "link" as const, href: socialLinks.youtube, newTab: true }] : []),
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
    weatherSection,
    {
      id: "reception",
      title: premiumSectionCopy.onlineReception,
      subtitle: getDepartmentSectionIntro(lang, "reception"),
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
                    lateCheckoutRequestedTime: slot,
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
      title: premiumSectionCopy.onlineHousekeeping,
      subtitle: getDepartmentSectionIntro(lang, "housekeeping"),
      items: [
        ...buildRequestDefItems("housekeeping").filter((item) => {
          const def = (item as any)?.requestDef as RequestDef | undefined;
          const defId = String(def?.id || "").trim().toLowerCase();
          const requestType = String(def?.requestType || "").trim().toLowerCase();
          return !["coffee_capsules", "coffee_capsules_request", "pillow_menu", "pillow_menu_request"].includes(defId) &&
            !["coffee_capsules", "pillow_menu"].includes(requestType);
        }),
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
          .filter((x) => !["towels", "toilet_paper", "extra_pillow", "coffee_capsules", "pillow_menu", "pillow-menu"].includes(String(x.key || "").trim().toLowerCase()))
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
                      lang === "bg" ? "Затвори" : lang === "de" ? "Schließen" : lang === "ro" ? "Închide" : lang === "cs" ? "Zavřít" : lang === "ru" ? "Закрыть" : "Close",
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
      title: premiumSectionCopy.onlineMaintenance,
      subtitle: getDepartmentSectionIntro(lang, "maintenance"),
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
              label: premiumSectionCopy.coffeeMachineIssue,
              kind: "link" as const,
              onClick: () =>
                submitGuestRequest({
                  type: "other_technical_issue",
                  typeLabel: premiumSectionCopy.coffeeMachineIssue,
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

  const sectionById = (id: string) => sections.find((section) => section.id === id) || null;
  const quickServiceIds = ["wifi", "reception", "housekeeping", "maintenance"];
  const quickServiceSections = quickServiceIds
    .map((id) => sectionById(id))
    .filter((section): section is HubSection => Boolean(section));

  const hotelInfoPolicyItems = hotelInfoItems
    .filter((item) => isHotelInfoGroup(item, "policy"))
    .map(toHotelInfoHubItem)
    .filter((item) => item.label || (item.kind === "info" && Boolean(item.info)));

  const infoCombinedSection: HubSection | null = (() => {
    const items = [
      ...(wifiSection ? wifiSection.items : []),
      ...(hotelInfoSection ? hotelInfoSection.items : []),
    ];

    if (!items.length) return null;

    return {
      id: "info",
      title: premiumSectionCopy.hotelInfo,
      items,
    };
  })();

  const contactCombinedSection: HubSection | null = quickServiceSections.length
    ? {
        id: "contact",
        title:
          lang === "bg"
            ? "Свържи се с нас"
            : lang === "de"
              ? "Kontakt"
              : lang === "ro"
                ? "Contactați-ne"
                : lang === "cs"
                  ? "Kontaktujte nás"
                  : lang === "ru"
                    ? "Свяжитесь с нами"
                    : "Contact us",
        items: [],
      }
    : null;

  const policyCombinedSection: HubSection | null = hotelInfoPolicyItems.length
    ? {
        id: "hotel_policies",
        title:
          lang === "bg"
            ? "Политика на хотела"
            : lang === "de"
              ? "Hotelrichtlinien"
              : lang === "ro"
                ? "Politica hotelului"
                : lang === "cs"
                  ? "Pravidla hotelu"
                  : lang === "ru"
                    ? "Правила отеля"
                    : "Hotel policies",
        items: hotelInfoPolicyItems,
      }
    : null;
  const restaurantOutletSection = outletsSection
    ? { ...outletsSection, title: lang === "bg" ? "Ресторант" : lang === "de" ? "Restaurant" : lang === "ro" ? "Restaurant" : lang === "cs" ? "Restaurace" : lang === "ru" ? "Ресторан" : "Restaurant" }
    : null;

  const barsOutletSection = outletsSection
    ? { ...outletsSection, title: lang === "bg" ? "Барове" : lang === "de" ? "Bars" : lang === "ro" ? "Baruri" : lang === "cs" ? "Bary" : lang === "ru" ? "Бары" : "Bars" }
    : null;

  const otherEntertainmentSection = outletsSection
    ? { ...outletsSection, title: premiumSectionCopy.otherEntertainment }
    : animationSection
      ? { ...animationSection, title: premiumSectionCopy.otherEntertainment }
      : null;

  const pillowMenuDef = findRequestDefByIds(["pillow_menu", "pillow_menu_request"]);
  const coffeeCapsulesDef = findRequestDefByIds(["coffee_capsules", "coffee_capsules_request"]);

  const pillowMenuSection: HubSection = {
    id: "pillow_menu",
    title: getPremiumServiceTitle(lang, "sleepPillows"),
    items: pillowMenuDef
      ? [buildStandaloneRequestDefHubItem(pillowMenuDef)]
      : [
          {
            label: String(tUI("pillow_menu") || (lang === "bg" ? "Вземи възглавница" : "Pillow menu")),
            kind: "link" as const,
            onClick: () =>
              submitGuestRequest({
                type: "pillow_menu",
                typeLabel: String(tUI("pillow_menu") || "Pillow menu"),
                requiresBilling: true,
                notifyDepartments: ["reception"],
              }),
          },
        ],
  };

  const coffeeCapsulesSection: HubSection = {
    id: "coffee_capsules",
    title: getPremiumServiceTitle(lang, "orderCoffeeCapsules"),
    items: coffeeCapsulesDef
      ? [buildStandaloneRequestDefHubItem(coffeeCapsulesDef)]
      : [
          {
            label: String(tUI("coffee_capsules") || (lang === "bg" ? "Поръчай кафе капсули" : "Coffee capsules")),
            kind: "link" as const,
            onClick: () =>
              submitGuestRequest({
                type: "coffee_capsules",
                typeLabel: String(tUI("coffee_capsules") || "Coffee capsules"),
                price: coffeeCapsulesPrice,
                currency: coffeeCapsulesCurrency,
                requiresBilling: true,
                notifyDepartments: ["reception"],
              }),
          },
        ],
  };

  const exploreHubSection = sectionById("explore");

  const reviewsCombinedSection: HubSection | null = (() => {
    const items = [
      ...(reviewsSection ? reviewsSection.items : []),
      ...(socialSection ? socialSection.items : []),
    ];
    if (!items.length) return null;
    return {
      id: "reviews",
      title: String(tUI("reviews_title") || (lang === "bg" ? "Отзиви" : "Reviews")),
      items,
    };
  })();

  const reviewsDisplaySection: HubSection = reviewsCombinedSection || {
    id: "reviews",
    title: String(tUI("reviews_title") || (lang === "bg" ? "Отзиви" : "Reviews")),
    items: [],
  };

  const receptionHubSection = sectionById("reception");
  const housekeepingHubSection = sectionById("housekeeping");
  const maintenanceHubSection = sectionById("maintenance");
  const emergencyTileSection = sectionById("emergency");

  const premiumTiles = [
    { id: "info", iconId: "info", title: premiumSectionCopy.hotelInfo, section: infoCombinedSection, requiresRoom: true },
    { id: "hotel_policies", iconId: "policy", title: getPremiumServiceTitle(lang, "hotelPolicy"), section: policyCombinedSection, requiresRoom: false },
    { id: "emergency", iconId: "emergency", title: lang === "bg" ? "Спешно повикване" : String(emergencyTileSection?.title || "Emergency call"), section: emergencyTileSection, requiresRoom: false, special: "emergency" as const },

    { id: "reception", iconId: "reception", title: premiumSectionCopy.onlineReception, section: receptionHubSection, requiresRoom: true },
    { id: "housekeeping", iconId: "housekeeping", title: premiumSectionCopy.onlineHousekeeping, section: housekeepingHubSection, requiresRoom: true },
    { id: "maintenance", iconId: "maintenance", title: premiumSectionCopy.onlineMaintenance, section: maintenanceHubSection, requiresRoom: true },

    { id: "massage_booking", iconId: "massage", title: getPremiumServiceTitle(lang, "bookMassage"), section: null, requiresRoom: true, special: "massage" as const },
    { id: "pillow_menu", iconId: "pillow", title: getPremiumServiceTitle(lang, "sleepPillows"), section: pillowMenuSection, requiresRoom: true },
    { id: "coffee_capsules", iconId: "coffee", title: getPremiumServiceTitle(lang, "orderCoffeeCapsules"), section: coffeeCapsulesSection, requiresRoom: true },

    { id: "restaurants", iconId: "restaurant", title: lang === "bg" ? "Ресторант" : String(restaurantOutletSection?.title || "Restaurant"), section: restaurantOutletSection, requiresRoom: true, outletCategories: ["restaurants"] },
    { id: "bars", iconId: "bars", title: lang === "bg" ? "Бар" : String(barsOutletSection?.title || "Bars"), section: barsOutletSection, requiresRoom: true, outletCategories: ["bars"] },
    { id: "entertainment", iconId: "entertainment", title: premiumSectionCopy.otherEntertainment, section: otherEntertainmentSection, requiresRoom: true, outletCategories: ["kids", "entertainment", "gym", "spa", "pool", "other", "room_service"] },

    { id: "explore", iconId: "explore", title: lang === "bg" ? "Около хотела" : String(exploreHubSection?.title || "Around the hotel"), section: exploreHubSection, requiresRoom: true },
    { id: "weather", iconId: "weather", title: lang === "bg" ? "Времето" : String(weatherSection.title || "Weather"), section: weatherSection, requiresRoom: true },
    { id: "reviews", iconId: "reviews", title: lang === "bg" ? "Отзиви" : reviewsDisplaySection.title, section: reviewsDisplaySection, requiresRoom: true },
  ].filter((tile) => tile.section || tile.special === "massage" || tile.special === "emergency");

  const selectedPremiumTile = openQuickServiceId
    ? premiumTiles.find((tile) => tile.id === openQuickServiceId) || null
    : null;

  const hotelStaySectionIds = new Set(["info", "weather"]);
  const foodEntertainmentSectionIds = new Set([
    "outlets",
    "animation",
    ...dynamicRequestDefSections.map((section) => section.id),
  ]);
  const reviewSocialSectionIds = new Set(["reviews", "social"]);
  const reservedSectionIds = new Set([
    ...quickServiceIds,
    ...hotelStaySectionIds,
    ...foodEntertainmentSectionIds,
    ...reviewSocialSectionIds,
    "explore",
    "ai",
    "emergency",
    "pillow_menu",
    "coffee_capsules",
    "massage_booking",
  ]);

  const hotelStaySections: HubSection[] = [];
  const foodEntertainmentSections: HubSection[] = [];
  const reviewSocialSections: HubSection[] = [];
  const exploreHubSectionForLegacy = null;
  const emergencyHubSection = sections.find((section) => section.id === "emergency") || null;
  const remainingSections = sections.filter((section) => !reservedSectionIds.has(section.id));
  const renderHubSection = (
    sec: HubSection,
    options?: { defaultOpen?: boolean; hideHeader?: boolean; keyPrefix?: string; outletCategories?: string[]; outletTitle?: string }
  ) => {
    const isLocked = !roomConfirmed && !preStayUnlockedSectionIds.has(sec.id);
    const key = `${options?.keyPrefix || "section"}-${sec.id}`;

    if (isLocked) {
      return (
        <LockedSectionCard
          key={key}
          title={String(sec.title)}
          message={roomCopy.lockedSectionMessage}
        />
      );
    }

    if (sec.id === "outlets") {
      return (
        <OutletsAccordion
          key={key}
          section={options?.outletTitle ? { ...sec, title: options.outletTitle } : sec}
          groups={options?.outletCategories ? groupedOutlets.filter((group) => options.outletCategories?.includes(group.category)) : groupedOutlets}
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
          focusRequestDefId={aiRequestNavigation?.sectionId === sec.id ? aiRequestNavigation.targetId : null}
          focusRequestNonce={aiRequestNavigation?.sectionId === sec.id ? aiRequestNavigation.nonce : 0}
          collapseToken={guestSectionsCollapseToken}
          defaultOpen={options?.defaultOpen}
          onTrack={trackGuestEvent}
        />
      );
    }

    return (
      <Accordion
        key={key}
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
        focusRequestDefId={aiRequestNavigation?.sectionId === sec.id ? aiRequestNavigation.targetId : null}
        focusRequestNonce={aiRequestNavigation?.sectionId === sec.id ? aiRequestNavigation.nonce : 0}
        collapseToken={guestSectionsCollapseToken}
        onCloseAi={clearAiState}
        onTrack={trackGuestEvent}
        defaultOpen={options?.defaultOpen}
        hideHeader={options?.hideHeader}
      />
    );
  };

  const closeAiPanel = () => {
    setAiPanelOpen(false);
    clearAiState();
    trackGuestEvent({
      eventName: "section_closed",
      eventCategory: "ai",
      section: "ai",
      sectionKey: "ai",
      label: String(tUI("ai_title") || "AI Concierge"),
      value: "closed",
    });
  };

  const openAiPanel = () => {
    if (!ensureConfirmedRoom()) return;
    setAiPanelOpen(true);
    trackGuestEvent({
      eventName: "ai_opened",
      eventCategory: "ai",
      section: "ai",
      sectionKey: "ai",
      label: String(tUI("ai_title") || "AI Concierge"),
      value: "open",
    });
  };

  const emergencyAction = emergencyHubSection?.items.find(
    (item) => item.kind === "link" && Boolean(item.href)
  );

  return (
    <div className="stayhub-premium-screen mx-auto min-h-screen max-w-md" style={themeStyle}>
      <div className={isAquamarineHub ? "relative stayhub-premium-hero-wrap-sandbox" : "relative"}>
        <div className={isAquamarineHub ? "stayhub-premium-hero stayhub-premium-hero-sandbox relative w-full overflow-hidden" : "stayhub-premium-hero relative h-[246px] sm:h-[270px] md:h-[300px] w-full overflow-hidden"}>
          <img
            src={isAquamarineHub ? "/images/aquamarine-test-hero-v6.jpg" : config.coverImage}
            alt={config.hotelName}
            className={isAquamarineHub ? "stayhub-premium-hero-image-sandbox" : "h-full w-full object-cover"}
            style={isAquamarineHub ? undefined : { objectPosition: config.coverImagePosition || "center center" }}
          />
        </div>

        <div className={isAquamarineHub ? "stayhub-premium-hero-overlay stayhub-premium-hero-overlay-sandbox absolute inset-0" : "stayhub-premium-hero-overlay absolute inset-0"} />

        <div className="stayhub-premium-hero-content absolute inset-0 z-10 flex flex-col p-4">
          <div className="flex items-start justify-between gap-3">
            <img
              src="/icons/guesthub-premium/stayhub-full-logo.png"
              alt="StayHub"
              className="stayhub-full-brand-logo"
              draggable={false}
              decoding="async"
            />

            <select
              value={String(lang)}
              onChange={(e) => setLang(e.target.value as LangKey)}
              className="stayhub-language-select rounded-xl px-3 py-2 text-sm outline-none"
              aria-label="Language"
            >
              {config.languages.map((l) => (
                <option key={String(l)} value={String(l)}>
                  {String(l).toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="stayhub-hero-welcome mt-auto text-center">
            <h1 className="stayhub-hero-title leading-tight drop-shadow-md">{getPremiumWelcomeTitle(lang)}</h1>
            <p className="stayhub-hero-subtitle mt-1 text-sm">{tUI("hero_subtitle")}</p>
          </div>
        </div>
      </div>

      {roomConfirmed && room.trim() ? (
        <div className="stayhub-confirmed-room-wrap px-4">
          <div className="stayhub-confirmed-room-card stayhub-confirmed-stay-card">
            <span>{roomCopy.confirmedState.replace("{room}", room)}</span>
            <small>
              {isDateExemptTestRoom(room)
                ? stayCopy.testRoomNoDates
                : stayCopy.confirmedLine.replace("{checkIn}", checkInDate).replace("{checkOut}", checkOutDate)}
            </small>
          </div>
          <button
            type="button"
            onClick={startRoomChangeFlow}
            className="stayhub-confirmed-room-card stayhub-room-switch-link"
          >
            {roomSwitchCopy.title}
          </button>
        </div>
      ) : null}

      {roomConfirmed ? (
        <div className="stayhub-post-confirm-actions px-4">
          <div className="stayhub-post-confirm-actions-grid">
            <div className="stayhub-post-confirm-action-card">
              <InstallAppButton
                lang={lang}
                label={String(tUI("install_app") || "Инсталирай приложението")}
              />
            </div>
            <GuestSurveyPushControls
              hotelSlug={String(config.hotelSlug || hotelContentSlug || "aquamarin")}
              room={room}
              roomConfirmed={roomConfirmed}
              lang={lang}
              timezone={hotelTimezone}
              stayId={activeStayId}
              stayDeviceId={stayDeviceId}
              deviceToken={stayDeviceToken}
              checkInDate={checkInDate}
              checkOutDate={checkOutDate}
            />
          </div>
        </div>
      ) : null}

      {roomConfirmed && showRoomSwitchCard ? (
        <div className="mt-3 px-4">
          <div className="rounded-2xl stayhub-panel stayhub-room-panel p-4">
            <h2 className="text-base font-medium" style={{ color: "#202627" }}>
              {roomSwitchCopy.title}
            </h2>
            <p className="mt-2 text-sm leading-6" style={{ color: "#202627" }}>
              {roomSwitchCopy.description}
            </p>
            <div className="mt-4">
              <label className="mb-2 block text-xs font-medium uppercase tracking-[0.16em]" style={{ color: "#202627" }}>
                {roomCopy.inputLabel}
              </label>
              <input
                value={manualRoomInput}
                onChange={(e) => setManualRoomInput(e.target.value)}
                placeholder={roomCopy.inputPlaceholder}
                inputMode="numeric"
                autoComplete="off"
                className="w-full rounded-xl stayhub-card px-4 py-3 text-sm outline-none placeholder:text-[color:var(--stayhub-muted)]"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setShowRoomSwitchCard(false); setManualRoomInput(""); }}
                className="stayhub-room-switch-secondary rounded-xl px-4 py-3 text-sm font-medium transition active:scale-[0.99]"
              >
                {roomSwitchCopy.cancel}
              </button>
              <button
                type="button"
                onClick={confirmManualRoom}
                className="rounded-xl px-4 py-3 text-sm font-semibold transition hover:opacity-95 active:scale-[0.99] stayhub-final-brand-cta"
                style={{ backgroundColor: "var(--stayhub-action)", color: "#ffffff" }}
              >
                {roomSwitchCopy.confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
              className="mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold transition hover:opacity-95 active:scale-[0.99] stayhub-final-brand-cta"
              style={{ backgroundColor: "var(--stayhub-action)", color: "#ffffff" }}
            >
              {guestIntroCopy.button}
            </button>
          </div>
        </div>
      ) : null}

      {/* room switch banner removed - handled only by modal */}

      {!roomConfirmed ? (
        <div id="stayhub-room-confirmation" className="mt-3 scroll-mt-4 px-4">
          <div className="rounded-2xl stayhub-panel stayhub-room-panel p-4">
            <h2 className="text-base font-medium" style={{ color: "#202627" }}>{roomCopy.cardTitle}</h2>
            <p className="mt-2 text-sm leading-6" style={{ color: "#202627" }}>{roomCopy.cardText}</p>

            <div className="mt-4">
              <label className="mb-2 block text-xs font-medium uppercase tracking-[0.16em]" style={{ color: "#202627" }}>
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

            {isDateExemptTestRoom(manualRoomInput) ? (
              <p className="mt-3 rounded-xl stayhub-card px-3 py-3 text-sm" style={{ color: "#4f6668" }}>
                {stayCopy.testRoomNoDates}
              </p>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3 stayhub-stay-date-grid">
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.12em]" style={{ color: "#202627" }}>
                      {stayCopy.checkInLabel}
                    </label>
                    <LocalizedStayDatePicker
                      value={checkInDate}
                      max={hotelTodayDateKey}
                      todayDateKey={hotelTodayDateKey}
                      lang={lang}
                      ariaLabel={stayCopy.checkInLabel}
                      onChange={(nextValue) => {
                        const next = normalizeStayDateKey(nextValue);
                        setCheckInDate(next);
                        if (checkOutDate && next && checkOutDate <= next) {
                          setCheckOutDate(addDaysToStayDateKey(next, 1));
                        }
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.12em]" style={{ color: "#202627" }}>
                      {stayCopy.checkOutLabel}
                    </label>
                    <LocalizedStayDatePicker
                      value={checkOutDate}
                      min={checkInDate ? addDaysToStayDateKey(checkInDate, 1) : hotelTodayDateKey}
                      todayDateKey={hotelTodayDateKey}
                      lang={lang}
                      ariaLabel={stayCopy.checkOutLabel}
                      onChange={(nextValue) => setCheckOutDate(normalizeStayDateKey(nextValue))}
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs leading-5" style={{ color: "#4f6668" }}>{stayCopy.stayHelp}</p>
              </>
            )}

            <button
              type="button"
              data-stayhub-room-confirm-cta="true"
              onClick={confirmManualRoom}
              disabled={stayConfirming}
              className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-semibold transition hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
              style={{ backgroundColor: "var(--stayhub-action)", color: "#ffffff" }}
            >
              {stayConfirming ? stayCopy.confirming : roomCopy.confirmButton}
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
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[70] w-[min(92vw,560px)] -translate-x-1/2 px-4">
          {submittingRequest ? (
            <div className="stayhub-request-toast stayhub-request-toast-sending rounded-2xl border px-4 py-4 shadow-2xl">
              <div className="text-sm font-medium">{roomCopy.requestSendingTitle}</div>
              <p className="mt-1 text-sm leading-6 text-sky-100/90">
                {roomCopy.requestSendingText.replace("{typeLabel}", submittingRequestLabel || "...")}
              </p>
            </div>
          ) : (
            <div className="stayhub-request-toast stayhub-request-toast-success rounded-2xl border px-4 py-4 shadow-2xl">
              <div className="text-sm font-medium">{roomCopy.requestAcceptedTitle}</div>
              <p className="mt-1 text-sm leading-6 text-emerald-100/90">
                {roomCopy.requestAcceptedText}
              </p>
            </div>
          )}
        </div>
      ) : null}

      {roomModal ? (
        <div className="stayhub-room-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="stayhub-room-modal w-full max-w-md rounded-2xl border border-white/10 bg-neutral-950 p-5 shadow-2xl">
            <div className="text-lg font-semibold text-white">
              {isRoomSwitchConfirmation
                ? lang === "bg"
                  ? "Смяна на стая"
                  : lang === "de"
                    ? "Zimmer wechseln"
                    : lang === "ru"
                      ? "Смена номера"
                      : "Switch room"
                : lang === "bg"
                  ? "Потвърждение на стая"
                  : lang === "de"
                    ? "Zimmer bestätigen"
                    : lang === "ru"
                      ? "Подтверждение номера"
                      : "Confirm room"}
            </div>

            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-neutral-200">
              {isRoomSwitchConfirmation && roomModal.currentRoom
                ? lang === "bg"
                  ? `В момента устройството е активно за стая ${roomModal.currentRoom}. Сменяйте стаята само ако наистина сте преместени в друга стая. Сигурни ли сте, че искате да преминете към стая ${roomModal.nextRoom}?`
                  : lang === "de"
                    ? `Dieses Gerät ist aktuell für Zimmer ${roomModal.currentRoom} aktiv. Wechseln Sie das Zimmer nur, wenn Sie tatsächlich in ein anderes Zimmer umgezogen sind. Sind Sie sicher, dass Sie zu Zimmer ${roomModal.nextRoom} wechseln möchten?`
                    : lang === "ru"
                      ? `Сейчас устройство привязано к номеру ${roomModal.currentRoom}. Меняйте номер только в том случае, если вас действительно переселили. Вы уверены, что хотите перейти к номеру ${roomModal.nextRoom}?`
                      : `This device is currently active for room ${roomModal.currentRoom}. Change the room only if you have actually been moved to another room. Are you sure you want to switch to room ${roomModal.nextRoom}?`
                : isDateExemptTestRoom(roomModal.nextRoom)
                  ? `${roomCopy.confirmMessage.replace("{room}", roomModal.nextRoom)}
${stayCopy.testRoomNoDates}`
                  : `${roomCopy.confirmMessage.replace("{room}", roomModal.nextRoom)}
${stayCopy.confirmLine.replace("{checkIn}", checkInDate).replace("{checkOut}", checkOutDate)}`}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={cancelRoomConfirmation}
                className="rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-sm font-semibold text-white"
              >
                {lang === "bg" ? "Отказ" : lang === "de" ? "Abbrechen" : lang === "ru" ? "Отмена" : "Cancel"}
              </button>

              <button
                type="button"
                onClick={() => void acceptRoomConfirmation()}
                disabled={stayConfirming}
                className="rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                style={{ backgroundColor: "var(--stayhub-action)", color: "#ffffff" }}
              >
                {stayConfirming
                  ? stayCopy.confirming
                  : isRoomSwitchConfirmation
                    ? lang === "bg"
                    ? "Смени стаята"
                    : lang === "de"
                      ? "Zimmer wechseln"
                      : lang === "ru"
                        ? "Сменить номер"
                        : "Switch room"
                  : lang === "bg"
                    ? "Потвърди"
                    : lang === "de"
                      ? "Bestätigen"
                      : lang === "ru"
                        ? "Подтвердить"
                        : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {requestDialog ? (
        <div className="stayhub-request-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="stayhub-request-modal w-full max-w-md rounded-2xl border border-white/10 bg-neutral-950 p-5 shadow-2xl">
            <div className="stayhub-request-modal-title text-lg font-semibold text-white">
              {requestDialog.title}
            </div>

            <p className="stayhub-request-modal-message mt-3 whitespace-pre-line text-sm leading-6 text-neutral-200">
              {requestDialog.message}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {requestDialog.cancelLabel ? (
                <button
                  type="button"
                  onClick={closeRequestDialog}
                  className="stayhub-request-modal-cancel rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-sm font-semibold text-white"
                >
                  {requestDialog.cancelLabel}
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={requestDialog.onConfirm ? confirmRequestDialog : closeRequestDialog}
                className="stayhub-request-modal-confirm rounded-xl px-4 py-3 text-sm font-semibold"
                style={{ backgroundColor: "var(--stayhub-action)", color: "var(--stayhub-text)" }}
              >
                {requestDialog.confirmLabel ||
                  (lang === "bg" ? "Добре" : lang === "de" ? "OK" : "OK")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {roomConfirmed ? (
        <Day3GuestSurvey
          hotelSlug={String(config.hotelSlug || hotelContentSlug || "aquamarin")}
          room={room}
          roomConfirmed={roomConfirmed}
          lang={lang}
          timezone={hotelTimezone}
          stayId={activeStayId}
          stayDeviceId={stayDeviceId}
          checkInDate={checkInDate}
          checkOutDate={checkOutDate}
          onTrack={trackGuestEvent}
        />
      ) : null}

      {roomConfirmed && activeGuestMassageBookings.length > 0 ? (
        <div className="mt-3 px-4">
          <div className="rounded-2xl stayhub-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-white">
                {getMassageReservationCopy(lang).title}
              </h2>
              <span
                className="rounded-full border border-emerald-300/30 bg-emerald-400/15 px-3 py-1 text-xs font-medium uppercase tracking-wide"
                style={{ color: "var(--stayhub-primary)" }}
              >
                {getMassageReservationCopy(lang).confirmed}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {activeGuestMassageBookings.map((booking) => {
                const copy = getMassageReservationCopy(lang);
                const reminder = getMassageReservationReminder(booking, lang);

                return (
                  <div key={booking.id} className="rounded-xl stayhub-card px-3 py-3">
                    <div className="flex items-start gap-3">
                      <span className="text-xl leading-none">💆</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-white">
                          {booking.serviceName}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-neutral-300">
                          {booking.dateLabel} • {booking.time}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-neutral-400">
                          {[
                            `${copy.duration}: ${booking.durationMinutes} ${copy.minutes}`,
                            Number.isFinite(Number(booking.price)) && Number(booking.price) > 0
                              ? `${copy.price}: ${Number(booking.price).toFixed(2)} ${booking.currency}`
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" • ")}
                        </div>

                        {booking.manualSheetChanged && booking.changeNotice ? (
                          <div className="mt-2 rounded-lg border border-sky-300/30 bg-sky-400/15 px-3 py-2 text-xs font-semibold text-sky-100">
                            {booking.changeNotice}
                          </div>
                        ) : null}

                        {reminder ? (
                          <div className="mt-2 rounded-lg border border-amber-300/30 bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-100">
                            {reminder}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
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
                    className="stayhub-guest-request-card rounded-xl stayhub-card px-3 py-3"
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

      <div className="px-4 pb-28 pt-3">
        <div className="space-y-3">
          {premiumTiles.length ? (
            <section aria-label={guestNavigationLabel("quick_services_title", guestNavCopy.quickServices)}>
              <div className="stayhub-premium-grid grid grid-cols-3 gap-2.5">
                {premiumTiles.map((tile) => {
                  const isLocked = Boolean(tile.requiresRoom) && !roomConfirmed;
                  const isSelected = openQuickServiceId === tile.id;

                  return (
                    <button
                      key={`premium-${tile.id}`}
                      data-stayhub-premium-tile={tile.id}
                      type="button"
                      onClick={() => {
                        if ((tile as any).special === "emergency") {
                          if (!emergencyAction || emergencyAction.kind !== "link" || !emergencyAction.href) return;

                          trackGuestEvent({
                            eventName: "phone_link_clicked",
                            eventCategory: "emergency",
                            section: "emergency",
                            sectionKey: "emergency",
                            buttonKey: "call_reception",
                            label: String(emergencyHubSection?.title || tUI("emergency_title") || "Emergency"),
                            value: "tel",
                            extra: { href: emergencyAction.href },
                          });

                          window.location.href = emergencyAction.href;
                          return;
                        }

                        if (isLocked) {
                          trackGuestEvent({
                            eventName: "locked_section_clicked",
                            eventCategory: "navigation",
                            section: tile.id,
                            sectionKey: tile.id,
                            buttonKey: "premium_home_tile",
                            label: String(tile.title || tile.id),
                            value: "locked",
                            roomConfirmed: false,
                          });
                          if (!ensureConfirmedRoom()) return;
                        }

                        const nextId = isSelected ? null : tile.id;
                        setOpenQuickServiceId(nextId);
                        trackGuestEvent({
                          eventName: nextId ? "section_opened" : "section_closed",
                          eventCategory: "navigation",
                          section: tile.id,
                          sectionKey: tile.id,
                          buttonKey: "premium_home_tile",
                          label: String(tile.title || tile.id),
                          value: nextId ? "open" : "closed",
                        });
                      }}
                      className={clsx(
                        "stayhub-premium-tile text-center transition active:scale-[0.99]",
                        isSelected ? "stayhub-premium-tile-active" : "",
                        isLocked ? "stayhub-premium-tile-locked" : "",
                        (tile as any).special === "emergency" ? "stayhub-premium-tile-emergency" : ""
                      )}
                    >
                      <span className="stayhub-premium-tile-icon" aria-hidden="true">
                        <PremiumSectionIcon id={tile.iconId} />
                      </span>
                      <span className="stayhub-premium-tile-label">
                        {stripLeadingVisualIcon(String(tile.title))}
                      </span>
                      {isLocked ? (
                        <span className="stayhub-premium-tile-lock" aria-hidden="true">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect x="5.5" y="10" width="13" height="10" rx="2.4" />
                            <path d="M8.5 10V7.3a3.5 3.5 0 0 1 7 0V10" />
                          </svg>
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>            </section>
          ) : null}

          {remainingSections.length ? (
            <div className="space-y-2">
              {remainingSections.map((section) =>
                renderHubSection(section, { keyPrefix: "more" })
              )}
            </div>
          ) : null}

        </div>

        <p className="mt-6 text-center text-xs text-neutral-400">{tUI("notice")}</p>
      </div>


      {selectedPremiumTile ? (
        <div className="stayhub-section-window-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 sm:items-center">
          <div className="stayhub-section-window w-full max-w-md rounded-[24px] p-3 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="stayhub-section-window-icon" aria-hidden="true">
                  <PremiumSectionIcon id={selectedPremiumTile.iconId || selectedPremiumTile.id || String(selectedPremiumTile.title)} />
                </span>
                <div className="truncate text-base font-semibold">{stripLeadingVisualIcon(String(selectedPremiumTile.title))}</div>
              </div>
              <button
                type="button"
                onClick={() => setOpenQuickServiceId(null)}
                className="stayhub-section-window-close"
                aria-label={guestNavigationLabel("close", guestNavCopy.close)}
              >
                ×
              </button>
            </div>

            <div className="stayhub-section-window-body max-h-[72vh] overflow-y-auto pr-1">
              {(selectedPremiumTile as any).special === "massage" ? (
                roomConfirmed && room.trim() ? (
                  <MassageBookingSection
                    hotelSlug={hotelContentSlug}
                    language={lang}
                    room={room}
                    roomConfirmed={roomConfirmed}
                    stayId={activeStayId}
                    stayDeviceId={stayDeviceId}
                    protectedSubmissionEnabled={true}
                    forceOpenToken={1}
                    collapseToken={guestSectionsCollapseToken}
                    onBookingSubmissionChange={handleMassageBookingSubmissionChange}
                    onBookingConfirmed={handleMassageBookingConfirmed}
                    onRequireRoomConfirmation={() => {
                      window.alert(roomCopy.lockedActionAlert);
                      window.setTimeout(() => {
                        document
                          .getElementById("stayhub-room-confirmation")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 0);
                    }}
                    onTrack={trackGuestEvent}
                  />
                ) : (
                  <LockedSectionCard
                    title={String(selectedPremiumTile.title)}
                    message={roomCopy.lockedSectionMessage}
                  />
                )
              ) : selectedPremiumTile.id === "contact" ? (
                <div className="space-y-2">
                  {quickServiceSections
                    .filter((section) => section.id !== "wifi")
                    .map((section) =>
                      renderHubSection(section, {
                        defaultOpen: false,
                        keyPrefix: "contact-detail",
                      })
                    )}
                </div>
              ) : selectedPremiumTile.section ? (
                selectedPremiumTile.section.id === "outlets" ? (
                  renderHubSection(selectedPremiumTile.section, {
                    defaultOpen: true,
                    keyPrefix: `premium-${selectedPremiumTile.id}`,
                    outletCategories: (selectedPremiumTile as any).outletCategories,
                    outletTitle: String(selectedPremiumTile.title),
                  })
                ) : (
                  renderHubSection(selectedPremiumTile.section, {
                    defaultOpen: true,
                    keyPrefix: `premium-${selectedPremiumTile.id}`,
                  })
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="px-4 pb-7">
      <button
        type="button"
        onClick={openAiPanel}
        className={clsx(
          "stayhub-ai-trigger w-full inline-flex items-center gap-3 rounded-[24px] px-5 py-4 text-sm font-semibold shadow-lg transition hover:opacity-95 active:scale-[0.98]",
          roomConfirmed ? "ring-1 ring-white/25" : "border"
        )}
        style={
          roomConfirmed
            ? {
                backgroundColor: "rgba(255,255,255,0.92)",
                color: "#0b6668",
              }
            : {
                backgroundColor: "#F5F5F5",
                borderColor: "#7ccfc6",
                color: "#0b6668",
              }
        }
        aria-label={getCurrentGuestUiText("ai_open") || guestNavCopy.askAi}
      >
        <span className="stayhub-ai-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="8" width="14" height="11" rx="3" />
            <path d="M12 5v3" />
            <circle cx="9" cy="13" r="1" />
            <circle cx="15" cy="13" r="1" />
            <path d="M9.5 16h5" />
            <path d="M4 12H2.8" />
            <path d="M21.2 12H20" />
          </svg>
        </span>
        <span className="flex-1 text-center">{String(tUI("ai_title") || "AI Concierge")}</span>
        {!roomConfirmed ? (
          <span
            className="stayhub-premium-lock-dot stayhub-ai-lock-dot"
            aria-label="Locked"
            title="Locked"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
        ) : null}
      </button>
      </div>

      {aiPanelOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-3 sm:items-center">
          <div className="stayhub-ai-panel-shell w-full max-w-md rounded-2xl stayhub-section-shell p-4 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="mr-auto flex items-center gap-2 text-lg font-semibold"><span className="stayhub-ai-icon stayhub-ai-icon-small" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 5v3"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><path d="M9.5 16h5"/></svg></span>{String(tUI("ai_title") || "AI Concierge")}</div>
              <div className="flex items-center gap-2">
                {aiHistory.length || aiQ.trim() ? (
                  <button
                    type="button"
                    onClick={clearAiState}
                    className="rounded-full stayhub-card px-3 py-2 text-xs font-semibold"
                  >
                    {aiChatCopy.newConversation}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closeAiPanel}
                  className="rounded-full stayhub-card px-3 py-2 text-xs font-semibold"
                >
                  {guestNavigationLabel("close", guestNavCopy.close)}
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2">
              {aiHistory.length === 0 && !aiLoading ? (
                <div className="rounded-xl stayhub-card p-3 text-sm leading-6">
                  {aiIntroText}
                </div>
              ) : (
                <div
                  ref={aiConversationRef}
                  className="max-h-[44vh] min-w-0 overflow-y-auto overflow-x-hidden rounded-xl p-1"
                >
                  <AiConversationMessages
                    history={aiHistory}
                    loading={aiLoading}
                    loadingText={String(tUI("ai_loading") || "Thinking...")}
                    lang={lang}
                    onAction={handleAiAction}
                  />
                </div>
              )}

              <textarea
                value={aiQ}
                onChange={(event) => setAiQ(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void askAI();
                  }
                }}
                placeholder={
                  aiHistory.length
                    ? aiChatCopy.followUp
                    : String(tUI("ai_placeholder") || "Ask a question about the hotel...")
                }
                className="min-h-[88px] w-full rounded-xl stayhub-card p-3 text-sm outline-none placeholder:text-[color:var(--stayhub-muted)]"
              />

              <button
                type="button"
                onClick={() => void askAI()}
                disabled={aiLoading || !aiQ.trim()}
                className="rounded-xl px-3 py-3 text-left text-sm font-semibold stayhub-action-card transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {aiLoading
                  ? String(tUI("ai_loading") || "Thinking...")
                  : String(tUI("ai_send") || "Send")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


function AiConversationMessages({
  history,
  loading,
  loadingText,
  lang,
  onAction,
}: {
  history: AiChatMessage[];
  loading: boolean;
  loadingText: string;
  lang: LangKey;
  onAction: (action: AiChatAction) => void;
}) {
  return (
    <div className="space-y-2">
      {history.map((message, index) => (
        <div
          key={`${message.role}-${index}-${message.content.slice(0, 24)}`}
          className={clsx("flex", message.role === "user" ? "justify-end" : "justify-start")}
        >
          <div
            className={clsx(
              "max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-6",
              message.role === "user" ? "stayhub-action-card" : "stayhub-card"
            )}
          >
            {message.role === "assistant" ? (
              <>
                <AiAnswerContent text={message.content} lang={lang} />
                {message.actions?.length ? (
                  <div className="mt-3 grid grid-cols-1 gap-2 border-t border-white/15 pt-3">
                    {message.actions.map((action) => (
                      <button
                        key={`${action.kind}-${action.targetId}`}
                        type="button"
                        onClick={() => onAction(action)}
                        className="rounded-xl px-3 py-2 text-left text-sm font-semibold stayhub-action-card transition active:scale-[0.99]"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              message.content
            )}
          </div>
        </div>
      ))}
      {loading ? (
        <div className="flex justify-start">
          <div className="max-w-[88%] rounded-2xl stayhub-card px-3 py-2 text-sm leading-6">
            {loadingText}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AiAnswerContent({ text, lang }: { text: string; lang: LangKey }) {
  const parts = String(text || "").split(/(https?:\/\/[^\s]+)/g);
  const linkLabels: Record<LangKey, string> = {
    bg: "Отвори линка",
    en: "Open link",
    de: "Link öffnen",
    ro: "Deschide linkul",
    cs: "Otevřít odkaz",
    ru: "Открыть ссылку",
  };

  return (
    <>
      {parts.map((part, index) => {
        if (!/^https?:\/\//i.test(part)) return <span key={`ai-text-${index}`}>{part}</span>;

        const match = part.match(/^(.*?)([),.;!?]+)?$/);
        const href = String(match?.[1] || part);
        const trailing = String(match?.[2] || "");

        return (
          <span key={`ai-link-${index}`} className="inline-flex max-w-full items-center gap-1 align-middle">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full rounded-lg px-3 py-2 font-semibold underline decoration-2 underline-offset-2 stayhub-action-card"
            >
              {linkLabels[lang] || linkLabels.en}
            </a>
            {trailing}
          </span>
        );
      })}
    </>
  );
}

function SectionGroupAccordion({
  id,
  title,
  children,
  forceOpenToken = 0,
  collapseToken = 0,
  defaultOpen = false,
  onTrack,
}: {
  id: string;
  title: string;
  children: ReactNode;
  forceOpenToken?: number;
  collapseToken?: number;
  defaultOpen?: boolean;
  onTrack: (payload: TrackHubPayload) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (forceOpenToken > 0) setOpen(true);
  }, [forceOpenToken]);

  useEffect(() => {
    if (collapseToken <= 0) return;
    setOpen(false);
  }, [collapseToken]);

  return (
    <div className="overflow-hidden rounded-2xl stayhub-section-shell">
      <button
        type="button"
        onClick={() =>
          setOpen((previous) => {
            const next = !previous;
            onTrack({
              eventName: next ? "section_opened" : "section_closed",
              eventCategory: "navigation",
              section: id,
              sectionKey: id,
              label: title,
              value: next ? "open" : "closed",
            });
            return next;
          })
        }
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left stayhub-section-header"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="stayhub-section-header-icon" aria-hidden="true">
            <PremiumSectionIcon id={id} />
          </span>
          <span className="truncate text-base font-medium">{stripLeadingVisualIcon(title)}</span>
        </span>
        <span className="stayhub-section-header-chevron">{open ? "▴" : "▾"}</span>
      </button>

      {open ? (
        <div className="space-y-2 px-3 py-3 stayhub-section-body">
          {children}
        </div>
      ) : null}
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
  focusRequestDefId = null,
  focusRequestNonce = 0,
  collapseToken = 0,
  onCloseAi,
  onTrack,
  defaultOpen = false,
  hideHeader = false,
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
  focusRequestDefId?: string | null;
  focusRequestNonce?: number;
  collapseToken?: number;
  onCloseAi?: () => void;
  onTrack: (payload: TrackHubPayload) => void;
  defaultOpen?: boolean;
  hideHeader?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [openRequestDefId, setOpenRequestDefId] = useState<string | null>(null);
  const [openInfoItemKey, setOpenInfoItemKey] = useState<string | null>(null);

  useEffect(() => {
    if (collapseToken <= 0) return;
    setOpen(false);
    setOpenRequestDefId(null);
    setOpenInfoItemKey(null);
  }, [collapseToken]);

  useEffect(() => {
    if (!focusRequestDefId || focusRequestNonce <= 0) return;

    const targetIndex = section.items.findIndex((item) => {
      const def = (item as any)?.requestDef as RequestDef | undefined;
      if (!def) return false;
      const id = String(def.id || "").trim();
      const requestType = String(def.requestType || "").trim();
      return id === focusRequestDefId || requestType === focusRequestDefId;
    });

    if (targetIndex < 0) return;

    const targetItem = section.items[targetIndex] as any;
    const targetDef = targetItem.requestDef as RequestDef | undefined;
    if (!targetDef) return;

    setOpen(true);

    if (targetItem.kind === "request_def") {
      setOpenRequestDefId(
        `${String(targetDef.id || targetDef.requestType || "request")}-${targetIndex}`
      );
    }

    window.setTimeout(() => {
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>("[data-stayhub-request-def-id]")
      );
      const targetNode = nodes.find(
        (node) => node.dataset.stayhubRequestDefId === focusRequestDefId
      );
      targetNode?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 160);
  }, [focusRequestDefId, focusRequestNonce, section.id]);

  return (
    <div
      className={clsx(
        "rounded-2xl overflow-hidden stayhub-section-shell",
        section.id === "ai" && "stayhub-ai-section"
      )}
    >
      {!hideHeader ? (
        <button
          type="button"
          onClick={() =>
            setOpen((prev) => {
              const next = !prev;
              const sectionId = String(section.id || "section");

              onTrack({
                eventName: sectionId === "ai" && next ? "ai_opened" : next ? "section_opened" : "section_closed",
                eventCategory: sectionId === "ai" ? "ai" : "navigation",
                section: sectionId,
                sectionKey: sectionId,
                label: String(section.title || sectionId),
                value: next ? "open" : "closed",
              });

              if (section.id === "ai" && !next) {
                onCloseAi?.();
              }

              return next;
            })
          }
          className="w-full px-4 py-4 text-left stayhub-section-header flex items-center justify-between gap-3"
        >
          <div className="flex min-w-0 items-center gap-3">
            {/* STAYHUB_INTERNAL_PREMIUM_SECTION_HEADER */}
            <span className="stayhub-section-header-icon" aria-hidden="true">
              <PremiumSectionIcon
                id={String(
                  (section as any).id ||
                    (section as any).key ||
                    (section as any).type ||
                    (section as any).section ||
                    section.title
                )}
              />
            </span>
            <div className="min-w-0">
              <div className="truncate text-base font-medium">
                {stripLeadingVisualIcon(section.title)}
              </div>
              {section.subtitle ? (
                <div
                  className={clsx(
                    "mt-1 text-xs font-medium opacity-80",
                    ["reception", "housekeeping", "maintenance"].includes(String(section.id)) &&
                      "stayhub-department-intro"
                  )}
                >
                  {stripLeadingVisualIcon(section.subtitle)}
                </div>
              ) : null}
            </div>
          </div>
          <div className="text-lg">▾</div>
        </button>
      ) : null}

      {hideHeader || open ? (
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
                  const infoItemKey = `${String(section.id || "section")}-${idx}`;
                  const isInfoAccordion = (section.id === "info" || section.id === "hotel_policies") && Boolean(it.label);
                  const isInfoOpen = openInfoItemKey === infoItemKey;

                  if (isInfoAccordion) {
                    return (
                      <div
                        key={infoItemKey}
                        className={clsx(
                          "overflow-hidden rounded-xl stayhub-card text-sm",
                          section.id === "hotel_policies" && "stayhub-policy-item"
                        )}
                      >
                        <button
                          type="button"
                          aria-expanded={isInfoOpen}
                          onClick={() => {
                            const nextOpen = !isInfoOpen;
                            setOpenInfoItemKey(nextOpen ? infoItemKey : null);
                            onTrack({
                              eventName: nextOpen ? "info_item_opened" : "info_item_closed",
                              eventCategory: "navigation",
                              section: String(section.id || "info"),
                              sectionKey: String(section.id || "info"),
                              itemKey: infoItemKey,
                              label: String(it.label || "info"),
                              value: nextOpen ? "open" : "closed",
                            });
                          }}
                          className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                        >
                          <span className="font-medium text-white">{stripLeadingVisualIcon(String(it.label || ""))}</span>
                          <span className="text-base text-white/80">{isInfoOpen ? "▴" : "▾"}</span>
                        </button>

                        {isInfoOpen ? (
                          <div className={clsx(
                              "whitespace-pre-wrap border-t border-white/10 px-3 pb-3 pt-3 text-neutral-100",
                              section.id === "hotel_policies" && "stayhub-policy-copy"
                            )}>
                            {it.info}
                          </div>
                        ) : null}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={infoItemKey}
                      className="rounded-xl stayhub-card p-3 text-sm"
                    >
                      {it.label ? (
                        <div className="font-medium text-white">{stripLeadingVisualIcon(String(it.label || ""))}</div>
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
                  const message = getRequestDefMessage(def);
                  const priceHint = getRequestDefPriceHint(def);
                  const localizedOptions = getRequestDefOptions(def);
                  const optionImages = getRequestDefOptionImages(def);
                  const optionInfos = getRequestDefOptionInfo(def);
                  const isQuantity = def.requestKind === "quantity" || def.requiresQuantity;
                  const quickKey = `${String(def.id || def.requestType || "request")}-${idx}`;
                  const isQuickOpen = openRequestDefId === quickKey;

                  return (
                    <div
                      key={quickKey}
                      data-stayhub-request-def-id={String(def.id || def.requestType || "").trim()}
                      className="rounded-xl stayhub-card overflow-hidden text-sm"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onTrack({
                            eventName: isQuickOpen ? "request_option_closed" : "request_option_opened",
                            eventCategory: "request",
                            section: String(section.id || "section"),
                            sectionKey: String(section.id || "section"),
                            itemKey: String(def.id || def.requestType || "request"),
                            label: title,
                            value: isQuickOpen ? "closed" : "open",
                          });
                          setOpenRequestDefId(isQuickOpen ? null : quickKey);
                        }}
                        className="w-full px-3 py-3 text-left flex items-center justify-between gap-3"
                      >
                        <span className="font-medium text-white">
                          {stripLeadingVisualIcon(title)}
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
                              {lang === "bg" ? "Цена" : lang === "de" ? "Preis" : lang === "ro" ? "Preț" : lang === "cs" ? "Cena" : lang === "ru" ? "Цена" : "Price"}: {priceHint}
                            </div>
                          ) : null}

                          {isQuantity ? (
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              {getQuantityChoices(def).map((qty) => (
                                <button
                                  key={qty}
                                  type="button"
                                  disabled={submittingRequest}
                                  onClick={() => {
                                    onTrack({
                                      eventName: "request_quantity_selected",
                                      eventCategory: "request",
                                      section: String(section.id || "section"),
                                      sectionKey: String(section.id || "section"),
                                      itemKey: String(def.id || def.requestType || "request"),
                                      buttonKey: "quantity_choice",
                                      label: title,
                                      value: String(qty),
                                    });
                                    submitRequestDefQuantityChoice(def, qty);
                                  }}
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
                                      onClick={() => {
                                        onTrack({
                                          eventName: "request_option_selected",
                                          eventCategory: "request",
                                          section: String(section.id || "section"),
                                          sectionKey: String(section.id || "section"),
                                          itemKey: String(def.id || def.requestType || "request"),
                                          buttonKey: "selection_option",
                                          label: title,
                                          value: String(optionIndex + 1),
                                          extra: { optionLabel: option },
                                        });
                                        submitRequestDefSelectionOption(def, option, optionIndex);
                                      }}
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
                                      <div className="text-sm font-medium">{option}</div>
                                      {optionInfo ? (
                                        <div className="mt-2 whitespace-pre-wrap text-[12px] font-medium leading-5 opacity-85">
                                          {optionInfo}
                                        </div>
                                      ) : null}
                                      <div className="mt-1 text-[11px] font-medium uppercase tracking-wide opacity-80">
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
                                    onClick={() => {
                                      onTrack({
                                        eventName: "request_option_selected",
                                        eventCategory: "request",
                                        section: String(section.id || "section"),
                                        sectionKey: String(section.id || "section"),
                                        itemKey: String(def.id || def.requestType || "request"),
                                        buttonKey: "selection_option",
                                        label: title,
                                        value: String(optionIndex + 1),
                                        extra: { optionLabel: option },
                                      });
                                      submitRequestDefSelectionOption(def, option, optionIndex);
                                    }}
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
                              onClick={() => {
                                onTrack({
                                  eventName: "request_button_clicked",
                                  eventCategory: "request",
                                  section: String(section.id || "section"),
                                  sectionKey: String(section.id || "section"),
                                  itemKey: String(def.id || def.requestType || "request"),
                                  buttonKey: "request_button",
                                  label: title,
                                  value: String(def.requestType || def.id || "request"),
                                });
                                handleRequestDefClick(def);
                              }}
                              className="mt-3 w-full rounded-xl px-3 py-2 text-left text-xs font-semibold stayhub-action-card active:scale-[0.99] transition disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {lang === "bg" ? "Изпрати заявка" : lang === "de" ? "Anfrage senden" : lang === "ro" ? "Trimite solicitarea" : lang === "cs" ? "Odeslat požadavek" : lang === "ru" ? "Отправить запрос" : "Send request"}
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                if (it.kind === "link" && it.onClick) {
                  const linkedRequestDef = (it as any)?.requestDef as RequestDef | undefined;

                  return (
                    <button
                      key={idx}
                      type="button"
                      data-stayhub-request-def-id={String(
                        linkedRequestDef?.id || linkedRequestDef?.requestType || ""
                      ).trim() || undefined}
                      onClick={() => {
                        onTrack({
                          eventName: "button_clicked",
                          eventCategory: "interaction",
                          section: String(section.id || "section"),
                          sectionKey: String(section.id || "section"),
                          buttonKey: "custom_action",
                          label: String(it.label || "action"),
                        });
                        it.onClick?.();
                      }}
                      disabled={submittingRequest}
                      className={clsx(
                        "rounded-xl px-3 py-3 text-left text-sm font-semibold ring-1 transition",
                        submittingRequest
                          ? "cursor-not-allowed stayhub-action-card opacity-70"
                          : "stayhub-action-card active:scale-[0.99]"
                      )}
                    >
                      {stripLeadingVisualIcon(String(it.label || ""))}
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
                      onClick={() => {
                        const href = String(it.href || "");
                        onTrack({
                          eventName: href.startsWith("tel:") ? "phone_link_clicked" : href.startsWith("mailto:") ? "email_link_clicked" : "external_link_clicked",
                          eventCategory: "link",
                          section: String(section.id || "section"),
                          sectionKey: String(section.id || "section"),
                          buttonKey: "link",
                          label: String(it.label || "link"),
                          value: href.startsWith("http") ? new URL(href).hostname : href.split(":")[0] || "link",
                          extra: { href },
                        });
                      }}
                      className="rounded-xl px-3 py-3 text-sm font-semibold stayhub-action-card active:scale-[0.99] transition"
                    >
                      {stripLeadingVisualIcon(String(it.label || ""))}
                    </a>
                  );
                }

                return (
                  <div
                    key={idx}
                    className="rounded-xl stayhub-card p-3 text-sm text-[color:var(--stayhub-muted)]"
                  >
                    {stripLeadingVisualIcon(String(it.label || ""))}
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
        "stayhub-request-status-badge rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap",
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
    <div className="stayhub-premium-locked-card" aria-disabled="true">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="stayhub-section-header-icon" aria-hidden="true">
            <PremiumSectionIcon id={title} />
          </span>
          <div className="truncate text-base font-medium">
            {stripLeadingVisualIcon(title)}
          </div>
        </div>
        <div className="stayhub-premium-lock-dot" aria-label="Locked" title="Locked">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="10" width="14" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
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
  focusRequestDefId = null,
  focusRequestNonce = 0,
  collapseToken = 0,
  defaultOpen = false,
  onTrack,
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
  focusRequestDefId?: string | null;
  focusRequestNonce?: number;
  collapseToken?: number;
  defaultOpen?: boolean;
  onTrack: (payload: TrackHubPayload) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [openVenue, setOpenVenue] = useState<string | null>(null);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const [openSpaRequestDefId, setOpenSpaRequestDefId] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (collapseToken <= 0) return;
    setOpen(false);
    setOpenCategory(null);
    setOpenVenue(null);
    setOpenSpaRequestDefId(null);
  }, [collapseToken]);

  useEffect(() => {
    if (!focusRequestDefId || focusRequestNonce <= 0) return;

    const targetIndex = spaRequestItems.findIndex((item) => {
      const def = (item as any)?.requestDef as RequestDef | undefined;
      if (!def) return false;
      const id = String(def.id || "").trim();
      const requestType = String(def.requestType || "").trim();
      return id === focusRequestDefId || requestType === focusRequestDefId;
    });

    if (targetIndex < 0) return;

    const targetItem = spaRequestItems[targetIndex] as any;
    const targetDef = targetItem.requestDef as RequestDef | undefined;
    if (!targetDef) return;

    const spaGroup = groups.find((group) => group.category === "spa" && group.venues.length > 0);
    if (!spaGroup) return;

    setOpen(true);
    setOpenCategory(spaGroup.category);

    if (spaGroup.venues.length > 1) {
      const firstSpaVenue = spaGroup.venues[0];
      setOpenVenue(
        `${spaGroup.category}-${firstSpaVenue.name || getVenueText(firstSpaVenue, "name", lang)}-0`
      );
    } else {
      setOpenVenue(null);
    }

    setOpenSpaRequestDefId(
      `spa-${String(targetDef.id || targetDef.requestType || "request")}-${targetIndex}`
    );

    window.setTimeout(() => {
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>("[data-stayhub-request-def-id]")
      );
      const targetNode = nodes.find(
        (node) => node.dataset.stayhubRequestDefId === focusRequestDefId
      );
      targetNode?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 220);
  }, [focusRequestDefId, focusRequestNonce]);

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
    const message = getRequestDefMessage(def);
    const priceHint = getRequestDefPriceHint(def);
    const localizedOptions = getRequestDefOptions(def);
    const optionImages = getRequestDefOptionImages(def);
    const optionInfos = getRequestDefOptionInfo(def);
    const isQuantity = def.requestKind === "quantity" || def.requiresQuantity;
    const quickKey = `spa-${String(def.id || def.requestType || "request")}-${index}`;
    const isQuickOpen = openSpaRequestDefId === quickKey;

    return (
      <div
        key={quickKey}
        data-stayhub-request-def-id={String(def.id || def.requestType || "").trim()}
        className="rounded-xl stayhub-card overflow-hidden text-sm"
      >
        <button
          type="button"
          onClick={() => {
            onTrack({
              eventName: isQuickOpen ? "request_option_closed" : "request_option_opened",
              eventCategory: "request",
              section: "outlets",
              sectionKey: "outlets",
              itemKey: String(def.id || def.requestType || "request"),
              label: title,
              value: isQuickOpen ? "closed" : "open",
              extra: { category: "spa" },
            });
            setOpenSpaRequestDefId(isQuickOpen ? null : quickKey);
          }}
          className="w-full px-3 py-3 text-left flex items-center justify-between gap-3"
        >
          <span className="font-medium text-white">{stripLeadingVisualIcon(title)}</span>
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
                {lang === "bg" ? "Цена" : lang === "de" ? "Preis" : lang === "ro" ? "Preț" : lang === "cs" ? "Cena" : lang === "ru" ? "Цена" : "Price"}: {priceHint}
              </div>
            ) : null}

            {isQuantity ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {getQuantityChoices(def).map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    disabled={submittingRequest}
                    onClick={() => {
                      onTrack({
                        eventName: "request_quantity_selected",
                        eventCategory: "request",
                        section: "outlets",
                        sectionKey: "outlets",
                        itemKey: String(def.id || def.requestType || "request"),
                        buttonKey: "quantity_choice",
                        label: title,
                        value: String(qty),
                        extra: { category: "spa" },
                      });
                      submitRequestDefQuantityChoice(def, qty);
                    }}
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
                        onClick={() => {
                          onTrack({
                            eventName: "request_option_selected",
                            eventCategory: "request",
                            section: "outlets",
                            sectionKey: "outlets",
                            itemKey: String(def.id || def.requestType || "request"),
                            buttonKey: "selection_option",
                            label: title,
                            value: String(optionIndex + 1),
                            extra: { category: "spa", optionLabel: option },
                          });
                          submitRequestDefSelectionOption(def, option, optionIndex);
                        }}
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
                        <div className="text-sm font-medium">{option}</div>
                        {optionInfo ? (
                          <div className="mt-2 whitespace-pre-wrap text-[12px] font-medium leading-5 opacity-85">
                            {optionInfo}
                          </div>
                        ) : null}
                        <div className="mt-1 text-[11px] font-medium uppercase tracking-wide opacity-80">
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
                      onClick={() => {
                        onTrack({
                          eventName: "request_option_selected",
                          eventCategory: "request",
                          section: "outlets",
                          sectionKey: "outlets",
                          itemKey: String(def.id || def.requestType || "request"),
                          buttonKey: "selection_option",
                          label: title,
                          value: String(optionIndex + 1),
                          extra: { category: "spa", optionLabel: option },
                        });
                        submitRequestDefSelectionOption(def, option, optionIndex);
                      }}
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
                onClick={() => {
                  onTrack({
                    eventName: "request_button_clicked",
                    eventCategory: "request",
                    section: "outlets",
                    sectionKey: "outlets",
                    itemKey: String(def.id || def.requestType || "request"),
                    buttonKey: "request_button",
                    label: title,
                    value: String(def.requestType || def.id || "request"),
                    extra: { category: "spa" },
                  });
                  handleRequestDefClick(def);
                }}
                className="mt-3 w-full rounded-xl px-3 py-2 text-left text-xs font-semibold stayhub-action-card active:scale-[0.99] transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {lang === "bg" ? "Изпрати заявка" : lang === "de" ? "Anfrage senden" : lang === "ro" ? "Trimite solicitarea" : lang === "cs" ? "Odeslat požadavek" : lang === "ru" ? "Отправить запрос" : "Send request"}
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
            <span className="font-medium">{String(tUI("cuisine") || "Cuisine")}:</span>{" "}
            {cuisine}
          </div>
        ) : null}

        {hoursText ? (
          <div className="rounded-xl stayhub-card p-3 text-sm">
            <div className="font-medium">{String(tUI("hours") || "Hours")}:</div>
            <div className="mt-1 whitespace-pre-line">
              {hoursText}
            </div>
          </div>
        ) : null}

        {location ? (
          <div className="rounded-xl stayhub-card p-3 text-sm">
            <span className="font-medium">{String(tUI("location") || "Location")}:</span>{" "}
            {location}
          </div>
        ) : null}

        {ageGroup ? (
          <div className="rounded-xl stayhub-card p-3 text-sm">
            <span className="font-medium">{String(tUI("age_group") || "Age group")}:</span>{" "}
            {ageGroup}
          </div>
        ) : null}

        {programText ? (
          <div className="rounded-xl stayhub-card p-3 text-sm">
            <span className="font-medium">{String(tUI("program") || "Program")}:</span>{" "}
            {programText}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2 pt-1">
          {venue.menuUrl ? (
            <a
              href={venue.menuUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                onTrack({
                  eventName: "external_link_clicked",
                  eventCategory: "link",
                  section: "outlets",
                  sectionKey: "outlets",
                  itemKey: normalizeCategory(venue),
                  buttonKey: "menu_pdf",
                  label: getVenueText(venue, "name", lang) || venue.name || "venue",
                  value: "menu_pdf",
                  extra: { href: venue.menuUrl },
                });
              }}
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
              onClick={() => {
                onTrack({
                  eventName: "external_link_clicked",
                  eventCategory: "link",
                  section: "outlets",
                  sectionKey: "outlets",
                  itemKey: normalizeCategory(venue),
                  buttonKey: "program_url",
                  label: getVenueText(venue, "name", lang) || venue.name || "venue",
                  value: "program_url",
                  extra: { href: venue.programUrl },
                });
              }}
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
        onClick={() =>
          setOpen((prev) => {
            const next = !prev;
            onTrack({
              eventName: next ? "section_opened" : "section_closed",
              eventCategory: "navigation",
              section: "outlets",
              sectionKey: "outlets",
              label: String(section.title || "outlets"),
              value: next ? "open" : "closed",
            });
            return next;
          })
        }
        className="w-full px-4 py-4 text-left stayhub-section-header flex items-center justify-between gap-3"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="stayhub-section-header-icon" aria-hidden="true">
            <PremiumSectionIcon id={String(section.title || section.id || 'outlets')} />
          </span>
          <span className="truncate text-base font-medium">{stripLeadingVisualIcon(String(section.title || ''))}</span>
        </span>
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
              const groupTitle = singleVenue ? getVenueText(singleVenue, "name", lang) : getCategoryDisplayTitle(catKey, tUI);
              const groupSubtitle = singleVenue ? getVenueText(singleVenue, "shortDescription", lang) : "";

              return (
                <div
                  key={catKey}
                  className="rounded-2xl overflow-hidden stayhub-action-card transition"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onTrack({
                        eventName: catOpen ? "outlet_category_closed" : "outlet_category_opened",
                        eventCategory: "navigation",
                        section: "outlets",
                        sectionKey: "outlets",
                        itemKey: catKey,
                        label: groupTitle,
                        value: catOpen ? "closed" : "open",
                      });
                      setOpenCategory(catOpen ? null : catKey);
                      setOpenVenue(null);
                    }}
                    className="w-full px-3 py-3 text-left flex items-center justify-between gap-3 active:scale-[0.99] transition"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="stayhub-section-header-icon stayhub-section-header-icon-inline" aria-hidden="true">
                        <PremiumSectionIcon id={`${catKey} ${groupTitle}`} />
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium text-white">{stripLeadingVisualIcon(String(groupTitle || ""))}</div>
                        {groupSubtitle ? (
                          <div className="mt-1 text-xs text-neutral-300">{groupSubtitle}</div>
                        ) : null}
                      </div>
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
                          const venueTitle = stripLeadingVisualIcon(String(venueName || ""));
                          const venueSubtitle = getVenueText(venue, "shortDescription", lang);

                          return (
                            <div
                              key={venueKey}
                              className="rounded-xl overflow-hidden stayhub-card"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  onTrack({
                                    eventName: venueOpen ? "venue_closed" : "venue_opened",
                                    eventCategory: "navigation",
                                    section: "outlets",
                                    sectionKey: "outlets",
                                    itemKey: catKey,
                                    label: venueName,
                                    value: venueOpen ? "closed" : "open",
                                  });
                                  setOpenVenue(venueOpen ? null : venueKey);
                                }}
                                className="w-full px-3 py-3 text-left flex items-center justify-between gap-3"
                              >
                                <div>
                                  <div className="font-medium text-white">{venueTitle}</div>
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
