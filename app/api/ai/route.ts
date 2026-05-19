import { NextResponse } from "next/server";

type Lang = "bg" | "de" | "en" | "ro" | "cs";

type Venue = {
  category?: string;
  type?: string;
  name?: string;
  shortDescription?: string;
  description?: string;
  cuisine?: string;
  hours?: string;
  hoursByLang?: Record<string, string>;
  open?: string;
  close?: string;
  location?: string;
  menuUrl?: string;
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

type TextMap = Partial<Record<Lang | string, string>>;

type HotelInfoItem = {
  key?: string;
  id?: string;
  category?: string;
  section?: string;
  icon?: string;
  sortOrder?: number;
  active?: boolean;
  title?: TextMap;
  text?: TextMap;
};

type HotelPayload = {
  hotelName?: string;
  locationQuery?: string;
  wifi?: { ssid?: string; password?: string };
  departmentHours?: Record<string, { open?: string; close?: string }>;
  venueRows?: Venue[];
  hotelInfoItems?: HotelInfoItem[];
  services?: ServiceItem[];
  reviews?: { google?: string; tripadvisor?: string };
};

const SUPPORTED_LANGS: Lang[] = ["bg", "de", "en", "ro", "cs"];

const COPY = {
  bg: {
    intro:
      "Мога да помагам с актуална информация за хотела – ресторанти, барове, работно време, Wi‑Fi, паркинг, анимация, политики, услуги и заявки в хъба.",
    outOfScope:
      "Мога да помагам само с информация за хотела и неговите услуги. Попитайте ме за ресторанти, барове, работно време, Wi‑Fi, паркинг, спа, анимация, услуги или правила в хотела.",
    noData:
      "Все още нямам тази информация за хотела. Моля, обърнете се към рецепция.",
    servicesIntro: "В момента в хъба са активни следните услуги:",
    hotelInfoIntro: "Ето актуалната информация:",
    wifi: (ssid?: string, password?: string) =>
      ssid
        ? `Wi‑Fi мрежа: ${ssid}${password ? `\nПарола: ${password}` : ""}`
        : "Все още нямам информация за Wi‑Fi. Моля, обърнете се към рецепция.",
    receptionHours: (open?: string, close?: string) =>
      open && close
        ? `Рецепцията работи от ${open} до ${close}.`
        : "Рецепцията е на разположение за съдействие.",
    location: (q?: string) =>
      q ? `Хотелът се намира в района на ${q}.` : "Все още нямам информация за локацията.",
    venueListIntro: (label: string) => `В хотела са активни следните ${label}:`,
    venueHours: (name: string, hours: string) => `• ${name}\n${hours}`,
    venueInfo: (name: string, details: string) => `• ${name} — ${details}`,
    venueReservation: (name: string) =>
      `• ${name} — за резервации използвайте съответната секция в хъба или се обърнете към рецепция.`,
    housekeepingHours: (open?: string, close?: string) =>
      open && close
        ? `Housekeeping работи от ${open} до ${close}. След работно време заявките се насочват към рецепция.`
        : "Housekeeping е на разположение за съдействие.",
    maintenanceHours: (open?: string, close?: string) =>
      open && close
        ? `Техническата поддръжка работи от ${open} до ${close}.`
        : "Техническата поддръжка е на разположение за съдействие.",
    reviews: "Можете да оставите отзив през секцията с отзиви в хъба.",
    categoryLabel: {
      restaurants: "ресторанти",
      bars: "барове",
      spa: "спа обекти",
      kids: "обекти за деца",
      pool: "басейни",
      gym: "фитнес зали",
      lounge: "лаундж зони",
      entertainment: "игрални зони",
      room_service: "room service услуги",
    },
  },
  en: {
    intro:
      "I can help with current hotel information – restaurants, bars, opening hours, Wi‑Fi, parking, animation, policies, services and hub requests.",
    outOfScope:
      "I can only help with information about the hotel and its services. Ask me about restaurants, bars, opening hours, Wi‑Fi, parking, spa, animation, services or hotel rules.",
    noData:
      "I do not have that hotel information yet. Please contact reception.",
    servicesIntro: "These services are currently active in the hub:",
    hotelInfoIntro: "Here is the current information:",
    wifi: (ssid?: string, password?: string) =>
      ssid
        ? `Wi‑Fi network: ${ssid}${password ? `\nPassword: ${password}` : ""}`
        : "I do not have Wi‑Fi details yet. Please contact reception.",
    receptionHours: (open?: string, close?: string) =>
      open && close ? `Reception is open from ${open} to ${close}.` : "Reception is available for assistance.",
    location: (q?: string) =>
      q ? `The hotel is located in the ${q} area.` : "I do not have the exact location details yet.",
    venueListIntro: (label: string) => `Currently active in the hotel: ${label}.`,
    venueHours: (name: string, hours: string) => `• ${name}\n${hours}`,
    venueInfo: (name: string, details: string) => `• ${name} — ${details}`,
    venueReservation: (name: string) =>
      `• ${name} — for reservations, please use the relevant section in the hub or contact reception.`,
    housekeepingHours: (open?: string, close?: string) =>
      open && close
        ? `Housekeeping is available from ${open} to ${close}. After hours, requests are routed to reception.`
        : "Housekeeping is available for assistance.",
    maintenanceHours: (open?: string, close?: string) =>
      open && close ? `Maintenance is available from ${open} to ${close}.` : "Maintenance is available for assistance.",
    reviews: "You can leave a review from the reviews section in the hub.",
    categoryLabel: {
      restaurants: "restaurants",
      bars: "bars",
      spa: "spa facilities",
      kids: "kids facilities",
      pool: "pool facilities",
      gym: "fitness facilities",
      lounge: "lounge areas",
      entertainment: "games room",
      room_service: "room service options",
    },
  },
  de: {
    intro:
      "Ich kann mit aktuellen Hotelinformationen helfen – Restaurants, Bars, Öffnungszeiten, WLAN, Parkplatz, Animation, Regeln, Services und Anfragen im Hub.",
    outOfScope:
      "Ich kann nur mit Informationen über das Hotel und seine Leistungen helfen. Fragen Sie mich nach Restaurants, Bars, Öffnungszeiten, WLAN, Parkplatz, Spa, Animation, Services oder Hotelregeln.",
    noData:
      "Ich habe diese Hotelinformation noch nicht. Bitte wenden Sie sich an die Rezeption.",
    servicesIntro: "Diese Dienstleistungen sind aktuell im Hub aktiv:",
    hotelInfoIntro: "Hier ist die aktuelle Information:",
    wifi: (ssid?: string, password?: string) =>
      ssid
        ? `WLAN-Netzwerk: ${ssid}${password ? `\nPasswort: ${password}` : ""}`
        : "Ich habe noch keine WLAN-Daten. Bitte wenden Sie sich an die Rezeption.",
    receptionHours: (open?: string, close?: string) =>
      open && close ? `Die Rezeption ist von ${open} bis ${close} geöffnet.` : "Die Rezeption hilft Ihnen gern weiter.",
    location: (q?: string) =>
      q ? `Das Hotel befindet sich im Bereich ${q}.` : "Ich habe noch keine genauen Standortinformationen.",
    venueListIntro: (label: string) => `Im Hotel sind aktuell folgende ${label} aktiv:`,
    venueHours: (name: string, hours: string) => `• ${name}\n${hours}`,
    venueInfo: (name: string, details: string) => `• ${name} — ${details}`,
    venueReservation: (name: string) =>
      `• ${name} — für Reservierungen nutzen Sie bitte den passenden Bereich im Hub oder wenden Sie sich an die Rezeption.`,
    housekeepingHours: (open?: string, close?: string) =>
      open && close
        ? `Housekeeping ist von ${open} bis ${close} verfügbar. Außerhalb der Zeiten werden Anfragen an die Rezeption weitergeleitet.`
        : "Housekeeping hilft Ihnen gern weiter.",
    maintenanceHours: (open?: string, close?: string) =>
      open && close ? `Die Technik ist von ${open} bis ${close} verfügbar.` : "Die Technik hilft Ihnen gern weiter.",
    reviews: "Sie können eine Bewertung über den Bewertungsbereich im Hub hinterlassen.",
    categoryLabel: {
      restaurants: "Restaurants",
      bars: "Bars",
      spa: "Spa-Bereiche",
      kids: "Kinderbereiche",
      pool: "Poolbereiche",
      gym: "Fitnessbereiche",
      lounge: "Lounge-Bereiche",
      entertainment: "Spielzimmer",
      room_service: "Room-Service-Angebote",
    },
  },
  ro: {
    intro:
      "Pot ajuta cu informații actuale despre hotel – restaurante, baruri, program, Wi‑Fi, parcare, animație, politici, servicii și solicitări în hub.",
    outOfScope:
      "Pot ajuta doar cu informații despre hotel și serviciile sale. Întrebați-mă despre restaurante, baruri, program, Wi‑Fi, parcare, spa, animație, servicii sau regulile hotelului.",
    noData:
      "Nu am încă această informație despre hotel. Vă rugăm să contactați recepția.",
    servicesIntro: "Următoarele servicii sunt active în hub:",
    hotelInfoIntro: "Iată informația actuală:",
    wifi: (ssid?: string, password?: string) =>
      ssid
        ? `Rețea Wi‑Fi: ${ssid}${password ? `\nParolă: ${password}` : ""}`
        : "Nu am încă detalii despre Wi‑Fi. Vă rugăm să contactați recepția.",
    receptionHours: (open?: string, close?: string) =>
      open && close ? `Recepția este deschisă de la ${open} până la ${close}.` : "Recepția vă stă la dispoziție.",
    location: (q?: string) =>
      q ? `Hotelul se află în zona ${q}.` : "Nu am încă detalii exacte despre locație.",
    venueListIntro: (label: string) => `În hotel sunt active următoarele ${label}:`,
    venueHours: (name: string, hours: string) => `• ${name}\n${hours}`,
    venueInfo: (name: string, details: string) => `• ${name} — ${details}`,
    venueReservation: (name: string) =>
      `• ${name} — pentru rezervări, folosiți secțiunea potrivită din hub sau contactați recepția.`,
    housekeepingHours: (open?: string, close?: string) =>
      open && close
        ? `Housekeeping este disponibil între ${open} și ${close}. În afara programului, solicitările sunt trimise la recepție.`
        : "Housekeeping vă stă la dispoziție.",
    maintenanceHours: (open?: string, close?: string) =>
      open && close ? `Întreținerea este disponibilă între ${open} și ${close}.` : "Întreținerea vă stă la dispoziție.",
    reviews: "Puteți lăsa o recenzie din secțiunea de recenzii din hub.",
    categoryLabel: {
      restaurants: "restaurante",
      bars: "baruri",
      spa: "facilități spa",
      kids: "facilități pentru copii",
      pool: "piscine",
      gym: "fitness",
      lounge: "zone lounge",
      entertainment: "sală de jocuri",
      room_service: "opțiuni room service",
    },
  },
  cs: {
    intro:
      "Mohu pomoci s aktuálními informacemi o hotelu – restaurace, bary, otevírací doba, Wi‑Fi, parkování, animace, pravidla, služby a požadavky v hubu.",
    outOfScope:
      "Mohu pomoci pouze s informacemi o hotelu a jeho službách. Zeptejte se na restaurace, bary, otevírací dobu, Wi‑Fi, parkování, spa, animaci, služby nebo pravidla hotelu.",
    noData:
      "Tuto informaci o hotelu zatím nemám. Kontaktujte prosím recepci.",
    servicesIntro: "V hubu jsou aktuálně aktivní tyto služby:",
    hotelInfoIntro: "Zde jsou aktuální informace:",
    wifi: (ssid?: string, password?: string) =>
      ssid
        ? `Wi‑Fi síť: ${ssid}${password ? `\nHeslo: ${password}` : ""}`
        : "Zatím nemám údaje k Wi‑Fi. Kontaktujte prosím recepci.",
    receptionHours: (open?: string, close?: string) =>
      open && close ? `Recepce je otevřena od ${open} do ${close}.` : "Recepce vám ráda pomůže.",
    location: (q?: string) =>
      q ? `Hotel se nachází v oblasti ${q}.` : "Zatím nemám přesné informace o poloze.",
    venueListIntro: (label: string) => `V hotelu jsou aktuálně aktivní tyto ${label}:`,
    venueHours: (name: string, hours: string) => `• ${name}\n${hours}`,
    venueInfo: (name: string, details: string) => `• ${name} — ${details}`,
    venueReservation: (name: string) =>
      `• ${name} — pro rezervace použijte příslušnou sekci v hubu nebo kontaktujte recepci.`,
    housekeepingHours: (open?: string, close?: string) =>
      open && close
        ? `Housekeeping je k dispozici od ${open} do ${close}. Mimo tuto dobu jsou požadavky odesílány na recepci.`
        : "Housekeeping vám rád pomůže.",
    maintenanceHours: (open?: string, close?: string) =>
      open && close ? `Údržba je k dispozici od ${open} do ${close}.` : "Údržba vám ráda pomůže.",
    reviews: "Recenzi můžete zanechat v sekci recenzí v hubu.",
    categoryLabel: {
      restaurants: "restaurace",
      bars: "bary",
      spa: "spa zařízení",
      kids: "dětská zařízení",
      pool: "bazény",
      gym: "fitness",
      lounge: "lounge zóny",
      entertainment: "herna",
      room_service: "pokojová služba",
    },
  },
} as const;

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  restaurants: ["restaurant", "restaurants", "ресторант", "ресторанти", "restoran", "restaurante", "restaurace", "mic dejun", "breakfast", "закуска", "frühstück", "snídaně", "lunch", "обяд", "mittag", "prânz", "oběd", "dinner", "вечеря", "abendessen", "cină", "večeře"],
  bars: ["bar", "bars", "бар", "барове", "baruri", "bary"],
  spa: ["spa", "спа", "wellness", "sauna", "масаж", "masaj", "masáž"],
  kids: ["kids", "kids club", "children", "дет", "деца", "детски", "copii", "děti", "dětský"],
  pool: ["pool", "басейн", "басейни", "piscină", "piscina", "bazén", "bazen"],
  gym: ["gym", "fitness", "фитнес"],
  lounge: ["lounge", "лаундж"],
  entertainment: ["entertainment", "games", "game", "games room", "игри", "игрална", "игрална зала", "sală de jocuri", "sala de jocuri", "herna"],
  room_service: ["room service", "roomservice", "room-service", "pokojová služba"],
};

