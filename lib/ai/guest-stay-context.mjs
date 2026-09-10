const INTENTS = Object.freeze({
  REQUESTS: "stay_context_requests",
  MASSAGE: "stay_context_massage",
  STAY_DATES: "stay_context_dates",
  SERVICE_USAGE: "stay_context_service_usage",
});

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function finiteCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function dateOnly(value) {
  const candidate = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function safeContext(value) {
  const context = value && typeof value === "object" ? value : {};
  const stay = context.stay && typeof context.stay === "object" ? context.stay : {};
  const requests = context.requests && typeof context.requests === "object" ? context.requests : {};
  const bookings = context.bookings && typeof context.bookings === "object" ? context.bookings : {};
  const usage = Array.isArray(context.observedServiceUsage) ? context.observedServiceUsage : [];

  return Object.freeze({
    scope: context.scope === "current_stay" ? "current_stay" : null,
    stay: Object.freeze({
      roomNumber: clean(stay.roomNumber) || null,
      lifecycleState: clean(stay.lifecycleState) || null,
      checkInDate: dateOnly(stay.checkInDate),
      checkOutDate: dateOnly(stay.checkOutDate),
    }),
    requests: Object.freeze({
      total: finiteCount(requests.total),
      active: finiteCount(requests.active),
      completed: finiteCount(requests.completed),
    }),
    bookings: Object.freeze({
      active: finiteCount(bookings.active),
      upcoming: finiteCount(bookings.upcoming),
    }),
    serviceUsageCount: usage.reduce((sum, item) => sum + finiteCount(item?.count), 0),
  });
}

export function detectGuestStayContextIntent(question) {
  const q = clean(question).toLowerCase();
  if (!q) return null;

  if (
    /(мо(ите|я)\s+заявк|активн(и|ата)\s+заявк|какви\s+заявки\s+имам|my\s+(active\s+)?requests?|open\s+requests?|meine\s+(offenen?\s+)?anfragen|offene\s+anfragen|cererile\s+mele|solicitările\s+mele|moje\s+(aktivní\s+)?požadavky|мои\s+(активные\s+)?заявк)/iu.test(q)
  ) return INTENTS.REQUESTS;

  if (
    /(мо(ят|я)\s+масаж|имам\s+ли\s+(запазен\s+)?масаж|my\s+massage|massage\s+booking|massage\s+appointment|meine\s+massage|massage\s*termin|masajul\s+meu|rezervare\s+masaj|moje\s+masáž|rezervace\s+masáže|мой\s+массаж|запис(ан|ь)\s+на\s+массаж)/iu.test(q)
  ) return INTENTS.MASSAGE;

  if (
    /(до\s+кога\s+(съм|е)\s+(в\s+хотела|престоят)|кога\s+ми\s+е\s+(напускането|checkout)|датата\s+ми\s+за\s+напускане|my\s+check[- ]?out\s+date|when\s+do\s+i\s+check\s*out|how\s+long\s+is\s+my\s+stay|mein\s+abreise(date|datum)|wann\s+reise\s+ich\s+ab|data\s+mea\s+de\s+check[- ]?out|când\s+plec\s+din\s+hotel|můj\s+termín\s+odjezdu|kdy\s+odjíždím|моя\s+дата\s+выезда|когда\s+я\s+выезжаю)/iu.test(q)
  ) return INTENTS.STAY_DATES;

  if (
    /(какви\s+услуги\s+съм\s+използвал|колко\s+услуги\s+съм\s+ползвал|services?\s+i('ve| have)?\s+used|what\s+services?\s+have\s+i\s+used|welche\s+services?\s+habe\s+ich\s+genutzt|welche\s+leistungen\s+habe\s+ich\s+genutzt|ce\s+servicii\s+am\s+folosit|jaké\s+služby\s+jsem\s+využil|какие\s+услуги\s+я\s+использовал)/iu.test(q)
  ) return INTENTS.SERVICE_USAGE;

  return null;
}

function formatStayDate(value, lang) {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  if (lang === "en") return `${day}.${month}.${year}`;
  return `${day}.${month}.${year}`;
}

function requestsAnswer(context, lang) {
  const total = context.requests.total;
  const active = context.requests.active;
  const completed = context.requests.completed;
  const answers = {
    bg: `За текущия Ви престой виждам ${total} заявк${total === 1 ? "а" : "и"}: ${active} активн${active === 1 ? "а" : "и"} и ${completed} завършен${completed === 1 ? "а" : "и"}.`,
    en: `For your current stay, I can see ${total} request${total === 1 ? "" : "s"}: ${active} active and ${completed} completed.`,
    de: `Für Ihren aktuellen Aufenthalt sehe ich ${total} Anfrage${total === 1 ? "" : "n"}: ${active} aktiv und ${completed} abgeschlossen.`,
    ro: `Pentru sejurul actual văd ${total} solicitări: ${active} active și ${completed} finalizate.`,
    cs: `Pro váš aktuální pobyt vidím ${total} požadavků: ${active} aktivních a ${completed} dokončených.`,
    ru: `Для текущего проживания я вижу ${total} заявок: ${active} активных и ${completed} завершённых.`,
  };
  return answers[lang] || answers.en;
}

function massageAnswer(context, lang) {
  const active = context.bookings.active;
  const upcoming = context.bookings.upcoming;
  const answers = active > 0
    ? {
        bg: `За текущия Ви престой виждам ${active} активн${active === 1 ? "а резервация" : "и резервации"} за масаж, от които ${upcoming} предстоят.`,
        en: `For your current stay, I can see ${active} active massage booking${active === 1 ? "" : "s"}, with ${upcoming} upcoming.`,
        de: `Für Ihren aktuellen Aufenthalt sehe ich ${active} aktive Massagebuchung${active === 1 ? "" : "en"}, davon ${upcoming} bevorstehend.`,
        ro: `Pentru sejurul actual văd ${active} rezervări active pentru masaj, dintre care ${upcoming} urmează.`,
        cs: `Pro váš aktuální pobyt vidím ${active} aktivních rezervací masáže, z toho ${upcoming} nadcházejících.`,
        ru: `Для текущего проживания я вижу ${active} активных записей на массаж, из них ${upcoming} предстоящих.`,
      }
    : {
        bg: "Не виждам активна резервация за масаж за текущия Ви престой.",
        en: "I do not see an active massage booking for your current stay.",
        de: "Ich sehe keine aktive Massagebuchung für Ihren aktuellen Aufenthalt.",
        ro: "Nu văd o rezervare activă pentru masaj în sejurul actual.",
        cs: "Pro váš aktuální pobyt nevidím aktivní rezervaci masáže.",
        ru: "Я не вижу активной записи на массаж для текущего проживания.",
      };
  return answers[lang] || answers.en;
}

function datesAnswer(context, lang) {
  const checkIn = formatStayDate(context.stay.checkInDate, lang);
  const checkOut = formatStayDate(context.stay.checkOutDate, lang);
  if (!checkOut) return null;
  const answers = {
    bg: checkIn
      ? `Текущият Ви престой е от ${checkIn} до ${checkOut}.`
      : `Датата за напускане на текущия Ви престой е ${checkOut}.`,
    en: checkIn
      ? `Your current stay is from ${checkIn} to ${checkOut}.`
      : `Your current stay check-out date is ${checkOut}.`,
    de: checkIn
      ? `Ihr aktueller Aufenthalt ist vom ${checkIn} bis ${checkOut}.`
      : `Das Abreisedatum Ihres aktuellen Aufenthalts ist ${checkOut}.`,
    ro: checkIn
      ? `Sejurul actual este din ${checkIn} până în ${checkOut}.`
      : `Data de check-out pentru sejurul actual este ${checkOut}.`,
    cs: checkIn
      ? `Váš aktuální pobyt je od ${checkIn} do ${checkOut}.`
      : `Datum odjezdu pro váš aktuální pobyt je ${checkOut}.`,
    ru: checkIn
      ? `Ваше текущее проживание — с ${checkIn} по ${checkOut}.`
      : `Дата выезда для текущего проживания — ${checkOut}.`,
  };
  return answers[lang] || answers.en;
}

function serviceUsageAnswer(context, lang) {
  const count = context.serviceUsageCount;
  const answers = {
    bg: count
      ? `За текущия Ви престой виждам ${count} регистрирани използвания на хотелски услуги. Това е история на реални действия, а не предположение за Ваши предпочитания.`
      : "Не виждам регистрирано използване на хотелски услуги за текущия Ви престой.",
    en: count
      ? `For your current stay, I can see ${count} recorded hotel-service uses. This is observed activity, not an inferred preference profile.`
      : "I do not see recorded hotel-service usage for your current stay.",
    de: count
      ? `Für Ihren aktuellen Aufenthalt sehe ich ${count} erfasste Nutzungen von Hotelservices. Das sind beobachtete Vorgänge, kein abgeleitetes Präferenzprofil.`
      : "Für Ihren aktuellen Aufenthalt sehe ich keine erfasste Nutzung von Hotelservices.",
    ro: count
      ? `Pentru sejurul actual văd ${count} utilizări înregistrate ale serviciilor hotelului. Sunt activități observate, nu preferințe deduse.`
      : "Nu văd utilizări înregistrate ale serviciilor hotelului pentru sejurul actual.",
    cs: count
      ? `Pro váš aktuální pobyt vidím ${count} zaznamenaných využití hotelových služeb. Jde o skutečnou aktivitu, ne odvozený profil preferencí.`
      : "Pro váš aktuální pobyt nevidím zaznamenané využití hotelových služeb.",
    ru: count
      ? `Для текущего проживания я вижу ${count} зарегистрированных использований услуг отеля. Это фактическая активность, а не предполагаемый профиль предпочтений.`
      : "Для текущего проживания я не вижу зарегистрированного использования услуг отеля.",
  };
  return answers[lang] || answers.en;
}

export function answerFromGuestStayContext({ intent, lang, stayContext } = {}) {
  if (!Object.values(INTENTS).includes(intent)) return null;
  const context = safeContext(stayContext);
  if (context.scope !== "current_stay") return null;
  const normalizedLang = ["bg", "en", "de", "ro", "cs", "ru"].includes(clean(lang).toLowerCase())
    ? clean(lang).toLowerCase()
    : "en";

  let answer = null;
  if (intent === INTENTS.REQUESTS) answer = requestsAnswer(context, normalizedLang);
  else if (intent === INTENTS.MASSAGE) answer = massageAnswer(context, normalizedLang);
  else if (intent === INTENTS.STAY_DATES) answer = datesAnswer(context, normalizedLang);
  else if (intent === INTENTS.SERVICE_USAGE) answer = serviceUsageAnswer(context, normalizedLang);

  return answer
    ? Object.freeze({
        answer,
        intent,
        guestSafeContext: context,
      })
    : null;
}

export const GUEST_STAY_CONTEXT_INTENTS = INTENTS;
