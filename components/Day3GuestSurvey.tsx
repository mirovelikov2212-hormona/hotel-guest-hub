"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LangKey } from "@/lib/types";
import type { TrackHubPayload } from "@/lib/trackHubEvent";

const SURVEY_VERSION = "day3-v1";
const SURVEY_STORAGE_PREFIX = "stayhub_day3_guest_survey";
const SURVEY_WINDOW_DAYS = 3;
const SURVEY_SNOOZE_MS = 2 * 60 * 60 * 1000;

type SurveyStep = "rating" | "areas" | "improvement" | "problem" | "thanks";
type ResolutionStatus = "fully_resolved" | "partially_resolved" | "not_resolved" | "not_informed" | "";

type StoredSurveyState = {
  firstConfirmedAt?: string;
  firstConfirmedDateKey?: string;
  submittedAt?: string;
  dismissedAt?: string;
  snoozedUntil?: string;
  lastSnoozedAt?: string;
  lastShownAt?: string;
  shownCount?: number;
};

type SurveyLaunchContext = {
  source: "automatic" | "guest_push" | "manual_force";
  bypassWindow: boolean;
  bypassSnooze: boolean;
};

type SurveyCopy = {
  title: string;
  intro: string;
  honestNote: string;
  progress1: string;
  progress2: string;
  progress3: string;
  q1: string;
  ratingHelp: string;
  ratingLabels: Record<number, string>;
  areaQuestion: string;
  areaHint: string;
  categories: Record<string, string>;
  q2: string;
  q2Hint: string;
  q2Placeholder: string;
  q3: string;
  q3Hint: string;
  q3Placeholder: string;
  resolutionQuestion: string;
  resolutionOptions: Record<Exclude<ResolutionStatus, "">, string>;
  resolutionNote: string;
  resolutionPlaceholder: string;
  thanksTitle: string;
  thanksText: string;
  back: string;
  next: string;
  send: string;
  notNow: string;
  skip: string;
  selectRating: string;
  selectCategory: string;
  writeImprovement: string;
  writeProblem: string;
  selectResolution: string;
  submitting: string;
  staffSignalTitle: string;
};

const CATEGORY_KEYS = [
  "room",
  "cleanliness",
  "food_restaurant",
  "pool",
  "beach",
  "staff_service",
  "noise",
  "hotel_services",
  "value_for_money",
  "other",
] as const;

const RESOLUTION_OPTIONS: Array<Exclude<ResolutionStatus, "">> = [
  "fully_resolved",
  "partially_resolved",
  "not_resolved",
  "not_informed",
];