const SERVICE_KEYWORDS: Record<string, string[]> = {
  towels: ["towel", "towels", "хавли", "кърпи", "prosop", "prosoape", "ručník", "ručníky"],
  toilet_paper: ["toilet paper", "toilet", "paper", "тоалетна хартия", "hârtie igienică", "toaletní papír"],
  extra_pillow: ["pillow", "pillows", "възглав", "възглавници", "pernă", "perne", "polštář", "polštáře"],
  extra_blanket: ["blanket", "одеяло", "одеяла", "pătură", "patura", "přikrývka"],
  bathrobe: ["bathrobe", "robe", "халат", "halat", "župan"],
  slippers: ["slippers", "pantoffel", "чехли", "papuci", "pantofle"],
  baby_cot: ["baby cot", "baby bed", "crib", "baby crib", "бебешко легло", "кошарка", "pătuț", "dětská postýlka"],
  iron: ["iron", "ютия", "fier de călcat", "žehlička"],
  minibar: ["minibar", "минибар"],
  laundry: ["laundry", "washing", "пране", "spălătorie", "prádelna"],
  late_checkout: ["late checkout", "late check-out", "checkout", "check-out", "късно напускане", "check-out târziu", "pozdní check-out"],
  wake_up_call: ["wake up", "wake-up", "wakeup", "събуждане", "будене", "trezire", "buzení"],
  taxi: ["taxi", "такси"],
  air_conditioning: ["air conditioning", "ac", "климатик", "aer condiționat", "klimatizace"],
  no_hot_water: ["hot water", "warm water", "топла вода", "apă caldă", "teplá voda"],
  other_technical_issue: ["broken", "issue", "problem", "счупено", "проблем", "defect", "rozbité", "porucha"],
  coffee_capsules: ["coffee capsules", "coffee", "capsules", "кафе", "кафе капсули", "капсули", "cafea", "capsule", "capsule de cafea", "kávové kapsle", "kava", "káva"],
  pillow_menu: ["pillow menu", "меню възглавници", "meniu perne", "nabídka polštářů"],
  special_occasion: ["special occasion", "специален повод", "ocazie specială", "zvláštní příležitost"],
};

