"use client";

import { useMemo, useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";
import {
  FACTORY_STANDARD_CATALOG_VERSION,
  FACTORY_STANDARD_CORE_SERVICES,
} from "@/lib/product-factory/factory-standard-catalog.mjs";
import { FACTORY_COMMON_LANGUAGE_OPTIONS } from "@/lib/product-factory/factory-language-options.mjs";
import FactoryNativeContentStep, {
  buildFactoryNativeBlueprintInput,
  createEmptyNativeSetupDraft,
  type NativeSetupDraft,
  validateNativeSetupDraft,
} from "@/app/control-plane/factory/new/FactoryNativeContentStep";

type DepartmentId = "reception" | "housekeeping" | "maintenance" | "restaurant" | "spa";
type DepartmentContactDraft = { phone: string; whatsapp: string; email: string };
type LocationAuthority = {
  query: string;
  displayName: string;
  latitude: number;
  longitude: number;
  timezone: string;
  countryCode: string;
  provider: "google_maps" | "open_meteo";
};
type LocationResolutionResult = {
  ok?: boolean;
  error?: string;
  location?: LocationAuthority;
};
type ServiceTemplate = {
  id: string;
  departmentId: DepartmentId;
  title: Record<string, string>;
  description: Record<string, string>;
  staffLabel: Record<string, string>;
  success: Record<string, string>;
  starterDefault?: boolean;
  requestKind?: string;
  requiresNote?: boolean;
  requiresQuantity?: boolean;
  minQty?: number;
  maxQty?: number;
  requiresTime?: boolean;
  timeMode?: string;
  aiVisible?: boolean;
  intentTags?: readonly string[];
};
type PreflightResult = {
  ok?: boolean;
  error?: string;
  blueprintHash?: string;
  identities?: {
    productionSlug: string;
    productionPublicSlug: string;
    sandboxSlug: string;
    sandboxPublicSlug: string;
  };
};
type FoundationResult = {
  ok?: boolean;
  error?: string;
  replayed?: boolean;
  onboardingRunId?: string;
  propertyId?: string;
  productionHotelId?: string;
  sandboxHotelId?: string;
};

const LANGUAGES = FACTORY_COMMON_LANGUAGE_OPTIONS.map(
  (item) => [item.code, item.nativeName, item.englishName] as const,
);

const COUNTRIES = [
  ["BG", "България", "Bulgaria"],
  ["DE", "Германия", "Germany"],
  ["GR", "Гърция", "Greece"],
  ["TR", "Турция", "Türkiye"],
  ["ES", "Испания", "Spain"],
  ["RO", "Румъния", "Romania"],
  ["CZ", "Чехия", "Czechia"],
  ["AT", "Австрия", "Austria"],
  ["CH", "Швейцария", "Switzerland"],
  ["FR", "Франция", "France"],
  ["IT", "Италия", "Italy"],
  ["NL", "Нидерландия", "Netherlands"],
  ["PL", "Полша", "Poland"],
  ["GB", "Великобритания", "United Kingdom"],
] as const;

const DEPARTMENTS: Array<{
  id: DepartmentId;
  bg: string;
  en: string;
  icon: string;
  helpBg: string;
  helpEn: string;
}> = [
  { id: "reception", bg: "Рецепция", en: "Reception", icon: "◈", helpBg: "Общи заявки и контакт с гостите", helpEn: "General requests and guest contact" },
  { id: "housekeeping", bg: "Камериерски екип", en: "Housekeeping", icon: "✦", helpBg: "Кърпи, възглавници, почистване", helpEn: "Towels, pillows and cleaning" },
  { id: "maintenance", bg: "Поддръжка", en: "Maintenance", icon: "⌁", helpBg: "Технически проблеми", helpEn: "Technical room issues" },
  { id: "restaurant", bg: "Ресторант", en: "Restaurant", icon: "◌", helpBg: "Ресторант и F&B заявки", helpEn: "Restaurant and F&B requests" },
  { id: "spa", bg: "SPA", en: "SPA", icon: "◇", helpBg: "SPA и wellness заявки", helpEn: "SPA and wellness requests" },
];

const CORE_SERVICES: ServiceTemplate[] = FACTORY_STANDARD_CORE_SERVICES
  .filter((service) => DEPARTMENTS.some((department) => department.id === service.departmentId))
  .map((service) => ({ ...service, departmentId: service.departmentId as DepartmentId }));

const DEFAULT_DEPARTMENTS: DepartmentId[] = ["reception", "housekeeping", "maintenance"];
const DEFAULT_SERVICE_IDS = CORE_SERVICES
  .filter(
    (service) =>
      DEFAULT_DEPARTMENTS.includes(service.departmentId) && service.starterDefault === true,
  )
  .map((service) => service.id);

const EMPTY_CONTACTS: Record<DepartmentId, DepartmentContactDraft> = {
  reception: { phone: "", whatsapp: "", email: "" },
  housekeeping: { phone: "", whatsapp: "", email: "" },
  maintenance: { phone: "", whatsapp: "", email: "" },
  restaurant: { phone: "", whatsapp: "", email: "" },
  spa: { phone: "", whatsapp: "", email: "" },
};

const COPY = {
  bg: {
    steps: ["Хотел", "Стаи и езици", "Екипи", "Услуги", "Native съдържание", "Контакти", "Преглед"],
    hero: "Създай тестов Hub за минути",
    heroHelp: "Без технически IDs, без код и без риск за Production.",
    hotelTitle: "Разкажи ни за хотела",
    hotelHelp: "Само основните данни. StayHub генерира техническата конфигурация автоматично.",
    hotelName: "Име на хотела",
    hotelPlaceholder: "Sunny Castle Hotel",
    country: "Държава",
    location: "Локация на хотела",
    locationHelp: "Въведи хотел, адрес, град, курорт или пощенски код. StayHub ще намери координатите и часовата зона автоматично.",
    locationPlaceholder: "Hotel Aquamarine, Kranevo",
    resolvedLocation: "Потвърдена локация",
    resolvingLocation: "Проверка на локацията…",
    locationFailed: "Локацията не беше намерена еднозначно. Провери текста и държавата.",
    timezone: "Часова зона",
    auto: "автоматично",
    roomsTitle: "Стаи и езици",
    roomsHelp: "За тест може да добавиш само 3–5 стаи.",
    languages: "Езици за гостите",
    roomMode: "Добавяне на стаи",
    range: "Диапазон",
    list: "Списък",
    first: "Първа стая",
    last: "Последна стая",
    roomList: "Стаи — по една на ред",
    roomCount: "Брой стаи",
    teamsTitle: "Кои екипи ще използват StayHub?",
    teamsHelp: "Рецепция е включена винаги. Останалите са по избор.",
    required: "задължително",
    servicesTitle: "Какво могат да заявяват гостите?",
    servicesHelp: "Избираш услуга, StayHub сам я насочва към правилния екип.",
    contactsTitle: "Как гостите да се свързват с екипите?",
    contactsHelp: "Добави телефон, WhatsApp и/или email за избраните екипи. Полетата са по избор и се използват като guest-facing контакти.",
    phone: "Телефон",
    whatsapp: "WhatsApp",
    email: "Email",
    configuredContacts: "Екипи с контакт",
    reviewTitle: "Преглед на тестовия Hub",
    reviewHelp: "Нищо няма да стане LIVE. Първо създаваме безопасен draft.",
    hotel: "Хотел",
    rooms: "Стаи",
    teams: "Екипи",
    services: "Услуги",
    native: "Native съдържание",
    contacts: "Контакти",
    validate: "Провери конфигурацията",
    validating: "Проверка…",
    ready: "Конфигурацията е валидна",
    confirm: "Потвърждавам създаването на тестов draft. Production и Sandbox остават неактивни.",
    create: "Създай тестов хотел",
    creating: "Създаване…",
    success: "Хотелът е създаден успешно",
    successHelp: "Production и Sandbox са създадени, но остават безопасно неактивни.",
    technical: "Технически детайли",
    next: "Напред",
    back: "Назад",
    invalid: "Провери задължителните полета.",
    preflightFailed: "Конфигурацията не мина проверката. Нищо не е създадено.",
    createFailed: "Хотелът не можа да бъде създаден. Нищо не е активирано.",
    conflict: "Такъв hotel slug вече съществува. Използвай друго тестово име или Advanced mode.",
  },
  en: {
    steps: ["Hotel", "Rooms & languages", "Teams", "Services", "Native content", "Contacts", "Review"],
    hero: "Create a test Hub in minutes",
    heroHelp: "No technical IDs, no code and no Production risk.",
    hotelTitle: "Tell us about the hotel",
    hotelHelp: "Only the essentials. StayHub generates the technical configuration automatically.",
    hotelName: "Hotel name",
    hotelPlaceholder: "Sunny Castle Hotel",
    country: "Country",
    location: "Hotel location",
    locationHelp: "Enter a hotel, address, city, resort or postal code. StayHub resolves coordinates and timezone automatically.",
    locationPlaceholder: "Hotel Aquamarine, Kranevo",
    resolvedLocation: "Resolved location",
    resolvingLocation: "Resolving location…",
    locationFailed: "The location could not be resolved unambiguously. Check the text and country.",
    timezone: "Timezone",
    auto: "automatic",
    roomsTitle: "Rooms and languages",
    roomsHelp: "For a test, 3–5 rooms are enough.",
    languages: "Guest languages",
    roomMode: "Add rooms",
    range: "Range",
    list: "List",
    first: "First room",
    last: "Last room",
    roomList: "Rooms — one per line",
    roomCount: "Room count",
    teamsTitle: "Which teams will use StayHub?",
    teamsHelp: "Reception is always enabled. Everything else is optional.",
    required: "required",
    servicesTitle: "What can guests request?",
    servicesHelp: "Choose a service and StayHub routes it to the right team automatically.",
    contactsTitle: "How can guests contact the teams?",
    contactsHelp: "Add a phone number, WhatsApp and/or email for the selected teams. All fields are optional and are used as guest-facing contacts.",
    phone: "Phone",
    whatsapp: "WhatsApp",
    email: "Email",
    configuredContacts: "Teams with contact",
    reviewTitle: "Review your test Hub",
    reviewHelp: "Nothing becomes LIVE. We create a safe draft first.",
    hotel: "Hotel",
    rooms: "Rooms",
    teams: "Teams",
    services: "Services",
    native: "Native content",
    contacts: "Contacts",
    validate: "Check configuration",
    validating: "Checking…",
    ready: "Configuration is valid",
    confirm: "I confirm creation of a test draft. Production and Sandbox remain inactive.",
    create: "Create test hotel",
    creating: "Creating…",
    success: "Hotel created successfully",
    successHelp: "Production and Sandbox were created but remain safely inactive.",
    technical: "Technical details",
    next: "Next",
    back: "Back",
    invalid: "Check the required fields.",
    preflightFailed: "The configuration did not pass validation. Nothing was created.",
    createFailed: "The hotel could not be created. Nothing was activated.",
    conflict: "This hotel slug already exists. Use another test name or Advanced mode.",
  },
} as const;

const field = "mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base text-white outline-none backdrop-blur transition placeholder:text-neutral-600 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/10";

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-hotel$/, "");

