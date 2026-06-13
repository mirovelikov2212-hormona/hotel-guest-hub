import { NextResponse } from "next/server";
import { getHotelConfig } from "@/lib/config";

type Lang = "bg" | "de" | "en" | "ro" | "cs" | "ru";

type Venue = {
  category?: string;
  type?: string;
  name?: string;
  nameByLang?: Record<string, string>;
  shortDescription?: string;
  shortDescriptionByLang?: Record<string, string>;
  description?: string;
  descriptionByLang?: Record<string, string>;
  cuisine?: string;
  cuisineByLang?: Record<string, string>;
  hours?: string;
  hoursByLang?: Record<string, string>;
  open?: string;
  close?: string;
  location?: string;
  locationByLang?: Record<string, string>;
  menuUrl?: string;
  requiresReservation?: boolean;
  active?: boolean;
  programText?: string;
  programTextByLang?: Record<string, string>;
  ageGroup?: string;
  ageGroupByLang?: Record<string, string>;
};

type ServiceItem = {
  key: string;
  label: string;
  description?: string;
  active?: boolean;
  keywords?: string[];
  category?: string;
  price?: string;
  currency?: string;
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

type HubKnowledgeItem = {
  label?: string;
  title?: string;
  info?: string;
  text?: string;
  kind?: string;
  href?: string;
  url?: string;
};

type HubKnowledgeSection = {
  id?: string;
  title?: string;
  items?: HubKnowledgeItem[];
};

type HotelPayload = {
  hotelName?: string;
  locationQuery?: string;
  wifi?: { ssid?: string; password?: string };
  departmentHours?: Record<string, { open?: string; close?: string }>;
  venueRows?: Venue[];
  hotelInfoItems?: HotelInfoItem[];
  services?: ServiceItem[];
  reviews?: { google?: string; tripadvisor?: string; booking?: string };
  socialLinks?: { facebook?: string; instagram?: string; tiktok?: string; youtube?: string };
  hubSections?: HubKnowledgeSection[];
};

const SUPPORTED_LANGS: Lang[] = ["bg", "de", "en", "ro", "cs", "ru"];

const COPY = {
  bg: {
    intro:
      "Мога да помагам с актуална информация за хотела – ресторанти, барове, работно време, Wi‑Fi, паркинг, анимация, политики, услуги, заявки в хъба и времето около хотела.",
    outOfScope:
      "Мога да помагам с информация за хотела, неговите услуги и времето около хотела. Попитайте ме за ресторанти, барове, работно време, Wi‑Fi, паркинг, спа, анимация, услуги, правила или прогноза за времето.",
    noData:
      "Все още нямам тази информация за хотела. Моля, обърнете се към рецепция.",
    lead: "Най-релевантната информация:",
    nearbyLead: "Информация за района около хотела:",
    actionLead: "Можете да го направите директно през хъба:",
    paidNotice: "Имайте предвид, че това е платена услуга и може да бъде начислена към сметката на стаята.",
    askReception: "Ако желаете нещо по-специфично, рецепцията ще Ви помогне най-точно.",
    nearbyNoData: "За обекти около хотела проверете секцията „Около хотела“ в хъба. Ако търсите конкретна препоръка, рецепцията ще Ви насочи най-добре.",
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
        ? `Камериерките са на разположение от ${open} до ${close}.`
        : "Камериерките са на разположение за съдействие.",
    maintenanceHours: (open?: string, close?: string) =>
      open && close
        ? `Техническата поддръжка работи от ${open} до ${close}.`
        : "Техническата поддръжка е на разположение за съдействие.",
    reviews: "Можете да оставите отзив през секцията „Отзиви“ в хъба — Google, TripAdvisor или Booking, ако са налични.",
    social: "Можете да ни последвате от секцията „Последвайте ни“ в хъба.",
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
      "I can help with current hotel information – restaurants, bars, opening hours, Wi‑Fi, parking, animation, policies, services, hub requests and the weather around the hotel.",
    outOfScope:
      "I can help with information about the hotel, its services and the weather around the hotel. Ask me about restaurants, bars, opening hours, Wi‑Fi, parking, spa, animation, services, hotel rules or today’s weather.",
    noData:
      "I do not have that hotel information yet. Please contact reception.",
    lead: "Most relevant information:",
    nearbyLead: "Information for the area around the hotel:",
    actionLead: "You can do this directly in the hub:",
    paidNotice: "Please note that this is a paid service and may be charged to your room account.",
    askReception: "For anything more specific, reception will be happy to guide you.",
    nearbyNoData: "For places around the hotel, please check the Explore nearby section in the hub. For a specific recommendation, reception can guide you best.",
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
        ? `Housekeeping is available from ${open} to ${close}.`
        : "Housekeeping is available for assistance.",
    maintenanceHours: (open?: string, close?: string) =>
      open && close ? `Maintenance is available from ${open} to ${close}.` : "Maintenance is available for assistance.",
    reviews: "You can leave a review from the Reviews section in the hub — Google, TripAdvisor or Booking, when available.",
    social: "You can follow us from the Follow us section in the hub.",
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
      "Ich kann mit aktuellen Hotelinformationen helfen – Restaurants, Bars, Öffnungszeiten, WLAN, Parkplatz, Animation, Regeln, Services, Anfragen im Hub und dem Wetter rund um das Hotel.",
    outOfScope:
      "Ich kann mit Informationen über das Hotel, seine Leistungen und das Wetter rund um das Hotel helfen. Fragen Sie mich nach Restaurants, Bars, Öffnungszeiten, WLAN, Parkplatz, Spa, Animation, Services, Hotelregeln oder dem Wetter.",
    noData:
      "Ich habe diese Hotelinformation noch nicht. Bitte wenden Sie sich an die Rezeption.",
    lead: "Passende Information:",
    nearbyLead: "Informationen zur Umgebung des Hotels:",
    actionLead: "Sie können das direkt im Hub erledigen:",
    paidNotice: "Bitte beachten Sie, dass dies eine kostenpflichtige Leistung ist und dem Zimmerkonto belastet werden kann.",
    askReception: "Für spezielle Wünsche hilft Ihnen die Rezeption gern weiter.",
    nearbyNoData: "Für Orte in der Umgebung nutzen Sie bitte den Bereich „Umgebung“ im Hub. Für eine konkrete Empfehlung hilft Ihnen die Rezeption am besten weiter.",
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
        ? `Housekeeping ist von ${open} bis ${close} verfügbar.`
        : "Housekeeping hilft Ihnen gern weiter.",
    maintenanceHours: (open?: string, close?: string) =>
      open && close ? `Die Technik ist von ${open} bis ${close} verfügbar.` : "Die Technik hilft Ihnen gern weiter.",
    reviews: "Sie können eine Bewertung im Bereich „Bewertungen“ im Hub hinterlassen — Google, TripAdvisor oder Booking, sofern verfügbar.",
    social: "Sie können uns im Bereich „Folgen Sie uns“ im Hub folgen.",
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
      "Pot ajuta cu informații actuale despre hotel – restaurante, baruri, program, Wi‑Fi, parcare, animație, politici, servicii, solicitări în hub și vremea din zona hotelului.",
    outOfScope:
      "Pot ajuta cu informații despre hotel, serviciile sale și vremea din zona hotelului. Întrebați-mă despre restaurante, baruri, program, Wi‑Fi, parcare, spa, animație, servicii, reguli sau vremea de azi.",
    noData:
      "Nu am încă această informație despre hotel. Vă rugăm să contactați recepția.",
    lead: "Informația relevantă:",
    nearbyLead: "Informații pentru zona din jurul hotelului:",
    actionLead: "Puteți face acest lucru direct din hub:",
    paidNotice: "Vă rugăm să rețineți că acesta este un serviciu contra cost și poate fi adăugat la contul camerei.",
    askReception: "Pentru ceva mai specific, recepția vă poate ajuta cel mai bine.",
    nearbyNoData: "Pentru locuri din apropierea hotelului, verificați secțiunea „Atracții / În apropiere” din hub. Pentru o recomandare concretă, recepția vă poate ghida cel mai bine.",
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
        ? `Serviciul de curățenie este disponibil între ${open} și ${close}.`
        : "Serviciul de curățenie vă stă la dispoziție.",
    maintenanceHours: (open?: string, close?: string) =>
      open && close ? `Întreținerea este disponibilă între ${open} și ${close}.` : "Întreținerea vă stă la dispoziție.",
    reviews: "Puteți lăsa o recenzie din secțiunea Recenzii din hub — Google, TripAdvisor sau Booking, dacă sunt disponibile.",
    social: "Ne puteți urmări din secțiunea Urmăriți-ne din hub.",
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
      "Mohu pomoci s aktuálními informacemi o hotelu – restaurace, bary, otevírací doba, Wi‑Fi, parkování, animace, pravidla, služby, požadavky v hubu a počasí v okolí hotelu.",
    outOfScope:
      "Mohu pomoci s informacemi o hotelu, jeho službách a počasí v okolí hotelu. Zeptejte se na restaurace, bary, otevírací dobu, Wi‑Fi, parkování, spa, animaci, služby, pravidla nebo dnešní počasí.",
    noData:
      "Tuto informaci o hotelu zatím nemám. Kontaktujte prosím recepci.",
    lead: "Nejdůležitější informace:",
    nearbyLead: "Informace o okolí hotelu:",
    actionLead: "Můžete to vyřídit přímo v hubu:",
    paidNotice: "Upozorňujeme, že se jedná o placenou službu a může být připsána na účet pokoje.",
    askReception: "Pro konkrétnější přání vám nejlépe pomůže recepce.",
    nearbyNoData: "Místa v okolí hotelu najdete v sekci „Okolí“ v hubu. Pro konkrétní doporučení vám nejlépe poradí recepce.",
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
        ? `Úklid pokoje je k dispozici od ${open} do ${close}.`
        : "Úklid pokoje vám rád pomůže.",
    maintenanceHours: (open?: string, close?: string) =>
      open && close ? `Údržba je k dispozici od ${open} do ${close}.` : "Údržba vám ráda pomůže.",
    reviews: "Recenzi můžete zanechat v sekci Recenze v hubu — Google, TripAdvisor nebo Booking, pokud jsou k dispozici.",
    social: "Sledovat nás můžete v sekci Sledujte nás v hubu.",
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
  ru: {
    intro:
      "Я могу помочь с актуальной информацией об отеле: рестораны, бары, часы работы, Wi‑Fi, парковка, анимация, правила, услуги, запросы в хабе и погода рядом с отелем.",
    outOfScope:
      "Я могу помочь с информацией об отеле, его услугах и погоде рядом с отелем. Спросите меня о ресторанах, барах, часах работы, Wi‑Fi, парковке, СПА, анимации, услугах, правилах или прогнозе погоды.",
    noData:
      "У меня пока нет этой информации об отеле. Пожалуйста, обратитесь на рецепцию.",
    lead: "Самая подходящая информация:",
    nearbyLead: "Информация о районе рядом с отелем:",
    actionLead: "Вы можете сделать это прямо в хабе:",
    paidNotice: "Обратите внимание: это платная услуга, и её стоимость может быть начислена на счёт номера.",
    askReception: "Если вам нужно что-то более конкретное, сотрудники рецепции помогут точнее.",
    nearbyNoData: "Места рядом с отелем можно найти в разделе «Рядом с отелем». Для конкретной рекомендации лучше обратиться на рецепцию.",
    servicesIntro: "Сейчас в хабе доступны следующие услуги:",
    hotelInfoIntro: "Актуальная информация:",
    wifi: (ssid?: string, password?: string) =>
      ssid
        ? `Сеть Wi‑Fi: ${ssid}${password ? `\nПароль: ${password}` : ""}`
        : "У меня пока нет данных о Wi‑Fi. Пожалуйста, обратитесь на рецепцию.",
    receptionHours: (open?: string, close?: string) =>
      open && close ? `Рецепция работает с ${open} до ${close}.` : "Рецепция готова помочь вам.",
    location: (q?: string) =>
      q ? `Отель находится в районе ${q}.` : "У меня пока нет точной информации о местоположении.",
    venueListIntro: (label: string) => `В отеле доступны следующие ${label}:`,
    venueHours: (name: string, hours: string) => `• ${name}\n${hours}`,
    venueInfo: (name: string, details: string) => `• ${name} — ${details}`,
    venueReservation: (name: string) =>
      `• ${name} — для бронирования используйте соответствующий раздел в хабе или обратитесь на рецепцию.`,
    housekeepingHours: (open?: string, close?: string) =>
      open && close
        ? `Уборка номера доступна с ${open} до ${close}.`
        : "Служба уборки номера готова помочь вам.",
    maintenanceHours: (open?: string, close?: string) =>
      open && close ? `Техническая служба работает с ${open} до ${close}.` : "Техническая служба готова помочь вам.",
    reviews: "Оставить отзыв можно в разделе «Отзывы» — через Google, TripAdvisor или Booking, если они доступны.",
    social: "Подписаться на наши страницы можно в разделе «Следите за нами».",
    categoryLabel: {
      restaurants: "рестораны",
      bars: "бары",
      spa: "СПА-объекты",
      kids: "детские зоны",
      pool: "бассейны",
      gym: "фитнес-залы",
      lounge: "лаунж-зоны",
      entertainment: "игровые залы",
      room_service: "услуги в номер",
    },
  },


} as const;

const CONVERSATION_COPY: Record<Lang, { greeting: string; thanks: string }> = {
  bg: {
    greeting: "Здравейте! Радвам се да помогна. Можете да ме попитате за ресторанти, барове, Wi‑Fi, паркинг, работно време, услуги в хъба или времето около хотела.",
    thanks: "Моля, с удоволствие. Ако имате нужда от още нещо, насреща съм.",
  },
  en: {
    greeting: "Hello! I’ll be happy to help. You can ask me about restaurants, bars, Wi‑Fi, parking, opening hours, hub services or the weather around the hotel.",
    thanks: "You’re very welcome. If you need anything else, I’m here to help.",
  },
  de: {
    greeting: "Guten Tag! Sehr gern helfe ich weiter. Sie können mich nach Restaurants, Bars, WLAN, Parkplatz, Öffnungszeiten, Services im Hub oder dem Wetter rund um das Hotel fragen.",
    thanks: "Sehr gern. Wenn Sie noch etwas benötigen, helfe ich Ihnen gerne weiter.",
  },
  ro: {
    greeting: "Bună ziua! Vă ajut cu plăcere. Mă puteți întreba despre restaurante, baruri, Wi‑Fi, parcare, program, servicii în hub sau vremea din zona hotelului.",
    thanks: "Cu plăcere. Dacă mai aveți nevoie de ceva, sunt aici să vă ajut.",
  },
  cs: {
    greeting: "Dobrý den! Rád vám pomohu. Můžete se zeptat na restaurace, bary, Wi‑Fi, parkování, otevírací dobu, služby v hubu nebo počasí v okolí hotelu.",
    thanks: "Rádo se stalo. Pokud budete potřebovat ještě něco, jsem tu pro vás.",
  },
  ru: {
    greeting: "Здравствуйте! С удовольствием помогу. Вы можете спросить о ресторанах, барах, Wi‑Fi, парковке, часах работы, услугах в хабе или погоде рядом с отелем.",
    thanks: "Пожалуйста. Если вам понадобится ещё что-то, я готов помочь.",
  },
};

const WEATHER_COPY: Record<Lang, {
  noLocation: string;
  unavailable: string;
  outsideArea: string;
  lead: (place: string) => string;
  now: string;
  today: string;
  tomorrow: string;
  temperature: string;
  feelsLike: string;
  minMax: (min?: number, max?: number) => string;
  clouds: string;
  wind: string;
  rainChance: string;
  humidity: string;
  adviceRain: string;
  adviceHot: string;
  adviceCold: string;
  adviceWind: string;
  adviceGood: string;
}> = {
  bg: {
    noLocation: "За да кажа времето точно, трябва да имам зададена локация на хотела. Моля, проверете настройката Hotel Location Query.",
    unavailable: "В момента не успявам да заредя прогнозата. Рецепцията ще Ви ориентира най-точно за времето днес.",
    outsideArea: "Мога да дам прогноза само за района на хотела. За други градове или държави, моля, проверете специализирано приложение за времето.",
    lead: (place) => `Актуално време за района на ${place}:`,
    now: "Сега",
    today: "Днес",
    tomorrow: "Утре",
    temperature: "Температура",
    feelsLike: "усеща се като",
    minMax: (min, max) => min != null && max != null ? `Минимална / максимална: ${Math.round(min)}°C / ${Math.round(max)}°C` : "",
    clouds: "Облачност",
    wind: "Вятър",
    rainChance: "Вероятност за валеж",
    humidity: "Влажност",
    adviceRain: "Добра идея е да вземете чадър — времето може да направи малък хотелски номер.",
    adviceHot: "Вземете вода и слънцезащита, особено ако планирате разходка или басейн.",
    adviceCold: "По-добре вземете лека връхна дреха — комфортът е част от ваканцията.",
    adviceWind: "Изглежда ветровито, така че край басейна може да е по-свежо от очакваното.",
    adviceGood: "Изглежда приятно за разходка или време край басейна.",
  },
  en: {
    noLocation: "To give accurate weather, I need the hotel location to be set. Please check the Hotel Location Query setting.",
    unavailable: "I can’t load the weather forecast right now. Reception can guide you best for today’s conditions.",
    outsideArea: "I can provide weather only for the hotel area. For other cities or countries, please check a dedicated weather app.",
    lead: (place) => `Current weather for the ${place} area:`,
    now: "Now",
    today: "Today",
    tomorrow: "Tomorrow",
    temperature: "Temperature",
    feelsLike: "feels like",
    minMax: (min, max) => min != null && max != null ? `Min / max: ${Math.round(min)}°C / ${Math.round(max)}°C` : "",
    clouds: "Cloud cover",
    wind: "Wind",
    rainChance: "Chance of rain",
    humidity: "Humidity",
    adviceRain: "It may be worth taking an umbrella — the weather likes a little drama sometimes.",
    adviceHot: "Take water and sun protection, especially if you plan a walk or pool time.",
    adviceCold: "A light jacket would be a good idea — comfort is part of the holiday.",
    adviceWind: "It looks breezy, so the pool area may feel cooler than expected.",
    adviceGood: "It looks pleasant for a walk or some time by the pool.",
  },
  de: {
    noLocation: "Für eine genaue Wetterauskunft muss die Hotellocation hinterlegt sein. Bitte prüfen Sie die Einstellung Hotel Location Query.",
    unavailable: "Ich kann die Wetterdaten gerade nicht laden. Die Rezeption hilft Ihnen für heute am besten weiter.",
    outsideArea: "Ich kann das Wetter nur für die Umgebung des Hotels anzeigen. Für andere Städte oder Länder nutzen Sie bitte eine Wetter-App.",
    lead: (place) => `Aktuelles Wetter für die Umgebung von ${place}:`,
    now: "Aktuell",
    today: "Heute",
    tomorrow: "Morgen",
    temperature: "Temperatur",
    feelsLike: "gefühlt",
    minMax: (min, max) => min != null && max != null ? `Min. / max.: ${Math.round(min)}°C / ${Math.round(max)}°C` : "",
    clouds: "Bewölkung",
    wind: "Wind",
    rainChance: "Regenwahrscheinlichkeit",
    humidity: "Luftfeuchtigkeit",
    adviceRain: "Ein Regenschirm wäre keine schlechte Idee — das Wetter hat manchmal seinen eigenen Plan.",
    adviceHot: "Nehmen Sie Wasser und Sonnenschutz mit, besonders für Spaziergänge oder Poolzeit.",
    adviceCold: "Eine leichte Jacke ist empfehlenswert — Komfort gehört zum Urlaub dazu.",
    adviceWind: "Es sieht windig aus, am Pool kann es daher frischer wirken.",
    adviceGood: "Das Wetter wirkt angenehm für einen Spaziergang oder Zeit am Pool.",
  },
  ro: {
    noLocation: "Pentru a oferi vremea exactă, locația hotelului trebuie să fie setată. Verificați setarea Hotel Location Query.",
    unavailable: "Momentan nu pot încărca prognoza meteo. Recepția vă poate ghida cel mai bine pentru condițiile de azi.",
    outsideArea: "Pot oferi vremea doar pentru zona hotelului. Pentru alte orașe sau țări, vă rugăm să verificați o aplicație meteo dedicată.",
    lead: (place) => `Vremea actuală pentru zona ${place}:`,
    now: "Acum",
    today: "Astăzi",
    tomorrow: "Mâine",
    temperature: "Temperatură",
    feelsLike: "se simte ca",
    minMax: (min, max) => min != null && max != null ? `Minimă / maximă: ${Math.round(min)}°C / ${Math.round(max)}°C` : "",
    clouds: "Nebulozitate",
    wind: "Vânt",
    rainChance: "Probabilitate de ploaie",
    humidity: "Umiditate",
    adviceRain: "Ar fi bine să luați o umbrelă — vremea mai face uneori mici surprize.",
    adviceHot: "Luați apă și protecție solară, mai ales dacă plănuiți o plimbare sau timp la piscină.",
    adviceCold: "O jachetă ușoară ar fi o idee bună — confortul face parte din vacanță.",
    adviceWind: "Pare vânt, deci zona piscinei poate părea mai răcoroasă.",
    adviceGood: "Vremea pare plăcută pentru o plimbare sau timp la piscină.",
  },
  cs: {
    noLocation: "Pro přesnou předpověď počasí musí být nastavena poloha hotelu. Zkontrolujte prosím nastavení Hotel Location Query.",
    unavailable: "Momentálně se mi nedaří načíst předpověď počasí. Recepce vám pro dnešek poradí nejlépe.",
    outsideArea: "Mohu zobrazit počasí pouze pro oblast hotelu. Pro jiná města nebo země prosím použijte specializovanou aplikaci pro počasí.",
    lead: (place) => `Aktuální počasí pro oblast ${place}:`,
    now: "Nyní",
    today: "Dnes",
    tomorrow: "Zítra",
    temperature: "Teplota",
    feelsLike: "pocitově",
    minMax: (min, max) => min != null && max != null ? `Min. / max.: ${Math.round(min)}°C / ${Math.round(max)}°C` : "",
    clouds: "Oblačnost",
    wind: "Vítr",
    rainChance: "Pravděpodobnost deště",
    humidity: "Vlhkost",
    adviceRain: "Deštník se může hodit — počasí umí občas překvapit.",
    adviceHot: "Vezměte si vodu a ochranu proti slunci, hlavně na procházku nebo k bazénu.",
    adviceCold: "Lehká bunda bude dobrý nápad — pohodlí patří k dovolené.",
    adviceWind: "Vypadá to na vítr, u bazénu může být chladněji, než se zdá.",
    adviceGood: "Počasí vypadá příjemně na procházku nebo chvíli u bazénu.",
  },
  ru: {
    noLocation: "Чтобы показать точную погоду, в настройках должно быть указано местоположение отеля.",
    unavailable: "Сейчас не удаётся загрузить прогноз погоды. Сотрудники рецепции помогут уточнить условия на сегодня.",
    outsideArea: "Я могу показать погоду только для района отеля. Для других городов или стран используйте приложение погоды.",
    lead: (place) => `Актуальная погода для района ${place}:`,
    now: "Сейчас",
    today: "Сегодня",
    tomorrow: "Завтра",
    temperature: "Температура",
    feelsLike: "ощущается как",
    minMax: (min, max) => min != null && max != null ? `Мин. / макс.: ${Math.round(min)}°C / ${Math.round(max)}°C` : "",
    clouds: "Облачность",
    wind: "Ветер",
    rainChance: "Вероятность дождя",
    humidity: "Влажность",
    adviceRain: "Лучше взять зонт — погода иногда любит сюрпризы.",
    adviceHot: "Возьмите воду и защиту от солнца, особенно для прогулки или отдыха у бассейна.",
    adviceCold: "Лёгкая куртка будет полезна — комфорт тоже часть отдыха.",
    adviceWind: "Ожидается ветер, поэтому у бассейна может быть прохладнее.",
    adviceGood: "Погода подходит для прогулки или отдыха у бассейна.",
  },
};

const GREETING_TERMS = [
  "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
  "здравей", "здравейте", "добър ден", "добро утро", "добър вечер", "хей",
  "hallo", "guten tag", "guten morgen", "guten abend",
  "bună", "buna", "salut", "bună ziua", "buna ziua", "bună dimineața", "buna dimineata",
  "ahoj", "dobrý den", "dobry den", "dobré ráno", "dobry rano", "dobrý večer", "dobry vecer",
  "привет", "здравствуйте", "добрый день", "доброе утро", "добрый вечер",
];

const THANKS_TERMS = [
  "thanks", "thank you", "благодаря", "мерси", "danke", "vielen dank", "mulțumesc", "multumesc", "děkuji", "dekuji", "díky", "diky",
  "спасибо", "благодарю",
];

const WEATHER_TERMS = [
  "weather", "forecast", "temperature", "rain", "cloud", "wind", "sunny", "storm", "umbrella",
  "време", "времето", "прогноза", "температура", "дъжд", "вали", "облаци", "облачно", "вятър", "слънце", "буря", "чадър",
  "wetter", "vorhersage", "temperatur", "regen", "wolken", "bewölkt", "wind", "sonne", "sturm", "schirm",
  "vreme", "vremea", "prognoza", "temperatură", "temperatura", "ploaie", "plouă", "ploua", "nori", "vânt", "vant", "soare", "furtună", "furtuna",
  "počasí", "pocasi", "předpověď", "predpoved", "teplota", "déšť", "dest", "prší", "prsi", "mraky", "oblačno", "vítr", "vitr", "slunce", "bouřka", "bourka",
  "погода", "прогноз", "температура", "дождь", "облачно", "облака", "ветер", "солнце", "гроза", "зонт",
];

const TOMORROW_TERMS = [
  "tomorrow", "утре", "morgen", "mâine", "maine", "zítra", "zitra", "завтра",
];


const CATEGORY_KEYWORDS: Record<string, string[]> = {
  restaurants: ["restaurant", "restaurants", "ресторант", "ресторанти", "restoran", "restaurante", "restaurace", "ресторан", "рестораны", "mic dejun", "breakfast", "закуска", "завтрак", "frühstück", "snídaně", "lunch", "обяд", "обед", "mittag", "prânz", "oběd", "dinner", "вечеря", "ужин", "abendessen", "cină", "večeře"],
  bars: ["bar", "bars", "бар", "барове", "baruri", "bary", "бары"],
  spa: ["spa", "спа", "wellness", "sauna", "сауна", "масаж", "массаж", "masaj", "masáž"],
  kids: ["kids", "kids club", "children", "дет", "деца", "детски", "дети", "детский", "copii", "děti", "dětský"],
  pool: ["pool", "басейн", "басейни", "бассейн", "бассейны", "piscină", "piscina", "bazén", "bazen"],
  gym: ["gym", "fitness", "фитнес"],
  lounge: ["lounge", "лаундж"],
  entertainment: ["entertainment", "games", "game", "games room", "игри", "игрална", "игрална зала", "игры", "игровая", "игровой зал", "sală de jocuri", "sala de jocuri", "herna"],
  room_service: ["room service", "roomservice", "room-service", "pokojová služba"],
};

const SERVICE_KEYWORDS: Record<string, string[]> = {
  towels: ["towel", "towels", "хавли", "кърпи", "полотенце", "полотенца", "prosop", "prosoape", "ručník", "ručníky"],
  toilet_paper: ["toilet paper", "toilet", "paper", "тоалетна хартия", "туалетная бумага", "hârtie igienică", "toaletní papír"],
  extra_pillow: ["pillow", "pillows", "възглав", "възглавници", "подушка", "подушки", "pernă", "perne", "polštář", "polštáře"],
  extra_blanket: ["blanket", "одеяло", "одеяла", "плед", "одеяло", "pătură", "patura", "přikrývka"],
  bathrobe: ["bathrobe", "robe", "халат", "банный халат", "halat", "župan"],
  slippers: ["slippers", "pantoffel", "чехли", "тапочки", "papuci", "pantofle"],
  baby_cot: ["baby cot", "baby bed", "crib", "baby crib", "бебешко легло", "кошарка", "детская кроватка", "кроватка", "pătuț", "dětská postýlka"],
  iron: ["iron", "ютия", "утюг", "fier de călcat", "žehlička"],
  minibar: ["minibar", "минибар"],
  laundry: ["laundry", "washing", "пране", "стирка", "прачечная", "spălătorie", "prádelna"],
  late_checkout: ["late checkout", "late check-out", "checkout", "check-out", "късно напускане", "поздний выезд", "check-out târziu", "pozdní check-out"],
  wake_up_call: ["wake up", "wake-up", "wakeup", "събуждане", "будене", "будильник", "разбудить", "trezire", "buzení"],
  taxi: ["taxi", "такси"],
  air_conditioning: ["air conditioning", "ac", "климатик", "кондиционер", "aer condiționat", "klimatizace"],
  no_hot_water: ["hot water", "warm water", "топла вода", "горячая вода", "нет горячей воды", "apă caldă", "teplá voda"],
  other_technical_issue: ["broken", "issue", "problem", "счупено", "проблем", "сломано", "не работает", "defect", "rozbité", "porucha"],
  coffee_capsules: ["coffee capsules", "coffee", "capsules", "кафе", "кафе капсули", "капсули", "кофе", "кофейные капсулы", "капсулы", "cafea", "capsule", "capsule de cafea", "kávové kapsle", "kava", "káva"],
  pillow_menu: ["pillow menu", "меню възглавници", "меню подушек", "meniu perne", "nabídka polštářů"],
  massage_booking: ["massage", "massages", "масаж", "масажи", "массаж", "массажи", "релакс", "masaj", "masaje", "masáž", "masáže", "spa therapy", "relax therapy"],
  special_occasion: ["special occasion", "специален повод", "ocazie specială", "zvláštní příležitost", "особый случай", "день рождения", "годовщина", "сюрприз", "праздник"],
  animation_program: ["animation", "animation program", "анимация", "анимационная программа", "детская анимация", "вечерняя программа"],
  world_cup_2026: ["world cup", "world cup 2026", "fifa", "football", "световно първенство", "чемпионат мира", "чемпионат мира 2026", "футбол", "матчи"],
  world_cup_conference_room: ["conference room", "конферентна зала", "konferenzraum", "sală de conferințe", "sala de conferinte", "konferenční sál", "konferencni sal", "конференц-зал", "конференц зал"],
};

const GENERIC_SERVICE_KEYWORDS = [
  "service", "services", "услуги", "order", "request", "поръч", "заяв", "can i", "може ли", "what can", "какво мога", "какви услуги",
  "servicii", "solicit", "pot", "služby", "požadavek", "mohu",
  "услуга", "услуги", "заказать", "заказ", "запрос", "можно ли", "что можно",
];

const HOTEL_KEYWORDS = [
  "hotel", "wifi", "wi-fi", "wlan", "internet", "reception", "rezeption", "recepție", "recepce", "restaurant", "bar", "spa", "pool", "kids", "animation", "parking", "park", "review", "policy", "rules", "gift", "cause", "charity", "booking", "tripadvisor",
  "хотел", "рецепц", "ресторан", "бар", "спа", "басейн", "дет", "анимац", "паркинг", "правила", "политик", "хавли", "шезлонг", "благотвор", "подарък", "кауза", "gift", "cause", "gift with a cause", "geschenk", "sinn", "cadou", "cauza", "darek", "ucel", "подарък", "кауза",
  "parcare", "prosoape", "șezlong", "sezlong", "caritate", "cadou", "cauză", "cauza", "politica", "reguli", "animație", "animatie",
  "parkování", "ručníky", "lehátka", "charita", "dárek", "darek", "účel", "ucel", "pravidla", "animace",
  "check", "location", "address", "hours", "opening", "program", "nearby", "around", "area", "работ", "час", "къде", "район", "района", "около", "наблизо", "близо", "where", "wo", "umgebung", "nähe", "unde", "apropiere", "împrejurimi", "kde", "okolí", "blízko", "otevírací", "program",
  "minibar", "минибар", "laundry", "пране", "стирка", "wake", "събуж", "разбудить", "taxi", "такси", "facebook", "instagram", "tiktok", "tik tok", "youtube", "social", "социал", "социаль", "подписаться", "follow",
  "отель", "рецепция", "ресторан", "бар", "спа", "бассейн", "дети", "анимация", "парковка", "правила", "политика", "полотенца", "шезлонги", "отзывы", "где", "рядом", "поблизости", "часы работы",
];

const INFO_GROUP_KEYWORDS: Record<string, string[]> = {
  parking: ["parking", "park", "паркинг", "парковка", "parcare", "parkování"],
  checkin: ["check in", "check-in", "checkout", "check-out", "настаняване", "напускане", "заезд", "выезд", "cazare", "plecare", "příjezd", "odjezd"],
  towel: ["towel", "towels", "хавли", "кърпи", "полотенце", "полотенца", "prosop", "prosoape", "ručník", "ručníky"],
  sunbed: ["sunbed", "sunbeds", "шезлонг", "шезлонги", "șezlong", "sezlong", "lehátko", "lehátka"],
  charity: ["charity", "gift", "cause", "gift with a cause", "благотвор", "подарък", "кауза", "подарък с кауза", "caritate", "cadou", "cauză", "cauza", "cadou cu o cauza", "cadou cu o cauză", "charita", "dárek", "darek", "účel", "ucel", "darek s dobrym ucelem", "dárek s dobrým účelem"],
  animation: ["animation", "анимац", "анимация", "animație", "animatie", "animace", "program"],
  world_cup: ["world cup", "fifa", "световно", "чемпионат мира", "mondial", "ms ve fotbale", "wm 2026"],
  emergency: ["emergency", "urgent", "спеш", "экстренно", "срочно", "notfall", "urgență", "nouz"],
  attractions: ["attraction", "nearby", "around", "забележ", "наблизо", "достопримечательности", "рядом", "atrac", "împrejurimi", "zajímav", "okolí"],
  pharmacy: ["pharmacy", "аптека", "аптеки", "farmacie", "lékárna"],
};


const NEARBY_TERMS = [
  "nearby", "around", "area", "near the hotel", "outside the hotel", "surroundings",
  "наблизо", "близо", "около", "район", "района", "в района", "извън хотела",
  "umgebung", "in der nähe", "nähe", "rund um das hotel",
  "apropiere", "în apropiere", "imprejurimi", "împrejurimi", "zona hotelului",
  "okolí", "v okolí", "blízko", "u hotelu",
  "рядом", "поблизости", "около отеля", "в районе", "за пределами отеля",
];

const OUTSIDE_CATEGORY_TERMS: Record<string, string[]> = {
  restaurants_nearby: ["restaurant", "restaurants", "ресторант", "ресторанти", "ресторан", "рестораны", "restaurante", "restaurace"],
  bars_nearby: ["bar", "bars", "бар", "барове", "бары", "baruri", "bary"],
  pharmacy: ["pharmacy", "аптека", "farmacie", "lékárna", "apotheke"],
  attractions: ["attraction", "attractions", "sightseeing", "places", "забележ", "какво да видя", "достопримечательности", "что посмотреть", "atrac", "zajímav", "památky"],
};

const PAID_SERVICE_KEYS = new Set(["minibar", "laundry", "coffee_capsules", "pillow_menu", "late_checkout", "massage_booking"]);

const SERVICE_SECTION_LABELS = {
  bg: { housekeeping: "Камериерки", reception: "Рецепция", support: "Поддръжка" },
  en: { housekeeping: "Housekeeping", reception: "Reception", support: "Support / Maintenance" },
  de: { housekeeping: "Housekeeping", reception: "Rezeption", support: "Technik / Support" },
  ro: { housekeeping: "Curățenie", reception: "Recepție", support: "Suport / Întreținere" },
  cs: { housekeeping: "Úklid pokoje", reception: "Recepce", support: "Podpora / Údržba" },
  ru: { housekeeping: "Уборка номера", reception: "Рецепция", support: "Техническая служба" },
} as const;

const SERVICE_SECTION_BY_KEY: Record<string, keyof typeof SERVICE_SECTION_LABELS.bg> = {
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
  coffee_capsules: "housekeeping",
  pillow_menu: "housekeeping",
  late_checkout: "reception",
  wake_up_call: "reception",
  taxi: "reception",
  special_occasion: "reception",
  air_conditioning: "support",
  no_hot_water: "support",
  other_technical_issue: "support",
};

function normalizeLang(value: string): Lang {
  const lower = String(value || "").trim().toLowerCase();
  return SUPPORTED_LANGS.includes(lower as Lang) ? (lower as Lang) : "en";
}

function normalizeSearchText(text: string) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(text: string) {
  return normalizeSearchText(text);
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
  const preferred: string[] = [lang, "en", "bg", "de", "ro", "cs", "ru"];
  for (const key of preferred) {
    const value = map[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

function getAllMapValues(map: TextMap | undefined): string[] {
  return Array.from(new Set(Object.values(map ?? {})
    .map((value) => String(value || "").trim())
    .filter(Boolean)));
}

function tokenizeForSearch(value: string): string[] {
  return clean(value)
    .split(/[\s,/·|()\[\]{}:;.!?"'\-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);
}

function normalizeDisplayText(value: string) {
  return String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\s*\|\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function languageFallbackOrder(lang: Lang | string): string[] {
  const current = String(lang || "").trim().toLowerCase();
  const alias = current === "cs" ? "cz" : current === "cz" ? "cs" : "";
  return Array.from(new Set([current, alias, "en", "bg", "de", "ro", "cs", "ru"].filter(Boolean)));
}

function getLocalizedVenueValue(map: Record<string, string> | undefined, lang: Lang | string, fallback = "") {
  const values = map ?? {};

  for (const candidate of languageFallbackOrder(lang)) {
    const value = String(values[candidate] || "").trim();
    if (value) return value;
  }

  return String(fallback || "").trim();
}

function getVenueText(venue: Venue, field: keyof Venue, lang: Lang | string): string {
  const mapKey = `${String(field)}ByLang` as keyof Venue;
  return getLocalizedVenueValue(
    venue[mapKey] as Record<string, string> | undefined,
    lang,
    String(venue[field] || "")
  );
}

function getAllLocalizedVenueValues(venue: Venue, field: keyof Venue): string[] {
  const direct = String(venue[field] || "").trim();
  const mapKey = `${String(field)}ByLang` as keyof Venue;
  const map = venue[mapKey] as Record<string, string> | undefined;

  return Array.from(new Set([
    direct,
    ...Object.values(map ?? {}).map((value) => String(value || "").trim()),
  ].filter(Boolean)));
}


const GENERIC_VENUE_WORDS = new Set([
  "a", "an", "the", "and", "of", "at", "in",
  "der", "die", "das", "den", "dem", "des", "und", "im", "am",
  "de", "la", "si", "și", "in", "în", "pentru",
  "a", "i", "v", "ve", "na", "pro",
  "и", "в", "на", "за", "от", "до", "с",
  "hotel", "хотел", "отель",
  "bar", "bars", "бар", "барове", "бары", "baruri", "bary",
  "restaurant", "restaurants", "ресторант", "ресторанти", "ресторан", "рестораны", "restaurante", "restaurace",
  "room", "rooms", "zimmer", "raum", "sala", "salon", "зал", "зала", "комната",
  "center", "centre", "centrum", "център", "центр",
  "pool", "басейн", "бассейн", "piscina", "bazen",
  "spa", "спа", "wellness",
]);

const VENUE_QUALIFIER_GROUPS: Record<string, string[]> = {
  outside: [
    "outside", "outdoor", "open air", "external", "terrace", "garden",
    "външен", "външният", "външния", "открит", "открита", "навън",
    "aussen", "aussenbar", "außen", "außenbar", "freiluft", "draussen", "draußen",
    "exterior", "afara", "afară", "terasa", "terasă",
    "venkovni", "venkovní", "venku",
    "открытый", "наружный", "уличный", "на улице",
  ],
  lobby: [
    "lobby", "foyer", "reception hall",
    "лоби", "фоайе", "вестибюл",
    "empfangshalle",
    "hol", "lobby bar",
    "лобби", "вестибюль",
  ],
  main: [
    "main", "principal", "haupt", "основен", "основной", "hlavni", "hlavní",
  ],
  games: [
    "games", "game room", "games room", "play room",
    "игрална", "игровая", "игровой", "игри", "игры",
    "spielzimmer", "spielraum",
    "jocuri", "herna",
  ],
  kids: [
    "kids", "children", "playground", "kids club",
    "детски", "деца", "детский", "дети",
    "kinder", "copii", "detsky", "dětský",
  ],
  beach: [
    "beach", "seaside", "strand", "плаж", "пляж", "plaja", "plajă", "plaz", "pláž",
  ],
  rooftop: [
    "roof", "rooftop", "sky", "dach", "покрив", "крыша", "acoperis", "acoperiș", "strecha", "střecha",
  ],
  indoor: [
    "indoor", "inside", "вътрешен", "вътрешният", "закрит", "innen", "interior", "vnitrni", "vnitřní", "крытый",
  ],
};

type RankedVenueMatch = {
  venue: Venue;
  score: number;
  strength: 0 | 1 | 2 | 3;
};

function canonicalVenueText(value: string) {
  return clean(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function venueWords(value: string) {
  return canonicalVenueText(value)
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
}

function phraseInVenueText(source: string, phrase: string) {
  const haystack = canonicalVenueText(source);
  const needle = canonicalVenueText(phrase);
  if (!haystack || !needle) return false;
  return (` ${haystack} `).includes(` ${needle} `);
}

function commonPrefixLength(a: string, b: string) {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) index += 1;
  return index;
}

function venueWordMatches(questionWord: string, venueWord: string) {
  const a = canonicalVenueText(questionWord);
  const b = canonicalVenueText(venueWord);
  if (!a || !b) return false;
  if (a === b) return true;

  const minLength = Math.min(a.length, b.length);
  if (minLength >= 5 && (a.startsWith(b) || b.startsWith(a))) return true;

  const prefix = commonPrefixLength(a, b);
  return minLength >= 6 && prefix >= 5 && prefix / minLength >= 0.7;
}

function getVenueNameValues(venue: Venue, lang: Lang | string) {
  return Array.from(new Set([
    getVenueText(venue, "name", lang),
    ...getAllLocalizedVenueValues(venue, "name"),
  ].map((value) => String(value || "").trim()).filter(Boolean)));
}

function getVenueDescriptionValues(venue: Venue, lang: Lang | string) {
  return Array.from(new Set([
    getVenueText(venue, "shortDescription", lang),
    getVenueText(venue, "description", lang),
    getVenueText(venue, "cuisine", lang),
    getVenueText(venue, "location", lang),
    getVenueText(venue, "programText", lang),
    getVenueText(venue, "ageGroup", lang),
    ...getAllLocalizedVenueValues(venue, "shortDescription"),
    ...getAllLocalizedVenueValues(venue, "description"),
    ...getAllLocalizedVenueValues(venue, "cuisine"),
    ...getAllLocalizedVenueValues(venue, "location"),
    ...getAllLocalizedVenueValues(venue, "programText"),
    ...getAllLocalizedVenueValues(venue, "ageGroup"),
  ].map((value) => String(value || "").trim()).filter(Boolean)));
}

function distinctiveVenueWords(values: string[]) {
  return Array.from(new Set(
    values
      .flatMap((value) => venueWords(value))
      .filter((word) => word.length >= 3 && !GENERIC_VENUE_WORDS.has(word))
  ));
}

function countVenueWordMatches(questionWords: string[], candidateWords: string[]) {
  return candidateWords.filter((candidate) =>
    questionWords.some((questionWord) => venueWordMatches(questionWord, candidate))
  ).length;
}

function qualifierGroupsFor(value: string) {
  return Object.entries(VENUE_QUALIFIER_GROUPS)
    .filter(([, terms]) => terms.some((term) => phraseInVenueText(value, term)))
    .map(([group]) => group);
}

function venueIdentity(venue: Venue, lang: Lang | string = "en"): string {
  return [
    venue.category,
    venue.type,
    ...getVenueNameValues(venue, lang),
    ...getVenueDescriptionValues(venue, lang),
  ]
    .map((value) => canonicalVenueText(String(value || "")))
    .filter(Boolean)
    .join(" ");
}

function scoreVenueMatch(venue: Venue, question: string, lang: Lang | string = "en"): RankedVenueMatch {
  const q = canonicalVenueText(question);
  const qWords = venueWords(q);
  const category = normalizeCategory(venue.category || venue.type);
  const detectedCategories = detectCategories(q);
  const categoryMatch = Boolean(category && detectedCategories.includes(category));

  const currentName = getVenueText(venue, "name", lang);
  const names = getVenueNameValues(venue, lang);
  const descriptions = getVenueDescriptionValues(venue, lang);

  const exactCurrentName = Boolean(currentName && phraseInVenueText(q, currentName));
  const exactAnyName = names.some((name) => phraseInVenueText(q, name));
  const exactDescription = descriptions.some((description) => phraseInVenueText(q, description));

  const currentNameWords = distinctiveVenueWords(currentName ? [currentName] : []);
  const allNameWords = distinctiveVenueWords(names);
  const descriptionWords = distinctiveVenueWords(descriptions);

  const currentNameMatches = countVenueWordMatches(qWords, currentNameWords);
  const allNameMatches = countVenueWordMatches(qWords, allNameWords);
  const descriptionMatches = countVenueWordMatches(qWords, descriptionWords);

  const questionQualifiers = qualifierGroupsFor(q);
  const venueQualifiers = qualifierGroupsFor(venueIdentity(venue, lang));
  const matchingQualifiers = questionQualifiers.filter((group) => venueQualifiers.includes(group));
  const missingQualifiers = questionQualifiers.filter((group) => !venueQualifiers.includes(group));

  let score = 0;
  if (categoryMatch) score += 35;
  if (exactCurrentName) score += 620;
  else if (exactAnyName) score += 540;

  score += currentNameMatches * 120;
  score += Math.max(0, allNameMatches - currentNameMatches) * 80;
  score += descriptionMatches * 45;
  if (exactDescription) score += 140;
  score += matchingQualifiers.length * 220;
  score -= missingQualifiers.length * 180;

  if (currentNameWords.length > 0 && currentNameMatches === currentNameWords.length) score += 160;
  if (detectedCategories.length > 0 && !categoryMatch && !exactAnyName) score -= 100;

  const strength: RankedVenueMatch["strength"] =
    exactCurrentName || exactAnyName
      ? 3
      : matchingQualifiers.length > 0 || currentNameMatches > 0 || allNameMatches > 0
        ? 2
        : exactDescription || descriptionMatches > 0
          ? 1
          : 0;

  return { venue, score, strength };
}

function rankVenueMatches(question: string, lang: Lang | string, hotel: HotelPayload) {
  return getActiveVenues(hotel)
    .map((venue) => scoreVenueMatch(venue, question, lang))
    .filter((match) => match.strength > 0 && match.score >= 45)
    .sort((a, b) => b.score - a.score);
}

function selectRankedVenueMatches(matches: RankedVenueMatch[]) {
  if (!matches.length) return [];

  const strong = matches.filter((match) => match.strength >= 2);
  if (strong.length) {
    const topScore = strong[0].score;
    return strong
      .filter((match) => match.strength === 3 || match.score >= topScore - 90)
      .slice(0, 4);
  }

  const topScore = matches[0].score;
  return matches.filter((match) => match.score >= topScore - 20).slice(0, 4);
}

function venueMatchesQuestion(venue: Venue, question: string, lang: Lang | string = "en") {
  const match = scoreVenueMatch(venue, question, lang);
  return match.strength > 0 && match.score >= 45;
}

function normalizeCategory(value?: string) {
  const raw = clean(String(value ?? ""))
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

  if (raw.includes("restaurant") || raw.includes("ресторан") || raw.includes("restaurante") || raw.includes("restaurace")) return "restaurants";
  if (raw.includes("bar")) return "bars";
  if (raw.includes("spa") || raw.includes("wellness")) return "spa";
  if (raw.includes("kids") || raw.includes("children") || raw.includes("дет") || raw.includes("copii") || raw.includes("děti") || raw.includes("deti")) return "kids";
  if (raw.includes("pool") || raw.includes("басейн") || raw.includes("бассейн") || raw.includes("piscina") || raw.includes("bazén") || raw.includes("bazen")) return "pool";
  if (raw.includes("gym") || raw.includes("fitness")) return "gym";
  if (raw.includes("lounge")) return "lounge";
  if (raw.includes("entertainment") || raw.includes("games") || raw.includes("игров") || raw.includes("играл")) return "entertainment";
  if (raw.includes("room_service") || raw.includes("roomservice")) return "room_service";

  return raw;
}

function getActiveVenues(hotel: HotelPayload) {
  return (hotel.venueRows ?? []).filter((venue) => venue.active !== false && (venue.name || getVenueText(venue, "name", "en")));
}

function getActiveServices(hotel: HotelPayload) {
  return (hotel.services ?? []).filter((service) => service.active !== false && service.label);
}

function getActiveHotelInfo(hotel: HotelPayload) {
  return (hotel.hotelInfoItems ?? []).filter((item) => item && item.active !== false);
}

function hubValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return "";
}

function buildHotelInfoItemsFromHubSections(sections: HubKnowledgeSection[] | undefined, lang: Lang): HotelInfoItem[] {
  if (!Array.isArray(sections) || !sections.length) return [];

  const items: HotelInfoItem[] = [];

  sections.forEach((section, sectionIndex) => {
    const sectionId = hubValue(section?.id) || `section_${sectionIndex}`;
    const sectionTitle = stripIcon(hubValue(section?.title));

    (section?.items ?? []).forEach((item, itemIndex) => {
      const label = stripIcon(hubValue(item?.label || item?.title));
      const info = normalizeDisplayText(hubValue(item?.info || item?.text));
      const href = hubValue(item?.href || item?.url);
      const text = [info, href].filter(Boolean).join("\n").trim();

      if (!label && !text) return;

      items.push({
        key: `hub_${sectionId}_${itemIndex}`,
        category: sectionId,
        section: sectionTitle,
        active: true,
        sortOrder: 7000 + sectionIndex * 100 + itemIndex,
        title: { [lang]: label || sectionTitle || sectionId },
        text: { [lang]: text || label },
      });
    });
  });

  return items;
}

function mergeHotelInfoItems(...groups: Array<HotelInfoItem[] | undefined>) {
  const seen = new Set<string>();
  const merged: HotelInfoItem[] = [];

  for (const group of groups) {
    for (const item of group ?? []) {
      if (!item || item.active === false) continue;
      const identity = clean([
        item.key,
        item.id,
        item.category,
        ...getAllMapValues(item.title),
        ...getAllMapValues(item.text),
      ].join(" "));
      if (!identity || seen.has(identity)) continue;
      seen.add(identity);
      merged.push(item);
    }
  }

  return merged;
}

function getVenueHours(venue: Venue, lang: Lang) {
  const localized = venue.hoursByLang?.[lang] || venue.hoursByLang?.en || venue.hoursByLang?.bg || "";
  return normalizeDisplayText(
    localized || venue.hours || (venue.open && venue.close ? `${venue.open} - ${venue.close}` : "")
  ).replace(/\b(\d):(\d{2})\b/g, "0$1:$2");
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

  const matches = getActiveServices(hotel).filter((service) => {
    const tokens = [
      clean(service.key),
      clean(service.key.replace(/_/g, " ")),
      clean(stripIcon(service.label)),
      ...(service.keywords ?? []).map(clean),
      ...(SERVICE_KEYWORDS[service.key] ?? []),
    ].filter(Boolean);

    return tokens.some((token) => hasTerm(q, token));
  });

  return refineServiceMatches(question, matches);
}

function itemIdentity(item: HotelInfoItem, lang: Lang) {
  const allText = [
    item.key,
    item.id,
    item.category,
    item.section,
    getMapValue(item.title, lang),
    getMapValue(item.text, lang),
    ...getAllMapValues(item.title),
    ...getAllMapValues(item.text),
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

    const nearbyIdentityTerms = [
      ...NEARBY_TERMS,
      "nearby", "around", "наблизо", "около", "район", "района", "umgebung", "nähe", "apropiere", "împrejurimi", "okolí", "blízko",
    ];
    if (nearbyIdentityTerms.some((term) => phraseInVenueText(identity, term)) && !isNearbyOutsideQuestion(q)) continue;

    const groupHit = Object.values(INFO_GROUP_KEYWORDS).some((terms) => hasAnyTerm(q, terms) && hasAnyTerm(identity, terms));
    const titleSource = [
      getMapValue(item.title, lang),
      ...getAllMapValues(item.title),
    ].join(" ");
    const titleTokens = tokenizeForSearch(stripIcon(titleSource));
    const titleHit = titleTokens.some((token) => hasTerm(q, token));
    const phraseHit = q.length >= 4 && (hasTerm(identity, q) || titleTokens.some((token) => hasTerm(identity, token) && hasTerm(q, token)));

    if (groupHit || titleHit || phraseHit) matches.push(item);
  }

  return matches;
}

function isHotelQuestion(question: string, hotel: HotelPayload) {
  const q = clean(question);
  if (!q) return true;
  if (hasAnyTerm(q, HOTEL_KEYWORDS)) return true;
  if (detectCategories(q).length > 0) return true;

  const infoMatch = findMatchingHotelInfo(q, "en", hotel).length > 0;
  if (infoMatch) return true;

  const venueMatch = getActiveVenues(hotel).some((venue) => venueMatchesQuestion(venue, q, "en"));
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

function pickMealLines(question: string, hours: string, lang: Lang) {
  const parts = normalizeDisplayText(hours).split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return "";

  const mealGroupsByLang: Record<Lang, Array<{ key: string; terms: string[]; excludeLineTerms?: string[] }>> = {
    bg: [
      { key: "breakfast", terms: ["закуска"], excludeLineTerms: ["следобедна закуска"] },
      { key: "lunch", terms: ["обяд"] },
      { key: "snack", terms: ["следобедна закуска", "следобедна"] },
      { key: "dinner", terms: ["вечеря"] },
    ],
    en: [
      { key: "breakfast", terms: ["breakfast"], excludeLineTerms: ["afternoon snack"] },
      { key: "lunch", terms: ["lunch"] },
      { key: "snack", terms: ["afternoon snack", "snack"] },
      { key: "dinner", terms: ["dinner"] },
    ],
    de: [
      { key: "breakfast", terms: ["frühstück", "fruhstuck"] },
      { key: "lunch", terms: ["mittagessen", "mittag"] },
      { key: "snack", terms: ["nachmittagssnack", "snack"] },
      { key: "dinner", terms: ["abendessen"] },
    ],
    ro: [
      { key: "breakfast", terms: ["mic dejun"] },
      { key: "lunch", terms: ["prânz", "pranz"] },
      { key: "snack", terms: ["gustare de după-amiază", "gustare de dupa-amiaza", "gustare"] },
      { key: "dinner", terms: ["cină", "cina"] },
    ],
    cs: [
      { key: "breakfast", terms: ["snídaně", "snidane"] },
      { key: "lunch", terms: ["oběd", "obed"] },
      { key: "snack", terms: ["odpolední svačina", "odpoledni svacina", "svačina", "svacina"] },
      { key: "dinner", terms: ["večeře", "vecere"] },
    ],
    ru: [
      { key: "breakfast", terms: ["завтрак"] },
      { key: "lunch", terms: ["обед"] },
      { key: "snack", terms: ["полдник"] },
      { key: "dinner", terms: ["ужин"] },
    ],
  };

  const mealGroups = mealGroupsByLang[lang];
  const requestedGroups = mealGroups.filter((group) => hasAnyTerm(question, group.terms));
  if (!requestedGroups.length) return normalizeDisplayText(hours);

  const selected = parts.filter((line) =>
    requestedGroups.some((group) => {
      if (!hasAnyTerm(line, group.terms)) return false;
      if (group.excludeLineTerms?.length && hasAnyTerm(line, group.excludeLineTerms)) return false;
      return true;
    })
  );

  return selected.length ? selected.join("\n") : normalizeDisplayText(hours);
}

function formatVenueLine(venue: Venue, lang: Lang, wantsReservation: boolean, question = "") {
  const t = COPY[lang];
  const name = getVenueText(venue, "name", lang) || venue.name || "Hotel";
  const hours = getVenueHours(venue, lang);
  const localizedHours = hours ? pickMealLines(question, hours, lang) : "";

  const details = uniqueNonEmpty([
    getVenueText(venue, "shortDescription", lang),
    getVenueText(venue, "description", lang),
    getVenueText(venue, "cuisine", lang),
    getVenueText(venue, "location", lang),
    getVenueText(venue, "programText", lang),
    getVenueText(venue, "ageGroup", lang),
  ]);

  const lines = [`• ${name}`, ...details, localizedHours].filter(Boolean);

  if (wantsReservation || venue.requiresReservation) {
    lines.push(t.venueReservation(name).replace(/^•\s*/, ""));
  }

  return lines.join("\n");
}

function buildVenueCategoryAnswer(question: string, lang: Lang, hotel: HotelPayload) {
  const t = COPY[lang];
  const categories = detectCategories(question);
  if (!categories.length) return null;

  const wantsReservation = hasAnyTerm(question, ["reserv", "book", "резерв", "брониров", "забронировать", "buch", "rezerv", "rezervare", "rezervovat"]);
  const venues = getActiveVenues(hotel).filter((venue) => categories.includes(normalizeCategory(venue.category || venue.type)));
  if (!venues.length) return t.noData;

  const labels = categories
    .map((category) => t.categoryLabel[category as keyof typeof t.categoryLabel] || category)
    .join(lang === "bg" || lang === "ru" ? " и " : lang === "de" ? " und " : lang === "ro" ? " și " : lang === "cs" ? " a " : " and ");

  const lines = venues.slice(0, 8).map((venue) => formatVenueLine(venue, lang, wantsReservation, question));
  return [t.venueListIntro(labels), ...lines.slice(0, 4)].join("\n");
}

function buildSpecificVenueAnswer(question: string, lang: Lang, hotel: HotelPayload) {
  const wantsReservation = hasAnyTerm(question, ["reserv", "book", "резерв", "брониров", "забронировать", "buch", "rezerv", "rezervare", "rezervovat"]);
  const venues = findMatchingVenues(question, lang, hotel);
  if (!venues.length) return null;
  return venues.map((venue) => formatVenueLine(venue, lang, wantsReservation, question)).join("\n\n");
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

  return lines.length ? lines.join("\n\n") : null;
}



const SERVICE_SUMMARY: Record<string, Partial<Record<Lang, string>>> = {
  pillow_menu: {
    bg: "Предлагат се допълнителни възглавници за по-голям комфорт. Изборът се прави от секция Камериерки в хъба.",
    en: "Additional pillows are available for extra comfort. You can request them from the Housekeeping section in the hub.",
    de: "Zusätzliche Kissen sind für mehr Komfort verfügbar. Sie können sie im Bereich Housekeeping im Hub anfragen.",
    ro: "Sunt disponibile perne suplimentare pentru mai mult confort. Le puteți solicita din secțiunea Curățenie din hub.",
    cs: "Pro větší pohodlí jsou k dispozici další polštáře. Můžete o ně požádat v sekci Úklid pokoje v hubu.",
    ru: "Для большего комфорта доступны дополнительные подушки. Их можно заказать в разделе «Уборка номера».",
  },
  coffee_capsules: {
    bg: "Кафе капсули могат да бъдат заявени от секция Камериерки. Услугата е платена и се начислява към стаята.",
    en: "Coffee capsules can be requested from the Housekeeping section. This is a paid service and can be charged to the room.",
    de: "Kaffeekapseln können im Bereich Housekeeping angefragt werden. Dies ist eine kostenpflichtige Leistung und kann dem Zimmer belastet werden.",
    ro: "Capsulele de cafea pot fi solicitate din secțiunea Curățenie. Serviciul este contra cost și poate fi adăugat pe nota camerei.",
    cs: "Kávové kapsle lze objednat v sekci Úklid pokoje. Služba je placená a může být připsána na účet pokoje.",
    ru: "Кофейные капсулы можно заказать в разделе «Уборка номера». Это платная услуга, которая может быть начислена на счёт номера.",
  },
  late_checkout: {
    bg: "Късен check-out може да бъде заявен от рецепция и се предоставя според заетостта на хотела.",
    en: "Late check-out can be requested from reception and is subject to hotel availability.",
    de: "Late Check-out kann an der Rezeption angefragt werden und hängt von der Verfügbarkeit im Hotel ab.",
    ro: "Late check-out poate fi solicitat la recepție și depinde de disponibilitatea hotelului.",
    cs: "Pozdní check-out lze požádat na recepci a závisí na dostupnosti hotelu.",
    ru: "Поздний выезд можно запросить на рецепции; услуга предоставляется при наличии возможности.",
  },
  massage_booking: {
    bg: "Масаж или релакс терапия може да бъде заявена през хъба. Услугата е платена и се потвърждава според наличните часове.",
    en: "Massage or relaxation therapy can be requested through the hub. This is a paid service and depends on available time slots.",
    de: "Massage oder Entspannungstherapie kann über den Hub angefragt werden. Dies ist eine kostenpflichtige Leistung und abhängig von verfügbaren Zeiten.",
    ro: "Masajul sau terapia de relaxare poate fi solicitată prin hub. Serviciul este contra cost și depinde de intervalele disponibile.",
    cs: "Masáž nebo relaxační terapii lze požádat přes hub. Služba je placená a závisí na dostupných termínech.",
    ru: "Массаж или расслабляющую процедуру можно заказать через хаб. Это платная услуга, доступная при наличии свободного времени.",
  },
  minibar: {
    bg: "Зареждане на минибар може да бъде заявено от секция Камериерки. Консумацията се начислява към стаята.",
    en: "Minibar refill can be requested from the Housekeeping section. Consumed items are charged to the room.",
    de: "Eine Minibar-Auffüllung kann im Bereich Housekeeping angefragt werden. Verbrauchte Artikel werden dem Zimmer belastet.",
    ro: "Reumplerea minibarului poate fi solicitată din secțiunea Curățenie. Produsele consumate se adaugă pe nota camerei.",
    cs: "Doplnění minibaru lze požádat v sekci Úklid pokoje. Spotřebované položky jsou účtovány na pokoj.",
    ru: "Пополнение мини-бара можно заказать в разделе «Уборка номера». Использованные товары начисляются на счёт номера.",
  },
};

function compactSentences(value: string, maxChars = 360, maxSentences = 3) {
  const text = normalizeDisplayText(value)
    .replace(/\s+/g, " ")
    .replace(/\s*•\s*/g, " ")
    .trim();
  if (!text) return "";

  const sentences = text
    .split(/(?<=[.!?。])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  let result = sentences.length ? sentences.slice(0, maxSentences).join(" ") : text;
  if (result.length > maxChars) result = `${result.slice(0, maxChars).trim()}…`;
  return result;
}

function extractPriceLine(value: string, lang: Lang) {
  const text = normalizeDisplayText(value);
  const match = text.match(/(?:€\s*)?\d+(?:[,.]\d{1,2})?\s*€/);
  if (!match) return "";
  const price = match[0].trim();
  const labels: Record<Lang, string> = {
    bg: "Цена",
    en: "Price",
    de: "Preis",
    ro: "Preț",
    cs: "Cena",
    ru: "Цена",
  };
  return `${labels[lang]}: ${price}.`;
}


function structuredServicePriceLine(service: ServiceItem, lang: Lang) {
  const rawPrice = String(service.price || "").trim();
  if (!rawPrice) return "";

  const rawCurrency = String(service.currency || "").trim();
  const normalizedCurrency = rawCurrency.toUpperCase() === "EUR" ? "€" : rawCurrency;
  const localPrice = lang === "en" ? rawPrice.replace(",", ".") : rawPrice.replace(".", ",");

  const amount =
    normalizedCurrency === "€"
      ? lang === "en"
        ? `€${localPrice}`
        : `${localPrice} €`
      : [localPrice, normalizedCurrency].filter(Boolean).join(" ");

  const labels: Record<Lang, string> = {
    bg: "Цена",
    en: "Price",
    de: "Preis",
    ro: "Preț",
    cs: "Cena",
    ru: "Цена",
  };

  return `${labels[lang]}: ${amount}.`;
}

function serviceActionLine(service: ServiceItem, lang: Lang) {
  const sectionKey = SERVICE_SECTION_BY_KEY[service.key];
  const section = sectionKey ? SERVICE_SECTION_LABELS[lang][sectionKey] : "";
  if (!section) return "";

  const lines: Record<Lang, string> = {
    bg: `Можете да го заявите от секция ${section} в хъба.`,
    en: `You can request it from the ${section} section in the hub.`,
    de: `Sie können es im Bereich ${section} im Hub anfragen.`,
    ro: `Îl puteți solicita din secțiunea ${section} din hub.`,
    cs: `Můžete o něj požádat v sekci ${section} v hubu.`,
    ru: `Вы можете заказать это в разделе ${section} в хабе.`,
  };
  return lines[lang];
}

function serviceScore(service: ServiceItem, question: string) {
  const q = clean(question);
  const key = clean(service.key);
  const label = clean(stripIcon(service.label));
  let score = 0;

  if (key && hasTerm(q, key)) score += 80;
  if (key && hasTerm(q, key.replace(/_/g, " "))) score += 80;
  if (label && hasTerm(q, label)) score += 70;

  for (const token of [...(service.keywords ?? []), ...(SERVICE_KEYWORDS[service.key] ?? [])]) {
    if (hasTerm(q, token)) score += clean(token).length >= 8 ? 12 : 6;
  }

  if (service.key === "pillow_menu" && hasAnyTerm(q, ["pillow", "pillows", "възглав", "подуш", "pern", "polstar", "polštář", "kissen"])) score += 30;
  if (service.key === "extra_pillow" && hasAnyTerm(q, ["menu", "меню", "available", "какви", "какие", "доступные", "what", "welche", "disponibile", "k dispozici"])) score -= 25;
  if (service.key === "pillow_menu" && hasAnyTerm(q, ["menu", "меню", "available", "какви", "какие", "доступные", "what", "welche", "disponibile", "k dispozici"])) score += 25;

  return score;
}

function refineServiceMatches(question: string, matches: ServiceItem[]) {
  const sorted = [...matches]
    .map((service) => ({ service, score: serviceScore(service, question) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const hasPillowMenu = sorted.some((entry) => entry.service.key === "pillow_menu");
  const seen = new Set<string>();
  const result: ServiceItem[] = [];

  for (const { service } of sorted) {
    if (hasPillowMenu && service.key === "extra_pillow") continue;
    const key = service.key || stripIcon(service.label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(service);
  }

  return result;
}

function friendlyLead(lang: Lang) {
  const leads: Record<Lang, string> = {
    bg: "Разбира се, с удоволствие.",
    en: "Of course, gladly.",
    de: "Sehr gern.",
    ro: "Sigur, cu plăcere.",
    cs: "Samozřejmě, rád pomohu.",
    ru: "Конечно, с удовольствием.",
  };
  return leads[lang];
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
  const text = compactSentences(getMapValue(item.text, lang), 300, 2);

  if (title && text) return `• ${title}\n${text}`;
  if (text) return `• ${text}`;
  if (title) return `• ${title}`;
  return "";
}

function formatServiceForSmartAnswer(service: ServiceItem, lang: Lang) {
  const label = stripIcon(service.label);
  const customSummary = SERVICE_SUMMARY[service.key]?.[lang] || "";
  const description = customSummary || compactSentences(service.description || "", 300, 2);
  const price = structuredServicePriceLine(service, lang) || extractPriceLine(service.description || "", lang);
  const action = customSummary ? "" : serviceActionLine(service, lang);
  const paid = PAID_SERVICE_KEYS.has(service.key) && !price && !customSummary ? COPY[lang].paidNotice : "";

  const details = uniqueNonEmpty([description, price, paid, action]).join("\n");
  if (label && details) return `• ${label}\n${details}`;
  if (details) return `• ${details}`;
  if (label) return `• ${label}`;
  return "";
}

function findMatchingVenues(question: string, lang: Lang, hotel: HotelPayload) {
  const ranked = rankVenueMatches(question, lang, hotel);
  return selectRankedVenueMatches(ranked).map((match) => match.venue);
}

function isNearbyOutsideQuestion(question: string) {
  return NEARBY_TERMS.some((term) => phraseInVenueText(question, term));
}

function identityHasAny(item: HotelInfoItem, lang: Lang, terms: string[]) {
  return hasAnyTerm(itemIdentity(item, lang), terms);
}

function findNearbyHotelInfo(question: string, lang: Lang, hotel: HotelPayload) {
  const q = clean(question);
  if (!isNearbyOutsideQuestion(q)) return [];

  const items = getActiveHotelInfo(hotel);
  const requestedGroups = Object.entries(OUTSIDE_CATEGORY_TERMS)
    .filter(([, terms]) => hasAnyTerm(q, terms))
    .map(([group]) => group);

  const nearbyIdentityTerms = [
    ...NEARBY_TERMS,
    "nearby", "around", "атракции", "забележ", "наблизо", "около", "район",
    "restaurants nearby", "ресторанти наблизо", "рестораны рядом", "аптека", "pharmacy", "atracții", "atractii", "restaurante", "okolí", "zajímav", "restaurace",
  ];

  return items.filter((item) => {
    const identity = itemIdentity(item, lang);
    if (!identity) return false;
    const isNearbyItem = nearbyIdentityTerms.some((term) => phraseInVenueText(identity, term));
    if (!isNearbyItem) return false;

    if (!requestedGroups.length) return true;

    return requestedGroups.some((group) => {
      const terms = OUTSIDE_CATEGORY_TERMS[group] || [];
      return hasAnyTerm(identity, terms) || clean(item.key || item.id || "").includes(group);
    });
  });
}

function buildNearbyAnswer(question: string, lang: Lang, hotel: HotelPayload) {
  const matches = findNearbyHotelInfo(question, lang, hotel);
  if (!isNearbyOutsideQuestion(question)) return null;

  if (!matches.length) return COPY[lang].nearbyNoData;

  const lines = matches.slice(0, 5).map((item) => formatInfoForSmartAnswer(item, lang)).filter(Boolean);
  return lines.length ? lines.slice(0, 3).join("\n\n") : COPY[lang].nearbyNoData;
}

function buildSmartTopicAnswer(question: string, lang: Lang, hotel: HotelPayload) {
  const q = clean(question);
  if (!q) return null;

  const infoMatches = findMatchingHotelInfo(q, lang, hotel);
  const serviceMatches = findMatchingServices(q, hotel);
  const venueMatches = findMatchingVenues(q, lang, hotel);
  const wantsReservation = hasAnyTerm(q, ["reserv", "book", "резерв", "брониров", "забронировать", "buch", "rezerv", "rezervare", "rezervovat"]);

  if (!infoMatches.length && !serviceMatches.length && !venueMatches.length) return null;

  const lines: string[] = [];

  if (infoMatches.length && !serviceMatches.length && !venueMatches.length) {
    lines.push(...infoMatches.slice(0, 1).map((item) => formatInfoForSmartAnswer(item, lang)));
    const cleaned = uniqueNonEmpty(lines);
    return cleaned.length ? cleaned[0] : null;
  }

  if (serviceMatches.length && !venueMatches.length) {
    lines.push(...serviceMatches.slice(0, 1).map((service) => formatServiceForSmartAnswer(service, lang)));
    const cleaned = uniqueNonEmpty(lines);
    return cleaned.length ? cleaned[0] : null;
  }

  if (venueMatches.length) {
    lines.push(...venueMatches.map((venue) => formatVenueLine(venue, lang, wantsReservation, question)));

    const venueHasHours = venueMatches.some((venue) => Boolean(getVenueHours(venue, lang)));
    if (!venueHasHours && infoMatches.length) {
      lines.push(formatInfoForSmartAnswer(infoMatches[0], lang));
    }

    // A specific venue question returns only the ranked venue matches.
    // Category-only questions continue to the category answer, which lists
    // all active venues in that category.
    if (!serviceMatches.length) {
      const cleaned = uniqueNonEmpty(lines);
      return cleaned.length ? cleaned.slice(0, 4).join("\n\n") : null;
    }
  }

  if (infoMatches.length && !venueMatches.length) {
    lines.push(...infoMatches.slice(0, 1).map((item) => formatInfoForSmartAnswer(item, lang)));
  }

  if (serviceMatches.length) {
    lines.push(...serviceMatches.slice(0, 1).map((service) => formatServiceForSmartAnswer(service, lang)));
  }

  const cleaned = uniqueNonEmpty(lines);
  return cleaned.length ? cleaned.slice(0, 2).join("\n\n") : null;
}

function buildServiceAnswer(question: string, lang: Lang, hotel: HotelPayload) {
  const t = COPY[lang];
  const activeServices = getActiveServices(hotel);
  if (!activeServices.length) return null;

  const matches = findMatchingServices(question, hotel);
  if (matches.length) {
    return matches.slice(0, 2).map((service) => formatServiceForSmartAnswer(service, lang)).join("\n\n");
  }

  if (isGenericServiceQuestion(question)) {
    return [t.servicesIntro, ...activeServices.slice(0, 15).map((service) => `• ${stripIcon(service.label)}`), t.askReception].join("\n");
  }

  return null;
}


function compactMessage(question: string) {
  return clean(question).replace(/[!?.;:,\-–—]+/g, " ").replace(/\s+/g, " ").trim();
}

function isGreetingOnly(question: string) {
  const q = compactMessage(question);
  if (!q || q.length > 36) return false;
  return GREETING_TERMS.some((term) => q === clean(term) || q === `${clean(term)} ai` || q === `${clean(term)} concierge` || q === `${clean(term)} консиерж`);
}

function isThanksOnly(question: string) {
  const q = compactMessage(question);
  if (!q || q.length > 42) return false;
  return THANKS_TERMS.some((term) => q === clean(term) || q.startsWith(`${clean(term)} `));
}

function isWeatherQuestion(question: string) {
  return hasAnyTerm(question, WEATHER_TERMS);
}

function toNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function degreeToCompass(deg?: number, lang: Lang = "en") {
  if (deg == null || !Number.isFinite(deg)) return "";
  const labels: Record<Lang, string[]> = {
    bg: ["С", "СИ", "И", "ЮИ", "Ю", "ЮЗ", "З", "СЗ"],
    en: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
    de: ["N", "NO", "O", "SO", "S", "SW", "W", "NW"],
    ro: ["N", "NE", "E", "SE", "S", "SV", "V", "NV"],
    cs: ["S", "SV", "V", "JV", "J", "JZ", "Z", "SZ"],
    ru: ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"],
  };
  return labels[lang][Math.round(deg / 45) % 8];
}

function weatherCodeText(code: number | undefined, lang: Lang) {
  const c = code ?? -1;
  const key = c === 0
    ? "clear"
    : [1, 2].includes(c)
      ? "partly"
      : c === 3
        ? "cloudy"
        : [45, 48].includes(c)
          ? "fog"
          : [51, 53, 55, 56, 57].includes(c)
            ? "drizzle"
            : [61, 63, 65, 66, 67, 80, 81, 82].includes(c)
              ? "rain"
              : [71, 73, 75, 77, 85, 86].includes(c)
                ? "snow"
                : [95, 96, 99].includes(c)
                  ? "storm"
                  : "unknown";

  const map: Record<string, Record<Lang, string>> = {
    clear: { bg: "ясно", en: "clear", de: "klar", ro: "senin", cs: "jasno", ru: "ясно" },
    partly: { bg: "частично облачно", en: "partly cloudy", de: "teilweise bewölkt", ro: "parțial noros", cs: "polojasno", ru: "переменная облачность" },
    cloudy: { bg: "облачно", en: "cloudy", de: "bewölkt", ro: "noros", cs: "zataženo", ru: "облачно" },
    fog: { bg: "мъгла", en: "foggy", de: "neblig", ro: "ceață", cs: "mlha", ru: "туман" },
    drizzle: { bg: "слаб дъжд", en: "light rain", de: "leichter Regen", ro: "ploaie slabă", cs: "slabý déšť", ru: "небольшой дождь" },
    rain: { bg: "дъжд", en: "rain", de: "Regen", ro: "ploaie", cs: "déšť", ru: "дождь" },
    snow: { bg: "сняг", en: "snow", de: "Schnee", ro: "zăpadă", cs: "sníh", ru: "снег" },
    storm: { bg: "гръмотевична буря", en: "thunderstorm", de: "Gewitter", ro: "furtună", cs: "bouřka", ru: "гроза" },
    unknown: { bg: "променливо", en: "variable", de: "wechselhaft", ro: "variabil", cs: "proměnlivo", ru: "переменная погода" },
  };

  return map[key][lang];
}

function normalizePlace(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,!?;:()\[\]{}"'`´’“”]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isTomorrowWeatherQuestion(question: string) {
  const q = normalizePlace(question);
  return TOMORROW_TERMS.some((term) => q.includes(normalizePlace(term)));
}

function cleanExplicitWeatherPlaceCandidate(value: string) {
  let place = normalizePlace(value);

  // Remove date/time words that are often next to the city name.
  place = place
    .replace(/(^|\s)(utre|tomorrow|morgen|maine|mâine|zitra|zítra|today|dnes|днес|днеска|утре|следобед|вечерта|сутринта|завтра|сегодня|вечером|утром)(\s|$)/g, " ")
    .replace(/(^|\s)(weather|forecast|wetter|meteo|времето|прогноза|погода|прогноз|vremea|počasí|pocasi)(\s|$)/g, " ")
    .replace(/(^|\s)(today|tomorrow|утре|днес|завтра|сегодня|morgen|heute|mâine|maine|astăzi|astazi|zítra|zitra|dnes)(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Stop at common connector words, so "Offenbach tomorrow" does not become a fake long place.
  place = place
    .split(/\s+(?:tomorrow|today|morgen|heute|utre|maine|mâine|zitra|zítra|dnes|утре|днес|завтра|сегодня|будет|ли|пожалуйста|ще|please|моля)\s+/)[0]
    .trim();

  // Ignore very vague words. These are handled by isHotelAreaPlace().
  if (["the", "der", "die", "das", "на", "за", "в", "във", "для", "около", "in", "for"].includes(place)) return "";
  return place;
}

function extractExplicitWeatherPlace(question: string) {
  const q = normalizePlace(question);
  const candidates: string[] = [];

  // Do not use JS word boundaries for Bulgarian/Czech/Romanian text here.
  //  is ASCII-centric and missed cases like "в Офенбах".
  const patterns = [
    /(?:^|\s)(?:във|в|за|около|край|при)\s+([a-zа-я0-9][a-zа-я0-9\- ]{1,55})/gi,
    /(?:^|\s)(?:in|for|near|around|at)\s+([a-zа-я0-9][a-zа-я0-9\- ]{1,55})/gi,
    /(?:^|\s)(?:fuer|fur|für|bei|in|umgebung von|naehe von|nähe von)\s+([a-zа-я0-9][a-zа-я0-9\- ]{1,55})/gi,
    /(?:^|\s)(?:în|in|la|langa|lângă|pentru)\s+([a-zа-я0-9][a-zа-я0-9\- ]{1,55})/gi,
    /(?:^|\s)(?:v|ve|pro|u)\s+([a-zа-я0-9][a-zа-я0-9\- ]{1,55})/gi,
    /(?:^|\s)(?:в|во|для|около|рядом с)\s+([a-zа-я0-9][a-zа-я0-9\- ]{1,55})/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(q)) !== null) {
      const candidate = cleanExplicitWeatherPlaceCandidate(match[1] || "");
      if (candidate) candidates.push(candidate);
    }
  }

  // Prefer the last explicit place, because questions usually end with the city:
  // "Какво ще е времето утре в Офенбах?"
  return candidates.at(-1) || "";
}

function isHotelAreaPlace(place: string, hotel: HotelPayload) {
  const normalizedPlace = normalizePlace(place);
  if (!normalizedPlace) return true;

  const vagueHotelAreaTerms = [
    "hotela", "hotel", "hotelului", "hotelu", "хотела", "района на хотела", "около хотела",
    "around the hotel", "hotel area", "zona hotelului", "okolí hotelu", "umgebung des hotels", "рядом с отелем", "около отеля", "район отеля",
  ];
  if (vagueHotelAreaTerms.some((term) => normalizedPlace.includes(normalizePlace(term)))) return true;

  const location = normalizePlace(hotel.locationQuery || "");
  const hotelName = normalizePlace(hotel.hotelName || "");
  const reference = [location, hotelName].filter(Boolean).join(" ");
  if (!reference) return false;

  if (reference.includes(normalizedPlace) || normalizedPlace.includes(reference)) return true;

  const blockedGenericTokens = new Set([
    "hotel", "resort", "отель", "курорт", "bulgaria", "germany", "deutschland", "bългария", "balgaria", "блгария", "болгария"
  ]);

  const tokens = new Set(
    reference
      .split(/\s+|,/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 4 && !["hotel", "resort", "отель", "курорт", "bulgaria", "germany", "deutschland", "bългария", "balgaria", "болгария"].includes(x))
  );

  return normalizedPlace.split(/\s+/).some((token) => tokens.has(token) && !blockedGenericTokens.has(token));
}

function isWeatherForOutsideArea(question: string, hotel: HotelPayload) {
  const place = extractExplicitWeatherPlace(question);
  if (!place) return false;
  return !isHotelAreaPlace(place, hotel);
}

function buildLocationCandidates(locationQuery?: string) {
  const raw = String(locationQuery || "").trim();
  if (!raw) return [];

  const parts = raw.split(",").map((x) => x.trim()).filter(Boolean);
  const candidates: string[] = [];

  // Prefer the concrete city/resort over the full hotel name.
  // Example: "Hotel Aquamarine Kranevo, Kranevo, Bulgaria" should resolve to Kranevo, not only Bulgaria.
  if (parts.length >= 2) {
    candidates.push(parts.slice(-2).join(", "));
    candidates.push(`${parts[parts.length - 2]} ${parts[parts.length - 1]}`);
    candidates.push(parts[parts.length - 2]);
  }

  const withoutHotelWord = raw.replace(/\bhotel\b/gi, "").replace(/\s+/g, " ").trim();
  if (withoutHotelWord && withoutHotelWord !== raw) candidates.push(withoutHotelWord);

  candidates.push(raw);

  return [...new Set(candidates.filter(Boolean))];
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeHotelLocation(locationQuery?: string) {
  for (const query of buildLocationCandidates(locationQuery)) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
    const data = await fetchJsonWithTimeout(url).catch(() => null);
    const first = data?.results?.[0];
    const latitude = toNumber(first?.latitude);
    const longitude = toNumber(first?.longitude);
    if (latitude != null && longitude != null) {
      const place = [first?.name, first?.country].filter(Boolean).join(", ") || query;
      return { latitude, longitude, place };
    }
  }
  return null;
}

function weatherAdvice(lang: Lang, precipitation: number | undefined, rainChance: number | undefined, temp: number | undefined, wind: number | undefined) {
  const t = WEATHER_COPY[lang];
  if ((rainChance ?? 0) >= 45 || (precipitation ?? 0) > 0) return t.adviceRain;
  if ((wind ?? 0) >= 32) return t.adviceWind;
  if ((temp ?? 0) >= 29) return t.adviceHot;
  if (temp != null && temp <= 10) return t.adviceCold;
  return t.adviceGood;
}

async function buildWeatherAnswer(question: string, lang: Lang, hotel: HotelPayload) {
  const t = WEATHER_COPY[lang];

  if (isWeatherForOutsideArea(question, hotel)) return t.outsideArea;

  if (!hotel.locationQuery) return t.noLocation;

  const geo = await geocodeHotelLocation(hotel.locationQuery).catch(() => null);
  if (!geo) return t.noLocation;

  const wantsTomorrow = isTomorrowWeatherQuestion(question);
  const dayIndex = wantsTomorrow ? 1 : 0;

  const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,precipitation&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=Europe%2FSofia&forecast_days=3`;
  const data = await fetchJsonWithTimeout(forecastUrl).catch(() => null);
  if (!data?.current && !data?.daily) return t.unavailable;

  const current = data.current || {};
  const daily = data.daily || {};

  if (wantsTomorrow) {
    const min = toNumber(daily.temperature_2m_min?.[dayIndex]);
    const max = toNumber(daily.temperature_2m_max?.[dayIndex]);
    const rainChance = toNumber(daily.precipitation_probability_max?.[dayIndex]);
    const code = toNumber(daily.weather_code?.[dayIndex]);

    const lines = [
      t.lead(geo.place),
      `• ${t.tomorrow}: ${weatherCodeText(code, lang)}`,
      t.minMax(min, max) ? `• ${t.tomorrow}: ${t.minMax(min, max)}` : "",
      rainChance != null ? `• ${t.rainChance}: ${Math.round(rainChance)}%` : "",
      weatherAdvice(lang, undefined, rainChance, max, undefined),
    ].filter(Boolean);

    return lines.join("\n");
  }

  const temp = toNumber(current.temperature_2m);
  const apparent = toNumber(current.apparent_temperature);
  const humidity = toNumber(current.relative_humidity_2m);
  const clouds = toNumber(current.cloud_cover);
  const wind = toNumber(current.wind_speed_10m);
  const windDir = toNumber(current.wind_direction_10m);
  const precipitation = toNumber(current.precipitation);
  const rainChance = toNumber(daily.precipitation_probability_max?.[0]);
  const min = toNumber(daily.temperature_2m_min?.[0]);
  const max = toNumber(daily.temperature_2m_max?.[0]);
  const code = toNumber(current.weather_code) ?? toNumber(daily.weather_code?.[0]);

  const lines = [
    t.lead(geo.place),
    `• ${t.now}: ${weatherCodeText(code, lang)}${temp != null ? `, ${t.temperature}: ${Math.round(temp)}°C` : ""}${apparent != null ? ` (${t.feelsLike}: ${Math.round(apparent)}°C)` : ""}`,
    t.minMax(min, max) ? `• ${t.today}: ${t.minMax(min, max)}` : "",
    clouds != null ? `• ${t.clouds}: ${Math.round(clouds)}%` : "",
    humidity != null ? `• ${t.humidity}: ${Math.round(humidity)}%` : "",
    wind != null ? `• ${t.wind}: ${Math.round(wind)} km/h${degreeToCompass(windDir, lang) ? ` ${degreeToCompass(windDir, lang)}` : ""}` : "",
    rainChance != null ? `• ${t.rainChance}: ${Math.round(rainChance)}%` : "",
    weatherAdvice(lang, precipitation, rainChance, temp, wind),
  ].filter(Boolean);

  return lines.join("\n");
}

async function buildHotelAnswer(question: string, lang: Lang, hotel: HotelPayload) {
  const t = COPY[lang];
  const q = clean(question);

  if (!q) return t.intro;
  if (isGreetingOnly(q)) return CONVERSATION_COPY[lang].greeting;
  if (isThanksOnly(q)) return CONVERSATION_COPY[lang].thanks;
  if (isWeatherQuestion(q)) return await buildWeatherAnswer(question, lang, hotel);
  if (!isHotelQuestion(q, hotel)) return t.outOfScope;

  if (hasAnyTerm(q, ["wifi", "wi-fi", "wlan", "internet", "парол", "парола", "пароль", "passwort", "password", "parolă", "parola", "heslo"])) {
    return t.wifi(hotel.wifi?.ssid, hotel.wifi?.password);
  }

  const nearbyAnswer = buildNearbyAnswer(q, lang, hotel);
  if (nearbyAnswer) return nearbyAnswer;

  const smartTopicAnswer = buildSmartTopicAnswer(q, lang, hotel);
  if (smartTopicAnswer) return smartTopicAnswer;

  const hotelInfoAnswer = buildHotelInfoAnswer(q, lang, hotel);
  if (hotelInfoAnswer) return hotelInfoAnswer;

  if (hasAnyTerm(q, ["review", "reviews", "отзив", "отзиви", "отзыв", "отзывы", "рейтинг", "rating", "bewertung", "recenzie", "recenze", "booking", "tripadvisor", "google review"])) {
    return t.reviews;
  }

  if (hasAnyTerm(q, ["facebook", "instagram", "tiktok", "tik tok", "youtube", "social", "социал", "социаль", "подписаться", "follow", "urmări", "sleduj"])) {
    return t.social;
  }

  if (hasAnyTerm(q, ["reception", "rezeption", "рецепц", "рецепция", "recepție", "recepce"])) {
    const reception = hotel.departmentHours?.reception ?? {};
    return t.receptionHours(reception.open, reception.close);
  }

  if (hasAnyTerm(q, ["where", "wo", "location", "address", "къде", "где", "адрес", "местоположение", "unde", "locație", "kde", "poloha"])) {
    return t.location(hotel.locationQuery);
  }

  if (hasAnyTerm(q, ["housekeeping", "clean", "камер", "почист", "уборка", "убрать", "curăț", "uklid", "úklid"])) {
    const housekeeping = hotel.departmentHours?.housekeeping ?? {};
    return t.housekeepingHours(housekeeping.open, housekeeping.close);
  }

  if (hasAnyTerm(q, ["maintenance", "technik", "поддр", "техническая служба", "ремонт", "repair", "întreținere", "údržba"])) {
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


function buildAiServicesFromRequestDefs(requestDefs: any[] | undefined, lang: Lang): ServiceItem[] {
  return (requestDefs ?? [])
    .filter((def) => def && def.enabled !== false && def.aiVisible !== false && def.guestVisible !== false)
    .map((def) => {
      const titleMap = (def.title ?? {}) as TextMap;
      const descriptionParts = [
        getMapValue((def.description ?? {}) as TextMap, lang),
        getMapValue((def.policy ?? {}) as TextMap, lang),
        getMapValue((def.subtitle ?? {}) as TextMap, lang),
      ].filter(Boolean);

      const optionWords = Object.values(def.optionsByLang ?? {})
        .flatMap((value: any) => Array.isArray(value) ? value : [])
        .map((value: any) => String(value || "").trim())
        .filter(Boolean);

      return {
        key: String(def.id || def.requestType || "").trim(),
        label: getMapValue(titleMap, lang) || String(def.id || def.requestType || "service").replace(/_/g, " "),
        description: descriptionParts.join("\n\n"),
        active: def.enabled !== false,
        category: String(def.category || def.targetDepartment || "").trim(),
        price: String(def.price || "").trim(),
        currency: String(def.currency || "").trim(),
        keywords: [
          String(def.id || ""),
          String(def.requestType || ""),
          String(def.category || ""),
          String(def.targetDepartment || ""),
          ...(Array.isArray(def.keywords) ? def.keywords : []),
          ...Object.values(titleMap).map((value) => String(value || "")),
          ...optionWords,
        ].filter(Boolean),
      } as ServiceItem;
    })
    .filter((service) => service.key || service.label);
}

function mergeVenueRows(serverRows: Venue[] | undefined, clientRows: Venue[] | undefined): Venue[] {
  const server = Array.isArray(serverRows) ? serverRows : [];
  const client = Array.isArray(clientRows) ? clientRows : [];

  if (!server.length) return client;
  if (!client.length) return server;

  const clientByIdentity = new Map<string, Venue>();
  for (const venue of client) {
    const identity = clean(
      `${normalizeCategory(venue.category || venue.type)}:${getVenueText(venue, "name", "en") || venue.name || ""}`
    );
    if (identity) clientByIdentity.set(identity, venue);
  }

  return server.map((serverVenue) => {
    const identity = clean(
      `${normalizeCategory(serverVenue.category || serverVenue.type)}:${getVenueText(serverVenue, "name", "en") || serverVenue.name || ""}`
    );
    const clientVenue = clientByIdentity.get(identity);
    if (!clientVenue) return serverVenue;

    return {
      ...serverVenue,
      ...clientVenue,
      nameByLang: { ...(serverVenue.nameByLang || {}), ...(clientVenue.nameByLang || {}) },
      shortDescriptionByLang: { ...(serverVenue.shortDescriptionByLang || {}), ...(clientVenue.shortDescriptionByLang || {}) },
      descriptionByLang: { ...(serverVenue.descriptionByLang || {}), ...(clientVenue.descriptionByLang || {}) },
      cuisineByLang: { ...(serverVenue.cuisineByLang || {}), ...(clientVenue.cuisineByLang || {}) },
      hoursByLang: { ...(serverVenue.hoursByLang || {}), ...(clientVenue.hoursByLang || {}) },
      locationByLang: { ...(serverVenue.locationByLang || {}), ...(clientVenue.locationByLang || {}) },
      programTextByLang: { ...(serverVenue.programTextByLang || {}), ...(clientVenue.programTextByLang || {}) },
      ageGroupByLang: { ...(serverVenue.ageGroupByLang || {}), ...(clientVenue.ageGroupByLang || {}) },
    };
  });
}

function mergeHotelKnowledge(clientHotel: HotelPayload, serverConfig: any, lang: Lang): HotelPayload {
  const client = clientHotel ?? {};
  const server = serverConfig ?? {};
  const serverServices = buildAiServicesFromRequestDefs(server.requestDefs, lang);
  const serverHotelInfo = Array.isArray(server.hotelInfoItems) ? server.hotelInfoItems : [];
  const clientHotelInfo = Array.isArray(client.hotelInfoItems) ? client.hotelInfoItems : [];
  const visibleHubInfo = buildHotelInfoItemsFromHubSections(client.hubSections, lang);

  return {
    ...client,
    hotelName: server.hotelName || client.hotelName,
    locationQuery: server.location?.query || server.locationQuery || client.locationQuery,
    wifi: server.wifi ?? client.wifi,
    departmentHours: server.departmentHours ?? client.departmentHours,
    reviews: server.reviews ?? client.reviews,
    socialLinks: server.socialLinks ?? client.socialLinks,
    venueRows: mergeVenueRows(server.venueRows, client.venueRows),
    hotelInfoItems: mergeHotelInfoItems(serverHotelInfo, clientHotelInfo, visibleHubInfo),
    services: Array.isArray(client.services) && client.services.length ? client.services : serverServices,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = String(body?.question ?? body?.message ?? body?.prompt ?? body?.text ?? "").trim();
    const lang = normalizeLang(String(body?.lang ?? "en"));
    const clientHotel = (body?.hotel ?? {}) as HotelPayload;
    const hotelSlug = String(
      body?.hotelSlug ??
      (body?.hotel as any)?.hotelSlug ??
      (body?.hotel as any)?.slug ??
      ""
    ).trim();

    const serverConfig = hotelSlug
      ? await getHotelConfig(hotelSlug).catch((error) => {
          console.error("AI failed to load server hotel config", { hotelSlug, error });
          return null;
        })
      : null;

    const hotel = mergeHotelKnowledge(clientHotel, serverConfig, lang);

    return NextResponse.json({
      ok: true,
      answer: await buildHotelAnswer(question, lang, hotel),
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