const GENERIC_SERVICE_KEYWORDS = [
  "service", "services", "услуги", "order", "request", "поръч", "заяв", "can i", "може ли", "what can", "какво мога", "какви услуги",
  "servicii", "solicit", "pot", "služby", "požadavek", "mohu",
];

const HOTEL_KEYWORDS = [
  "hotel", "wifi", "wi-fi", "wlan", "internet", "reception", "rezeption", "recepție", "recepce", "restaurant", "bar", "spa", "pool", "kids", "animation", "parking", "park", "review", "policy", "rules",
  "хотел", "рецепц", "ресторан", "бар", "спа", "басейн", "дет", "анимац", "паркинг", "правила", "политик", "хавли", "шезлонг", "благотвор",
  "parcare", "prosoape", "șezlong", "sezlong", "caritate", "politica", "reguli", "animație", "animatie",
  "parkování", "ručníky", "lehátka", "charita", "pravidla", "animace",
  "check", "location", "address", "hours", "opening", "program", "работ", "час", "къде", "where", "wo", "unde", "kde", "otevírací", "program",
  "minibar", "минибар", "laundry", "пране", "wake", "събуж", "taxi", "такси",
];

const INFO_GROUP_KEYWORDS: Record<string, string[]> = {
  parking: ["parking", "park", "паркинг", "parcare", "parkování"],
  checkin: ["check in", "check-in", "checkout", "check-out", "настаняване", "напускане", "cazare", "plecare", "příjezd", "odjezd"],
  towel: ["towel", "towels", "хавли", "кърпи", "prosop", "prosoape", "ručník", "ručníky"],
  sunbed: ["sunbed", "sunbeds", "шезлонг", "шезлонги", "șezlong", "sezlong", "lehátko", "lehátka"],
  charity: ["charity", "благотвор", "caritate", "charita"],
  animation: ["animation", "анимац", "animație", "animatie", "animace", "program"],
  world_cup: ["world cup", "fifa", "световно", "mondial", "ms ve fotbale", "wm 2026"],
  emergency: ["emergency", "urgent", "спеш", "notfall", "urgență", "nouz"],
  attractions: ["attraction", "nearby", "around", "забележ", "наблизо", "atrac", "împrejurimi", "zajímav", "okolí"],
  pharmacy: ["pharmacy", "аптека", "farmacie", "lékárna"],
};

