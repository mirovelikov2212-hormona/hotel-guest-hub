"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LangKey } from "@/lib/types";
import type { TrackHubPayload } from "@/lib/trackHubEvent";

const SURVEY_VERSION = "day3-v1";
const SURVEY_STORAGE_PREFIX = "stayhub_day3_guest_survey";
const SURVEY_TARGET_MINUTES = 21 * 60 + 30;

type SurveyStep = "rating" | "areas" | "improvement" | "problem" | "thanks";
type ResolutionStatus = "fully_resolved" | "partially_resolved" | "not_resolved" | "not_informed" | "";

type StoredSurveyState = {
  firstConfirmedAt?: string;
  firstConfirmedDateKey?: string;
  submittedAt?: string;
  dismissedAt?: string;
  lastShownAt?: string;
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

function isForceSurveyEnabled() {
  if (typeof window === "undefined") return false;
  const value = new URLSearchParams(window.location.search).get("survey");
  return ["1", "true", "yes", "force", "test"].includes(String(value || "").trim().toLowerCase());
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
  const [forceSurvey, setForceSurvey] = useState(false);
  const [step, setStep] = useState<SurveyStep>("rating");
  const [rating, setRating] = useState<number | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [improvementText, setImprovementText] = useState("");
  const [problemText, setProblemText] = useState("");
  const [resolutionStatus, setResolutionStatus] = useState<ResolutionStatus>("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const shownTrackedRef = useRef<string>("");

  useEffect(() => {
    setForceSurvey(isForceSurveyEnabled());
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
    if (existing.firstConfirmedDateKey) {
      setStoredState(existing);
      return;
    }

    const hotelNow = getHotelTimeParts(timezone);
    const next = {
      ...existing,
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

  const isEligible = useMemo(() => {
    if (!roomConfirmed || !normalizeRoomNumber(room) || !storedState.firstConfirmedDateKey) return false;
    if (storedState.submittedAt || storedState.dismissedAt) return false;
    if (forceSurvey) return true;

    const hotelNow = getHotelTimeParts(timezone);
    return hotelNow.dateKey === targetDateKey && hotelNow.minutes >= SURVEY_TARGET_MINUTES;
  }, [clockTick, forceSurvey, room, roomConfirmed, storedState, targetDateKey, timezone]);

  useEffect(() => {
    if (!isEligible || !storageKey) return;

    const marker = `${storageKey}:${targetDateKey}`;
    if (shownTrackedRef.current === marker) return;
    shownTrackedRef.current = marker;

    const next = { ...readStoredSurveyState(storageKey), lastShownAt: new Date().toISOString() };
    writeStoredSurveyState(storageKey, next);
    setStoredState(next);

    onTrack({
      eventName: "day3_survey_shown",
      eventCategory: "survey",
      section: "day3_survey",
      sectionKey: "day3_survey",
      label: SURVEY_VERSION,
      value: targetDateKey,
      metadata: {
        surveyVersion: SURVEY_VERSION,
        targetDateKey,
        forceSurvey,
      },
    });
  }, [forceSurvey, isEligible, onTrack, storageKey, targetDateKey]);

  const resetSurveyUi = useCallback(() => {
    setStep("rating");
    setRating(null);
    setSelectedCategories([]);
    setImprovementText("");
    setProblemText("");
    setResolutionStatus("");
    setResolutionNote("");
    setSubmitting(false);
  }, []);

  const dismissSurvey = useCallback(() => {
    const next = { ...readStoredSurveyState(storageKey), dismissedAt: new Date().toISOString() };
    writeStoredSurveyState(storageKey, next);
    setStoredState(next);
    resetSurveyUi();

    onTrack({
      eventName: "day3_survey_dismissed",
      eventCategory: "survey",
      section: "day3_survey",
      sectionKey: "day3_survey",
      label: SURVEY_VERSION,
      metadata: { surveyVersion: SURVEY_VERSION, step },
    });
  }, [onTrack, resetSurveyUi, step, storageKey]);

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category]
    );
  }, []);

  const handleRatingSelect = useCallback((value: number) => {
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

  const submitSurvey = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);

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
      hotelTimezone: timezone,
    };

    onTrack({
      eventName: "day3_survey_submitted",
      eventCategory: "survey",
      section: "day3_survey",
      sectionKey: "day3_survey",
      label: SURVEY_VERSION,
      value: rating === null ? null : String(rating),
      metadata: payload,
    });

    if (shouldCreateReceptionSignal({ rating, problemText, resolutionStatus })) {
      try {
        const response = await fetch("/api/guest/request-create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hotelSlug,
            room,
            type: "information_request",
            typeLabel: SURVEY_COPY.bg.staffSignalTitle,
            note: buildStaffNoteBg({
              room,
              rating,
              selectedCategories,
              improvementText,
              problemText,
              resolutionStatus,
              resolutionNote,
            }),
            serviceTime: "now",
            departmentOverride: "reception",
            notifyDepartments: ["reception"],
            guestLanguage: String(lang),
            sourceRequestDef: "day3_guest_survey",
          }),
        });

        const result = (await response.json().catch(() => null)) as { ok?: boolean; request?: { id?: string } } | null;

        if (response.ok && result?.ok) {
          onTrack({
            eventName: "day3_survey_reception_signal_created",
            eventCategory: "survey",
            section: "day3_survey",
            sectionKey: "day3_survey",
            label: SURVEY_VERSION,
            requestId: result.request?.id || undefined,
            metadata: {
              surveyVersion: SURVEY_VERSION,
              requestId: result.request?.id || null,
              resolutionStatus: resolutionStatus || null,
            },
          });
        }
      } catch (error) {
        console.error("day3 survey reception signal failed", error);
      }
    }

    const next = { ...readStoredSurveyState(storageKey), submittedAt: new Date().toISOString() };
    writeStoredSurveyState(storageKey, next);
    setStoredState(next);
    setStep("thanks");
    setSubmitting(false);
  }, [
    hotelSlug,
    improvementText,
    lang,
    onTrack,
    problemText,
    rating,
    resolutionNote,
    resolutionStatus,
    room,
    selectedCategories,
    storageKey,
    storedState.firstConfirmedDateKey,
    submitting,
    targetDateKey,
    timezone,
  ]);

  if (!isEligible && step !== "thanks") return null;

  const progressLabel = step === "rating" || step === "areas" ? copy.progress1 : step === "improvement" ? copy.progress2 : copy.progress3;

  return (
    <div className="mt-3 px-4">
      <div className="rounded-2xl stayhub-panel p-4 shadow-sm">
        {step === "thanks" ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-400/15 text-2xl">
              ✓
            </div>
            <h2 className="mt-3 text-base font-semibold text-white">{copy.thanksTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-200">{copy.thanksText}</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-100/80">
                  {progressLabel}
                </div>
                <h2 className="mt-1 text-base font-semibold text-white">{copy.title}</h2>
              </div>
              <button
                type="button"
                onClick={dismissSurvey}
                className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white/75 transition hover:bg-white/10"
              >
                {copy.notNow}
              </button>
            </div>

            {step === "rating" ? (
              <div className="mt-4">
                <p className="text-sm leading-6 text-neutral-200">{copy.intro}</p>
                <p className="mt-2 text-sm leading-6 text-neutral-300">{copy.honestNote}</p>
                <h3 className="mt-4 text-lg font-semibold text-white">{copy.q1}</h3>
                <p className="mt-1 text-sm text-neutral-300">{copy.ratingHelp}</p>

                <div className="mt-3 grid gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleRatingSelect(value)}
                      className={clsx(
                        "flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left transition active:scale-[0.99]",
                        rating === value
                          ? "border-emerald-200 bg-emerald-400/20 text-white"
                          : "border-white/10 bg-white/5 text-neutral-100 hover:bg-white/10"
                      )}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 text-sm font-bold">
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
                <h3 className="text-lg font-semibold text-white">{copy.areaQuestion}</h3>
                <p className="mt-1 text-sm text-neutral-300">{copy.areaHint}</p>
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
                            ? "border-emerald-200 bg-emerald-400/20 text-white"
                            : "border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10"
                        )}
                      >
                        {selected ? "✓ " : ""}{copy.categories[key]}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStep("rating")}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
                  >
                    {copy.back}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep("improvement")}
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
                <h3 className="text-lg font-semibold leading-7 text-white">{copy.q2}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-300">{copy.q2Hint}</p>
                <textarea
                  value={improvementText}
                  onChange={(event) => setImprovementText(event.target.value.slice(0, 400))}
                  placeholder={copy.q2Placeholder}
                  rows={4}
                  className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-neutral-400 focus:border-emerald-200/60"
                />
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(rating && rating <= 4 ? "areas" : "rating")}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
                  >
                    {copy.back}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep("problem")}
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
                <h3 className="text-lg font-semibold leading-7 text-white">{copy.q3}</h3>
                <p className="mt-2 text-sm leading-6 text-neutral-300">{copy.q3Hint}</p>
                <textarea
                  value={problemText}
                  onChange={(event) => setProblemText(event.target.value.slice(0, 400))}
                  placeholder={copy.q3Placeholder}
                  rows={3}
                  className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-neutral-400 focus:border-emerald-200/60"
                />

                <div className="mt-4">
                  <div className="text-sm font-semibold text-white">{copy.resolutionQuestion}</div>
                  <div className="mt-2 grid gap-2">
                    {RESOLUTION_OPTIONS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setResolutionStatus(key)}
                        className={clsx(
                          "rounded-xl border px-3 py-2 text-left text-sm font-semibold transition",
                          resolutionStatus === key
                            ? "border-emerald-200 bg-emerald-400/20 text-white"
                            : "border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10"
                        )}
                      >
                        {copy.resolutionOptions[key]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <label className="text-sm font-semibold text-white">{copy.resolutionNote}</label>
                  <textarea
                    value={resolutionNote}
                    onChange={(event) => setResolutionNote(event.target.value.slice(0, 400))}
                    placeholder={copy.resolutionPlaceholder}
                    rows={3}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-neutral-400 focus:border-emerald-200/60"
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStep("improvement")}
                    disabled={submitting}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
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
