"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type LangKey = "bg" | "en" | "de" | "ro" | "cs" | "ru";

type MassageService = {
  serviceId: string;
  nameBg: string;
  nameEn: string;
  nameDe: string;
  nameRo: string;
  nameCs: string;
  nameRu: string;
  durationMinutes: number;
  price: number;
  currency: string;
  bufferMinutes: number;
  sortOrder: number;
};

type BookableDate = {
  date: string;
  availableCount: number;
  firstAvailableTime: string;
  lastAvailableTime: string;
};

type ApiEnvelope<T> = {
  ok: boolean;
  action?: string;
  hotelSlug?: string;
  result?: T;
  code?: string;
  error?: string;
};

type ServicesResult = {
  count: number;
  services: MassageService[];
};

type BookableDatesResult = {
  serviceId: string;
  fromDate: string;
  count: number;
  dates: BookableDate[];
};

type AvailabilityResult = {
  serviceId: string;
  date: string | null;
  durationMinutes?: number;
  bufferMinutes?: number;
  slotMinutes?: number;
  availableTimes: string[];
};

const SUPPORTED_LANGUAGES: Array<{ key: LangKey; label: string }> = [
  { key: "bg", label: "BG" },
  { key: "en", label: "EN" },
  { key: "de", label: "DE" },
  { key: "ro", label: "RO" },
  { key: "cs", label: "CZ" },
  { key: "ru", label: "RU" },
];

const COPY: Record<
  LangKey,
  {
    title: string;
    subtitle: string;
    testMode: string;
    chooseService: string;
    chooseDate: string;
    chooseTime: string;
    loading: string;
    retry: string;
    noServices: string;
    noDates: string;
    noTimes: string;
    duration: string;
    minutes: string;
    price: string;
    selected: string;
    service: string;
    date: string;
    time: string;
    readOnlyNotice: string;
    reset: string;
    change: string;
  }
