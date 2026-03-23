import { NextResponse } from "next/server";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Lang = "bg" | "de" | "en";

type Venue = {
  category?: string;
  type?: string;
  name?: string;
  shortDescription?: string;
  description?: string;
  cuisine?: string;
  hours?: string;
  open?: string;
  close?: string;
  location?: string;
  requiresReservation?: boolean;
  active?: boolean;
  programText?: string;
  ageGroup?: string;
};

type ServiceItem = {
  key: string;
  label: string;
  description?: string;
  active?: boolean;
  keywords?: string[];
  category?: string;
};

type HotelPayload = {
  hotelName?: string;
  locationQuery?: string;
  wifi?: { ssid?: string; password?: string };
  departmentHours?: Record<string, { open?: string; close?: string }>;
  venueRows?: Venue[];
  services?: ServiceItem[];
};

const COPY = {
  bg: {
    intro:
      "Мога да помагам само с информация за хотела и неговите услуги.",
    outOfScope:
      "Мога да помагам само с информация за хотела и неговите услуги. Попитайте ме за ресторанти, барове, спа, работно време, детски кът, услуги, удобства или локации в хотела.",
    noData:
      "Все още нямам тази информация за хотела. Моля, обърнете се към рецепция.",
    servicesIntro:
      "В момента в хъба са активни следните услуги:",
    wifi: (ssid?: string, password?: string) =>
      ssid
        ? `WiFi мрежа: ${ssid}${password ? `\nПарола: ${password}` : ""}`
        : "Все още нямам информация за WiFi. Моля, обърнете се към рецепция.",
    receptionHours: (open?: string, close?: string) =>
      open && close
        ? `Рецепцията работи от ${open} до ${close}.`
        : "Рецепцията е на разположение за съдействие.",
    location: (q?: string) =>
      q ? `Хотелът е в района на ${q}.` : "Все още нямам информация за локацията.",
    venueListIntro: (label: string) =>
      `В момента в хотела са активни следните ${label}:`,
    venueHours: (name: string, hours: string) => `• ${name} — ${hours}`,
    venueInfo: (name: string, details: string) => `• ${name} — ${details}`,
    venueReservation: (name: string) =>
      `• ${name} — за резервации използвайте секцията за резервации в хъба или се обърнете към рецепция.`,
    housekeepingHours: (open?: string, close?: string) =>
      open && close
        ? `Housekeeping работи от ${open} до ${close}.`
        : "Housekeeping е на разположение за съдействие.",
    maintenanceHours: (open?: string, close?: string) =>
      open && close
        ? `Техническата поддръжка работи от ${open} до ${close}.`
        : "Техническата поддръжка е на разположение за съдействие.",
    categoryLabel: {
      restaurants: "ресторанти",
      bars: "барове",
      spa: "спа обекти",
      kids: "обекти за деца",
      pool: "басейни",
      gym: "фитнес зали",
      lounge: "лаундж зони",
      room_service: "room service услуги",
    },
  },
  en: {
    intro:
      "I can help only with hotel information and hotel services.",
    outOfScope:
      "I can only help with information about the hotel and its services. Ask me about restaurants, bars, spa, opening hours, kids club, services, facilities or hotel locations.",
    noData:
      "I do not have that hotel information yet. Please contact reception.",
    servicesIntro:
      "These services are currently active in the hub:",
    wifi: (ssid?: string, password?: string) =>
      ssid
        ? `WiFi network: ${ssid}${password ? `\nPassword: ${password}` : ""}`
        : "I do not have WiFi details yet. Please contact reception.",
    receptionHours: (open?: string, close?: string) =>
      open && close
        ? `Reception is open from ${open} to ${close}.`
        : "Reception is available for assistance.",
    location: (q?: string) =>
      q ? `The hotel is located in the ${q} area.` : "I do not have the exact location details yet.",
    venueListIntro: (label: string) =>
      `Currently active in the hotel: ${label}.`,
    venueHours: (name: string, hours: string) => `• ${name} — ${hours}`,
    venueInfo: (name: string, details: string) => `• ${name} — ${details}`,
    venueReservation: (name: string) =>
      `• ${name} — for reservations, please use the reservation section in the hub or contact reception.`,
    housekeepingHours: (open?: string, close?: string) =>
      open && close
        ? `Housekeeping is available from ${open} to ${close}.`
        : "Housekeeping is available for assistance.",
    maintenanceHours: (open?: string, close?: string) =>
      open && close
        ? `Maintenance is available from ${open} to ${close}.`
        : "Maintenance is available for assistance.",
    categoryLabel: {
      restaurants: "restaurants",
      bars: "bars",
      spa: "spa facilities",
      kids: "kids facilities",
      pool: "pool facilities",
      gym: "fitness facilities",
      lounge: "lounge areas",
      room_service: "room service options",
    },
  },
  de: {
    intro:
      "Ich kann nur mit Hotelinformationen und Hoteldienstleistungen helfen.",
    outOfScope:
      "Ich kann nur mit Informationen über das Hotel und seine Leistungen helfen. Fragen Sie mich nach Restaurants, Bars, Spa, Öffnungszeiten, Kinderclub, Dienstleistungen, Einrichtungen oder Hotelbereichen.",
    noData:
      "Ich habe diese Hotelinformation noch nicht. Bitte wenden Sie sich an die Rezeption.",
    servicesIntro:
      "Diese Dienstleistungen sind aktuell im Hub aktiv:",
    wifi: (ssid?: string, password?: string) =>
      ssid
        ? `WLAN-Netzwerk: ${ssid}${password ? `\nPasswort: ${password}` : ""}`
        : "Ich habe noch keine WLAN-Daten. Bitte wenden Sie sich an die Rezeption.",
    receptionHours: (open?: string, close?: string) =>
      open && close
        ? `Die Rezeption ist von ${open} bis ${close} geöffnet.`
        : "Die Rezeption hilft Ihnen gern weiter.",
    location: (q?: string) =>
      q ? `Das Hotel befindet sich im Bereich ${q}.` : "Ich habe noch keine genauen Standortinformationen.",
    venueListIntro: (label: string) =>
      `Im Hotel sind aktuell folgende ${label} aktiv:`,
    venueHours: (name: string, hours: string) => `• ${name} — ${hours}`,
    venueInfo: (name: string, details: string) => `• ${name} — ${details}`,
    venueReservation: (name: string) =>
      `• ${name} — für Reservierungen nutzen Sie bitte den Reservierungsbereich im Hub oder wenden Sie sich an die Rezeption.`,
    housekeepingHours: (open?: string, close?: string) =>
      open && close
        ? `Housekeeping ist von ${open} bis ${close} verfügbar.`
        : "Housekeeping hilft Ihnen gern weiter.",
    maintenanceHours: (open?: string, close?: string) =>
      open && close
        ? `Die Technik ist von ${open} bis ${close} verfügbar.`
        : "Die Technik hilft Ihnen gern weiter.",
    categoryLabel: {
      restaurants: "Restaurants",
      bars: "Bars",
      spa: "Spa-Bereiche",
      kids: "Kinderbereiche",
      pool: "Poolbereiche",
      gym: "Fitnessbereiche",
      lounge: "Lounge-Bereiche",
      room_service: "Room-Service-Angebote",
    },
  },
} as const;

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  restaurants: ["restaurant", "restaurants", "ресторант", "ресторанти", "restoran"],
  bars: ["bar", "bars", "бар", "барове"],
  spa: ["spa", "спа", "wellness"],
  kids: ["kids", "kids club", "children", "дет", "деца", "детски"],
  pool: ["pool", "басейн", "басейни"],
  gym: ["gym", "fitness", "фитнес"],
  lounge: ["lounge", "лаундж"],
  room_service: ["room service", "roomservice", "room-service"],
};

