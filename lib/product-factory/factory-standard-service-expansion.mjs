const title = (bg, en, de, ro, cs, ru) => ({ bg, en, de, ro, cs, ru });

const success = (value) => ({
  bg: `Заявката „${value.bg}“ е изпратена.`,
  en: `Your “${value.en}” request has been sent.`,
  de: `Ihre Anfrage „${value.de}“ wurde gesendet.`,
  ro: `Solicitarea „${value.ro}” a fost trimisă.`,
  cs: `Požadavek „${value.cs}“ byl odeslán.`,
  ru: `Запрос «${value.ru}» отправлен.`,
});

function descriptionFor(departmentId, value) {
  if (departmentId === "housekeeping") {
    return {
      bg: `Заявете „${value.bg}“ от екипа на камериерките.`,
      en: `Request “${value.en}” from housekeeping.`,
      de: `„${value.de}“ beim Housekeeping anfragen.`,
      ro: `Solicitați „${value.ro}” de la serviciul de curățenie.`,
      cs: `Požádejte úklid o „${value.cs}“.`,
      ru: `Закажите «${value.ru}» в службе уборки номера.`,
    };
  }
  if (departmentId === "maintenance") {
    return {
      bg: `Съобщете за „${value.bg}“ на техническата поддръжка.`,
      en: `Report “${value.en}” to maintenance.`,
      de: `„${value.de}“ dem technischen Service melden.`,
      ro: `Raportați „${value.ro}” serviciului tehnic.`,
      cs: `Nahlaste „${value.cs}“ technické údržbě.`,
      ru: `Сообщите о проблеме «${value.ru}» в техническую службу.`,
    };
  }
  return {
    bg: `Изпратете заявка за „${value.bg}“ до рецепция.`,
    en: `Send a request for “${value.en}” to reception.`,
    de: `Eine Anfrage für „${value.de}“ an die Rezeption senden.`,
    ro: `Trimiteți o solicitare pentru „${value.ro}” la recepție.`,
    cs: `Odešlete požadavek „${value.cs}“ na recepci.`,
    ru: `Отправьте запрос «${value.ru}» на рецепцию.`,
  };
}

function service(id, departmentId, localizedTitle, metadata = {}) {
  return {
    id,
    departmentId,
    billable: false,
    aiVisible: true,
    starterDefault: false,
    requestKind: "standard",
    requiresNote: false,
    requiresQuantity: false,
    requiresTime: false,
    timeMode: "none",
    intentTags: [id],
    ...metadata,
    title: localizedTitle,
    description: metadata.description || descriptionFor(departmentId, localizedTitle),
    staffLabel: localizedTitle,
    success: metadata.success || success(localizedTitle),
  };
}

export const FACTORY_STANDARD_SERVICE_METADATA = Object.freeze({
  "contact-reception": {
    starterDefault: true,
    aiVisible: true,
    requiresNote: true,
    requestKind: "standard",
    intentTags: ["request_service", "reception_contact"],
  },
  "late-checkout": {
    starterDefault: true,
    aiVisible: true,
    requiresNote: false,
    requestKind: "standard",
    intentTags: ["request_service", "late_checkout"],
  },
  "extra-towel": {
    starterDefault: true,
    aiVisible: true,
    requestKind: "quantity",
    requiresQuantity: true,
    minQty: 1,
    maxQty: 6,
    intentTags: ["request_item", "linen", "room_towels"],
  },
  "extra-pillow": {
    starterDefault: true,
    aiVisible: true,
    requestKind: "quantity",
    requiresQuantity: true,
    minQty: 1,
    maxQty: 4,
    intentTags: ["request_item", "sleep_comfort", "pillow"],
  },
  "room-cleaning": {
    starterDefault: true,
    aiVisible: true,
    requestKind: "standard",
    intentTags: ["request_service", "room_cleaning"],
  },
  "technical-problem": {
    starterDefault: true,
    aiVisible: true,
    requiresNote: true,
    requestKind: "standard",
    intentTags: ["technical_problem", "maintenance"],
  },
  "restaurant-assistance": {
    starterDefault: true,
    aiVisible: true,
    requiresNote: true,
    requestKind: "standard",
    intentTags: ["restaurant", "food_beverage", "assistance"],
  },
  "spa-assistance": {
    starterDefault: true,
    aiVisible: true,
    requiresNote: true,
    requestKind: "standard",
    intentTags: ["spa", "wellness", "assistance"],
  },
});

