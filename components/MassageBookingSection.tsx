"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LangKey } from "@/lib/types";
import type { TrackHubPayload } from "@/lib/trackHubEvent";

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
  result?: T;
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
  availableTimes: string[];
};

type MassageCopy = {
  sectionTitle: string;
  sectionSubtitle: string;
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
};

const COPY: Record<LangKey, MassageCopy> = {
  bg: {
    sectionTitle: "Запази масаж",
    sectionSubtitle: "Изберете масаж, свободна дата и час.",
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
    readOnlyNotice: "Защитен преглед: резервация все още не се изпраща.",
    reset: "Нов избор",
    change: "Промени",
  },
  en: {
    sectionTitle: "Book a massage",
    sectionSubtitle: "Choose a massage, an available date and time.",
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
    readOnlyNotice: "Protected preview: no booking is submitted yet.",
    reset: "Start again",
    change: "Change",
  },
  de: {
    sectionTitle: "Massage buchen",
    sectionSubtitle: "Wählen Sie eine Massage, ein freies Datum und eine Uhrzeit.",
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
    readOnlyNotice: "Geschützte Vorschau: Es wird noch keine Buchung gesendet.",
    reset: "Neue Auswahl",
    change: "Ändern",
  },
  ro: {
    sectionTitle: "Rezervă un masaj",
    sectionSubtitle: "Alegeți un masaj, o dată și o oră disponibile.",
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
    readOnlyNotice: "Previzualizare protejată: rezervarea nu este încă trimisă.",
    reset: "Selecție nouă",
    change: "Schimbați",
  },
  cs: {
    sectionTitle: "Rezervovat masáž",
    sectionSubtitle: "Vyberte masáž, volné datum a čas.",
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
    readOnlyNotice: "Chráněný náhled: rezervace se zatím neodesílá.",
    reset: "Nový výběr",
    change: "Změnit",
  },
  ru: {
    sectionTitle: "Забронировать массаж",
    sectionSubtitle: "Выберите массаж, свободную дату и время.",
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
    readOnlyNotice: "Защищённый просмотр: бронирование пока не отправляется.",
    reset: "Новый выбор",
    change: "Изменить",
  },
};