const SERVICE_KEYWORDS: Record<string, string[]> = {
  towels: ["towel", "towels", "хавли", "кърпи"],
  toilet_paper: ["toilet paper", "toilet", "paper", "тоалетна хартия"],
  extra_pillow: ["pillow", "pillows", "възглав", "възглавници"],
  extra_blanket: ["blanket", "одеяло", "одеяла"],
  bathrobe: ["bathrobe", "robe", "халат"],
  slippers: ["slippers", "pantoffel", "чехли"],
  baby_cot: ["baby cot", "baby bed", "crib", "baby crib", "бебешко легло", "кошарка"],
  iron: ["iron", "ютия"],
  minibar: ["minibar", "минибар"],
  laundry: ["laundry", "washing", "пране"],
  late_checkout: ["late checkout", "late check-out", "checkout", "check-out", "късно напускане"],
  wake_up_call: ["wake up", "wake-up", "wakeup", "събуждане", "будене"],
  taxi: ["taxi", "такси"],
  air_conditioning: ["air conditioning", "ac", "климатик"],
  no_hot_water: ["hot water", "warm water", "топла вода"],
  other_technical_issue: ["broken", "issue", "problem", "счупено", "проблем"],
};

const GENERIC_SERVICE_KEYWORDS = [
  "service",
  "services",
  "услуги",
  "order",
  "request",
  "поръч",
  "заяв",
  "can i",
  "може ли",
  "what can",
  "какво мога",
  "какви услуги",
];