const ADDITIONS = [
  service("toilet-paper", "housekeeping", title("Тоалетна хартия", "Toilet paper", "Toilettenpapier", "Hârtie igienică", "Toaletní papír", "Туалетная бумага"), { requestKind: "quantity", requiresQuantity: true, minQty: 1, maxQty: 6, intentTags: ["request_item", "bathroom_supply"] }),
  service("extra-blanket", "housekeeping", title("Допълнителна завивка", "Extra blanket", "Zusatzdecke", "Pătură suplimentară", "Přikrývka navíc", "Дополнительное одеяло"), { requestKind: "quantity", requiresQuantity: true, minQty: 1, maxQty: 3, intentTags: ["request_item", "sleep_comfort", "blanket"] }),
  service("bathrobe", "housekeeping", title("Халат", "Bathrobe", "Bademantel", "Halat de baie", "Župan", "Халат"), { requestKind: "quantity", requiresQuantity: true, minQty: 1, maxQty: 4, intentTags: ["request_item", "room_comfort", "bathrobe"] }),
  service("slippers", "housekeeping", title("Чехли", "Slippers", "Hausschuhe", "Papuci", "Pantofle", "Тапочки"), { requestKind: "quantity", requiresQuantity: true, minQty: 1, maxQty: 4, intentTags: ["request_item", "room_comfort", "slippers"] }),
  service("baby-cot", "housekeeping", title("Бебешко легло", "Baby cot", "Babybett", "Pătuț pentru bebeluși", "Dětská postýlka", "Детская кроватка"), { requiresNote: true, intentTags: ["request_item", "baby", "family", "baby_cot"] }),
  service("iron", "housekeeping", title("Ютия и дъска", "Iron and ironing board", "Bügeleisen und Bügelbrett", "Fier și masă de călcat", "Žehlička a žehlicí prkno", "Утюг и гладильная доска"), { intentTags: ["request_item", "ironing", "iron_board"] }),
  service("laundry", "housekeeping", title("Пране", "Laundry service", "Wäscheservice", "Serviciu de spălătorie", "Prádelna", "Прачечная"), { requiresNote: true, intentTags: ["request_service", "laundry"] }),
  service("minibar-refill", "housekeeping", title("Зареждане на минибар", "Minibar refill", "Minibar auffüllen", "Reumplere minibar", "Doplnění minibaru", "Пополнение мини-бара"), { intentTags: ["request_service", "minibar_refill"] }),
  service("other-housekeeping", "housekeeping", title("Друга заявка към камериерки", "Other housekeeping request", "Andere Housekeeping-Anfrage", "Altă solicitare pentru curățenie", "Jiný požadavek na úklid", "Другой запрос в службу уборки"), { requiresNote: true, intentTags: ["request_service", "housekeeping_other"] }),

  service("air-conditioning", "maintenance", title("Проблем с климатик или отопление", "Air conditioning or heating issue", "Problem mit Klimaanlage oder Heizung", "Problemă cu aerul condiționat sau încălzirea", "Problém s klimatizací nebo topením", "Проблема с кондиционером или отоплением"), { requiresNote: true, intentTags: ["technical_problem", "air_conditioning", "heating"] }),
  service("no-hot-water", "maintenance", title("Няма топла вода", "No hot water", "Kein warmes Wasser", "Nu este apă caldă", "Neteče teplá voda", "Нет горячей воды"), { requiresNote: true, intentTags: ["technical_problem", "hot_water"] }),
  service("tv-issue", "maintenance", title("Проблем с телевизора", "TV issue", "TV-Problem", "Problemă cu televizorul", "Problém s televizí", "Проблема с телевизором"), { requiresNote: true, intentTags: ["technical_problem", "television"] }),
  service("lighting-issue", "maintenance", title("Проблем с осветлението", "Lighting issue", "Beleuchtungsproblem", "Problemă cu iluminatul", "Problém s osvětlením", "Проблема с освещением"), { requiresNote: true, intentTags: ["technical_problem", "lighting"] }),
  service("bathroom-issue", "maintenance", title("Проблем в банята", "Bathroom issue", "Badezimmerproblem", "Problemă în baie", "Problém v koupelně", "Проблема в ванной"), { requiresNote: true, intentTags: ["technical_problem", "bathroom"] }),
  service("door-lock-issue", "maintenance", title("Проблем с врата или ключалка", "Door or lock issue", "Problem mit Tür oder Schloss", "Problemă cu ușa sau încuietoarea", "Problém se dveřmi nebo zámkem", "Проблема с дверью или замком"), { requiresNote: true, intentTags: ["technical_problem", "door", "lock"] }),
  service("wifi-issue", "maintenance", title("Проблем с Wi-Fi", "Wi-Fi issue", "WLAN-Problem", "Problemă cu Wi-Fi", "Problém s Wi-Fi", "Проблема с Wi-Fi"), { requiresNote: true, intentTags: ["technical_problem", "wifi_problem", "internet_problem"] }),
  service("power-outlet-issue", "maintenance", title("Проблем с електрически контакт", "Power outlet issue", "Steckdosenproblem", "Problemă cu priza electrică", "Problém se zásuvkou", "Проблема с розеткой"), { requiresNote: true, intentTags: ["technical_problem", "power_outlet"] }),
  service("safe-issue", "maintenance", title("Проблем със сейфа", "Safe issue", "Safe-Problem", "Problemă cu seiful", "Problém s trezorem", "Проблема с сейфом"), { requiresNote: true, intentTags: ["technical_problem", "safe"] }),
  service("balcony-door-issue", "maintenance", title("Проблем с балконската врата", "Balcony door issue", "Problem mit der Balkontür", "Problemă cu ușa balconului", "Problém s balkonovými dveřmi", "Проблема с балконной дверью"), { requiresNote: true, intentTags: ["technical_problem", "balcony_door"] }),
  service("minibar-not-cooling", "maintenance", title("Минибарът не охлажда", "Minibar not cooling", "Minibar kühlt nicht", "Minibarul nu răcește", "Minibar nechladí", "Мини-бар не охлаждает"), { requiresNote: true, intentTags: ["technical_problem", "minibar_cooling"] }),
  service("other-technical-issue", "maintenance", title("Друг технически проблем", "Other technical issue", "Anderes technisches Problem", "Altă problemă tehnică", "Jiný technický problém", "Другая техническая проблема"), { requiresNote: true, intentTags: ["technical_problem", "other"] }),
  service("coffee-machine-issue", "maintenance", title("Проблем с кафе машината", "Coffee machine issue", "Problem mit der Kaffeemaschine", "Problemă cu aparatul de cafea", "Problém s kávovarem", "Проблема с кофемашиной"), { requiresNote: true, intentTags: ["technical_problem", "coffee_machine"] }),

  service("wake-up-call", "reception", title("Събуждане", "Wake-up call", "Weckruf", "Apel de trezire", "Buzení", "Звонок-будильник"), { requestKind: "time_slot", requiresTime: true, timeMode: "slots", intentTags: ["request_service", "wake_up_call"] }),
  service("taxi", "reception", title("Такси", "Taxi", "Taxi", "Taxi", "Taxi", "Такси"), { requiresNote: true, requiresTime: true, timeMode: "free", intentTags: ["request_service", "taxi", "transport"] }),
  service("information-request", "reception", title("Информация от рецепция", "Information from reception", "Information von der Rezeption", "Informații de la recepție", "Informace z recepce", "Информация на рецепции"), { requiresNote: true, intentTags: ["request_service", "reception_information"] }),
  service("reservation-assistance", "reception", title("Помощ с резервация", "Reservation assistance", "Hilfe bei einer Reservierung", "Ajutor pentru rezervare", "Pomoc s rezervací", "Помощь с бронированием"), { requiresNote: true, intentTags: ["request_service", "reservation_help"] }),
  service("luggage-assistance", "reception", title("Помощ с багаж", "Luggage assistance", "Gepäckhilfe", "Ajutor cu bagajele", "Pomoc se zavazadly", "Помощь с багажом"), { requiresNote: true, intentTags: ["request_service", "luggage"] }),
  service("other-reception", "reception", title("Друга заявка към рецепция", "Other reception request", "Andere Anfrage an die Rezeption", "Altă solicitare la recepție", "Jiný požadavek na recepci", "Другой запрос на рецепцию"), { requiresNote: true, intentTags: ["request_service", "reception_other"] }),
  service("special-occasion", "reception", title("Специален повод", "Special occasion", "Besonderer Anlass", "Ocazie specială", "Speciální příležitost", "Особый случай"), {
    requiresNote: true,
    intentTags: ["special_occasion", "birthday", "anniversary", "surprise"],
    description: {
      bg: "Рожден ден, годишнина, изненада или друг повод.",
      en: "Birthday, anniversary, surprise or another occasion.",
      de: "Geburtstag, Jubiläum, Überraschung oder anderer Anlass.",
      ro: "Zi de naștere, aniversare, surpriză sau altă ocazie.",
      cs: "Narozeniny, výročí, překvapení nebo jiná příležitost.",
      ru: "День рождения, годовщина, сюрприз или другой повод.",
    },
  }),
];

export const FACTORY_STANDARD_SERVICE_ADDITIONS = Object.freeze(ADDITIONS);
