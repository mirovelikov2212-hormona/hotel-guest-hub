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
  availableTimes?: string[];
};

type ApiEnvelope<T> = {
  ok: boolean;
  result?: T;
  code?: string;
  error?: string;
};

type MassageBookingResult = {
  status: "BOOKING_WRITTEN" | "BOOKING_ALREADY_CONFIRMED";
  serviceId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  roomNumber: string;
  writeVerified: boolean;
  idempotentReplay: boolean;
};

type BookingFeedback = {
  kind: "info" | "success" | "error";
  text: string;
  code?: string;
} | null;

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

type MassageBootstrapResult = {
  fromDate: string;
  daysChecked: number;
  services: ServicesResult;
  availabilityByService: Record<string, BookableDatesResult>;
  readMode?: string;
  elapsedMs?: number;
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
  changeService: string;
  room: string;
  confirmedRoom: string;
  confirmRoomFirst: string;
  confirmBooking: string;
  sendingBooking: string;
  protectedServerReached: string;
  bookingSuccess: string;
  bookingAlreadyConfirmed: string;
  bookingConflict: string;
  bookingFailed: string;
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
    changeService: "Промени масажа",
    room: "Стая",
    confirmedRoom: "Потвърдена стая",
    confirmRoomFirst: "Потвърдете стаята първо",
    confirmBooking: "Потвърди резервацията",
    sendingBooking: "Изпращане…",
    protectedServerReached: "Защитеният тест достигна до сървъра. Реалното записване все още е изключено.",
    bookingSuccess: "Резервацията за масаж е потвърдена.",
    bookingAlreadyConfirmed: "Тази резервация вече е потвърдена.",
    bookingConflict: "Избраният час вече не е свободен. Изберете друг час.",
    bookingFailed: "Резервацията не можа да бъде изпратена. Опитайте отново.",
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
    changeService: "Change massage",
    room: "Room",
    confirmedRoom: "Confirmed room",
    confirmRoomFirst: "Confirm your room first",
    confirmBooking: "Confirm booking",
    sendingBooking: "Sending…",
    protectedServerReached: "The protected test reached the server. Real booking is still disabled.",
    bookingSuccess: "Your massage booking is confirmed.",
    bookingAlreadyConfirmed: "This booking is already confirmed.",
    bookingConflict: "The selected time is no longer available. Choose another time.",
    bookingFailed: "The booking could not be submitted. Please try again.",
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
    changeService: "Massage ändern",
    room: "Zimmer",
    confirmedRoom: "Bestätigtes Zimmer",
    confirmRoomFirst: "Bestätigen Sie zuerst Ihr Zimmer",
    confirmBooking: "Buchung bestätigen",
    sendingBooking: "Wird gesendet…",
    protectedServerReached: "Der geschützte Test hat den Server erreicht. Echte Buchungen sind noch deaktiviert.",
    bookingSuccess: "Ihre Massagebuchung wurde bestätigt.",
    bookingAlreadyConfirmed: "Diese Buchung ist bereits bestätigt.",
    bookingConflict: "Die gewählte Uhrzeit ist nicht mehr verfügbar. Wählen Sie eine andere Uhrzeit.",
    bookingFailed: "Die Buchung konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
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
    changeService: "Schimbați masajul",
    room: "Cameră",
    confirmedRoom: "Cameră confirmată",
    confirmRoomFirst: "Confirmați mai întâi camera",
    confirmBooking: "Confirmați rezervarea",
    sendingBooking: "Se trimite…",
    protectedServerReached: "Testul protejat a ajuns la server. Rezervarea reală este încă dezactivată.",
    bookingSuccess: "Rezervarea pentru masaj a fost confirmată.",
    bookingAlreadyConfirmed: "Această rezervare este deja confirmată.",
    bookingConflict: "Ora selectată nu mai este disponibilă. Alegeți altă oră.",
    bookingFailed: "Rezervarea nu a putut fi trimisă. Încercați din nou.",
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
    changeService: "Změnit masáž",
    room: "Pokoj",
    confirmedRoom: "Potvrzený pokoj",
    confirmRoomFirst: "Nejprve potvrďte pokoj",
    confirmBooking: "Potvrdit rezervaci",
    sendingBooking: "Odesílání…",
    protectedServerReached: "Chráněný test dorazil na server. Skutečné rezervace jsou zatím vypnuté.",
    bookingSuccess: "Rezervace masáže byla potvrzena.",
    bookingAlreadyConfirmed: "Tato rezervace je již potvrzena.",
    bookingConflict: "Vybraný čas již není dostupný. Zvolte jiný čas.",
    bookingFailed: "Rezervaci se nepodařilo odeslat. Zkuste to znovu.",
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
    changeService: "Изменить массаж",
    room: "Номер",
    confirmedRoom: "Подтверждённый номер",
    confirmRoomFirst: "Сначала подтвердите номер",
    confirmBooking: "Подтвердить бронирование",
    sendingBooking: "Отправка…",
    protectedServerReached: "Защищённый тест достиг сервера. Реальное бронирование пока отключено.",
    bookingSuccess: "Бронирование массажа подтверждено.",
    bookingAlreadyConfirmed: "Это бронирование уже подтверждено.",
    bookingConflict: "Выбранное время больше недоступно. Выберите другое время.",
    bookingFailed: "Не удалось отправить бронирование. Попробуйте ещё раз.",
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

const CACHE_TTL = {
  services: 30 * 60 * 1000,
  dates: 30 * 1000,
  times: 15 * 1000,
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

function readMassageCache<T>(key: string): T | null {
  const now = Date.now();
  const memoryEntry = memoryCache.get(key) as CacheEntry<T> | undefined;

  if (memoryEntry && memoryEntry.expiresAt > now) {
    return memoryEntry.value;
  }

  if (memoryEntry) {
    memoryCache.delete(key);
  }

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || parsed.expiresAt <= now) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    memoryCache.set(key, parsed as CacheEntry<unknown>);
    return parsed.value;
  } catch {
    return null;
  }
}