const HOTEL_KEYWORDS = [
  "hotel",
  "wifi",
  "wi-fi",
  "internet",
  "reception",
  "restaurant",
  "restaurants",
  "bar",
  "bars",
  "spa",
  "pool",
  "kids",
  "дет",
  "ресторан",
  "ресторанти",
  "спа",
  "басейн",
  "басейни",
  "бар",
  "барове",
  "рецепц",
  "check",
  "location",
  "address",
  "hours",
  "opening",
  "работ",
  "час",
  "къде",
  "where",
  "wo",
  "gym",
  "fitness",
  "service",
  "services",
  "услуг",
  "удобств",
  "towel",
  "хавли",
  "minibar",
  "минибар",
  "laundry",
  "пране",
  "wake",
  "събуж",
  "taxi",
  "такси",
];

function normalizeLang(value: string): Lang {
  return value === "bg" || value === "de" ? value : "en";
}

function clean(text: string) {
  return String(text || "").toLowerCase().trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasTerm(text: string, term: string) {
  const source = clean(text);
  const needle = clean(term);
  if (!source || !needle) return false;

  if (needle === "wo") {
    return /(^|\W)wo(\W|$)/i.test(source);
  }

  if (/^[a-z]{1,3}$/i.test(needle)) {
    return new RegExp(`(^|\\W)${escapeRegExp(needle)}(\\W|$)`, "i").test(source);
  }

  return source.includes(needle);
}

function hasAnyTerm(text: string, terms: string[]) {
  return terms.some((term) => hasTerm(text, term));
}

function normalizeCategory(value?: string) {
  const raw = clean(String(value ?? ""))
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

  if (raw.includes("restaurant")) return "restaurants";
  if (raw.includes("bar")) return "bars";
  if (raw.includes("spa")) return "spa";
  if (raw.includes("kids")) return "kids";
  if (raw.includes("pool")) return "pool";
  if (raw.includes("gym") || raw.includes("fitness")) return "gym";
  if (raw.includes("lounge")) return "lounge";
  if (raw.includes("room_service") || raw.includes("roomservice")) return "room_service";

  return raw;
}

function getActiveVenues(hotel: HotelPayload) {
  return (hotel.venueRows ?? []).filter((venue) => venue.active !== false && venue.name);
}

function getActiveServices(hotel: HotelPayload) {
  return (hotel.services ?? []).filter((service) => service.active !== false && service.label);
}

function detectCategories(question: string) {
  const q = clean(question);
  const result = new Set<string>();

  Object.entries(CATEGORY_KEYWORDS).forEach(([category, keywords]) => {
    if (hasAnyTerm(q, keywords)) {
      result.add(category);
    }
  });

  return [...result];
}

function isGenericServiceQuestion(question: string) {
  const q = clean(question);
  return hasAnyTerm(q, GENERIC_SERVICE_KEYWORDS);
}

function findMatchingServices(question: string, hotel: HotelPayload) {
  const q = clean(question);

  return getActiveServices(hotel).filter((service) => {
    const tokens = [
      clean(service.key),
      clean(service.key.replace(/_/g, " ")),
      clean(service.label),
      ...(service.keywords ?? []).map(clean),
      ...(SERVICE_KEYWORDS[service.key] ?? []),
    ].filter(Boolean);

    return tokens.some((token) => hasTerm(q, token));
  });
}

function isHotelQuestion(question: string, hotel: HotelPayload) {
  const q = clean(question);
  if (!q) return true;
  if (hasAnyTerm(q, HOTEL_KEYWORDS)) return true;

  const venues = getActiveVenues(hotel);
  const venueMatch = venues.some((venue) => {
    const name = clean(venue.name ?? "");
    const category = normalizeCategory(venue.category || venue.type);
    return (name && hasTerm(q, name)) || (category && hasTerm(q, category));
  });

  if (venueMatch) return true;

  const services = getActiveServices(hotel);
  return services.some((service) => {
    const tokens = [
      clean(service.key),
      clean(service.key.replace(/_/g, " ")),
      clean(service.label),
      ...(service.keywords ?? []).map(clean),
      ...(SERVICE_KEYWORDS[service.key] ?? []),
    ].filter(Boolean);

    return tokens.some((token) => hasTerm(q, token));
  });
}

function formatVenueLine(venue: Venue, lang: Lang, wantsReservation: boolean) {
  const t = COPY[lang];
  const name = venue.name || "Hotel";
  const hours =
    venue.hours || (venue.open && venue.close ? `${venue.open} - ${venue.close}` : "");
  const detail =
    venue.shortDescription ||
    venue.description ||
    venue.cuisine ||
    venue.location ||
    venue.programText ||
    venue.ageGroup ||
    "";

  if (wantsReservation || venue.requiresReservation) {
    return t.venueReservation(name);
  }

  if (hours) return t.venueHours(name, hours);
  if (detail) return t.venueInfo(name, detail);

  return `• ${name}`;
}

function buildVenueCategoryAnswer(question: string, lang: Lang, hotel: HotelPayload) {
  const t = COPY[lang];
  const categories = detectCategories(question);
  if (!categories.length) return null;

  const wantsReservation = hasAnyTerm(question, ["reserv", "book", "резерв", "buch"]);

  const venues = getActiveVenues(hotel).filter((venue) => {
    const category = normalizeCategory(venue.category || venue.type);
    return categories.includes(category);
  });

  if (!venues.length) return t.noData;

  const labels = categories
    .map((category) => t.categoryLabel[category as keyof typeof t.categoryLabel] || category)
    .join(lang === "bg" ? " и " : lang === "de" ? " und " : " and ");

  const lines = venues.slice(0, 8).map((venue) =>
    formatVenueLine(venue, lang, wantsReservation)
  );

  return [t.venueListIntro(labels), ...lines].join("\n");
}

function buildSpecificVenueAnswer(question: string, lang: Lang, hotel: HotelPayload) {
  const wantsReservation = hasAnyTerm(question, ["reserv", "book", "резерв", "buch"]);

  const venues = getActiveVenues(hotel).filter((venue) => {
    const name = clean(venue.name ?? "");
    return name && hasTerm(question, name);
  });

  if (!venues.length) return null;

  return venues
    .slice(0, 5)
    .map((venue) => formatVenueLine(venue, lang, wantsReservation))
    .join("\n");
}

function buildServiceAnswer(question: string, lang: Lang, hotel: HotelPayload) {
  const t = COPY[lang];
  const activeServices = getActiveServices(hotel);
  if (!activeServices.length) return null;

  const matches = findMatchingServices(question, hotel);
  if (matches.length) {
    return matches
      .slice(0, 5)
      .map(
        (service) =>
          `• ${service.label}${service.description ? ` — ${service.description}` : ""}`
      )
      .join("\n");
  }

  if (isGenericServiceQuestion(question)) {
    return [
      t.servicesIntro,
      ...activeServices.slice(0, 12).map((service) => `• ${service.label}`),
    ].join("\n");
  }

  return null;
}

function buildHotelAnswer(question: string, lang: Lang, hotel: HotelPayload) {
  const t = COPY[lang];
  const q = clean(question);

  if (!q) return t.intro;
  if (!isHotelQuestion(q, hotel)) return t.outOfScope;

  if (hasAnyTerm(q, ["wifi", "wi-fi", "internet", "парол", "парола", "passwort", "password"])) {
    return t.wifi(hotel.wifi?.ssid, hotel.wifi?.password);
  }

  if (hasAnyTerm(q, ["reception", "rezeption", "рецепц"])) {
    const reception = hotel.departmentHours?.reception ?? {};
    return t.receptionHours(reception.open, reception.close);
  }

  if (hasAnyTerm(q, ["where", "wo", "location", "address", "къде", "адрес"])) {
    return t.location(hotel.locationQuery);
  }

  if (hasAnyTerm(q, ["housekeeping", "камер", "clean"])) {
    const housekeeping = hotel.departmentHours?.housekeeping ?? {};
    return t.housekeepingHours(housekeeping.open, housekeeping.close);
  }

  if (hasAnyTerm(q, ["maintenance", "technik", "поддр", "repair"])) {
    const maintenance = hotel.departmentHours?.maintenance ?? {};
    return t.maintenanceHours(maintenance.open, maintenance.close);
  }

  const serviceAnswer = buildServiceAnswer(q, lang, hotel);
  if (serviceAnswer) return serviceAnswer;

  const specificVenueAnswer = buildSpecificVenueAnswer(q, lang, hotel);
  if (specificVenueAnswer) return specificVenueAnswer;

  const categoryAnswer = buildVenueCategoryAnswer(q, lang, hotel);
  if (categoryAnswer) return categoryAnswer;

  return t.noData;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = String(
      body?.question ?? body?.message ?? body?.prompt ?? body?.text ?? ""
    ).trim();
    const lang = normalizeLang(String(body?.lang ?? "en"));
    const hotel = (body?.hotel ?? {}) as HotelPayload;

    return NextResponse.json({
      ok: true,
      answer: buildHotelAnswer(question, lang, hotel),
      hotelOnly: true,
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      answer: COPY.en.noData,
      error: error?.message || "Server error",
    });
  }
}