function normalizeLanguage(language: LangKey): LangKey {
  return COPY[language] ? language : "bg";
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

const normalCardStyle = {
  backgroundColor: "color-mix(in srgb, var(--stayhub-soft) 92%, white 8%)",
  borderColor: "color-mix(in srgb, var(--stayhub-action) 42%, transparent)",
  color: "#202627",
};

const selectedCardStyle = {
  backgroundColor: "var(--stayhub-action)",
  borderColor: "#202627",
  color: "var(--stayhub-text)",
};

export default function MassageBookingSection({
  hotelSlug,
  language,
  forceOpenToken = 0,
  onTrack,
}: {
  hotelSlug: string;
  language: LangKey;
  forceOpenToken?: number;
  onTrack: (payload: TrackHubPayload) => void;
}) {
  const lang = normalizeLanguage(language);
  const copy = COPY[lang];
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState<MassageService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [dates, setDates] = useState<BookableDate[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [times, setTimes] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState("");
  const [loadingServices, setLoadingServices] = useState(false);
  const [servicesLoaded, setServicesLoaded] = useState(false);
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [error, setError] = useState("");
  const [serviceStepExpanded, setServiceStepExpanded] = useState(true);
  const [dateStepExpanded, setDateStepExpanded] = useState(true);
  const [timeStepExpanded, setTimeStepExpanded] = useState(true);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const dateSectionRef = useRef<HTMLElement | null>(null);
  const timeSectionRef = useRef<HTMLElement | null>(null);
  const summarySectionRef = useRef<HTMLElement | null>(null);

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
    window.setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
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
      setServicesLoaded(true);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load massages.");
    } finally {
      setLoadingServices(false);
    }
  }, [hotelSlug]);

  useEffect(() => {
    if (!open || servicesLoaded || loadingServices) return;
    const controller = new AbortController();
    void loadServices(controller.signal);
    return () => controller.abort();
  }, [loadServices, loadingServices, open, servicesLoaded]);

  useEffect(() => {
    if (forceOpenToken <= 0) return;
    setOpen(true);
    window.setTimeout(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, [forceOpenToken]);

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

    onTrack({
      eventName: "massage_service_selected",
      eventCategory: "massage",
      section: "massage_booking",
      sectionKey: "massage_booking",
      itemKey: serviceId,
      label: serviceId,
      value: serviceId,
    });

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

    onTrack({
      eventName: "massage_date_selected",
      eventCategory: "massage",
      section: "massage_booking",
      sectionKey: "massage_booking",
      itemKey: selectedServiceId,
      label: date,
      value: date,
    });

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
    onTrack({
      eventName: "massage_time_selected",
      eventCategory: "massage",
      section: "massage_booking",
      sectionKey: "massage_booking",
      itemKey: selectedServiceId,
      label: time,
      value: time,
      extra: { date: selectedDate },
    });
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
    scrollToSection(sectionRef.current);
  };

  return (
    <div ref={sectionRef} id="stayhub-massage-booking" className="scroll-mt-4 rounded-2xl overflow-hidden stayhub-section-shell">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          onTrack({
            eventName: next ? "section_opened" : "section_closed",
            eventCategory: "navigation",
            section: "massage_booking",
            sectionKey: "massage_booking",
            label: copy.sectionTitle,
            value: next ? "open" : "closed",
          });
        }}
        className="w-full px-4 py-4 text-left stayhub-section-header flex items-center justify-between gap-3"
        aria-expanded={open}
        aria-controls="stayhub-massage-booking-body"
      >
        <div>
          <div className="text-base font-semibold">💆 {copy.sectionTitle}</div>
          <div className="mt-1 text-xs opacity-85">{copy.sectionSubtitle}</div>
        </div>
        <div className="text-lg">{open ? "▴" : "▾"}</div>
      </button>

      {open ? (
        <div id="stayhub-massage-booking-body" className="stayhub-section-body px-3 py-3 sm:px-4 sm:py-4">
          {error ? (
            <div className="mb-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <div>{error}</div>
              <button
                type="button"
                onClick={() => void loadServices()}
                className="mt-2 rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white"
              >
                {copy.retry}
              </button>
            </div>
          ) : null}

          <section className="rounded-2xl border p-3" style={{ borderColor: "var(--stayhub-action)", backgroundColor: "var(--stayhub-soft)", color: "#202627" }}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold">{copy.chooseService}</h3>
              {selectedService && !serviceStepExpanded ? (
                <button
                  type="button"
                  onClick={() => setServiceStepExpanded(true)}
                  className="rounded-full border px-3 py-1 text-xs font-bold"
                  style={{ borderColor: "var(--stayhub-action)", color: "var(--stayhub-primary)" }}
                >
                  {copy.change}
                </button>
              ) : null}
            </div>

            {selectedService && !serviceStepExpanded ? (
              <div className="mt-3 rounded-xl border p-3" style={selectedCardStyle}>
                <div className="font-bold">{serviceName(selectedService, lang)}</div>
                <div className="mt-1 text-xs opacity-90">
                  {copy.duration}: {selectedService.durationMinutes} {copy.minutes} · {copy.price}: {selectedService.price.toFixed(2)} {selectedService.currency}
                </div>
              </div>
            ) : loadingServices ? (
              <div className="mt-3 text-sm opacity-70">{copy.loading}</div>
            ) : services.length ? (
              <div className="mt-3 grid gap-2">
                {services.map((service) => {
                  const active = selectedServiceId === service.serviceId;
                  return (
                    <button
                      key={service.serviceId}
                      type="button"
                      onClick={() => void chooseService(service.serviceId)}
                      className="rounded-xl border p-3 text-left transition active:scale-[0.99]"
                      style={active ? selectedCardStyle : normalCardStyle}
                    >
                      <div className="font-bold">{serviceName(service, lang)}</div>
                      <div className="mt-1 text-xs opacity-75">
                        {copy.duration}: {service.durationMinutes} {copy.minutes} · {copy.price}: {service.price.toFixed(2)} {service.currency}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 text-sm opacity-70">{copy.noServices}</div>
            )}
          </section>

          {selectedService ? (
            <section
              ref={dateSectionRef}
              className="mt-3 scroll-mt-4 rounded-2xl border p-3"
              style={{ borderColor: "var(--stayhub-action)", backgroundColor: "var(--stayhub-soft)", color: "#202627" }}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold">{copy.chooseDate}</h3>
                {selectedDate && !dateStepExpanded ? (
                  <button
                    type="button"
                    onClick={() => setDateStepExpanded(true)}
                    className="rounded-full border px-3 py-1 text-xs font-bold"
                    style={{ borderColor: "var(--stayhub-action)", color: "var(--stayhub-primary)" }}
                  >
                    {copy.change}
                  </button>
                ) : null}
              </div>

              {selectedDate && selectedDateInfo && !dateStepExpanded ? (
                <div className="mt-3 rounded-xl border p-3" style={selectedCardStyle}>
                  <div className="font-bold">{formatDate(selectedDate, lang)}</div>
                  <div className="mt-1 text-xs opacity-90">
                    {selectedDateInfo.firstAvailableTime}–{selectedDateInfo.lastAvailableTime}
                  </div>
                </div>
              ) : loadingDates ? (
                <div className="mt-3 text-sm opacity-70">{copy.loading}</div>
              ) : dates.length ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {dates.map((item) => {
                    const active = selectedDate === item.date;
                    return (
                      <button
                        key={item.date}
                        type="button"
                        onClick={() => void chooseDate(item.date)}
                        className="rounded-xl border px-3 py-3 text-left transition active:scale-[0.99]"
                        style={active ? selectedCardStyle : normalCardStyle}
                      >
                        <div className="font-bold">{formatDate(item.date, lang)}</div>
                        <div className="mt-1 text-[11px] opacity-75">
                          {item.firstAvailableTime}–{item.lastAvailableTime}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 text-sm opacity-70">{copy.noDates}</div>
              )}
            </section>
          ) : null}

          {selectedDate ? (
            <section
              ref={timeSectionRef}
              className="mt-3 scroll-mt-4 rounded-2xl border p-3"
              style={{ borderColor: "var(--stayhub-action)", backgroundColor: "var(--stayhub-soft)", color: "#202627" }}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold">{copy.chooseTime}</h3>
                {selectedTime && !timeStepExpanded ? (
                  <button
                    type="button"
                    onClick={() => setTimeStepExpanded(true)}
                    className="rounded-full border px-3 py-1 text-xs font-bold"
                    style={{ borderColor: "var(--stayhub-action)", color: "var(--stayhub-primary)" }}
                  >
                    {copy.change}
                  </button>
                ) : null}
              </div>

              {selectedTime && !timeStepExpanded ? (
                <div className="mt-3 rounded-xl border px-4 py-3 text-center text-lg font-bold" style={selectedCardStyle}>
                  {selectedTime}
                </div>
              ) : loadingTimes ? (
                <div className="mt-3 text-sm opacity-70">{copy.loading}</div>
              ) : times.length ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {times.map((time) => {
                    const active = selectedTime === time;
                    return (
                      <button
                        key={time}
                        type="button"
                        onClick={() => chooseTime(time)}
                        className="rounded-xl border px-2 py-2 text-center text-sm font-bold transition active:scale-[0.98]"
                        style={active ? selectedCardStyle : normalCardStyle}
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 text-sm opacity-70">{copy.noTimes}</div>
              )}
            </section>
          ) : null}

          {selectedService && selectedDate && selectedTime ? (
            <section
              ref={summarySectionRef}
              className="mt-3 scroll-mt-4 rounded-2xl border-2 p-4"
              style={selectedCardStyle}
            >
              <h3 className="text-lg font-bold">{copy.selected}</h3>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="font-semibold opacity-80">{copy.service}</dt>
                <dd className="font-bold">{serviceName(selectedService, lang)}</dd>
                <dt className="font-semibold opacity-80">{copy.date}</dt>
                <dd className="font-bold">{formatDate(selectedDate, lang)}</dd>
                <dt className="font-semibold opacity-80">{copy.time}</dt>
                <dd className="font-bold">{selectedTime}</dd>
              </dl>
              <div className="mt-4 rounded-xl bg-white/15 p-3 text-sm font-semibold">
                {copy.readOnlyNotice}
              </div>
              <button
                type="button"
                onClick={resetSelection}
                className="mt-3 rounded-xl border bg-white px-4 py-2 text-sm font-bold"
                style={{ borderColor: "white", color: "var(--stayhub-primary)" }}
              >
                {copy.reset}
              </button>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
