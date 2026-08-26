import { FACTORY_STANDARD_SERVICE_ADDITIONS, FACTORY_STANDARD_SERVICE_METADATA } from "./factory-standard-service-expansion.mjs";

const SUPPORTED_LANGUAGES = ["bg", "en", "de", "ro", "cs", "ru"];

function freezeLocalized(value) {
  return Object.freeze({ ...value });
}

function defaultSuccess(title) {
  return {
    bg: `Заявката „${title.bg}“ е изпратена.`, en: `Your “${title.en}” request has been sent.`,
    de: `Ihre Anfrage „${title.de}“ wurde gesendet.`, ro: `Solicitarea „${title.ro}” a fost trimisă.`,
    cs: `Požadavek „${title.cs}“ byl odeslán.`, ru: `Запрос «${title.ru}» отправлен.`,
  };
}

function freezeService(service) {
  return Object.freeze({
    ...service,
    billable: false,
    title: freezeLocalized(service.title),
    description: freezeLocalized(service.description),
    staffLabel: freezeLocalized(service.staffLabel || service.title),
    success: freezeLocalized(service.success || defaultSuccess(service.title)),
    intentTags: Object.freeze([...(service.intentTags || [service.id])]),
  });
}

function freezeVenueCapability(capability) {
  return Object.freeze({
    ...capability,
    title: freezeLocalized(capability.title),
  });
}

const BASE_CORE_SERVICES = [
  {
    id: "contact-reception",
    departmentId: "reception",
    billable: false,
    title: {
      bg: "Свържи се с рецепция",
      en: "Contact reception",
      de: "Rezeption kontaktieren",
      ro: "Contactează recepția",
      cs: "Kontaktovat recepci",
      ru: "Связаться с ресепшеном",
    },
    description: {
      bg: "Изпратете заявка или въпрос директно до рецепцията.",
      en: "Send a request or question directly to reception.",
      de: "Senden Sie eine Anfrage oder Frage direkt an die Rezeption.",
      ro: "Trimiteți o solicitare sau o întrebare direct la recepție.",
      cs: "Odešlete požadavek nebo dotaz přímo na recepci.",
      ru: "Отправьте запрос или вопрос напрямую на ресепшен.",
    },
  },
  {
    id: "late-checkout",
    departmentId: "reception",
    billable: false,
    title: {
      bg: "Късно освобождаване",
      en: "Late checkout",
      de: "Später Check-out",
      ro: "Check-out târziu",
      cs: "Pozdní check-out",
      ru: "Поздний выезд",
    },
    description: {
      bg: "Попитайте рецепцията дали е възможно по-късно освобождаване на стаята.",
      en: "Ask reception whether a later room checkout is available.",
      de: "Fragen Sie an der Rezeption nach, ob ein späterer Check-out möglich ist.",
      ro: "Întrebați recepția dacă este disponibil un check-out mai târziu.",
      cs: "Zeptejte se recepce, zda je možný pozdější check-out.",
      ru: "Уточните на ресепшене возможность более позднего выезда.",
    },
  },
  {
    id: "extra-towel",
    departmentId: "housekeeping",
    billable: false,
    title: {
      bg: "Допълнителна кърпа",
      en: "Extra towel",
      de: "Zusätzliches Handtuch",
      ro: "Prosop suplimentar",
      cs: "Ručník navíc",
      ru: "Дополнительное полотенце",
    },
    description: {
      bg: "Заявете допълнителна кърпа за Вашата стая.",
      en: "Request an additional towel for your room.",
      de: "Bestellen Sie ein zusätzliches Handtuch für Ihr Zimmer.",
      ro: "Solicitați un prosop suplimentar pentru camera dumneavoastră.",
      cs: "Požádejte o další ručník na svůj pokoj.",
      ru: "Закажите дополнительное полотенце в номер.",
    },
  },
  {
    id: "extra-pillow",
    departmentId: "housekeeping",
    billable: false,
    title: {
      bg: "Допълнителна възглавница",
      en: "Extra pillow",
      de: "Zusätzliches Kissen",
      ro: "Pernă suplimentară",
      cs: "Polštář navíc",
      ru: "Дополнительная подушка",
    },
    description: {
      bg: "Заявете допълнителна възглавница за Вашата стая.",
      en: "Request an additional pillow for your room.",
      de: "Bestellen Sie ein zusätzliches Kissen für Ihr Zimmer.",
      ro: "Solicitați o pernă suplimentară pentru camera dumneavoastră.",
      cs: "Požádejte o další polštář na svůj pokoj.",
      ru: "Закажите дополнительную подушку в номер.",
    },
  },
  {
    id: "room-cleaning",
    departmentId: "housekeeping",
    billable: false,
    title: {
      bg: "Почистване на стаята",
      en: "Room cleaning",
      de: "Zimmerreinigung",
      ro: "Curățarea camerei",
      cs: "Úklid pokoje",
      ru: "Уборка номера",
    },
    description: {
      bg: "Изпратете заявка до камериерския екип за почистване на стаята.",
      en: "Send a room-cleaning request to the housekeeping team.",
      de: "Senden Sie eine Anfrage zur Zimmerreinigung an das Housekeeping-Team.",
      ro: "Trimiteți o solicitare de curățare a camerei echipei de housekeeping.",
      cs: "Odešlete požadavek na úklid pokoje týmu housekeeping.",
      ru: "Отправьте запрос на уборку номера службе housekeeping.",
    },
  },
  {
    id: "technical-problem",
    departmentId: "maintenance",
    billable: false,
    title: {
      bg: "Технически проблем",
      en: "Technical problem",
      de: "Technisches Problem",
      ro: "Problemă tehnică",
      cs: "Technický problém",
      ru: "Техническая проблема",
    },
    description: {
      bg: "Съобщете за технически проблем в стаята или хотелската зона.",
      en: "Report a technical problem in your room or another hotel area.",
      de: "Melden Sie ein technisches Problem in Ihrem Zimmer oder einem anderen Hotelbereich.",
      ro: "Raportați o problemă tehnică din cameră sau dintr-o altă zonă a hotelului.",
      cs: "Nahlaste technický problém na pokoji nebo v jiné části hotelu.",
      ru: "Сообщите о технической проблеме в номере или другой зоне отеля.",
    },
  },
  {
    id: "restaurant-assistance",
    departmentId: "restaurant",
    billable: false,
    title: {
      bg: "Въпрос към ресторанта",
      en: "Restaurant assistance",
      de: "Restaurant kontaktieren",
      ro: "Asistență restaurant",
      cs: "Dotaz na restauraci",
      ru: "Связаться с рестораном",
    },
    description: {
      bg: "Изпратете въпрос или заявка до ресторанта.",
      en: "Send a question or request to the restaurant team.",
      de: "Senden Sie eine Frage oder Anfrage an das Restaurant-Team.",
      ro: "Trimiteți o întrebare sau o solicitare echipei restaurantului.",
      cs: "Odešlete dotaz nebo požadavek týmu restaurace.",
      ru: "Отправьте вопрос или запрос сотрудникам ресторана.",
    },
  },
  {
    id: "spa-assistance",
    departmentId: "spa",
    billable: false,
    title: {
      bg: "Въпрос към SPA",
      en: "SPA assistance",
      de: "SPA kontaktieren",
      ro: "Asistență SPA",
      cs: "Dotaz na SPA",
      ru: "Связаться со SPA",
    },
    description: {
      bg: "Изпратете въпрос или заявка до SPA и wellness екипа.",
      en: "Send a question or request to the SPA and wellness team.",
      de: "Senden Sie eine Frage oder Anfrage an das SPA- und Wellness-Team.",
      ro: "Trimiteți o întrebare sau o solicitare echipei SPA și wellness.",
      cs: "Odešlete dotaz nebo požadavek týmu SPA a wellness.",
      ru: "Отправьте вопрос или запрос команде SPA и wellness.",
    },
  },
];