const SURVEY_COPY: Record<string, SurveyCopy> = {
  bg: {
    title: "Кратък въпрос към Вас",
    intro: "Вече сте няколко дни при нас и имате реални впечатления от хотела.",
    honestNote: "Можете да бъдете напълно откровени — кратките и конкретни отговори ни помагат най-много.",
    progress1: "1 от 3",
    progress2: "2 от 3",
    progress3: "3 от 3",
    q1: "Как протича престоят Ви до момента?",
    ratingHelp: "Изберете оценка от 1 до 5:",
    ratingLabels: {
      1: "Има сериозни проблеми",
      2: "Има неща за подобрение",
      3: "Нормално",
      4: "Добре, но може още",
      5: "Отлично",
    },
    areaQuestion: "За коя част от хотела се отнася най-много мнението Ви?",
    areaHint: "Можете да изберете повече от един вариант.",
    categories: {
      room: "Стая",
      cleanliness: "Чистота",
      food_restaurant: "Храна и ресторант",
      pool: "Басейн",
      beach: "Плаж",
      staff_service: "Персонал и обслужване",
      noise: "Шум",
      hotel_services: "Услуги в хотела",
      value_for_money: "Цена спрямо условията",
      other: "Друго",
    },
    q2: "Като гост с вече натрупани впечатления, коя част от престоя Ви бихте ни посъветвали да подобрим?",
    q2Hint: "Можете да бъдете напълно откровени — дори едно кратко изречение е достатъчно.",
    q2Placeholder: "Напишете кратко мнение...",
    q3: "Сблъскахте ли се с някакъв проблем от пристигането си насам?",
    q3Hint: "Опишете накратко какво се случи. Ако не е имало проблем, можете да оставите полето празно или да напишете „нямаше проблем“.",
    q3Placeholder: "Вашият отговор...",
    resolutionQuestion: "Беше ли решен проблемът?",
    resolutionOptions: {
      fully_resolved: "Да, решен е напълно",
      partially_resolved: "Частично",
      not_resolved: "Не, все още не е решен",
      not_informed: "Не съм уведомявал/а екипа",
    },
    resolutionNote: "Как беше решен или какво още очаквате?",
    resolutionPlaceholder: "По желание...",
    thanksTitle: "Благодарим Ви.",
    thanksText: "Вашата обратна връзка отива директно към екипа на хотела и ни помага да реагираме навреме, докато още сте наши гости.",
    back: "Назад",
    next: "Напред",
    send: "Изпрати",
    notNow: "Не сега",
    skip: "Пропусни",
    selectRating: "Моля, изберете оценка.",
    selectCategory: "Моля, изберете поне една категория.",
    writeImprovement: "Моля, напишете кратко какво да подобрим.",
    writeProblem: "Моля, напишете кратко какъв е проблемът. Ако няма конкретен проблем, напишете „нямаше проблем“.",
    selectResolution: "Моля, посочете дали проблемът е решен.",
    submitting: "Изпращане...",
    staffSignalTitle: "Обратна връзка от гост",
  },
  en: {
    title: "A quick question for you",
    intro: "You have been with us for a few days and already have real impressions of the hotel.",
    honestNote: "Please feel free to be completely honest — short and specific answers help us the most.",
    progress1: "1 of 3",
    progress2: "2 of 3",
    progress3: "3 of 3",
    q1: "How is your stay so far?",
    ratingHelp: "Choose a rating from 1 to 5:",
    ratingLabels: {
      1: "Serious problems",
      2: "Things to improve",
      3: "Normal",
      4: "Good, but could be better",
      5: "Excellent",
    },
    areaQuestion: "Which part of the hotel does your opinion mainly relate to?",
    areaHint: "You can select more than one option.",
    categories: {
      room: "Room",
      cleanliness: "Cleanliness",
      food_restaurant: "Food & restaurant",
      pool: "Pool",
      beach: "Beach",
      staff_service: "Staff & service",
      noise: "Noise",
      hotel_services: "Hotel services",
      value_for_money: "Value for money",
      other: "Other",
    },
    q2: "As a guest with impressions already gathered, which part of your stay would you advise us to improve?",
    q2Hint: "Please feel free to be completely honest — even one short sentence is enough.",
    q2Placeholder: "Write a short comment...",
    q3: "Have you encountered any problem since your arrival?",
    q3Hint: "Briefly describe what happened. If there was no problem, you can leave this empty or write “no problem”.",
    q3Placeholder: "Your answer...",
    resolutionQuestion: "Was the problem resolved?",
    resolutionOptions: {
      fully_resolved: "Yes, fully resolved",
      partially_resolved: "Partially",
      not_resolved: "No, not resolved yet",
      not_informed: "I did not inform the team",
    },
    resolutionNote: "How was it resolved or what are you still expecting?",
    resolutionPlaceholder: "Optional...",
    thanksTitle: "Thank you.",
    thanksText: "Your feedback goes directly to the hotel team and helps us react in time while you are still our guest.",
    back: "Back",
    next: "Next",
    send: "Send",
    notNow: "Not now",
    skip: "Skip",
    selectRating: "Please choose a rating.",
    selectCategory: "Please select at least one category.",
    writeImprovement: "Please write briefly what we should improve.",
    writeProblem: "Please briefly describe the problem. If there was no specific problem, write “no problem”.",
    selectResolution: "Please indicate whether the problem was resolved.",
    submitting: "Sending...",
    staffSignalTitle: "Guest feedback",
  },
  de: {
    title: "Eine kurze Frage an Sie",
    intro: "Sie sind bereits seit einigen Tagen bei uns und haben echte Eindrücke vom Hotel gesammelt.",
    honestNote: "Sie können ganz offen sein — kurze und konkrete Antworten helfen uns am meisten.",
    progress1: "1 von 3",
    progress2: "2 von 3",
    progress3: "3 von 3",
    q1: "Wie ist Ihr Aufenthalt bisher?",
    ratingHelp: "Wählen Sie eine Bewertung von 1 bis 5:",
    ratingLabels: {
      1: "Es gibt ernsthafte Probleme",
      2: "Es gibt Verbesserungsbedarf",
      3: "Normal",
      4: "Gut, aber es geht noch besser",
      5: "Ausgezeichnet",
    },
    areaQuestion: "Auf welchen Bereich des Hotels bezieht sich Ihre Meinung am meisten?",
    areaHint: "Sie können mehr als eine Option auswählen.",
    categories: {
      room: "Zimmer",
      cleanliness: "Sauberkeit",
      food_restaurant: "Essen & Restaurant",
      pool: "Pool",
      beach: "Strand",
      staff_service: "Personal & Service",
      noise: "Lärm",
      hotel_services: "Hotelleistungen",
      value_for_money: "Preis-Leistungs-Verhältnis",
      other: "Sonstiges",
    },
    q2: "Als Gast mit bereits gesammelten Eindrücken: Welchen Teil Ihres Aufenthalts würden Sie uns empfehlen zu verbessern?",
    q2Hint: "Sie können ganz offen sein — auch ein kurzer Satz reicht aus.",
    q2Placeholder: "Schreiben Sie einen kurzen Kommentar...",
    q3: "Gab es seit Ihrer Anreise ein Problem?",
    q3Hint: "Beschreiben Sie kurz, was passiert ist. Wenn es kein Problem gab, können Sie das Feld leer lassen oder „kein Problem“ schreiben.",
    q3Placeholder: "Ihre Antwort...",
    resolutionQuestion: "Wurde das Problem gelöst?",
    resolutionOptions: {
      fully_resolved: "Ja, vollständig gelöst",
      partially_resolved: "Teilweise",
      not_resolved: "Nein, noch nicht gelöst",
      not_informed: "Ich habe das Team nicht informiert",
    },
    resolutionNote: "Wie wurde es gelöst oder was erwarten Sie noch?",
    resolutionPlaceholder: "Optional...",
    thanksTitle: "Vielen Dank.",
    thanksText: "Ihr Feedback geht direkt an das Hotelteam und hilft uns, rechtzeitig zu reagieren, solange Sie noch unser Gast sind.",
    back: "Zurück",
    next: "Weiter",
    send: "Senden",
    notNow: "Nicht jetzt",
    skip: "Überspringen",
    selectRating: "Bitte wählen Sie eine Bewertung.",
    selectCategory: "Bitte wählen Sie mindestens eine Kategorie aus.",
    writeImprovement: "Bitte schreiben Sie kurz, was wir verbessern sollten.",
    writeProblem: "Bitte beschreiben Sie kurz das Problem. Wenn es kein konkretes Problem gab, schreiben Sie „kein Problem“.",
    selectResolution: "Bitte geben Sie an, ob das Problem gelöst wurde.",
    submitting: "Wird gesendet...",
    staffSignalTitle: "Gästefeedback",
  },
  ro: {
    title: "O întrebare rapidă pentru dumneavoastră",
    intro: "Sunteți deja de câteva zile la noi și aveți impresii reale despre hotel.",
    honestNote: "Puteți fi complet sincer — răspunsurile scurte și concrete ne ajută cel mai mult.",
    progress1: "1 din 3",
    progress2: "2 din 3",
    progress3: "3 din 3",
    q1: "Cum decurge sejurul dumneavoastră până acum?",
    ratingHelp: "Alegeți o notă de la 1 la 5:",
    ratingLabels: {
      1: "Există probleme serioase",
      2: "Sunt lucruri de îmbunătățit",
      3: "Normal",
      4: "Bine, dar se poate mai bine",
      5: "Excelent",
    },
    areaQuestion: "La ce parte a hotelului se referă cel mai mult opinia dumneavoastră?",
    areaHint: "Puteți selecta mai multe opțiuni.",
    categories: {
      room: "Cameră",
      cleanliness: "Curățenie",
      food_restaurant: "Mâncare și restaurant",
      pool: "Piscină",
      beach: "Plajă",
      staff_service: "Personal și servicii",
      noise: "Zgomot",
      hotel_services: "Servicii hoteliere",
      value_for_money: "Raport calitate-preț",
      other: "Altceva",
    },
    q2: "Ca oaspete care a acumulat deja impresii, ce parte a sejurului ne-ați sfătui să îmbunătățim?",
    q2Hint: "Puteți fi complet sincer — chiar și o propoziție scurtă este suficientă.",
    q2Placeholder: "Scrieți o opinie scurtă...",
    q3: "Ați întâmpinat vreo problemă de la sosire până acum?",
    q3Hint: "Descrieți pe scurt ce s-a întâmplat. Dacă nu a fost nicio problemă, puteți lăsa câmpul gol sau scrie „nicio problemă”.",
    q3Placeholder: "Răspunsul dumneavoastră...",
    resolutionQuestion: "Problema a fost rezolvată?",
    resolutionOptions: {
      fully_resolved: "Da, a fost rezolvată complet",
      partially_resolved: "Parțial",
      not_resolved: "Nu, încă nu a fost rezolvată",
      not_informed: "Nu am informat echipa",
    },
    resolutionNote: "Cum a fost rezolvată sau ce mai așteptați?",
    resolutionPlaceholder: "Opțional...",
    thanksTitle: "Vă mulțumim.",
    thanksText: "Feedbackul dumneavoastră ajunge direct la echipa hotelului și ne ajută să reacționăm la timp, cât timp sunteți încă oaspetele nostru.",
    back: "Înapoi",
    next: "Înainte",
    send: "Trimite",
    notNow: "Nu acum",
    skip: "Omite",
    selectRating: "Vă rugăm să alegeți o notă.",
    selectCategory: "Vă rugăm să selectați cel puțin o categorie.",
    writeImprovement: "Vă rugăm să scrieți pe scurt ce ar trebui să îmbunătățim.",
    writeProblem: "Vă rugăm să descrieți pe scurt problema. Dacă nu a existat o problemă concretă, scrieți „nicio problemă”.",
    selectResolution: "Vă rugăm să indicați dacă problema a fost rezolvată.",
    submitting: "Se trimite...",
    staffSignalTitle: "Feedback de la oaspete",
  },
  cs: {
    title: "Krátká otázka pro vás",
    intro: "Jste u nás už několik dní a máte skutečné dojmy z hotelu.",
    honestNote: "Můžete být zcela upřímní — krátké a konkrétní odpovědi nám pomáhají nejvíce.",
    progress1: "1 ze 3",
    progress2: "2 ze 3",
    progress3: "3 ze 3",
    q1: "Jak zatím probíhá váš pobyt?",
    ratingHelp: "Vyberte hodnocení od 1 do 5:",
    ratingLabels: {
      1: "Jsou zde vážné problémy",
      2: "Jsou věci ke zlepšení",
      3: "Normální",
      4: "Dobré, ale mohlo by být lepší",
      5: "Výborné",
    },
    areaQuestion: "Ke které části hotelu se váš názor nejvíce vztahuje?",
    areaHint: "Můžete vybrat více možností.",
    categories: {
      room: "Pokoj",
      cleanliness: "Čistota",
      food_restaurant: "Jídlo a restaurace",
      pool: "Bazén",
      beach: "Pláž",
      staff_service: "Personál a služby",
      noise: "Hluk",
      hotel_services: "Hotelové služby",
      value_for_money: "Poměr ceny a kvality",
      other: "Jiné",
    },
    q2: "Jako host, který už nasbíral dojmy, kterou část pobytu byste nám doporučili zlepšit?",
    q2Hint: "Můžete být zcela upřímní — stačí i jedna krátká věta.",
    q2Placeholder: "Napište krátký komentář...",
    q3: "Setkali jste se od příjezdu s nějakým problémem?",
    q3Hint: "Stručně popište, co se stalo. Pokud žádný problém nebyl, můžete pole nechat prázdné nebo napsat „žádný problém“.",
    q3Placeholder: "Vaše odpověď...",
    resolutionQuestion: "Byl problém vyřešen?",
    resolutionOptions: {
      fully_resolved: "Ano, zcela vyřešen",
      partially_resolved: "Částečně",
      not_resolved: "Ne, zatím není vyřešen",
      not_informed: "Tým jsem neinformoval/a",
    },
    resolutionNote: "Jak byl vyřešen nebo co ještě očekáváte?",
    resolutionPlaceholder: "Volitelné...",
    thanksTitle: "Děkujeme.",
    thanksText: "Vaše zpětná vazba jde přímo hotelovému týmu a pomáhá nám reagovat včas, dokud jste stále naším hostem.",
    back: "Zpět",
    next: "Další",
    send: "Odeslat",
    notNow: "Teď ne",
    skip: "Přeskočit",
    selectRating: "Vyberte prosím hodnocení.",
    selectCategory: "Vyberte prosím alespoň jednu kategorii.",
    writeImprovement: "Napište prosím krátce, co bychom měli zlepšit.",
    writeProblem: "Stručně prosím popište problém. Pokud žádný konkrétní problém nebyl, napište „žádný problém“.",
    selectResolution: "Uveďte prosím, zda byl problém vyřešen.",
    submitting: "Odesílání...",
    staffSignalTitle: "Zpětná vazba hosta",
  },
  ru: {
    title: "Короткий вопрос к вам",
    intro: "Вы уже несколько дней у нас и успели получить реальные впечатления об отеле.",
    honestNote: "Вы можете быть полностью откровенны — короткие и конкретные ответы помогают нам больше всего.",
    progress1: "1 из 3",
    progress2: "2 из 3",
    progress3: "3 из 3",
    q1: "Как проходит ваш отдых на данный момент?",
    ratingHelp: "Выберите оценку от 1 до 5:",
    ratingLabels: {
      1: "Есть серьёзные проблемы",
      2: "Есть что улучшить",
      3: "Нормально",
      4: "Хорошо, но можно лучше",
      5: "Отлично",
    },
    areaQuestion: "К какой части отеля больше всего относится ваше мнение?",
    areaHint: "Можно выбрать несколько вариантов.",
    categories: {
      room: "Номер",
      cleanliness: "Чистота",
      food_restaurant: "Еда и ресторан",
      pool: "Бассейн",
      beach: "Пляж",
      staff_service: "Персонал и обслуживание",
      noise: "Шум",
      hotel_services: "Услуги отеля",
      value_for_money: "Цена и условия",
      other: "Другое",
    },
    q2: "Как гость, который уже получил впечатления, какую часть отдыха вы бы посоветовали нам улучшить?",
    q2Hint: "Вы можете быть полностью откровенны — достаточно даже одного короткого предложения.",
    q2Placeholder: "Напишите короткий комментарий...",
    q3: "Столкнулись ли вы с какой-либо проблемой с момента приезда?",
    q3Hint: "Кратко опишите, что произошло. Если проблем не было, можно оставить поле пустым или написать «проблем не было».",
    q3Placeholder: "Ваш ответ...",
    resolutionQuestion: "Была ли проблема решена?",
    resolutionOptions: {
      fully_resolved: "Да, полностью решена",
      partially_resolved: "Частично",
      not_resolved: "Нет, ещё не решена",
      not_informed: "Я не сообщал(а) команде",
    },
    resolutionNote: "Как она была решена или чего вы ещё ожидаете?",
    resolutionPlaceholder: "По желанию...",
    thanksTitle: "Спасибо.",
    thanksText: "Ваш отзыв передаётся напрямую команде отеля и помогает нам реагировать вовремя, пока вы ещё являетесь нашим гостем.",
    back: "Назад",
    next: "Далее",
    send: "Отправить",
    notNow: "Не сейчас",
    skip: "Пропустить",
    selectRating: "Пожалуйста, выберите оценку.",
    selectCategory: "Пожалуйста, выберите хотя бы одну категорию.",
    writeImprovement: "Пожалуйста, кратко напишите, что нам следует улучшить.",
    writeProblem: "Пожалуйста, кратко опишите проблему. Если конкретной проблемы не было, напишите «проблем не было».",
    selectResolution: "Пожалуйста, укажите, была ли проблема решена.",
    submitting: "Отправка...",
    staffSignalTitle: "Отзыв гостя",
  },
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function normalizeLang(value: LangKey | string): keyof typeof SURVEY_COPY {
  const key = String(value || "").trim().toLowerCase();
  return key in SURVEY_COPY ? key : "en";
}

function normalizeRoomNumber(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function getSurveyStorageKey(hotelSlug: string, room: string) {
  const hotel = String(hotelSlug || "default").trim().toLowerCase() || "default";
  const safeRoom = normalizeRoomNumber(room) || "unknown";
  return `${SURVEY_STORAGE_PREFIX}:${SURVEY_VERSION}:${hotel}:${safeRoom}`;
}

function readStoredSurveyState(key: string): StoredSurveyState {
  if (typeof window === "undefined" || !key) return {};

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredSurveyState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredSurveyState(key: string, state: StoredSurveyState) {
  if (typeof window === "undefined" || !key) return;

  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.error("writeStoredSurveyState failed", error);
  }
}

function getHotelTimeParts(timezone: string) {
  const safeTimezone = String(timezone || "Europe/Sofia").trim() || "Europe/Sofia";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(map.hour === "24" ? "0" : map.hour || "0");
  const minute = Number(map.minute || "0");

  return {
    dateKey: `${map.year}-${map.month}-${map.day}`,
    minutes: hour * 60 + minute,
  };
}

function addDaysToDateKey(dateKey: string, days: number) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

function getSurveyLaunchContext(): SurveyLaunchContext {
  if (typeof window === "undefined") {
    return { source: "automatic", bypassWindow: false, bypassSnooze: false };
  }

  const params = new URLSearchParams(window.location.search);
  const surveyValue = String(params.get("survey") || "").trim().toLowerCase();
  const sourceValue = String(params.get("source") || "").trim().toLowerCase();
  const isGuestPush = sourceValue === "guest_survey_push" && ["1", "true", "yes"].includes(surveyValue);
  const isManualForce = ["force", "test"].includes(surveyValue) || (
    ["1", "true", "yes"].includes(surveyValue) && !isGuestPush
  );

  if (isGuestPush) {
    return { source: "guest_push", bypassWindow: false, bypassSnooze: true };
  }

  if (isManualForce) {
    return { source: "manual_force", bypassWindow: true, bypassSnooze: true };
  }

  return { source: "automatic", bypassWindow: false, bypassSnooze: false };
}

function isDateKeyWithinWindow(dateKey: string, startDateKey: string, endDateKey: string) {
  if (!dateKey || !startDateKey || !endDateKey) return false;
  return dateKey >= startDateKey && dateKey <= endDateKey;
}

function buildStaffNoteBg(input: {
  room: string;
  rating: number | null;
  selectedCategories: string[];
  improvementText: string;
  problemText: string;
  resolutionStatus: ResolutionStatus;
  resolutionNote: string;
}) {
  const bg = SURVEY_COPY.bg;
  const categoryLabels = input.selectedCategories
    .map((key) => bg.categories[key] || key)
    .join(", ");
  const resolutionLabel = input.resolutionStatus
    ? bg.resolutionOptions[input.resolutionStatus as Exclude<ResolutionStatus, "">]
    : "Няма избран статус";

  return [
    "Анкета Ден 3 / обратна връзка от гост",
    `Стая: ${input.room}`,
    `Оценка: ${input.rating ?? "—"}/5`,
    categoryLabels ? `Категории: ${categoryLabels}` : "Категории: —",
    input.improvementText.trim() ? `Съвет за подобрение: ${input.improvementText.trim()}` : "Съвет за подобрение: —",
    input.problemText.trim() ? `Проблем: ${input.problemText.trim()}` : "Проблем: —",
    `Решен ли е проблемът: ${resolutionLabel}`,
    input.resolutionNote.trim() ? `Допълнение: ${input.resolutionNote.trim()}` : "Допълнение: —",
  ].join("\n");
}

function shouldCreateReceptionSignal(input: {
  rating: number | null;
  problemText: string;
  resolutionStatus: ResolutionStatus;
}) {
  const problemText = input.problemText.trim();
  if (!problemText) return false;
  if (input.resolutionStatus === "partially_resolved") return true;
  if (input.resolutionStatus === "not_resolved") return true;
  if (input.resolutionStatus === "not_informed") return true;
  return Number(input.rating || 0) <= 2;
}


function getSubmitErrorText(lang: LangKey | string) {
  const key = String(lang || "").trim().toLowerCase();
  if (key === "bg") return "Анкетата не беше изпратена. Моля, опитайте отново.";
  if (key === "de") return "Die Umfrage wurde nicht gesendet. Bitte versuchen Sie es erneut.";
  if (key === "ro") return "Chestionarul nu a fost trimis. Vă rugăm să încercați din nou.";
  if (key === "cs") return "Dotazník nebyl odeslán. Zkuste to prosím znovu.";
  if (key === "ru") return "Анкета не была отправлена. Пожалуйста, попробуйте ещё раз.";
  return "The survey was not sent. Please try again.";
}

export default function Day3GuestSurvey({
  hotelSlug,
  room,
  roomConfirmed,
  lang,
  timezone,
  onTrack,
}: {
  hotelSlug: string;
  room: string;
  roomConfirmed: boolean;
  lang: LangKey;
  timezone: string;
  onTrack: (payload: TrackHubPayload) => void;
}) {
  const copy = SURVEY_COPY[normalizeLang(lang)] || SURVEY_COPY.en;
  const storageKey = useMemo(() => getSurveyStorageKey(hotelSlug, room), [hotelSlug, room]);
  const [storedState, setStoredState] = useState<StoredSurveyState>({});
  const [clockTick, setClockTick] = useState(0);
  const [launchContext, setLaunchContext] = useState<SurveyLaunchContext>({
    source: "automatic",
    bypassWindow: false,
    bypassSnooze: false,
  });
  const [step, setStep] = useState<SurveyStep>("rating");
  const [rating, setRating] = useState<number | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [improvementText, setImprovementText] = useState("");
  const [problemText, setProblemText] = useState("");
  const [resolutionStatus, setResolutionStatus] = useState<ResolutionStatus>("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const shownTrackedRef = useRef<string>("");

  useEffect(() => {
    setLaunchContext(getSurveyLaunchContext());
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!roomConfirmed || !normalizeRoomNumber(room) || !storageKey) {
      setStoredState({});
      return;
    }

    const existing = readStoredSurveyState(storageKey);
    const { dismissedAt: _legacyDismissedAt, ...migratedExisting } = existing;

    if (existing.firstConfirmedDateKey) {
      if (existing.dismissedAt) {
        writeStoredSurveyState(storageKey, migratedExisting);
      }
      setStoredState(migratedExisting);
      return;
    }

    const hotelNow = getHotelTimeParts(timezone);
    const next = {
      ...migratedExisting,
      firstConfirmedAt: existing.firstConfirmedAt || new Date().toISOString(),
      firstConfirmedDateKey: hotelNow.dateKey,
    };
    writeStoredSurveyState(storageKey, next);
    setStoredState(next);
  }, [room, roomConfirmed, storageKey, timezone]);

  const targetDateKey = useMemo(
    () => addDaysToDateKey(storedState.firstConfirmedDateKey || "", 2),
    [storedState.firstConfirmedDateKey]
  );

  const surveyWindowEndDateKey = useMemo(
    () => addDaysToDateKey(targetDateKey, SURVEY_WINDOW_DAYS - 1),
    [targetDateKey]
  );

  const isEligible = useMemo(() => {
    if (!roomConfirmed || !normalizeRoomNumber(room) || !storedState.firstConfirmedDateKey) return false;
    if (storedState.submittedAt) return false;

    const hotelNow = getHotelTimeParts(timezone);
    const insideWindow = isDateKeyWithinWindow(
      hotelNow.dateKey,
      targetDateKey,
      surveyWindowEndDateKey
    );

    if (!insideWindow && !launchContext.bypassWindow) return false;

    const snoozedUntilMs = Date.parse(String(storedState.snoozedUntil || ""));
    const isSnoozed = Number.isFinite(snoozedUntilMs) && snoozedUntilMs > Date.now();

    return launchContext.bypassSnooze || !isSnoozed;
  }, [
    clockTick,
    launchContext,
    room,
    roomConfirmed,
    storedState.firstConfirmedDateKey,
    storedState.snoozedUntil,
    storedState.submittedAt,
    surveyWindowEndDateKey,
    targetDateKey,
    timezone,
  ]);

  useEffect(() => {
    if (!isEligible || !storageKey) {
      shownTrackedRef.current = "";
      return;
    }

    const visibilityMarker = `${storageKey}:${targetDateKey}:${storedState.snoozedUntil || "initial"}:${launchContext.source}`;
    if (shownTrackedRef.current === visibilityMarker) return;
    shownTrackedRef.current = visibilityMarker;

    const previous = readStoredSurveyState(storageKey);
    const previousShownCount = Math.max(
      Number(previous.shownCount || 0),
      previous.lastShownAt ? 1 : 0
    );
    const shownCount = previousShownCount + 1;
    const next = {
      ...previous,
      dismissedAt: undefined,
      lastShownAt: new Date().toISOString(),
      shownCount,
    };
    writeStoredSurveyState(storageKey, next);
    setStoredState(next);

    const eventName = shownCount > 1 ? "day3_survey_reopened" : "day3_survey_shown";
    const showReason = launchContext.source === "guest_push"
      ? "push"
      : shownCount > 1
        ? "reopened"
        : "automatic";

    onTrack({
      eventName,
      eventCategory: "survey",
      section: "day3_survey",
      sectionKey: "day3_survey",
      label: SURVEY_VERSION,
      value: targetDateKey,
      metadata: {
        surveyVersion: SURVEY_VERSION,
        firstConfirmedDateKey: storedState.firstConfirmedDateKey || null,
        targetDateKey,
        surveyWindowEndDateKey,
        launchSource: launchContext.source,
        forceSurvey: launchContext.bypassWindow || launchContext.source === "guest_push",
        showReason,
        shownCount,
      },
    });
  }, [
    isEligible,
    launchContext.source,
    onTrack,
    storageKey,
    storedState.firstConfirmedDateKey,
    storedState.snoozedUntil,
    surveyWindowEndDateKey,
    targetDateKey,
  ]);

  const resetSurveyUi = useCallback(() => {
    setStep("rating");
    setRating(null);
    setSelectedCategories([]);
    setImprovementText("");
    setProblemText("");
    setResolutionStatus("");
    setResolutionNote("");
    setSubmitError("");
    setSubmitting(false);
  }, []);

  const dismissSurvey = useCallback(() => {
    const snoozedAt = new Date();
    const snoozedUntil = new Date(snoozedAt.getTime() + SURVEY_SNOOZE_MS).toISOString();
    const previous = readStoredSurveyState(storageKey);
    const next = {
      ...previous,
      dismissedAt: undefined,
      lastSnoozedAt: snoozedAt.toISOString(),
      snoozedUntil,
    };
    writeStoredSurveyState(storageKey, next);
    setStoredState(next);

    onTrack({
      eventName: "day3_survey_snoozed",
      eventCategory: "survey",
      section: "day3_survey",
      sectionKey: "day3_survey",
      label: SURVEY_VERSION,
      metadata: {
        surveyVersion: SURVEY_VERSION,
        step,
        targetDateKey,
        surveyWindowEndDateKey,
        snoozedUntil,
        snoozeMinutes: SURVEY_SNOOZE_MS / 60_000,
      },
    });
  }, [onTrack, step, storageKey, surveyWindowEndDateKey, targetDateKey]);

  const toggleCategory = useCallback((category: string) => {
    setSubmitError("");
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category]
    );
  }, []);

  const handleRatingSelect = useCallback((value: number) => {
    setSubmitError("");
    setRating(value);
    onTrack({
      eventName: "day3_survey_rating_selected",
      eventCategory: "survey",
      section: "day3_survey",
      sectionKey: "day3_survey",
      label: "rating",
      value: String(value),
      metadata: { surveyVersion: SURVEY_VERSION, rating: value },
    });
    setStep(value >= 1 && value <= 4 ? "areas" : "improvement");
  }, [onTrack]);

  const requireSurveyDetails = useCallback(() => {
    if (rating === null) {
      setSubmitError(copy.selectRating);
      return false;
    }

    if (rating <= 4 && selectedCategories.length === 0) {
      setSubmitError(copy.selectCategory);
      setStep("areas");
      return false;
    }

    if (rating <= 4 && !improvementText.trim()) {
      setSubmitError(copy.writeImprovement);
      setStep("improvement");
      return false;
    }

    if (rating <= 3 && !problemText.trim()) {
      setSubmitError(copy.writeProblem);
      setStep("problem");
      return false;
    }

    if (rating <= 3 && !resolutionStatus) {
      setSubmitError(copy.selectResolution);
      setStep("problem");
      return false;
    }

    setSubmitError("");
    return true;
  }, [
    copy.selectCategory,
    copy.selectRating,
    copy.selectResolution,
    copy.writeImprovement,
    copy.writeProblem,
    improvementText,
    problemText,
    rating,
    resolutionStatus,
    selectedCategories.length,
  ]);

  const goToImprovementStep = useCallback(() => {
    if (rating !== null && rating <= 4 && selectedCategories.length === 0) {
      setSubmitError(copy.selectCategory);
      return;
    }

    setSubmitError("");
    setStep("improvement");
  }, [copy.selectCategory, rating, selectedCategories.length]);

  const goToProblemStep = useCallback(() => {
    if (rating !== null && rating <= 4 && !improvementText.trim()) {
      setSubmitError(copy.writeImprovement);
      return;
    }

    setSubmitError("");
    setStep("problem");
  }, [copy.writeImprovement, improvementText, rating]);

  const submitSurvey = useCallback(async () => {
    if (submitting) return;

    if (!requireSurveyDetails()) return;

    setSubmitting(true);
    setSubmitError("");

    const payload = {
      surveyVersion: SURVEY_VERSION,
      rating,
      selectedCategories,
      improvementText: improvementText.trim(),
      problemText: problemText.trim(),
      resolutionStatus: resolutionStatus || null,
      resolutionNote: resolutionNote.trim(),
      targetDateKey,
      firstConfirmedDateKey: storedState.firstConfirmedDateKey || null,
      surveyWindowEndDateKey,
      launchSource: launchContext.source,
      shownCount: Number(storedState.shownCount || 0),
      hotelTimezone: timezone,
    };

    try {
      const response = await fetch("/api/guest/day3-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelSlug,
          room,
          language: String(lang),
          ...payload,
        }),
      });

      const result = (await response.json().catch(() => null)) as { ok?: boolean; survey?: { id?: string }; error?: string } | null;

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || `Failed to save survey: ${response.status}`);
      }

      onTrack({
        eventName: "day3_survey_submitted",
        eventCategory: "survey",
        section: "day3_survey",
        sectionKey: "day3_survey",
        label: SURVEY_VERSION,
        value: String(rating),
        requestId: result.survey?.id ? `survey-${result.survey.id}` : undefined,
        metadata: {
          ...payload,
          surveyId: result.survey?.id || null,
        },
      });

      const next = {
        ...readStoredSurveyState(storageKey),
        submittedAt: new Date().toISOString(),
        snoozedUntil: undefined,
        dismissedAt: undefined,
      };
      writeStoredSurveyState(storageKey, next);
      setStoredState(next);
      resetSurveyUi();
    } catch (error) {
      console.error("day3 survey submit failed", error);
      setSubmitError(getSubmitErrorText(lang));
      setSubmitting(false);
    }
  }, [
    copy.selectRating,
    hotelSlug,
    improvementText,
    lang,
    onTrack,
    problemText,
    rating,
    requireSurveyDetails,
    resetSurveyUi,
    resolutionNote,
    resolutionStatus,
    room,
    selectedCategories,
    storageKey,
    storedState.firstConfirmedDateKey,
    submitting,
    surveyWindowEndDateKey,
    targetDateKey,
    timezone,
    launchContext.source,
    storedState.shownCount,
  ]);

  if (!isEligible) return null;

  const progressLabel = step === "rating" || step === "areas" ? copy.progress1 : step === "improvement" ? copy.progress2 : copy.progress3;

  return (
    <div className="mt-3 px-4">
      <div className="rounded-2xl border p-4 shadow-sm" style={{ backgroundColor: "#F5F5F5", borderColor: "#43baad", color: "#202627" }}>
        {step === "thanks" ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border text-2xl" style={{ borderColor: "#43baad", backgroundColor: "rgba(67,186,173,0.12)", color: "#202627" }}>
              ✓
            </div>
            <h2 className="mt-3 text-base font-semibold text-[#202627]">{copy.thanksTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-[#344044]">{copy.thanksText}</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#43baad]">
                  {progressLabel}
                </div>
                <h2 className="mt-1 text-base font-semibold text-[#202627]">{copy.title}</h2>
              </div>
              <button
                type="button"
                onClick={dismissSurvey}
                className="rounded-full border border-[#202627]/25 bg-white px-3 py-1 text-xs font-semibold text-[#202627] transition hover:bg-[#43baad]/10"
              >
                {copy.notNow}
              </button>
            </div>

            {step === "rating" ? (
              <div className="mt-4">
                <p className="text-sm leading-6 text-[#344044]">{copy.intro}</p>
                <p className="mt-2 text-sm leading-6 text-[#4f5b5f]">{copy.honestNote}</p>
                <h3 className="mt-4 text-lg font-semibold text-[#202627]">{copy.q1}</h3>
                <p className="mt-1 text-sm text-[#4f5b5f]">{copy.ratingHelp}</p>

                <div className="mt-3 grid gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleRatingSelect(value)}
                      className={clsx(
                        "flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left transition active:scale-[0.99]",
                        rating === value
                          ? "border-[#43baad] bg-[#43baad]/15 text-[#202627]"
                          : "border-[#d7dcde] bg-white text-[#202627] hover:bg-[#43baad]/10"
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#202627]/25 text-sm font-bold">
                        {value}
                      </span>
                      <span className="text-sm font-medium">{copy.ratingLabels[value]}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {step === "areas" ? (
              <div className="mt-4">
                <h3 className="text-lg font-semibold text-[#202627]">{copy.areaQuestion}</h3>
                <p className="mt-1 text-sm text-[#4f5b5f]">{copy.areaHint}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {CATEGORY_KEYS.map((key) => {
                    const selected = selectedCategories.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleCategory(key)}
                        className={clsx(
                          "rounded-full border px-3 py-2 text-sm font-semibold transition",
                          selected
                            ? "border-[#43baad] bg-[#43baad]/15 text-[#202627]"
                            : "border-[#d7dcde] bg-white text-[#202627] hover:bg-[#43baad]/10"
                        )}
                      >
                        {selected ? "✓ " : ""}{copy.categories[key]}
                      </button>
                    );
                  })}
                </div>

                {submitError ? (
                  <div className="mt-4 rounded-xl border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm font-semibold text-rose-900">
                    {submitError}
                  </div>
                ) : null}

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStep("rating")}
                    className="rounded-xl border border-[#d7dcde] bg-white px-4 py-3 text-sm font-semibold text-[#202627]"
                  >
                    {copy.back}
                  </button>
                  <button
                    type="button"
                    onClick={goToImprovementStep}
                    className="rounded-xl px-4 py-3 text-sm font-semibold"
                    style={{ backgroundColor: "var(--stayhub-action)", color: "var(--stayhub-text)" }}
                  >
                    {copy.next}
                  </button>
                </div>
              </div>
            ) : null}

            {step === "improvement" ? (
              <div className="mt-4">
                <h3 className="text-lg font-semibold leading-7 text-[#202627]">{copy.q2}</h3>
                <p className="mt-2 text-sm leading-6 text-[#4f5b5f]">{copy.q2Hint}</p>
                <textarea
                  value={improvementText}
                  onChange={(event) => {
                    setSubmitError("");
                    setImprovementText(event.target.value.slice(0, 400));
                  }}
                  placeholder={copy.q2Placeholder}
                  rows={4}
                  className="mt-3 w-full rounded-xl border border-[#d7dcde] bg-white px-4 py-3 text-sm leading-6 text-[#202627] outline-none placeholder:text-[#7b8588] focus:border-[#43baad]"
                />
                {submitError ? (
                  <div className="mt-4 rounded-xl border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm font-semibold text-rose-900">
                    {submitError}
                  </div>
                ) : null}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(rating && rating <= 4 ? "areas" : "rating")}
                    className="rounded-xl border border-[#d7dcde] bg-white px-4 py-3 text-sm font-semibold text-[#202627]"
                  >
                    {copy.back}
                  </button>
                  <button
                    type="button"
                    onClick={goToProblemStep}
                    className="rounded-xl px-4 py-3 text-sm font-semibold"
                    style={{ backgroundColor: "var(--stayhub-action)", color: "var(--stayhub-text)" }}
                  >
                    {copy.next}
                  </button>
                </div>
              </div>
            ) : null}

            {step === "problem" ? (
              <div className="mt-4">
                <h3 className="text-lg font-semibold leading-7 text-[#202627]">{copy.q3}</h3>
                <p className="mt-2 text-sm leading-6 text-[#4f5b5f]">{copy.q3Hint}</p>
                <textarea
                  value={problemText}
                  onChange={(event) => {
                    setSubmitError("");
                    setProblemText(event.target.value.slice(0, 400));
                  }}
                  placeholder={copy.q3Placeholder}
                  rows={3}
                  className="mt-3 w-full rounded-xl border border-[#d7dcde] bg-white px-4 py-3 text-sm leading-6 text-[#202627] outline-none placeholder:text-[#7b8588] focus:border-[#43baad]"
                />

                <div className="mt-4">
                  <div className="text-sm font-semibold text-[#202627]">{copy.resolutionQuestion}</div>
                  <div className="mt-2 grid gap-2">
                    {RESOLUTION_OPTIONS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setSubmitError("");
                          setResolutionStatus(key);
                        }}
                        className={clsx(
                          "rounded-xl border px-3 py-2 text-left text-sm font-semibold transition",
                          resolutionStatus === key
                            ? "border-[#43baad] bg-[#43baad]/15 text-[#202627]"
                            : "border-[#d7dcde] bg-white text-[#202627] hover:bg-[#43baad]/10"
                        )}
                      >
                        {copy.resolutionOptions[key]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <label className="text-sm font-semibold text-[#202627]">{copy.resolutionNote}</label>
                  <textarea
                    value={resolutionNote}
                    onChange={(event) => {
                      setSubmitError("");
                      setResolutionNote(event.target.value.slice(0, 400));
                    }}
                    placeholder={copy.resolutionPlaceholder}
                    rows={3}
                    className="mt-2 w-full rounded-xl border border-[#d7dcde] bg-white px-4 py-3 text-sm leading-6 text-[#202627] outline-none placeholder:text-[#7b8588] focus:border-[#43baad]"
                  />
                </div>

                {submitError ? (
                  <div className="mt-4 rounded-xl border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm font-semibold text-rose-900">
                    {submitError}
                  </div>
                ) : null}

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStep("improvement")}
                    disabled={submitting}
                    className="rounded-xl border border-[#d7dcde] bg-white px-4 py-3 text-sm font-semibold text-[#202627] disabled:opacity-60"
                  >
                    {copy.back}
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitSurvey()}
                    disabled={submitting}
                    className="rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70"
                    style={{ backgroundColor: "var(--stayhub-action)", color: "var(--stayhub-text)" }}
                  >
                    {submitting ? copy.submitting : copy.send}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