function normalizeLang(value: string): Lang {
  const lower = String(value || "").trim().toLowerCase();
  return SUPPORTED_LANGS.includes(lower as Lang) ? (lower as Lang) : "en";
}

function clean(text: string) {
  return String(text || "").toLowerCase().trim();
}

function stripIcon(text: string) {
  return String(text || "").replace(/^\p{Extended_Pictographic}\s*/u, "").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasTerm(text: string, term: string) {
  const source = clean(text);
  const needle = clean(term);
  if (!source || !needle) return false;

  if (["wo"].includes(needle)) {
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

function getMapValue(map: TextMap | undefined, lang: Lang) {
  if (!map) return "";
  const preferred: string[] = [lang, "en", "bg", "de", "ro", "cs"];
  for (const key of preferred) {
    const value = map[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

function normalizeDisplayText(value: string) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\s*\|\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeCategory(value?: string) {
  const raw = clean(String(value ?? ""))
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

  if (raw.includes("restaurant")) return "restaurants";
  if (raw.includes("bar")) return "bars";
  if (raw.includes("spa") || raw.includes("wellness")) return "spa";
  if (raw.includes("kids") || raw.includes("children")) return "kids";
  if (raw.includes("pool")) return "pool";
  if (raw.includes("gym") || raw.includes("fitness")) return "gym";
  if (raw.includes("lounge")) return "lounge";
  if (raw.includes("entertainment") || raw.includes("games")) return "entertainment";
  if (raw.includes("room_service") || raw.includes("roomservice")) return "room_service";

  return raw;
}

function getActiveVenues(hotel: HotelPayload) {
  return (hotel.venueRows ?? []).filter((venue) => venue.active !== false && venue.name);
}

function getActiveServices(hotel: HotelPayload) {
  return (hotel.services ?? []).filter((service) => service.active !== false && service.label);
}

function getActiveHotelInfo(hotel: HotelPayload) {
  return (hotel.hotelInfoItems ?? []).filter((item) => item && item.active !== false);
}

function getVenueHours(venue: Venue, lang: Lang) {
  const localized = venue.hoursByLang?.[lang] || venue.hoursByLang?.en || venue.hoursByLang?.bg || "";
  return normalizeDisplayText(localized || venue.hours || (venue.open && venue.close ? `${venue.open} - ${venue.close}` : ""));
}

function detectCategories(question: string) {
  const q = clean(question);
  const result = new Set<string>();

  Object.entries(CATEGORY_KEYWORDS).forEach(([category, keywords]) => {
    if (hasAnyTerm(q, keywords)) result.add(category);
  });

  return [...result];
}

function isGenericServiceQuestion(question: string) {
  return hasAnyTerm(question, GENERIC_SERVICE_KEYWORDS);
}

function findMatchingServices(question: string, hotel: HotelPayload) {
  const q = clean(question);

  return getActiveServices(hotel).filter((service) => {
    const tokens = [
      clean(service.key),
      clean(service.key.replace(/_/g, " ")),
      clean(stripIcon(service.label)),
      ...(service.keywords ?? []).map(clean),
      ...(SERVICE_KEYWORDS[service.key] ?? []),
    ].filter(Boolean);

    return tokens.some((token) => hasTerm(q, token));
  });
}

function itemIdentity(item: HotelInfoItem, lang: Lang) {
  const allText = [
    item.key,
    item.id,
    item.category,
    item.section,
    getMapValue(item.title, lang),
    getMapValue(item.title, "en"),
    getMapValue(item.title, "bg"),
    getMapValue(item.text, lang),
  ];
  return allText.map((value) => clean(String(value || ""))).filter(Boolean).join(" ");
}

function findMatchingHotelInfo(question: string, lang: Lang, hotel: HotelPayload) {
  const q = clean(question);
  const items = getActiveHotelInfo(hotel);
  const matches: HotelInfoItem[] = [];

  for (const item of items) {
    const identity = itemIdentity(item, lang);
    if (!identity) continue;

    const groupHit = Object.values(INFO_GROUP_KEYWORDS).some((terms) => hasAnyTerm(q, terms) && hasAnyTerm(identity, terms));
    const title = getMapValue(item.title, lang) || getMapValue(item.title, "en") || getMapValue(item.title, "bg");
    const titleTokens = stripIcon(title).split(/[\s,/·|()-]+/).filter((token) => token.length >= 4);
    const titleHit = titleTokens.some((token) => hasTerm(q, token));

    if (groupHit || titleHit) matches.push(item);
  }

  return matches;
}

function isHotelQuestion(question: string, hotel: HotelPayload) {
  const q = clean(question);
  if (!q) return true;
  if (hasAnyTerm(q, HOTEL_KEYWORDS)) return true;

  const infoMatch = findMatchingHotelInfo(q, "en", hotel).length > 0;
  if (infoMatch) return true;

  const venueMatch = getActiveVenues(hotel).some((venue) => {
    const name = clean(venue.name ?? "");
    const category = normalizeCategory(venue.category || venue.type);
    return (name && hasTerm(q, name)) || (category && hasTerm(q, category));
  });
  if (venueMatch) return true;

  return getActiveServices(hotel).some((service) => {
    const tokens = [
      clean(service.key),
      clean(service.key.replace(/_/g, " ")),
      clean(stripIcon(service.label)),
      ...(service.keywords ?? []).map(clean),
      ...(SERVICE_KEYWORDS[service.key] ?? []),
    ].filter(Boolean);
    return tokens.some((token) => hasTerm(q, token));
  });
}

function pickMealLines(question: string, hours: string) {
  const parts = normalizeDisplayText(hours).split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return "";

  const mealGroups = [
    ["breakfast", "закуска", "frühstück", "mic dejun", "snídaně"],
    ["lunch", "обяд", "mittagessen", "prânz", "pranz", "oběd"],
    ["snack", "следобед", "gustare", "svačina"],
    ["dinner", "вечеря", "abendessen", "cină", "cina", "večeře"],
  ];

  const selected = parts.filter((line) => mealGroups.some((terms) => hasAnyTerm(question, terms) && hasAnyTerm(line, terms)));
  return selected.length ? selected.join("\n") : normalizeDisplayText(hours);
}

function formatVenueLine(venue: Venue, lang: Lang, wantsReservation: boolean, question = "") {
  const t = COPY[lang];
  const name = venue.name || "Hotel";
  const hours = getVenueHours(venue, lang);
  const detail = venue.shortDescription || venue.description || venue.cuisine || venue.location || venue.programText || venue.ageGroup || "";

  if (wantsReservation || venue.requiresReservation) return t.venueReservation(name);
  if (hours) return t.venueHours(name, pickMealLines(question, hours));
  if (detail) return t.venueInfo(name, detail);
  return `• ${name}`;
}

function buildVenueCategoryAnswer(question: string, lang: Lang, hotel: HotelPayload) {
  const t = COPY[lang];
  const categories = detectCategories(question);
  if (!categories.length) return null;

  const wantsReservation = hasAnyTerm(question, ["reserv", "book", "резерв", "buch", "rezerv", "rezervare", "rezervovat"]);
  const venues = getActiveVenues(hotel).filter((venue) => categories.includes(normalizeCategory(venue.category || venue.type)));
  if (!venues.length) return t.noData;

  const labels = categories
    .map((category) => t.categoryLabel[category as keyof typeof t.categoryLabel] || category)
    .join(lang === "bg" ? " и " : lang === "de" ? " und " : lang === "ro" ? " și " : lang === "cs" ? " a " : " and ");

  const lines = venues.slice(0, 8).map((venue) => formatVenueLine(venue, lang, wantsReservation, question));
  return [t.venueListIntro(labels), ...lines].join("\n");
}

function buildSpecificVenueAnswer(question: string, lang: Lang, hotel: HotelPayload) {
  const wantsReservation = hasAnyTerm(question, ["reserv", "book", "резерв", "buch", "rezerv", "rezervare", "rezervovat"]);
  const venues = getActiveVenues(hotel).filter((venue) => {
    const name = clean(venue.name ?? "");
    return name && hasTerm(question, name);
  });
  if (!venues.length) return null;
  return venues.slice(0, 5).map((venue) => formatVenueLine(venue, lang, wantsReservation, question)).join("\n");
}

function buildHotelInfoAnswer(question: string, lang: Lang, hotel: HotelPayload) {
  const matches = findMatchingHotelInfo(question, lang, hotel);
  if (!matches.length) return null;

  const lines = matches.slice(0, 5).map((item) => {
    const title = stripIcon(getMapValue(item.title, lang));
    const text = normalizeDisplayText(getMapValue(item.text, lang));
    if (title && text) return `• ${title}\n${text}`;
    if (text) return `• ${text}`;
    if (title) return `• ${title}`;
    return "";
  }).filter(Boolean);

  return lines.length ? [COPY[lang].hotelInfoIntro, ...lines].join("\n") : null;
}


function uniqueNonEmpty(lines: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const line of lines) {
    const value = normalizeDisplayText(line);
    if (!value) continue;
    const key = clean(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

function formatInfoForSmartAnswer(item: HotelInfoItem, lang: Lang) {
  const title = stripIcon(getMapValue(item.title, lang));
  const text = normalizeDisplayText(getMapValue(item.text, lang));

  if (title && text) return `• ${title}\n${text}`;
  if (text) return `• ${text}`;
  if (title) return `• ${title}`;
  return "";
}

function formatServiceForSmartAnswer(service: ServiceItem) {
  const label = stripIcon(service.label);
  const description = normalizeDisplayText(service.description || "");

  if (label && description) return `• ${label}\n${description}`;
  if (description) return `• ${description}`;
  if (label) return `• ${label}`;
  return "";
}

function findMatchingVenues(question: string, hotel: HotelPayload) {
  const q = clean(question);
  const categories = detectCategories(q);
  const venues = getActiveVenues(hotel).filter((venue) => {
    const name = clean(venue.name ?? "");
    const category = normalizeCategory(venue.category || venue.type);
    return (name && hasTerm(q, name)) || (category && categories.includes(category));
  });

  const seen = new Set<string>();
  return venues.filter((venue) => {
    const key = clean(`${venue.category || venue.type || ""}:${venue.name || ""}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSmartTopicAnswer(question: string, lang: Lang, hotel: HotelPayload) {
  const q = clean(question);
  if (!q) return null;

  const infoMatches = findMatchingHotelInfo(q, lang, hotel);
  const serviceMatches = findMatchingServices(q, hotel);
  const venueMatches = findMatchingVenues(q, hotel);
  const wantsReservation = hasAnyTerm(q, ["reserv", "book", "резерв", "buch", "rezerv", "rezervare", "rezervovat"]);

  if (!infoMatches.length && !serviceMatches.length && !venueMatches.length) return null;

  const lines: string[] = [];

  if (infoMatches.length) {
    lines.push(COPY[lang].hotelInfoIntro);
    lines.push(...infoMatches.slice(0, 4).map((item) => formatInfoForSmartAnswer(item, lang)));
  }

  if (venueMatches.length) {
    lines.push(
      ...venueMatches.slice(0, 5).map((venue) => formatVenueLine(venue, lang, wantsReservation, question))
    );
  }

  if (serviceMatches.length) {
    lines.push(
      ...serviceMatches.slice(0, 5).map((service) => formatServiceForSmartAnswer(service))
    );
  }

  const cleaned = uniqueNonEmpty(lines);
  return cleaned.length ? cleaned.join("\n\n") : null;
}

function buildServiceAnswer(question: string, lang: Lang, hotel: HotelPayload) {
  const t = COPY[lang];
  const activeServices = getActiveServices(hotel);
  if (!activeServices.length) return null;

  const matches = findMatchingServices(question, hotel);
  if (matches.length) {
    return matches.slice(0, 5).map((service) => `• ${stripIcon(service.label)}${service.description ? ` — ${normalizeDisplayText(service.description)}` : ""}`).join("\n");
  }

  if (isGenericServiceQuestion(question)) {
    return [t.servicesIntro, ...activeServices.slice(0, 15).map((service) => `• ${stripIcon(service.label)}`)].join("\n");
  }

  return null;
}

function buildHotelAnswer(question: string, lang: Lang, hotel: HotelPayload) {
  const t = COPY[lang];
  const q = clean(question);

  if (!q) return t.intro;
  if (!isHotelQuestion(q, hotel)) return t.outOfScope;

  if (hasAnyTerm(q, ["wifi", "wi-fi", "wlan", "internet", "парол", "парола", "passwort", "password", "parolă", "parola", "heslo"])) {
    return t.wifi(hotel.wifi?.ssid, hotel.wifi?.password);
  }

  const smartTopicAnswer = buildSmartTopicAnswer(q, lang, hotel);
  if (smartTopicAnswer) return smartTopicAnswer;

  const hotelInfoAnswer = buildHotelInfoAnswer(q, lang, hotel);
  if (hotelInfoAnswer) return hotelInfoAnswer;

  if (hasAnyTerm(q, ["review", "reviews", "отзив", "bewertung", "recenzie", "recenze"])) {
    return t.reviews;
  }

  if (hasAnyTerm(q, ["reception", "rezeption", "рецепц", "recepție", "recepce"])) {
    const reception = hotel.departmentHours?.reception ?? {};
    return t.receptionHours(reception.open, reception.close);
  }

  if (hasAnyTerm(q, ["where", "wo", "location", "address", "къде", "адрес", "unde", "locație", "kde", "poloha"])) {
    return t.location(hotel.locationQuery);
  }

  if (hasAnyTerm(q, ["housekeeping", "clean", "камер", "почист", "curăț", "uklid", "úklid"])) {
    const housekeeping = hotel.departmentHours?.housekeeping ?? {};
    return t.housekeepingHours(housekeeping.open, housekeeping.close);
  }

  if (hasAnyTerm(q, ["maintenance", "technik", "поддр", "repair", "întreținere", "údržba"])) {
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
    const question = String(body?.question ?? body?.message ?? body?.prompt ?? body?.text ?? "").trim();
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