const CORE_SERVICES = [
  ...BASE_CORE_SERVICES.map((service) => ({ ...service, ...(FACTORY_STANDARD_SERVICE_METADATA[service.id] || {}) })),
  ...FACTORY_STANDARD_SERVICE_ADDITIONS,
].map(freezeService);

const VENUE_CAPABILITIES = [
  ["restaurant", "Ресторант", "Restaurant", "Restaurant", "Restaurant", "Restaurace", "Ресторан"],
  ["bar", "Бар", "Bar", "Bar", "Bar", "Bar", "Бар"],
  ["lounge", "Lounge", "Lounge", "Lounge", "Lounge", "Lounge", "Лаунж"],
  ["water_park", "Воден парк", "Water park", "Wasserpark", "Parc acvatic", "Akvapark", "Аквапарк"],
  ["pool", "Басейн", "Pool", "Pool", "Piscină", "Bazén", "Бассейн"],
  ["spa", "SPA и Wellness", "SPA & Wellness", "SPA & Wellness", "SPA & Wellness", "SPA & Wellness", "SPA и Wellness"],
  ["fitness", "Фитнес", "Fitness", "Fitness", "Fitness", "Fitness", "Фитнес"],
  ["kids_club", "Детски клуб", "Kids club", "Kinderclub", "Club pentru copii", "Dětský klub", "Детский клуб"],
  ["beach", "Плаж", "Beach", "Strand", "Plajă", "Pláž", "Пляж"],
  ["entertainment", "Анимация и развлечения", "Entertainment", "Unterhaltung", "Divertisment", "Zábava", "Развлечения"],
  ["custom", "Друга зона", "Other venue", "Weiterer Bereich", "Altă zonă", "Další prostor", "Другая зона"],
].map(([id, bg, en, de, ro, cs, ru]) => freezeVenueCapability({
  id,
  multiple: true,
  title: { bg, en, de, ro, cs, ru },
}));

const SERVICE_BY_ID = new Map(CORE_SERVICES.map((service) => [service.id, service]));
const VENUE_BY_ID = new Map(VENUE_CAPABILITIES.map((capability) => [capability.id, capability]));

export function getFactoryStandardService(id) {
  return SERVICE_BY_ID.get(String(id || "").trim().toLowerCase()) || null;
}

export function getFactoryVenueCapability(id) {
  return VENUE_BY_ID.get(String(id || "").trim().toLowerCase()) || null;
}

export const FACTORY_STANDARD_LANGUAGES = Object.freeze([...SUPPORTED_LANGUAGES]);
export const FACTORY_STANDARD_CORE_SERVICES = Object.freeze([...CORE_SERVICES]);
export const FACTORY_STANDARD_VENUE_CAPABILITIES = Object.freeze([...VENUE_CAPABILITIES]);