> = {
  bg: {
    title: "Масажи",
    subtitle: "Проверка на свободните дати и часове",
    testMode: "Защитен режим — само преглед",
    chooseService: "1. Изберете масаж",
    chooseDate: "2. Изберете дата",
    chooseTime: "3. Изберете час",
    loading: "Зареждане…",
    retry: "Опитайте отново",
    noServices: "В момента няма налични масажи.",
    noDates: "Няма свободни дати в показания период.",
    noTimes: "За тази дата няма свободни часове.",
    duration: "Продължителност",
    minutes: "мин.",
    price: "Цена",
    selected: "Избран час",
    service: "Масаж",
    date: "Дата",
    time: "Час",
    readOnlyNotice: "Това е тестов преглед. Резервация не се изпраща.",
    reset: "Нов избор",
    change: "Промени",
  },
  en: {
    title: "Massages",
    subtitle: "Check available dates and times",
    testMode: "Protected mode — read only",
    chooseService: "1. Choose a massage",
    chooseDate: "2. Choose a date",
    chooseTime: "3. Choose a time",
    loading: "Loading…",
    retry: "Try again",
    noServices: "No massages are available at the moment.",
    noDates: "No available dates in the displayed period.",
    noTimes: "No available times for this date.",
    duration: "Duration",
    minutes: "min",
    price: "Price",
    selected: "Selected time",
    service: "Massage",
    date: "Date",
    time: "Time",
    readOnlyNotice: "This is a test preview. No booking is submitted.",
    reset: "Start again",
    change: "Change",
  },
  de: {
    title: "Massagen",
    subtitle: "Freie Termine prüfen",
    testMode: "Geschützter Modus — nur Ansicht",
    chooseService: "1. Massage auswählen",
    chooseDate: "2. Datum auswählen",
    chooseTime: "3. Uhrzeit auswählen",
    loading: "Wird geladen…",
    retry: "Erneut versuchen",
    noServices: "Derzeit sind keine Massagen verfügbar.",
    noDates: "Im angezeigten Zeitraum gibt es keine freien Tage.",
    noTimes: "Für dieses Datum gibt es keine freien Zeiten.",
    duration: "Dauer",
    minutes: "Min.",
    price: "Preis",
    selected: "Ausgewählter Termin",
    service: "Massage",
    date: "Datum",
    time: "Uhrzeit",
    readOnlyNotice: "Dies ist eine Testansicht. Es wird keine Buchung gesendet.",
    reset: "Neue Auswahl",
    change: "Ändern",
  },
  ro: {
    title: "Masaje",
    subtitle: "Verificați datele și orele disponibile",
    testMode: "Mod protejat — doar vizualizare",
    chooseService: "1. Alegeți un masaj",
    chooseDate: "2. Alegeți data",
    chooseTime: "3. Alegeți ora",
    loading: "Se încarcă…",
    retry: "Încercați din nou",
    noServices: "Momentan nu sunt disponibile masaje.",
    noDates: "Nu există date libere în perioada afișată.",
    noTimes: "Nu există ore libere pentru această dată.",
    duration: "Durată",
    minutes: "min.",
    price: "Preț",
    selected: "Ora selectată",
    service: "Masaj",
    date: "Data",
    time: "Ora",
    readOnlyNotice: "Aceasta este o previzualizare de test. Rezervarea nu este trimisă.",
    reset: "Selecție nouă",
    change: "Schimbați",
  },
  cs: {
    title: "Masáže",
    subtitle: "Kontrola volných termínů",
    testMode: "Chráněný režim — pouze náhled",
    chooseService: "1. Vyberte masáž",
    chooseDate: "2. Vyberte datum",
    chooseTime: "3. Vyberte čas",
    loading: "Načítání…",
    retry: "Zkusit znovu",
    noServices: "Momentálně nejsou k dispozici žádné masáže.",
    noDates: "V zobrazeném období nejsou volné termíny.",
    noTimes: "Pro toto datum nejsou volné časy.",
    duration: "Délka",
    minutes: "min.",
    price: "Cena",
    selected: "Vybraný termín",
    service: "Masáž",
    date: "Datum",
    time: "Čas",
    readOnlyNotice: "Toto je testovací náhled. Rezervace se neodesílá.",
    reset: "Nový výběr",
    change: "Změnit",
  },
  ru: {
    title: "Массажи",
    subtitle: "Проверка свободных дат и времени",
    testMode: "Защищённый режим — только просмотр",
    chooseService: "1. Выберите массаж",
    chooseDate: "2. Выберите дату",
    chooseTime: "3. Выберите время",
    loading: "Загрузка…",
    retry: "Попробовать снова",
    noServices: "Сейчас нет доступных массажей.",
    noDates: "В указанном периоде нет свободных дат.",
    noTimes: "На эту дату нет свободного времени.",
    duration: "Продолжительность",
    minutes: "мин.",
    price: "Цена",
    selected: "Выбранное время",
    service: "Массаж",
    date: "Дата",
    time: "Время",
    readOnlyNotice: "Это тестовый просмотр. Бронирование не отправляется.",
    reset: "Новый выбор",
    change: "Изменить",
  },
};

function normalizeLanguage(value: string): LangKey {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "cz") return "cs";
  return SUPPORTED_LANGUAGES.some((item) => item.key === normalized)
    ? (normalized as LangKey)
    : "bg";
}

function getSofiaIsoDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function serviceName(service: MassageService, language: LangKey) {
  const names: Record<LangKey, string> = {
    bg: service.nameBg,
    en: service.nameEn,
    de: service.nameDe,
    ro: service.nameRo,
    cs: service.nameCs,
    ru: service.nameRu,
  };

  return names[language] || service.nameEn || service.nameBg || service.serviceId;
}

function languageLocale(language: LangKey) {
  return {
    bg: "bg-BG",
    en: "en-GB",
    de: "de-DE",
    ro: "ro-RO",
    cs: "cs-CZ",
    ru: "ru-RU",
  }[language];
}