function writeMassageCache<T>(key: string, value: T, ttlMs: number) {
  const entry: CacheEntry<T> = {
    expiresAt: Date.now() + ttlMs,
    value,
  };

  memoryCache.set(key, entry as CacheEntry<unknown>);

  try {
    window.sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // The in-memory cache still works when sessionStorage is unavailable.
  }
}

function servicesCacheKey(hotelSlug: string) {
  return `stayhub:massage:v3:services:${hotelSlug}`;
}

function bootstrapCacheKey(hotelSlug: string, fromDate: string) {
  return `stayhub:massage:v3:bootstrap:${hotelSlug}:${fromDate}`;
}

function datesCacheKey(hotelSlug: string, serviceId: string, fromDate: string) {
  return `stayhub:massage:v3:dates:${hotelSlug}:${serviceId}:${fromDate}`;
}

function timesCacheKey(hotelSlug: string, serviceId: string, date: string) {
  return `stayhub:massage:v3:times:${hotelSlug}:${serviceId}:${date}`;
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
  room,
  roomConfirmed,
  protectedSubmissionEnabled = false,
  forceOpenToken = 0,
  onRequireRoomConfirmation,
  onTrack,
}: {
  hotelSlug: string;
  language: LangKey;
  room: string;
  roomConfirmed: boolean;
  protectedSubmissionEnabled?: boolean;
  forceOpenToken?: number;
  onRequireRoomConfirmation: () => void;
  onTrack: (payload: TrackHubPayload) => void;
}) {
  const lang = normalizeLanguage(language);
  const copy = COPY[lang];
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState<MassageService[]>([]);
  const [availabilityByService, setAvailabilityByService] = useState<Record<string, BookableDatesResult>>({});
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
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingFeedback, setBookingFeedback] = useState<BookingFeedback>(null);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const servicesLoadPromiseRef = useRef<Promise<void> | null>(null);

  const selectedService = useMemo(
    () => services.find((service) => service.serviceId === selectedServiceId) || null,
    [selectedServiceId, services]
  );

  const selectedDateInfo = useMemo(
    () => dates.find((item) => item.date === selectedDate) || null,
    [dates, selectedDate]
  );

  const sectionSubtitle = selectedService && !serviceStepExpanded
    ? `${serviceName(selectedService, lang)} · ${selectedService.durationMinutes} ${copy.minutes} · ${selectedService.price.toFixed(2)} ${selectedService.currency}`
    : copy.sectionSubtitle;

  const loadServices = useCallback((signal?: AbortSignal) => {
    if (servicesLoadPromiseRef.current) {
      return servicesLoadPromiseRef.current;
    }

    const task = (async () => {
      const fromDate = getSofiaIsoDate();
      const cacheKey = bootstrapCacheKey(hotelSlug, fromDate);
      const cached = readMassageCache<MassageBootstrapResult>(cacheKey);

      if (cached) {
        setServices(cached.services?.services || []);
        setAvailabilityByService(cached.availabilityByService || {});
        setServicesLoaded(true);
        return;
      }

      setLoadingServices(true);
      setError("");

      try {
        const result = await fetchMassageApi<MassageBootstrapResult>(
          new URLSearchParams({
            hotelSlug,
            action: "bootstrap",
            fromDate,
            daysAhead: "14",
          }),
          signal
        );

        const nextServices = result.services?.services || [];
        const nextAvailability = result.availabilityByService || {};

        setServices(nextServices);
        setAvailabilityByService(nextAvailability);
        setServicesLoaded(true);
        writeMassageCache(cacheKey, result, CACHE_TTL.dates);
        writeMassageCache(
          servicesCacheKey(hotelSlug),
          result.services,
          CACHE_TTL.services
        );

        for (const service of nextServices) {
          const serviceAvailability = nextAvailability[service.serviceId];
          if (!serviceAvailability) continue;

          writeMassageCache(
            datesCacheKey(hotelSlug, service.serviceId, fromDate),
            serviceAvailability,
            CACHE_TTL.dates
          );

          for (const item of serviceAvailability.dates || []) {
            if (!Array.isArray(item.availableTimes)) continue;
            writeMassageCache(
              timesCacheKey(hotelSlug, service.serviceId, item.date),
              item.availableTimes,
              CACHE_TTL.times
            );
          }
        }
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load massages.");
      } finally {
        setLoadingServices(false);
      }
    })().finally(() => {
      servicesLoadPromiseRef.current = null;
    });

    servicesLoadPromiseRef.current = task;
    return task;
  }, [hotelSlug]);

  // Warm the massage catalogue shortly after the Guest Hub mounts.
  // The first Apps Script call can have cold-start latency, so doing it in
  // the background makes the first visible section opening feel immediate.
  useEffect(() => {
    if (servicesLoaded) return;

    const timerId = window.setTimeout(() => {
      void loadServices();
    }, 180);

    return () => window.clearTimeout(timerId);
  }, [loadServices, servicesLoaded]);

  useEffect(() => {
    if (forceOpenToken <= 0) return;
    setOpen(true);
    window.setTimeout(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, [forceOpenToken]);

  const chooseService = async (serviceId: string) => {
    const fromDate = getSofiaIsoDate();
    const embedded = availabilityByService[serviceId] || null;
    const cached = readMassageCache<BookableDatesResult>(
      datesCacheKey(hotelSlug, serviceId, fromDate)
    );
    const available = embedded || cached;

    setSelectedServiceId(serviceId);
    setDates(available?.dates || []);
    setSelectedDate("");
    setTimes([]);
    setSelectedTime("");
    setServiceStepExpanded(false);
    setDateStepExpanded(true);
    setTimeStepExpanded(true);
    setLoadingDates(!available);
    setLoadingTimes(false);
    setError("");
    setBookingFeedback(null);
    setBookingConfirmed(false);

    onTrack({
      eventName: "massage_service_selected",
      eventCategory: "massage",
      section: "massage_booking",
      sectionKey: "massage_booking",
      itemKey: serviceId,
      label: serviceId,
      value: serviceId,
    });

    if (available) return;

    try {
      const result = await fetchMassageApi<BookableDatesResult>(
        new URLSearchParams({
          hotelSlug,
          action: "bookable_dates",
          serviceId,
          fromDate,
          daysAhead: "14",
        })
      );
      setDates(result.dates || []);
      setAvailabilityByService((current) => ({
        ...current,
        [serviceId]: result,
      }));
      writeMassageCache(
        datesCacheKey(hotelSlug, serviceId, fromDate),
        result,
        CACHE_TTL.dates
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dates.");
    } finally {
      setLoadingDates(false);
    }
  };

  const chooseDate = async (date: string) => {
    if (!selectedServiceId) return;

    const selectedDateOption = dates.find((item) => item.date === date);
    const cacheKey = timesCacheKey(hotelSlug, selectedServiceId, date);
    const embeddedTimes = Array.isArray(selectedDateOption?.availableTimes)
      ? selectedDateOption.availableTimes
      : null;
    const cachedTimes = readMassageCache<string[]>(cacheKey);
    const immediatelyAvailableTimes = embeddedTimes || cachedTimes;

    setSelectedDate(date);
    setTimes(immediatelyAvailableTimes || []);
    setSelectedTime("");
    setDateStepExpanded(false);
    setTimeStepExpanded(true);
    setLoadingTimes(!immediatelyAvailableTimes);
    setError("");
    setBookingFeedback(null);
    setBookingConfirmed(false);

    onTrack({
      eventName: "massage_date_selected",
      eventCategory: "massage",
      section: "massage_booking",
      sectionKey: "massage_booking",
      itemKey: selectedServiceId,
      label: date,
      value: date,
    });

    if (immediatelyAvailableTimes) {
      writeMassageCache(cacheKey, immediatelyAvailableTimes, CACHE_TTL.times);
      return;
    }

    try {
      const result = await fetchMassageApi<AvailabilityResult>(
        new URLSearchParams({
          hotelSlug,
          action: "availability",
          serviceId: selectedServiceId,
          date,
        })
      );
      const availableTimes = result.availableTimes || [];
      setTimes(availableTimes);
      writeMassageCache(cacheKey, availableTimes, CACHE_TTL.times);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load times.");
    } finally {
      setLoadingTimes(false);
    }
  };

  const chooseTime = (time: string) => {
    setSelectedTime(time);
    setTimeStepExpanded(false);
    setBookingFeedback(null);
    setBookingConfirmed(false);
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
    setBookingFeedback(null);
    setBookingConfirmed(false);
  };

  const submitBooking = async () => {
    if (!selectedService || !selectedDate || !selectedTime || submittingBooking) return;

    if (!roomConfirmed || !room.trim()) {
      setBookingFeedback({ kind: "info", text: copy.confirmRoomFirst, code: "ROOM_NOT_CONFIRMED" });
      onTrack({
        eventName: "massage_room_confirmation_required",
        eventCategory: "massage",
        section: "massage_booking",
        sectionKey: "massage_booking",
        itemKey: selectedService.serviceId,
        label: "room_not_confirmed",
        value: selectedTime,
        extra: { date: selectedDate },
      });
      onRequireRoomConfirmation();
      return;
    }

    if (!protectedSubmissionEnabled) {
      setBookingFeedback({ kind: "info", text: copy.readOnlyNotice, code: "PROTECTED_SUBMISSION_DISABLED" });
      return;
    }

    setSubmittingBooking(true);
    setBookingFeedback(null);

    onTrack({
      eventName: "massage_booking_submit_clicked",
      eventCategory: "massage",
      section: "massage_booking",
      sectionKey: "massage_booking",
      itemKey: selectedService.serviceId,
      label: selectedTime,
      value: selectedService.serviceId,
      extra: { date: selectedDate, room },
    });

    try {
      const response = await fetch("/api/guest/massages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          hotelSlug,
          serviceId: selectedService.serviceId,
          date: selectedDate,
          time: selectedTime,
          room,
          roomConfirmed: true,
          guestLanguage: lang,
        }),
      });

      const payload = (await response.json().catch(() => null)) as ApiEnvelope<MassageBookingResult> | null;

      if (response.ok && payload?.ok && payload.result) {
        const alreadyConfirmed = payload.result.status === "BOOKING_ALREADY_CONFIRMED";
        setBookingConfirmed(true);
        setBookingFeedback({
          kind: "success",
          text: alreadyConfirmed ? copy.bookingAlreadyConfirmed : copy.bookingSuccess,
          code: payload.result.status,
        });
        onTrack({
          eventName: alreadyConfirmed ? "massage_booking_already_confirmed" : "massage_booking_submitted",
          eventCategory: "massage",
          section: "massage_booking",
          sectionKey: "massage_booking",
          itemKey: selectedService.serviceId,
          label: selectedTime,
          value: payload.result.status,
          extra: { date: selectedDate, room },
        });
        return;
      }

      const code = String(payload?.code || "MASSAGE_BOOKING_FAILED");
      let text = payload?.error || copy.bookingFailed;
      let kind: "info" | "error" = "error";

      if (code === "MASSAGE_BOOKING_POST_DISABLED" || code === "MASSAGE_CALENDAR_WRITE_DISABLED") {
        kind = "info";
        text = copy.protectedServerReached;
      } else if (code === "ROOM_NOT_CONFIRMED") {
        kind = "info";
        text = copy.confirmRoomFirst;
        onRequireRoomConfirmation();
      } else if (code === "SLOT_NO_LONGER_AVAILABLE") {
        text = copy.bookingConflict;
      }

      setBookingFeedback({ kind, text, code });
      onTrack({
        eventName: "massage_booking_submit_rejected",
        eventCategory: "massage",
        section: "massage_booking",
        sectionKey: "massage_booking",
        itemKey: selectedService.serviceId,
        label: code,
        value: selectedTime,
        extra: { date: selectedDate, room, code },
      });
    } catch {
      setBookingFeedback({ kind: "error", text: copy.bookingFailed, code: "NETWORK_ERROR" });
      onTrack({
        eventName: "massage_booking_submit_failed",
        eventCategory: "massage",
        section: "massage_booking",
        sectionKey: "massage_booking",
        itemKey: selectedService.serviceId,
        label: "network_error",
        value: selectedTime,
        extra: { date: selectedDate, room },
      });
    } finally {
      setSubmittingBooking(false);
    }
  };

  return (
    <div ref={sectionRef} id="stayhub-massage-booking" className="scroll-mt-4 rounded-2xl overflow-hidden stayhub-section-shell">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && !servicesLoaded) {
            void loadServices();
          }
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
          <div className="mt-1 text-xs opacity-85">{sectionSubtitle}</div>
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

          <section
            className="rounded-2xl border p-3"
            style={{
              borderColor: "var(--stayhub-action)",
              backgroundColor: "var(--stayhub-soft)",
              color: "#202627",
            }}
            aria-busy={loadingServices || loadingDates}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold">{copy.chooseService}</h3>
              {selectedService && !serviceStepExpanded ? (
                <button
                  type="button"
                  onClick={() => setServiceStepExpanded(true)}
                  className="rounded-full border bg-white px-3 py-1 text-xs font-bold"
                  style={{ borderColor: "var(--stayhub-action)", color: "var(--stayhub-primary)" }}
                >
                  {copy.changeService}
                </button>
              ) : null}
            </div>

            {selectedService && !serviceStepExpanded ? (
              <div className="mt-3 rounded-xl border p-3" style={selectedCardStyle}>
                <div className="font-bold">{serviceName(selectedService, lang)}</div>
                <div className="mt-1 text-xs opacity-90">
                  {copy.duration}: {selectedService.durationMinutes} {copy.minutes} · {copy.price}: {selectedService.price.toFixed(2)} {selectedService.currency}
                </div>
                {loadingDates ? (
                  <div className="mt-2 text-xs font-semibold opacity-90">{copy.loading}</div>
                ) : null}
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
              className="mt-3 rounded-2xl border p-3"
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
              className="mt-3 rounded-2xl border p-3"
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
              className="mt-3 rounded-2xl border-2 p-4"
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
                <dt className="font-semibold opacity-80">{copy.duration}</dt>
                <dd className="font-bold">{selectedService.durationMinutes} {copy.minutes}</dd>
                <dt className="font-semibold opacity-80">{copy.price}</dt>
                <dd className="font-bold">{selectedService.price.toFixed(2)} {selectedService.currency}</dd>
                <dt className="font-semibold opacity-80">{copy.room}</dt>
                <dd className="font-bold">
                  {roomConfirmed && room.trim() ? `${copy.confirmedRoom}: ${room}` : copy.confirmRoomFirst}
                </dd>
              </dl>


              {bookingFeedback ? (
                <div
                  className={`mt-3 rounded-xl border p-3 text-sm font-semibold ${
                    bookingFeedback.kind === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : bookingFeedback.kind === "error"
                        ? "border-red-200 bg-red-50 text-red-900"
                        : "border-sky-200 bg-sky-50 text-sky-900"
                  }`}
                  role="status"
                >
                  {bookingFeedback.text}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void submitBooking()}
                disabled={submittingBooking || bookingConfirmed}
                className="mt-3 w-full rounded-xl border bg-white px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
                style={{ borderColor: "white", color: "var(--stayhub-primary)" }}
              >
                {submittingBooking
                  ? copy.sendingBooking
                  : roomConfirmed && room.trim()
                    ? copy.confirmBooking
                    : copy.confirmRoomFirst}
              </button>

              <button
                type="button"
                onClick={resetSelection}
                className="mt-2 w-full rounded-xl border border-white/60 bg-transparent px-4 py-2 text-sm font-bold text-white"
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