const validEmail = (value: string) =>
  !value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export default function HotelManagerOnboardingWizardV2({ lang }: { lang: ControlPlaneLang }) {
  const copy = COPY[lang];
  const [step, setStep] = useState(0);
  const [hotelName, setHotelName] = useState("");
  const [countryCode, setCountryCode] = useState("BG");
  const [locationQuery, setLocationQuery] = useState("");
  const [resolvedLocation, setResolvedLocation] = useState<LocationAuthority | null>(null);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const [roomMode, setRoomMode] = useState<"range" | "explicit">("explicit");
  const [rangeStart, setRangeStart] = useState("101");
  const [rangeEnd, setRangeEnd] = useState("105");
  const [explicitRooms, setExplicitRooms] = useState("SC-T01\nSC-T02\nSC-T03");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(["bg", "en"]);
  const [selectedDepartments, setSelectedDepartments] = useState<DepartmentId[]>(() => [...DEFAULT_DEPARTMENTS]);
  const [selectedServices, setSelectedServices] = useState<string[]>(() => [...DEFAULT_SERVICE_IDS]);
  const [nativeSetup, setNativeSetup] = useState<NativeSetupDraft>(() => createEmptyNativeSetupDraft());
  const [departmentContacts, setDepartmentContacts] = useState<Record<DepartmentId, DepartmentContactDraft>>(() => ({
    reception: { ...EMPTY_CONTACTS.reception },
    housekeeping: { ...EMPTY_CONTACTS.housekeeping },
    maintenance: { ...EMPTY_CONTACTS.maintenance },
    restaurant: { ...EMPTY_CONTACTS.restaurant },
    spa: { ...EMPTY_CONTACTS.spa },
  }));
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightJson, setPreflightJson] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<FoundationResult | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => `hotel-factory-manager:${crypto.randomUUID()}`);

  const hotelSlug = slugify(hotelName);
  const roomList = useMemo(
    () => explicitRooms.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
    [explicitRooms],
  );
  const roomCount = roomMode === "explicit"
    ? new Set(roomList).size
    : Math.max(0, Number(rangeEnd) - Number(rangeStart) + 1);
  const nativeBlueprint = useMemo(
    () => buildFactoryNativeBlueprintInput(nativeSetup, selectedLanguages),
    [nativeSetup, selectedLanguages],
  );

  const blueprint = useMemo(() => ({
    version: 1,
    organization: { id: hotelSlug ? `${hotelSlug}-org` : "", name: hotelName.trim() },
    property: {
      slug: hotelSlug,
      publicSlug: hotelSlug,
      name: hotelName.trim(),
      countryCode,
      timezone: resolvedLocation?.timezone || "",
      location: resolvedLocation ? {
        query: locationQuery.trim(),
        displayName: resolvedLocation.displayName,
        latitude: resolvedLocation.latitude,
        longitude: resolvedLocation.longitude,
        lat: resolvedLocation.latitude,
        lng: resolvedLocation.longitude,
      } : { query: locationQuery.trim() },
      locales: selectedLanguages,
      roomCount,
      roomInventory: roomMode === "range"
        ? { ranges: [{ start: Number(rangeStart), end: Number(rangeEnd), padTo: 0, prefix: "", suffix: "" }] }
        : { explicit: roomList.map((number) => ({ number })) },
    },
    environment: { production: true, sandbox: true },
    departments: selectedDepartments.map((id) => {
      const contact = departmentContacts[id];
      const contactPayload = {
        phone: contact.phone.trim(),
        whatsapp: contact.whatsapp.trim(),
        email: contact.email.trim(),
      };
      if (id === "reception") return { id, name: "Reception", hours: { is24h: true }, contact: contactPayload };
      if (id === "housekeeping") return { id, name: "Housekeeping", hours: { open: "07:00", close: "17:00" }, afterHoursDepartmentId: "reception", contact: contactPayload };
      if (id === "maintenance") return { id, name: "Maintenance", hours: { open: "07:00", close: "17:00" }, afterHoursDepartmentId: "reception", contact: contactPayload };
      if (id === "restaurant") return { id, name: "Restaurant", hours: { open: "07:00", close: "22:00" }, contact: contactPayload };
      return { id, name: "SPA", hours: { open: "09:00", close: "20:00" }, contact: contactPayload };
    }),
    integrations: [],
    workflows: [],
    services: CORE_SERVICES
      .filter(
        (service) =>
          selectedServices.includes(service.id) && selectedDepartments.includes(service.departmentId),
      )
      .map((service) => ({
        id: service.id,
        name: service.title.en,
        mode: "configurable",
        departmentId: service.departmentId,
        priorityDefault: "normal",
        catalogRef: service.id,
        catalogVersion: FACTORY_STANDARD_CATALOG_VERSION,
        title: { ...service.title },
        description: { ...service.description },
        staffLabel: { ...service.staffLabel },
        success: { ...service.success },
        requestKind: service.requestKind || "standard",
        requiresNote: Boolean(service.requiresNote),
        requiresQuantity: Boolean(service.requiresQuantity),
        ...(typeof service.minQty === "number" ? { minQty: service.minQty } : {}),
        ...(typeof service.maxQty === "number" ? { maxQty: service.maxQty } : {}),
        requiresTime: Boolean(service.requiresTime),
        timeMode: service.timeMode || "none",
        aiVisible: Boolean(service.aiVisible),
        intentTags: [...(service.intentTags || [service.id])],
      })),
    nativeContent: nativeBlueprint.nativeContent,
    venues: nativeBlueprint.venues,
  }), [
    hotelSlug,
    hotelName,
    countryCode,
    locationQuery,
    resolvedLocation,
    selectedLanguages,
    roomCount,
    roomMode,
    rangeStart,
    rangeEnd,
    roomList,
    selectedDepartments,
    selectedServices,
    departmentContacts,
    nativeBlueprint,
  ]);

  const blueprintJson = JSON.stringify(blueprint);
  const preflightCurrent = Boolean(
    preflight?.ok && preflight?.blueprintHash && preflightJson === blueprintJson,
  );
  const configuredContactCount = selectedDepartments.filter((id) => {
    const contact = departmentContacts[id];
    return Boolean(contact.phone.trim() || contact.whatsapp.trim() || contact.email.trim());
  }).length;

  function invalidate() {
    setPreflight(null);
    setPreflightJson(null);
    setConfirmed(false);
    setResult(null);
    setFeedback(null);
  }

  function invalidateLocationAuthority() {
    setResolvedLocation(null);
    invalidate();
  }

  function toggleLanguage(id: string) {
    setSelectedLanguages((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
    invalidate();
  }

  function toggleDepartment(id: DepartmentId) {
    if (id === "reception") return;
    const enabling = !selectedDepartments.includes(id);
    setSelectedDepartments((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
    setSelectedServices((items) => {
      if (!enabling) {
        return items.filter((serviceId) => {
          const service = CORE_SERVICES.find((candidate) => candidate.id === serviceId);
          return service ? service.departmentId !== id : false;
        });
      }
      const recommended = CORE_SERVICES
        .filter((service) => service.departmentId === id && service.starterDefault === true)
        .map((service) => service.id);
      return [...new Set([...items, ...recommended])];
    });
    invalidate();
  }

  function toggleService(id: string) {
    setSelectedServices((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
    invalidate();
  }

  function patchContact(id: DepartmentId, patch: Partial<DepartmentContactDraft>) {
    setDepartmentContacts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
    invalidate();
  }

  function canAdvance() {
    setFeedback(null);
    if (step === 0 && (!hotelName.trim() || !hotelSlug || !countryCode || !locationQuery.trim() || !resolvedLocation)) return false;
    if (step === 1 && (!roomCount || !selectedLanguages.length)) return false;
    if (step === 4 && !validateNativeSetupDraft(nativeSetup, selectedLanguages)) return false;
    if (step === 5 && selectedDepartments.some((id) => {
      const contact = departmentContacts[id];
      return contact.phone.trim().length > 160
        || contact.whatsapp.trim().length > 160
        || contact.email.trim().length > 320
        || !validEmail(contact.email);
    })) return false;
    return true;
  }

  async function resolveLocationAuthority() {
    if (!locationQuery.trim() || !countryCode) return null;

    setResolvingLocation(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/control-plane/onboarding/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: locationQuery.trim(), countryCode }),
      });
      const payload = (await response.json().catch(() => ({}))) as LocationResolutionResult;
      if (!response.ok || !payload.ok || !payload.location) {
        setResolvedLocation(null);
        setFeedback(copy.locationFailed);
        return null;
      }
      setResolvedLocation(payload.location);
      return payload.location;
    } catch {
      setResolvedLocation(null);
      setFeedback(copy.locationFailed);
      return null;
    } finally {
      setResolvingLocation(false);
    }
  }

  async function advanceStep() {
    setFeedback(null);
    if (step === 0) {
      if (!hotelName.trim() || !hotelSlug || !countryCode || !locationQuery.trim()) {
        setFeedback(copy.invalid);
        return;
      }
      const location = resolvedLocation || await resolveLocationAuthority();
      if (!location) return;
      setStep(1);
      return;
    }

    if (canAdvance()) setStep((value) => Math.min(6, value + 1));
    else setFeedback(copy.invalid);
  }

  async function runPreflight() {
    setValidating(true);
    setFeedback(null);
    setPreflight(null);
    setPreflightJson(null);
    setConfirmed(false);
    try {
      const response = await fetch("/api/control-plane/onboarding/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blueprint }),
      });
      const payload = (await response.json().catch(() => ({}))) as PreflightResult;
      if (!response.ok || !payload.ok) {
        setFeedback(copy.preflightFailed);
        return;
      }
      setPreflight(payload);
      setPreflightJson(blueprintJson);
    } catch {
      setFeedback(copy.preflightFailed);
    } finally {
      setValidating(false);
    }
  }

  async function createHotel() {
    if (!confirmed || creating || !preflightCurrent || !preflight?.blueprintHash) return;
    setCreating(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/control-plane/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          expectedBlueprintHash: preflight.blueprintHash,
          approval: {
            createDraftTenant: true,
            keepProductionInactive: true,
            keepSandboxInactive: true,
            publishRevision: false,
            activateLive: false,
          },
          blueprint,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as FoundationResult;
      if (!response.ok || !payload.ok) {
        setFeedback(payload.error === "conflict" ? copy.conflict : copy.createFailed);
        return;
      }
      setResult(payload);
    } catch {
      setFeedback(copy.createFailed);
    } finally {
      setCreating(false);
    }
  }

  const teamLabels = selectedDepartments.map((id) => {
    const department = DEPARTMENTS.find((item) => item.id === id);
    return department ? (lang === "bg" ? department.bg : department.en) : id;
  });
  const languageLabels = selectedLanguages.map((id) => {
    const language = LANGUAGES.find((item) => item[0] === id);
    return language ? (lang === "bg" ? language[1] : language[2]) : id;
  });
  const serviceLabels = CORE_SERVICES
    .filter(
      (service) => selectedServices.includes(service.id) && selectedDepartments.includes(service.departmentId),
    )
    .map((service) => service.title[lang] || service.title.en || service.id);
  const serviceGroups = selectedDepartments.map((departmentId) => {
    const department = DEPARTMENTS.find((item) => item.id === departmentId) || DEPARTMENTS[0];
    const departmentServices = CORE_SERVICES.filter((service) => service.departmentId === departmentId);
    return {
      department,
      recommended: departmentServices.filter((service) => service.starterDefault === true),
      optional: departmentServices.filter((service) => service.starterDefault !== true),
    };
  });

  function renderServiceOption(service: ServiceTemplate) {
    const active = selectedServices.includes(service.id);
    const detail = service.description[lang] || service.description.en || "";
    const traits = [
      service.requiresQuantity ? (lang === "bg" ? "брой" : "quantity") : null,
      service.requiresTime ? (lang === "bg" ? "час" : "time") : null,
      service.requiresNote ? (lang === "bg" ? "детайли" : "details") : null,
    ].filter(Boolean);
    return (
      <button
        key={service.id}
        type="button"
        onClick={() => toggleService(service.id)}
        className={`rounded-2xl border p-4 text-left transition ${active ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/5 bg-black/20 hover:border-white/15"}`}
      >
        <div className="flex items-start justify-between gap-3">
          <p className={active ? "font-semibold text-cyan-50" : "font-semibold text-neutral-300"}>
            {active ? "✓ " : ""}{service.title[lang] || service.title.en}
          </p>
          {traits.length > 0 && (
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-neutral-600">
              {traits.join(" · ")}
            </span>
          )}
        </div>
        {detail && <p className="mt-2 text-xs leading-5 text-neutral-500">{detail}</p>}
      </button>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-neutral-900/90 p-5 shadow-[0_30px_120px_rgba(6,182,212,0.08)] backdrop-blur sm:p-7">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />
      <div className="relative">
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/70">StayHub Smart Setup</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{copy.hero}</h2>
            <p className="mt-2 text-sm text-neutral-400">{copy.heroHelp}</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-neutral-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]" /> SAFE DRAFT MODE
          </div>
        </div>

        <div className="mb-7 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
          {copy.steps.map((label, index) => (
            <div
              key={label}
              className={`rounded-2xl border px-3 py-3 text-xs transition ${index === step ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100 shadow-[inset_0_0_24px_rgba(34,211,238,.06)]" : index < step ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-200" : "border-white/5 bg-black/20 text-neutral-500"}`}
            >
              <span className="mr-2 font-mono">{String(index + 1).padStart(2, "0")}</span>{label}
            </div>
          ))}
        </div>

        {step === 0 && (
          <Panel title={copy.hotelTitle} help={copy.hotelHelp}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-neutral-300">
                {copy.hotelName}
                <input value={hotelName} onChange={(event) => { setHotelName(event.target.value); invalidate(); }} placeholder={copy.hotelPlaceholder} className={field} />
              </label>
              <label className="text-sm text-neutral-300">
                {copy.country}
                <select value={countryCode} onChange={(event) => { setCountryCode(event.target.value); invalidateLocationAuthority(); }} className={field}>
                  {COUNTRIES.map((item) => <option key={item[0]} value={item[0]}>{lang === "bg" ? item[1] : item[2]}</option>)}
                </select>
              </label>
              <label className="text-sm text-neutral-300 sm:col-span-2">
                {copy.location}
                <input
                  value={locationQuery}
                  onChange={(event) => { setLocationQuery(event.target.value); invalidateLocationAuthority(); }}
                  placeholder={copy.locationPlaceholder}
                  maxLength={240}
                  className={field}
                />
                <span className="mt-2 block text-xs leading-5 text-neutral-500">{copy.locationHelp}</span>
              </label>
            </div>
            {resolvedLocation && (
              <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-100">
                ✓ {copy.resolvedLocation}: {resolvedLocation.displayName}
              </div>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Metric label={copy.resolvedLocation} value={resolvedLocation?.displayName || "—"} />
              <Metric label={copy.timezone} value={resolvedLocation ? `${resolvedLocation.timezone} · ${copy.auto}` : "—"} />
              <Metric label="Hub URL" value={hotelSlug ? `/h/${hotelSlug}` : "—"} />
            </div>
          </Panel>
        )}

        {step === 1 && (
          <Panel title={copy.roomsTitle} help={copy.roomsHelp}>
            <p className="mb-3 text-sm font-medium text-neutral-300">{copy.languages}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {LANGUAGES.map((language) => {
                const active = selectedLanguages.includes(language[0]);
                return <Choice key={language[0]} active={active} onClick={() => toggleLanguage(language[0])} title={`${active ? "✓ " : ""}${lang === "bg" ? language[1] : language[2]}`} />;
              })}
            </div>
            <div className="mt-6">
              <p className="mb-3 text-sm font-medium text-neutral-300">{copy.roomMode}</p>
              <div className="flex gap-2">
                <Choice compact active={roomMode === "range"} onClick={() => { setRoomMode("range"); invalidate(); }} title={copy.range} />
                <Choice compact active={roomMode === "explicit"} onClick={() => { setRoomMode("explicit"); invalidate(); }} title={copy.list} />
              </div>
            </div>
            {roomMode === "range" ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-neutral-300">{copy.first}<input inputMode="numeric" value={rangeStart} onChange={(event) => { setRangeStart(event.target.value.replace(/\D/g, "")); invalidate(); }} className={field} /></label>
                <label className="text-sm text-neutral-300">{copy.last}<input inputMode="numeric" value={rangeEnd} onChange={(event) => { setRangeEnd(event.target.value.replace(/\D/g, "")); invalidate(); }} className={field} /></label>
              </div>
            ) : (
              <label className="mt-4 block text-sm text-neutral-300">{copy.roomList}<textarea rows={6} value={explicitRooms} onChange={(event) => { setExplicitRooms(event.target.value); invalidate(); }} className={`${field} font-mono`} /></label>
            )}
            <div className="mt-4"><Metric label={copy.roomCount} value={String(roomCount)} /></div>
          </Panel>
        )}

        {step === 2 && (
          <Panel title={copy.teamsTitle} help={copy.teamsHelp}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DEPARTMENTS.map((department) => {
                const active = selectedDepartments.includes(department.id);
                return (
                  <button key={department.id} type="button" onClick={() => toggleDepartment(department.id)} className={`group rounded-3xl border p-5 text-left transition ${active ? "border-cyan-300/40 bg-cyan-300/10 shadow-[0_12px_40px_rgba(6,182,212,.07)]" : "border-white/5 bg-black/20 hover:border-white/15"}`}>
                    <div className="flex items-start justify-between">
                      <span className={`text-2xl ${active ? "text-cyan-200" : "text-neutral-600"}`}>{department.icon}</span>
                      {department.id === "reception" && <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-neutral-500">{copy.required}</span>}
                    </div>
                    <p className={`mt-5 font-semibold ${active ? "text-cyan-50" : "text-neutral-300"}`}>{active ? "✓ " : ""}{lang === "bg" ? department.bg : department.en}</p>
                    <p className="mt-2 text-xs leading-5 text-neutral-500">{lang === "bg" ? department.helpBg : department.helpEn}</p>
                  </button>
                );
              })}
            </div>
          </Panel>
        )}

        {step === 3 && (
          <Panel title={copy.servicesTitle} help={copy.servicesHelp}>
            <div className="space-y-5">
              {serviceGroups.map(({ department, recommended, optional }) => (
                <section key={department.id} className="rounded-3xl border border-white/5 bg-black/15 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-neutral-200">{lang === "bg" ? department.bg : department.en}</p>
                      <p className="mt-1 text-xs text-neutral-500">{selectedServices.filter((id) => CORE_SERVICES.some((service) => service.id === id && service.departmentId === department.id)).length} {lang === "bg" ? "избрани" : "selected"}</p>
                    </div>
                    <span className="rounded-full border border-cyan-300/15 bg-cyan-300/5 px-3 py-1 text-[10px] uppercase tracking-wide text-cyan-100/70">{lang === "bg" ? "Core каталог" : "Core catalog"}</span>
                  </div>
                  {recommended.length > 0 && <div className="mt-4"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200/70">{lang === "bg" ? "Препоръчани" : "Recommended"}</p><div className="grid gap-3 sm:grid-cols-2">{recommended.map(renderServiceOption)}</div></div>}
                  {optional.length > 0 && <details className="mt-4" open={optional.some((service) => selectedServices.includes(service.id))}><summary className="cursor-pointer rounded-2xl border border-white/5 bg-black/20 px-4 py-3 text-sm font-medium text-neutral-400 hover:border-white/10 hover:text-neutral-300">+ {optional.length} {lang === "bg" ? "още опции" : "more options"}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{optional.map(renderServiceOption)}</div></details>}
                </section>
              ))}
            </div>
          </Panel>
        )}

        {step === 4 && (
          <div className="rounded-3xl border border-white/5 bg-black/15 p-5 sm:p-6">
            <FactoryNativeContentStep
              lang={lang}
              locales={selectedLanguages}
              value={nativeSetup}
              onChange={(next) => { setNativeSetup(next); invalidate(); }}
            />
          </div>
        )}

        {step === 5 && (
          <Panel title={copy.contactsTitle} help={copy.contactsHelp}>
            <div className="space-y-4">
              {selectedDepartments.map((departmentId) => {
                const department = DEPARTMENTS.find((item) => item.id === departmentId) || DEPARTMENTS[0];
                const contact = departmentContacts[departmentId];
                return (
                  <section key={departmentId} className="rounded-3xl border border-white/5 bg-black/20 p-4 sm:p-5">
                    <div className="flex items-center gap-3">
                      <span className="text-xl text-cyan-200">{department.icon}</span>
                      <div><p className="font-semibold text-neutral-200">{lang === "bg" ? department.bg : department.en}</p><p className="text-xs text-neutral-500">{departmentId}</p></div>
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-3">
                      <label className="text-sm text-neutral-300">{copy.phone}<input inputMode="tel" value={contact.phone} onChange={(event) => patchContact(departmentId, { phone: event.target.value })} placeholder="+359 2 123 4567" maxLength={160} className={field} /></label>
                      <label className="text-sm text-neutral-300">{copy.whatsapp}<input inputMode="tel" value={contact.whatsapp} onChange={(event) => patchContact(departmentId, { whatsapp: event.target.value })} placeholder="+359 88 123 4567" maxLength={160} className={field} /></label>
                      <label className="text-sm text-neutral-300">{copy.email}<input type="email" value={contact.email} onChange={(event) => patchContact(departmentId, { email: event.target.value })} placeholder="reception@example.com" maxLength={320} className={field} /></label>
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="mt-4"><Metric label={copy.configuredContacts} value={`${configuredContactCount} / ${selectedDepartments.length}`} /></div>
          </Panel>
        )}

        {step === 6 && (
          <Panel title={copy.reviewTitle} help={copy.reviewHelp}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label={copy.hotel} value={hotelName} />
              <Metric label={copy.rooms} value={String(roomCount)} />
              <Metric label={copy.resolvedLocation} value={resolvedLocation?.displayName || "—"} />
              <Metric label={copy.timezone} value={resolvedLocation?.timezone || "—"} />
              <Metric label={copy.languages} value={languageLabels.join(", ")} />
              <Metric label={copy.teams} value={teamLabels.join(", ")} />
              <div className="sm:col-span-2"><Metric label={copy.services} value={serviceLabels.length ? serviceLabels.join(", ") : "—"} /></div>
              <div className="sm:col-span-2"><Metric label={copy.native} value={`${nativeSetup.items.length} info · ${nativeSetup.venues.length} venues${nativeSetup.wifiSsid.trim() ? " · Wi‑Fi" : ""}`} /></div>
              <div className="sm:col-span-2"><Metric label={copy.contacts} value={`${configuredContactCount} / ${selectedDepartments.length}`} /></div>
            </div>
            {!preflightCurrent && !result?.ok && (
              <button type="button" onClick={runPreflight} disabled={validating} className="mt-5 w-full rounded-2xl border border-cyan-300/40 bg-gradient-to-r from-cyan-400/15 to-teal-400/10 px-4 py-4 font-semibold text-cyan-50 shadow-[0_12px_50px_rgba(6,182,212,.08)] transition hover:border-cyan-200/60 disabled:opacity-50">
                {validating ? copy.validating : copy.validate}
              </button>
            )}
            {preflightCurrent && preflight?.identities && !result?.ok && (
              <div className="mt-5 rounded-3xl border border-emerald-400/25 bg-emerald-400/5 p-5">
                <p className="font-semibold text-emerald-100">✓ {copy.ready}</p>
                <details className="mt-3 text-xs text-neutral-500">
                  <summary className="cursor-pointer">{copy.technical}</summary>
                  <div className="mt-2 space-y-1 font-mono">
                    <p>Production: {preflight.identities.productionPublicSlug}</p>
                    <p>Sandbox: {preflight.identities.sandboxPublicSlug}</p>
                  </div>
                </details>
                <label className="mt-4 flex items-start gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-xs text-neutral-300">
                  <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 accent-cyan-300" />
                  <span>{copy.confirm}</span>
                </label>
                <button type="button" disabled={!confirmed || creating} onClick={createHotel} className="mt-4 w-full rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 py-4 font-semibold text-amber-100 transition hover:border-amber-200/60 disabled:opacity-40">
                  {creating ? copy.creating : copy.create}
                </button>
              </div>
            )}
            {result?.ok && (
              <div className="mt-5 rounded-3xl border border-emerald-400/30 bg-gradient-to-br from-emerald-400/10 to-cyan-400/5 p-6">
                <p className="text-lg font-semibold text-emerald-100">✓ {copy.success}</p>
                <p className="mt-2 text-sm text-emerald-50/75">{copy.successHelp}</p>
                <details className="mt-4 text-xs text-neutral-500">
                  <summary className="cursor-pointer">{copy.technical}</summary>
                  <div className="mt-2 space-y-1 font-mono">
                    <p>Run: {result.onboardingRunId}</p>
                    <p>Property: {result.propertyId}</p>
                    <p>Production: {result.productionHotelId}</p>
                    <p>Sandbox: {result.sandboxHotelId}</p>
                  </div>
                </details>
              </div>
            )}
          </Panel>
        )}

        {feedback && <p className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-100">{feedback}</p>}
        {!result?.ok && (
          <div className="mt-7 flex justify-between gap-3">
            <button type="button" disabled={step === 0 || resolvingLocation} onClick={() => { setStep((value) => Math.max(0, value - 1)); setFeedback(null); }} className="rounded-2xl border border-white/10 bg-black/20 px-5 py-3 text-sm text-neutral-300 transition hover:border-white/20 disabled:opacity-30">
              {copy.back}
            </button>
            {step < 6 && (
              <button type="button" disabled={resolvingLocation} onClick={() => { void advanceStep(); }} className="rounded-2xl border border-cyan-300/40 bg-cyan-300/10 px-6 py-3 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200/60 disabled:opacity-40">
                {resolvingLocation ? copy.resolvingLocation : copy.next} →
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Panel({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/5 bg-black/15 p-5 sm:p-6">
      <div className="mb-6">
        <h3 className="text-xl font-semibold tracking-tight text-white">{title}</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">{help}</p>
      </div>
      {children}
    </div>
  );
}

function Choice({ active, title, onClick, compact = false }: { active: boolean; title: string; onClick: () => void; compact?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`${compact ? "px-4 py-2" : "px-4 py-3"} rounded-2xl border text-left text-sm transition ${active ? "border-cyan-300/45 bg-cyan-300/10 text-cyan-100" : "border-white/5 bg-black/20 text-neutral-400 hover:border-white/15"}`}>
      {title}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-600">{label}</p>
      <p className="mt-2 break-words text-sm font-medium text-neutral-200">{value || "—"}</p>
    </div>
  );
}