function formatDate(dateIso: string, language: LangKey) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat(languageLocale(language), {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

async function fetchMassageApi<T>(params: URLSearchParams, signal?: AbortSignal) {
  const response = await fetch(`/api/guest/massages?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal,
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !payload?.ok || !payload.result) {
    throw new Error(payload?.error || "Massage availability could not be loaded.");
  }

  return payload.result;
}

export default function MassageAvailabilityPreview({
  hotelSlug,
  initialLanguage,
}: {
  hotelSlug: string;
  initialLanguage: string;
}) {
  const [language, setLanguage] = useState<LangKey>(() => normalizeLanguage(initialLanguage));
  const [services, setServices] = useState<MassageService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [dates, setDates] = useState<BookableDate[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [times, setTimes] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState("");
  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [error, setError] = useState("");
  const [serviceStepExpanded, setServiceStepExpanded] = useState(true);
  const [dateStepExpanded, setDateStepExpanded] = useState(true);
  const [timeStepExpanded, setTimeStepExpanded] = useState(true);
  const dateSectionRef = useRef<HTMLElement | null>(null);
  const timeSectionRef = useRef<HTMLElement | null>(null);
  const summarySectionRef = useRef<HTMLElement | null>(null);

  const copy = COPY[language];
  const selectedService = useMemo(
    () => services.find((service) => service.serviceId === selectedServiceId) || null,
    [selectedServiceId, services]
  );

  const selectedDateInfo = useMemo(
    () => dates.find((item) => item.date === selectedDate) || null,
    [dates, selectedDate]
  );

  const scrollToSection = (target: HTMLElement | null) => {
    if (!target) return;
    window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const loadServices = useCallback(async (signal?: AbortSignal) => {
    setLoadingServices(true);
    setError("");

    try {
      const result = await fetchMassageApi<ServicesResult>(
        new URLSearchParams({ hotelSlug, action: "services" }),
        signal
      );
      setServices(result.services || []);
    } catch (loadError) {
      if (loadError instanceof Error && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load massages.");
    } finally {
      setLoadingServices(false);
    }
  }, [hotelSlug]);

  useEffect(() => {
    const controller = new AbortController();
    void loadServices(controller.signal);
    return () => controller.abort();
  }, [loadServices]);

  const chooseService = async (serviceId: string) => {
    setSelectedServiceId(serviceId);
    setDates([]);
    setSelectedDate("");
    setTimes([]);
    setSelectedTime("");
    setServiceStepExpanded(false);
    setDateStepExpanded(true);
    setTimeStepExpanded(true);
    setLoadingDates(true);
    setError("");

    try {
      const result = await fetchMassageApi<BookableDatesResult>(
        new URLSearchParams({
          hotelSlug,
          action: "bookable_dates",
          serviceId,
          fromDate: getSofiaIsoDate(),
          daysAhead: "14",
        })
      );
      setDates(result.dates || []);
      scrollToSection(dateSectionRef.current);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dates.");
    } finally {
      setLoadingDates(false);
    }
  };

  const chooseDate = async (date: string) => {
    if (!selectedServiceId) return;

    setSelectedDate(date);
    setTimes([]);
    setSelectedTime("");
    setDateStepExpanded(false);
    setTimeStepExpanded(true);
    setLoadingTimes(true);
    setError("");

    try {
      const result = await fetchMassageApi<AvailabilityResult>(
        new URLSearchParams({
          hotelSlug,
          action: "availability",
          serviceId: selectedServiceId,
          date,
        })
      );
      setTimes(result.availableTimes || []);
      scrollToSection(timeSectionRef.current);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load times.");
    } finally {
      setLoadingTimes(false);
    }
  };

  const chooseTime = (time: string) => {
    setSelectedTime(time);
    setTimeStepExpanded(false);
    scrollToSection(summarySectionRef.current);
  };

  const resetSelection = () => {
    setSelectedServiceId("");
    setDates([]);
    setSelectedDate("");
    setTimes([]);
    setSelectedTime("");
    setServiceStepExpanded(true);
    setDateStepExpanded(true);
    setTimeStepExpanded(true);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="min-h-screen bg-[#f5f5f5] px-4 py-6 text-[#202627]">
      <div className="mx-auto max-w-xl">
        <header className="rounded-3xl border border-[#43b5a1] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#3c8476]">
                StayHub · Aquamarine
              </div>
              <h1 className="mt-2 text-2xl font-bold">💆 {copy.title}</h1>
              <p className="mt-1 text-sm text-[#596364]">{copy.subtitle}</p>
            </div>
            <div className="rounded-full bg-[#e6f6f2] px-3 py-1.5 text-xs font-bold text-[#286f63]">
              {copy.testMode}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {SUPPORTED_LANGUAGES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setLanguage(item.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  language === item.key
                    ? "border-[#202627] bg-[#43b5a1] text-white"
                    : "border-[#43b5a1] bg-white text-[#286f63]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            <div>{error}</div>
            <button
              type="button"
              onClick={() => void loadServices()}
              className="mt-3 rounded-xl bg-red-700 px-3 py-2 font-semibold text-white"
            >
              {copy.retry}
            </button>
          </div>
        ) : null}

        <section className="mt-4 rounded-3xl border border-[#43b5a1] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold">{copy.chooseService}</h2>
            {selectedService && !serviceStepExpanded ? (
              <button
                type="button"
                onClick={() => setServiceStepExpanded(true)}
                className="rounded-full border border-[#43b5a1] px-3 py-1 text-xs font-bold text-[#286f63]"
              >
                {copy.change}
              </button>
            ) : null}
          </div>

          {selectedService && !serviceStepExpanded ? (
            <div className="mt-3 rounded-2xl border border-[#202627] bg-[#43b5a1] p-3 text-white">
              <div className="font-bold">{serviceName(selectedService, language)}</div>
              <div className="mt-1 text-xs text-white/85">
                {copy.duration}: {selectedService.durationMinutes} {copy.minutes} · {copy.price}:{" "}
                {selectedService.price.toFixed(2)} {selectedService.currency}
              </div>
            </div>
          ) : loadingServices ? (
            <div className="mt-3 text-sm text-[#596364]">{copy.loading}</div>
          ) : services.length ? (
            <div className="mt-3 grid gap-2">
              {services.map((service) => {
                const active = selectedServiceId === service.serviceId;
                return (
                  <button
                    key={service.serviceId}
                    type="button"
                    onClick={() => void chooseService(service.serviceId)}
                    className={`rounded-2xl border p-3 text-left transition active:scale-[0.99] ${
                      active
                        ? "border-[#202627] bg-[#43b5a1] text-white"
                        : "border-[#b8ddd6] bg-[#f7fcfb] text-[#202627]"
                    }`}
                  >
                    <div className="font-bold">{serviceName(service, language)}</div>
                    <div className={`mt-1 text-xs ${active ? "text-white/85" : "text-[#596364]"}`}>
                      {copy.duration}: {service.durationMinutes} {copy.minutes} · {copy.price}:{" "}
                      {service.price.toFixed(2)} {service.currency}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 text-sm text-[#596364]">{copy.noServices}</div>
          )}
        </section>

        {selectedService ? (
          <section
            ref={dateSectionRef}
            className="mt-4 scroll-mt-4 rounded-3xl border border-[#43b5a1] bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold">{copy.chooseDate}</h2>
              {selectedDate && !dateStepExpanded ? (
                <button
                  type="button"
                  onClick={() => setDateStepExpanded(true)}
                  className="rounded-full border border-[#43b5a1] px-3 py-1 text-xs font-bold text-[#286f63]"
                >
                  {copy.change}
                </button>
              ) : null}
            </div>

            {selectedDate && selectedDateInfo && !dateStepExpanded ? (
              <div className="mt-3 rounded-2xl border border-[#202627] bg-[#43b5a1] p-3 text-white">
                <div className="font-bold">{formatDate(selectedDate, language)}</div>
                <div className="mt-1 text-xs text-white/85">
                  {selectedDateInfo.firstAvailableTime}–{selectedDateInfo.lastAvailableTime}
                </div>
              </div>
            ) : loadingDates ? (
              <div className="mt-3 text-sm text-[#596364]">{copy.loading}</div>
            ) : dates.length ? (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {dates.map((item) => {
                  const active = selectedDate === item.date;
                  return (
                    <button
                      key={item.date}
                      type="button"
                      onClick={() => void chooseDate(item.date)}
                      className={`rounded-2xl border px-3 py-3 text-left transition active:scale-[0.99] ${
                        active
                          ? "border-[#202627] bg-[#43b5a1] text-white"
                          : "border-[#b8ddd6] bg-[#f7fcfb]"
                      }`}
                    >
                      <div className="font-bold">{formatDate(item.date, language)}</div>
                      <div className={`mt-1 text-[11px] ${active ? "text-white/85" : "text-[#596364]"}`}>
                        {item.firstAvailableTime}–{item.lastAvailableTime}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 text-sm text-[#596364]">{copy.noDates}</div>
            )}
          </section>
        ) : null}

        {selectedDate ? (
          <section
            ref={timeSectionRef}
            className="mt-4 scroll-mt-4 rounded-3xl border border-[#43b5a1] bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold">{copy.chooseTime}</h2>
              {selectedTime && !timeStepExpanded ? (
                <button
                  type="button"
                  onClick={() => setTimeStepExpanded(true)}
                  className="rounded-full border border-[#43b5a1] px-3 py-1 text-xs font-bold text-[#286f63]"
                >
                  {copy.change}
                </button>
              ) : null}
            </div>

            {selectedTime && !timeStepExpanded ? (
              <div className="mt-3 rounded-2xl border border-[#202627] bg-[#43b5a1] px-4 py-3 text-center text-lg font-bold text-white">
                {selectedTime}
              </div>
            ) : loadingTimes ? (
              <div className="mt-3 text-sm text-[#596364]">{copy.loading}</div>
            ) : times.length ? (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {times.map((time) => {
                  const active = selectedTime === time;
                  return (
                    <button
                      key={time}
                      type="button"
                      onClick={() => chooseTime(time)}
                      className={`rounded-xl border px-3 py-2 text-center text-sm font-bold transition active:scale-[0.98] ${
                        active
                          ? "border-[#202627] bg-[#43b5a1] text-white"
                          : "border-[#b8ddd6] bg-[#f7fcfb]"
                      }`}
                    >
                      {time}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 text-sm text-[#596364]">{copy.noTimes}</div>
            )}
          </section>
        ) : null}

        {selectedService && selectedDate && selectedTime ? (
          <section
            ref={summarySectionRef}
            className="mt-4 scroll-mt-4 rounded-3xl border-2 border-[#202627] bg-[#43b5a1] p-4 text-white shadow-sm"
          >
            <h2 className="text-lg font-bold">{copy.selected}</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="font-semibold text-white/80">{copy.service}</dt>
              <dd className="font-bold">{serviceName(selectedService, language)}</dd>
              <dt className="font-semibold text-white/80">{copy.date}</dt>
              <dd className="font-bold">{formatDate(selectedDate, language)}</dd>
              <dt className="font-semibold text-white/80">{copy.time}</dt>
              <dd className="font-bold">{selectedTime}</dd>
            </dl>
            <div className="mt-4 rounded-2xl bg-white/15 p-3 text-sm font-semibold">
              {copy.readOnlyNotice}
            </div>
            <button
              type="button"
              onClick={resetSelection}
              className="mt-3 rounded-xl border border-white bg-white px-4 py-2 text-sm font-bold text-[#286f63]"
            >
              {copy.reset}
            </button>
          </section>
        ) : null}
      </div>
    </main>
  );
}
