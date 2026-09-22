"use client";

import { useEffect, useMemo, useState } from "react";

type ManagerUiLanguage = "bg" | "en" | "de";
type EditorTab = "services" | "venues" | "schedules";

type LocalizedText = Record<string, string>;

type ServiceEditorRow = {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  price: string | null;
  currency: string | null;
  guestVisible: boolean;
  enabled: boolean;
  sortOrder: number | null;
  targetDepartment: string | null;
  requestType: string | null;
  operationallyConfigured: boolean;
};

type VenueEditorRow = {
  id: string;
  type: string;
  name: string;
  nameByLang: LocalizedText;
  shortDescription: string;
  shortDescriptionByLang: LocalizedText;
  description: string;
  descriptionByLang: LocalizedText;
  cuisine: string;
  cuisineByLang: LocalizedText;
  hours: string;
  hoursByLang: LocalizedText;
  location: string;
  locationByLang: LocalizedText;
  active: boolean;
  sortOrder: number | null;
  reservationManaged: boolean;
};

type WeeklyWindow = {
  days: string[];
  open: string;
  close: string;
  label?: string;
};

type Season = {
  id: string;
  startDate: string;
  endDate: string;
  is24h: boolean;
  windows: WeeklyWindow[];
  label?: string;
};

type DateOverride = {
  date: string;
  mode: "closed" | "24h" | "custom";
  windows?: Array<{ open: string; close: string; label?: string }>;
  label?: string;
};

type ScheduleValue = {
  is24h: boolean;
  windows: WeeklyWindow[];
  seasons?: Season[];
  dateOverrides?: DateOverride[];
};

type ScheduleEditorRow = {
  department: string;
  fallbackDepartment: string | null;
  fallbackConflict: boolean;
  schedule: ScheduleValue | null;
  scheduleSource: "v2" | "legacy" | "missing";
};

type EditorPayload = {
  hotel: { id: string; slug: string; name: string };
  liveRevision: { id: string; revisionNo: number; checksum: string };
  languages: string[];
  services: ServiceEditorRow[];
  venues: VenueEditorRow[];
  schedules: ScheduleEditorRow[];
};

type PreviewPayload = {
  scope: EditorTab;
  preview: Record<string, unknown>;
  diff: {
    changed?: boolean;
    changedCategories?: string[];
    totalChanges?: number | Record<string, number>;
    diffHash?: string;
  };
};

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const ALL_DAYS = [...WEEKDAYS];

const DAY_LABELS: Record<ManagerUiLanguage, Record<string, string>> = {
  bg: { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Нд" },
  en: { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" },
  de: { mon: "Mo", tue: "Di", wed: "Mi", thu: "Do", fri: "Fr", sat: "Sa", sun: "So" },
};

const COPY = {
  bg: {
    eyebrow: "Управление на Hub",
    title: "Съдържание и работно време",
    intro: "Редактирайте само позволените полета. Преди бъдещо публикуване системата проверява operational последствията и блокира опасни промени.",
    services: "Услуги",
    venues: "Обекти",
    schedules: "Работно време",
    loading: "Зареждане…",
    reload: "Презареди",
    liveRevision: "LIVE ревизия",
    language: "Език",
    choose: "Изберете",
    titleLabel: "Име",
    description: "Описание",
    price: "Цена",
    currency: "Валута",
    visible: "Видимо за госта",
    enabled: "Активно",
    sortOrder: "Подредба",
    routingProtected: "Routing и workflow са защитени",
    targetDepartment: "Основен отдел",
    requestType: "Тип заявка",
    preview: "Провери промяната",
    checking: "Проверка…",
    valid: "Промяната е валидна за draft",
    noChange: "Няма промяна спрямо LIVE.",
    protectedNote: "Този екран не публикува директно в LIVE.",
    venueType: "Тип",
    shortDescription: "Кратко описание",
    cuisine: "Кухня / тип услуга",
    publicHours: "Публично работно време",
    location: "Локация",
    active: "Активен",
    reservationProtected: "Reservation routing и operational контакти са защитени",
    department: "Отдел",
    fallback: "Fallback отдел",
    noFallback: "Няма зададен fallback",
    conflict: "Има противоречив fallback в текущата конфигурация",
    source: "Източник",
    weekly: "Седмичен график",
    twentyFour: "24/7",
    addShift: "Добави смяна",
    remove: "Премахни",
    open: "От",
    close: "До",
    days: "Дни",
    seasons: "Сезони",
    addSeason: "Добави сезон",
    seasonId: "Код",
    seasonLabel: "Име на сезона",
    startDate: "От дата",
    endDate: "До дата",
    exceptions: "Изключения по дата",
    addException: "Добави дата",
    date: "Дата",
    mode: "Режим",
    closed: "Затворен",
    custom: "Специални часове",
    impact: "Operational preview",
    precedence: "Приоритет: конкретна дата → сезон → седмичен график",
    gaps: "Периоди без покритие",
    noGaps: "Няма gap за този ден",
    fallbackConsequence: "При gap незавършените заявки се поемат от",
    noFallbackWarning: "Има gap, но няма fallback отдел.",
    exactDateHint: "Специалните часове за една дата не пресичат полунощ. При нужда задайте и следващата дата.",
    futurePublish: "Записването и Publish flow ще се активират при финалното системно свързване.",
    validationError: "Проверете въведените данни.",
    conflictError: "LIVE конфигурацията се е променила. Презаредете.",
    accessError: "Нямате право за тази промяна.",
    systemError: "Системна грешка. Промяната не е публикувана.",
  },
  en: {
    eyebrow: "Hub management",
    title: "Content and operating hours",
    intro: "Edit only permitted fields. Before future publishing, the system checks operational impact and blocks unsafe changes.",
    services: "Services",
    venues: "Venues",
    schedules: "Operating hours",
    loading: "Loading…",
    reload: "Reload",
    liveRevision: "LIVE revision",
    language: "Language",
    choose: "Choose",
    titleLabel: "Title",
    description: "Description",
    price: "Price",
    currency: "Currency",
    visible: "Visible to guest",
    enabled: "Enabled",
    sortOrder: "Order",
    routingProtected: "Routing and workflow are protected",
    targetDepartment: "Primary department",
    requestType: "Request type",
    preview: "Check change",
    checking: "Checking…",
    valid: "The change is valid for a draft",
    noChange: "No change from LIVE.",
    protectedNote: "This screen never publishes directly to LIVE.",
    venueType: "Type",
    shortDescription: "Short description",
    cuisine: "Cuisine / service type",
    publicHours: "Public hours",
    location: "Location",
    active: "Active",
    reservationProtected: "Reservation routing and operational contacts are protected",
    department: "Department",
    fallback: "Fallback department",
    noFallback: "No fallback configured",
    conflict: "Current configuration contains conflicting fallbacks",
    source: "Source",
    weekly: "Weekly schedule",
    twentyFour: "24/7",
    addShift: "Add shift",
    remove: "Remove",
    open: "From",
    close: "To",
    days: "Days",
    seasons: "Seasons",
    addSeason: "Add season",
    seasonId: "Code",
    seasonLabel: "Season name",
    startDate: "Start date",
    endDate: "End date",
    exceptions: "Date exceptions",
    addException: "Add date",
    date: "Date",
    mode: "Mode",
    closed: "Closed",
    custom: "Custom hours",
    impact: "Operational preview",
    precedence: "Priority: exact date → season → weekly schedule",
    gaps: "Periods without coverage",
    noGaps: "No gap on this day",
    fallbackConsequence: "During a gap unresolved requests are handled by",
    noFallbackWarning: "There is a gap but no fallback department.",
    exactDateHint: "Exact-date custom hours do not cross midnight. Add the following date when needed.",
    futurePublish: "Draft persistence and Publish flow will be enabled during final system integration.",
    validationError: "Check the entered data.",
    conflictError: "The LIVE configuration changed. Reload.",
    accessError: "You do not have permission for this change.",
    systemError: "System error. The change was not published.",
  },
  de: {
    eyebrow: "Hub-Verwaltung",
    title: "Inhalte und Betriebszeiten",
    intro: "Bearbeiten Sie nur zulässige Felder. Vor einer späteren Veröffentlichung prüft das System die operativen Auswirkungen und blockiert unsichere Änderungen.",
    services: "Services",
    venues: "Bereiche",
    schedules: "Betriebszeiten",
    loading: "Laden…",
    reload: "Neu laden",
    liveRevision: "LIVE-Revision",
    language: "Sprache",
    choose: "Auswählen",
    titleLabel: "Name",
    description: "Beschreibung",
    price: "Preis",
    currency: "Währung",
    visible: "Für Gäste sichtbar",
    enabled: "Aktiv",
    sortOrder: "Reihenfolge",
    routingProtected: "Routing und Workflow sind geschützt",
    targetDepartment: "Primäre Abteilung",
    requestType: "Anfragetyp",
    preview: "Änderung prüfen",
    checking: "Prüfung…",
    valid: "Die Änderung ist für einen Entwurf gültig",
    noChange: "Keine Änderung gegenüber LIVE.",
    protectedNote: "Dieser Bildschirm veröffentlicht niemals direkt in LIVE.",
    venueType: "Typ",
    shortDescription: "Kurzbeschreibung",
    cuisine: "Küche / Leistungsart",
    publicHours: "Öffentliche Öffnungszeiten",
    location: "Standort",
    active: "Aktiv",
    reservationProtected: "Reservierungsrouting und operative Kontakte sind geschützt",
    department: "Abteilung",
    fallback: "Fallback-Abteilung",
    noFallback: "Kein Fallback konfiguriert",
    conflict: "Die aktuelle Konfiguration enthält widersprüchliche Fallbacks",
    source: "Quelle",
    weekly: "Wochenplan",
    twentyFour: "24/7",
    addShift: "Schicht hinzufügen",
    remove: "Entfernen",
    open: "Von",
    close: "Bis",
    days: "Tage",
    seasons: "Saisons",
    addSeason: "Saison hinzufügen",
    seasonId: "Code",
    seasonLabel: "Saisonname",
    startDate: "Startdatum",
    endDate: "Enddatum",
    exceptions: "Datums-Ausnahmen",
    addException: "Datum hinzufügen",
    date: "Datum",
    mode: "Modus",
    closed: "Geschlossen",
    custom: "Sonderzeiten",
    impact: "Operative Vorschau",
    precedence: "Priorität: konkretes Datum → Saison → Wochenplan",
    gaps: "Zeiten ohne Abdeckung",
    noGaps: "Keine Lücke an diesem Tag",
    fallbackConsequence: "Während einer Lücke übernimmt offene Anfragen",
    noFallbackWarning: "Es gibt eine Lücke, aber keine Fallback-Abteilung.",
    exactDateHint: "Sonderzeiten für ein Datum überschreiten Mitternacht nicht. Bei Bedarf den Folgetag ergänzen.",
    futurePublish: "Entwurfsspeicherung und Publish-Flow werden bei der finalen Systemintegration aktiviert.",
    validationError: "Prüfen Sie die eingegebenen Daten.",
    conflictError: "Die LIVE-Konfiguration wurde geändert. Bitte neu laden.",
    accessError: "Sie haben keine Berechtigung für diese Änderung.",
    systemError: "Systemfehler. Die Änderung wurde nicht veröffentlicht.",
  },
} as const;

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function textForLanguage(value: LocalizedText, language: string) {
  return value?.[language] || value?.en || value?.bg || Object.values(value || {}).find(Boolean) || "";
}

function normalizeSchedule(value: ScheduleValue | null): ScheduleValue {
  if (!value) return { is24h: false, windows: [] };
  return {
    is24h: value.is24h === true,
    windows: Array.isArray(value.windows) ? deepClone(value.windows) : [],
    seasons: Array.isArray(value.seasons) ? deepClone(value.seasons) : [],
    dateOverrides: Array.isArray(value.dateOverrides) ? deepClone(value.dateOverrides) : [],
  };
}

function failureMessage(
  body: { errorType?: string; error?: string } | null,
  copy: typeof COPY.bg,
) {
  if (body?.errorType === "validation") return copy.validationError;
  if (body?.errorType === "conflict") return copy.conflictError;
  if (body?.errorType === "access") return copy.accessError;
  if (body?.errorType === "system") return copy.systemError;
  return body?.error || copy.validationError;
}

function diffCount(diff: PreviewPayload["diff"] | null) {
  if (!diff) return 0;
  if (typeof diff.totalChanges === "number") return diff.totalChanges;
  if (diff.totalChanges && typeof diff.totalChanges === "object") {
    return Object.values(diff.totalChanges).reduce(
      (sum, value) => sum + (Number(value) || 0),
      0,
    );
  }
  return diff.changed ? 1 : 0;
}

export default function ManagerHubContentEditor({
  hotelSlug,
  lang,
}: {
  hotelSlug: string;
  lang: ManagerUiLanguage;
}) {
  const copy = COPY[lang] || COPY.bg;
  const [editor, setEditor] = useState<EditorPayload | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>("services");
  const [guestLanguage, setGuestLanguage] = useState("bg");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewPayload | null>(null);

  const [serviceId, setServiceId] = useState("");
  const [serviceDraft, setServiceDraft] = useState<ServiceEditorRow | null>(null);
  const [venueId, setVenueId] = useState("");
  const [venueDraft, setVenueDraft] = useState<VenueEditorRow | null>(null);
  const [department, setDepartment] = useState("");
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleValue>({ is24h: false, windows: [] });

  async function loadEditor() {
    setLoading(true);
    setError("");
    setPreview(null);
    try {
      const response = await fetch(
        "/api/staff/content-changes/editor-state?hotelSlug=" + encodeURIComponent(hotelSlug),
        { credentials: "same-origin", cache: "no-store" },
      );
      const body = await response.json().catch(() => null) as {
        ok?: boolean;
        editor?: EditorPayload;
        error?: string;
        errorType?: string;
      } | null;
      if (!response.ok || !body?.ok || !body.editor) {
        throw new Error(failureMessage(body, copy as typeof COPY.bg));
      }

      setEditor(body.editor);
      const preferred = body.editor.languages.includes(lang) ? lang : body.editor.languages[0] || "en";
      setGuestLanguage(preferred);

      const firstService = body.editor.services[0] || null;
      setServiceId(firstService?.id || "");
      setServiceDraft(firstService ? deepClone(firstService) : null);

      const firstVenue = body.editor.venues[0] || null;
      setVenueId(firstVenue?.id || "");
      setVenueDraft(firstVenue ? deepClone(firstVenue) : null);

      const firstSchedule = body.editor.schedules[0] || null;
      setDepartment(firstSchedule?.department || "");
      setScheduleDraft(normalizeSchedule(firstSchedule?.schedule || null));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hotelSlug) void loadEditor();
  }, [hotelSlug]);

  const selectedService = useMemo(
    () => editor?.services.find((item) => item.id === serviceId) || null,
    [editor, serviceId],
  );
  const selectedVenue = useMemo(
    () => editor?.venues.find((item) => item.id === venueId) || null,
    [editor, venueId],
  );
  const selectedSchedule = useMemo(
    () => editor?.schedules.find((item) => item.department === department) || null,
    [editor, department],
  );

  function selectService(nextId: string) {
    const next = editor?.services.find((item) => item.id === nextId) || null;
    setServiceId(nextId);
    setServiceDraft(next ? deepClone(next) : null);
    setPreview(null);
    setError("");
  }

  function selectVenue(nextId: string) {
    const next = editor?.venues.find((item) => item.id === nextId) || null;
    setVenueId(nextId);
    setVenueDraft(next ? deepClone(next) : null);
    setPreview(null);
    setError("");
  }

  function selectSchedule(nextDepartment: string) {
    const next = editor?.schedules.find((item) => item.department === nextDepartment) || null;
    setDepartment(nextDepartment);
    setScheduleDraft(normalizeSchedule(next?.schedule || null));
    setPreview(null);
    setError("");
  }

  async function previewChange(payload: Record<string, unknown>) {
    setChecking(true);
    setError("");
    setPreview(null);
    try {
      const response = await fetch("/api/staff/content-changes/editor-state", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelSlug, ...payload }),
      });
      const body = await response.json().catch(() => null) as {
        ok?: boolean;
        result?: PreviewPayload;
        error?: string;
        errorType?: string;
      } | null;
      if (!response.ok || !body?.ok || !body.result) {
        throw new Error(failureMessage(body, copy as typeof COPY.bg));
      }
      setPreview(body.result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setChecking(false);
    }
  }

  async function checkService() {
    if (!serviceDraft || !selectedService) return;
    await previewChange({
      scope: "services",
      operations: [{
        schemaVersion: "manager-service-change-v1",
        kind: "service_content_update",
        serviceId: serviceDraft.id,
        patch: {
          title: serviceDraft.title,
          description: serviceDraft.description,
          price: serviceDraft.price,
          currency: serviceDraft.price ? serviceDraft.currency : null,
          guestVisible: serviceDraft.guestVisible,
          enabled: serviceDraft.enabled,
          sortOrder: serviceDraft.sortOrder || 1,
        },
      }],
    });
  }

  async function checkVenue() {
    if (!venueDraft || !selectedVenue) return;
    await previewChange({
      scope: "venues",
      operations: [{
        schemaVersion: "manager-venue-change-v1",
        kind: "venue_content_update",
        venueId: venueDraft.id,
        patch: {
          name: venueDraft.name,
          nameByLang: venueDraft.nameByLang,
          shortDescription: venueDraft.shortDescription,
          shortDescriptionByLang: venueDraft.shortDescriptionByLang,
          description: venueDraft.description,
          descriptionByLang: venueDraft.descriptionByLang,
          cuisine: venueDraft.cuisine,
          cuisineByLang: venueDraft.cuisineByLang,
          hours: venueDraft.hours,
          hoursByLang: venueDraft.hoursByLang,
          location: venueDraft.location,
          locationByLang: venueDraft.locationByLang,
          active: venueDraft.active,
          sortOrder: venueDraft.sortOrder || 1,
        },
      }],
    });
  }

  async function checkSchedule() {
    if (!department) return;
    await previewChange({
      scope: "schedules",
      department,
      schedule: scheduleDraft,
    });
  }

  function updateServiceLocalized(
    field: "title" | "description",
    value: string,
  ) {
    setServiceDraft((current) => current ? ({
      ...current,
      [field]: { ...current[field], [guestLanguage]: value },
    }) : current);
    setPreview(null);
  }

  function updateVenueLocalized(
    field: "nameByLang" | "shortDescriptionByLang" | "descriptionByLang" | "cuisineByLang" | "hoursByLang" | "locationByLang",
    value: string,
  ) {
    setVenueDraft((current) => current ? ({
      ...current,
      [field]: { ...current[field], [guestLanguage]: value },
    }) : current);
    setPreview(null);
  }

  function updateWindow(
    owner: "weekly" | "season",
    index: number,
    patch: Partial<WeeklyWindow>,
    seasonIndex?: number,
  ) {
    setScheduleDraft((current) => {
      const next = deepClone(current);
      if (owner === "weekly") {
        next.windows[index] = { ...next.windows[index], ...patch };
      } else if (Number.isInteger(seasonIndex)) {
        const season = next.seasons?.[seasonIndex as number];
        if (season) season.windows[index] = { ...season.windows[index], ...patch };
      }
      return next;
    });
    setPreview(null);
  }

  function toggleWindowDay(
    owner: "weekly" | "season",
    index: number,
    day: string,
    seasonIndex?: number,
  ) {
    const window = owner === "weekly"
      ? scheduleDraft.windows[index]
      : scheduleDraft.seasons?.[seasonIndex || 0]?.windows[index];
    if (!window) return;
    const days = window.days.includes(day)
      ? window.days.filter((item) => item !== day)
      : [...window.days, day];
    updateWindow(owner, index, { days }, seasonIndex);
  }

  function renderWindowEditor(
    window: WeeklyWindow,
    index: number,
    owner: "weekly" | "season",
    seasonIndex?: number,
  ) {
    return (
      <div key={`${owner}-${seasonIndex ?? "base"}-${index}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleWindowDay(owner, index, day, seasonIndex)}
              className={
                "rounded-full border px-2.5 py-1 text-xs font-semibold "
                + (window.days.includes(day)
                  ? "border-cyan-300/35 bg-cyan-300/15 text-cyan-50"
                  : "border-white/10 bg-black/20 text-white/50")
              }
            >
              {DAY_LABELS[lang][day]}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs text-white/55">
            <span className="mb-1 block">{copy.open}</span>
            <input
              type="time"
              value={window.open}
              onChange={(event) => updateWindow(owner, index, { open: event.target.value }, seasonIndex)}
              className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
            />
          </label>
          <label className="text-xs text-white/55">
            <span className="mb-1 block">{copy.close}</span>
            <input
              type="time"
              value={window.close}
              onChange={(event) => updateWindow(owner, index, { close: event.target.value }, seasonIndex)}
              className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setScheduleDraft((current) => {
                const next = deepClone(current);
                if (owner === "weekly") next.windows.splice(index, 1);
                else if (Number.isInteger(seasonIndex)) next.seasons?.[seasonIndex as number]?.windows.splice(index, 1);
                return next;
              });
              setPreview(null);
            }}
            className="self-end rounded-lg border border-rose-300/20 px-3 py-2 text-xs font-semibold text-rose-100"
          >
            {copy.remove}
          </button>
        </div>
      </div>
    );
  }

  const scheduleImpact = preview?.scope === "schedules"
    ? (preview.preview.impact as Record<string, unknown> | undefined)
    : undefined;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-100/60">{copy.eyebrow}</p>
          <h3 className="mt-1 text-xl font-semibold text-white">{copy.title}</h3>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-white/65">{copy.intro}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadEditor()}
          disabled={loading}
          className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white/80"
        >
          {loading ? copy.loading : copy.reload}
        </button>
      </div>

      {editor ? (
        <div className="mt-3 text-xs text-white/45">
          {copy.liveRevision}: #{editor.liveRevision.revisionNo}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {(["services","venues","schedules"] as EditorTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setActiveTab(tab);
              setPreview(null);
              setError("");
            }}
            className={
              "rounded-full border px-4 py-2 text-sm font-semibold "
              + (activeTab === tab
                ? "border-cyan-300/35 bg-cyan-300/15 text-cyan-50"
                : "border-white/10 bg-black/20 text-white/65")
            }
          >
            {copy[tab]}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-50">
          {error}
        </div>
      ) : null}

      {!editor && !loading ? (
        <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
          {copy.reload}
        </div>
      ) : null}

      {editor && activeTab !== "schedules" ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="self-center text-xs text-white/45">{copy.language}</span>
          {editor.languages.map((language) => (
            <button
              key={language}
              type="button"
              onClick={() => {
                setGuestLanguage(language);
                setPreview(null);
              }}
              className={
                "rounded-full border px-3 py-1.5 text-xs font-semibold "
                + (guestLanguage === language
                  ? "border-violet-300/35 bg-violet-300/15 text-violet-50"
                  : "border-white/10 bg-black/20 text-white/55")
              }
            >
              {language.toUpperCase()}
            </button>
          ))}
        </div>
      ) : null}

      {editor && activeTab === "services" ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(220px,0.38fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            {editor.services.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => selectService(service.id)}
                className={
                  "w-full rounded-xl border p-3 text-left "
                  + (serviceId === service.id
                    ? "border-cyan-300/30 bg-cyan-300/10"
                    : "border-white/10 bg-black/20")
                }
              >
                <p className="font-semibold text-white">{textForLanguage(service.title, guestLanguage) || service.id}</p>
                <p className="mt-1 text-xs text-white/45">{service.targetDepartment || "—"} · {service.requestType || "—"}</p>
              </button>
            ))}
          </div>

          {serviceDraft ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="grid gap-3 lg:grid-cols-2">
                <label className="text-xs text-white/60">
                  <span className="mb-1 block">{copy.titleLabel} · {guestLanguage.toUpperCase()}</span>
                  <input
                    value={serviceDraft.title[guestLanguage] || ""}
                    onChange={(event) => updateServiceLocalized("title", event.target.value)}
                    className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                  />
                </label>
                <label className="text-xs text-white/60">
                  <span className="mb-1 block">{copy.sortOrder}</span>
                  <input
                    type="number"
                    min={1}
                    value={serviceDraft.sortOrder || 1}
                    onChange={(event) => {
                      setServiceDraft((current) => current ? ({ ...current, sortOrder: Number(event.target.value) || 1 }) : current);
                      setPreview(null);
                    }}
                    className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                  />
                </label>
              </div>

              <label className="mt-3 block text-xs text-white/60">
                <span className="mb-1 block">{copy.description} · {guestLanguage.toUpperCase()}</span>
                <textarea
                  value={serviceDraft.description[guestLanguage] || ""}
                  onChange={(event) => updateServiceLocalized("description", event.target.value)}
                  className="min-h-24 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                />
              </label>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-white/60">
                  <span className="mb-1 block">{copy.price}</span>
                  <input
                    inputMode="decimal"
                    value={serviceDraft.price || ""}
                    onChange={(event) => {
                      const price = event.target.value;
                      setServiceDraft((current) => current ? ({ ...current, price, currency: price ? (current.currency || "EUR") : null }) : current);
                      setPreview(null);
                    }}
                    className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                  />
                </label>
                <label className="text-xs text-white/60">
                  <span className="mb-1 block">{copy.currency}</span>
                  <input
                    maxLength={3}
                    disabled={!serviceDraft.price}
                    value={serviceDraft.currency || ""}
                    onChange={(event) => {
                      setServiceDraft((current) => current ? ({ ...current, currency: event.target.value.toUpperCase() }) : current);
                      setPreview(null);
                    }}
                    className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white disabled:opacity-40"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm text-white/75">
                  <input
                    type="checkbox"
                    checked={serviceDraft.guestVisible}
                    onChange={(event) => {
                      setServiceDraft((current) => current ? ({ ...current, guestVisible: event.target.checked }) : current);
                      setPreview(null);
                    }}
                  />
                  {copy.visible}
                </label>
                <label className="flex items-center gap-2 text-sm text-white/75">
                  <input
                    type="checkbox"
                    checked={serviceDraft.enabled}
                    onChange={(event) => {
                      setServiceDraft((current) => current ? ({ ...current, enabled: event.target.checked }) : current);
                      setPreview(null);
                    }}
                  />
                  {copy.enabled}
                </label>
              </div>

              <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-3 text-xs text-emerald-50/75">
                <strong>{copy.routingProtected}</strong>
                <div className="mt-1">{copy.targetDepartment}: {serviceDraft.targetDepartment || "—"} · {copy.requestType}: {serviceDraft.requestType || "—"}</div>
              </div>

              <button
                type="button"
                onClick={() => void checkService()}
                disabled={checking}
                className="mt-4 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-50 disabled:opacity-40"
              >
                {checking ? copy.checking : copy.preview}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {editor && activeTab === "venues" ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(220px,0.38fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            {editor.venues.map((venue) => (
              <button
                key={venue.id}
                type="button"
                onClick={() => selectVenue(venue.id)}
                className={
                  "w-full rounded-xl border p-3 text-left "
                  + (venueId === venue.id
                    ? "border-cyan-300/30 bg-cyan-300/10"
                    : "border-white/10 bg-black/20")
                }
              >
                <p className="font-semibold text-white">{textForLanguage(venue.nameByLang, guestLanguage) || venue.name || venue.id}</p>
                <p className="mt-1 text-xs text-white/45">{venue.type || "venue"}</p>
              </button>
            ))}
          </div>

          {venueDraft ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="grid gap-3 lg:grid-cols-2">
                <label className="text-xs text-white/60">
                  <span className="mb-1 block">{copy.titleLabel} · {guestLanguage.toUpperCase()}</span>
                  <input
                    value={venueDraft.nameByLang[guestLanguage] || ""}
                    onChange={(event) => updateVenueLocalized("nameByLang", event.target.value)}
                    className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                  />
                </label>
                <label className="text-xs text-white/60">
                  <span className="mb-1 block">{copy.sortOrder}</span>
                  <input
                    type="number"
                    min={1}
                    value={venueDraft.sortOrder || 1}
                    onChange={(event) => {
                      setVenueDraft((current) => current ? ({ ...current, sortOrder: Number(event.target.value) || 1 }) : current);
                      setPreview(null);
                    }}
                    className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                  />
                </label>
              </div>

              <label className="mt-3 block text-xs text-white/60">
                <span className="mb-1 block">{copy.shortDescription} · {guestLanguage.toUpperCase()}</span>
                <textarea
                  value={venueDraft.shortDescriptionByLang[guestLanguage] || ""}
                  onChange={(event) => updateVenueLocalized("shortDescriptionByLang", event.target.value)}
                  className="min-h-20 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                />
              </label>

              <label className="mt-3 block text-xs text-white/60">
                <span className="mb-1 block">{copy.description} · {guestLanguage.toUpperCase()}</span>
                <textarea
                  value={venueDraft.descriptionByLang[guestLanguage] || ""}
                  onChange={(event) => updateVenueLocalized("descriptionByLang", event.target.value)}
                  className="min-h-24 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                />
              </label>

              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                <label className="text-xs text-white/60">
                  <span className="mb-1 block">{copy.cuisine} · {guestLanguage.toUpperCase()}</span>
                  <input
                    value={venueDraft.cuisineByLang[guestLanguage] || ""}
                    onChange={(event) => updateVenueLocalized("cuisineByLang", event.target.value)}
                    className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                  />
                </label>
                <label className="text-xs text-white/60">
                  <span className="mb-1 block">{copy.location} · {guestLanguage.toUpperCase()}</span>
                  <input
                    value={venueDraft.locationByLang[guestLanguage] || ""}
                    onChange={(event) => updateVenueLocalized("locationByLang", event.target.value)}
                    className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                  />
                </label>
                <label className="text-xs text-white/60">
                  <span className="mb-1 block">{copy.publicHours} · {guestLanguage.toUpperCase()}</span>
                  <textarea
                    value={venueDraft.hoursByLang[guestLanguage] || ""}
                    onChange={(event) => updateVenueLocalized("hoursByLang", event.target.value)}
                    className="min-h-20 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>

              <label className="mt-4 flex items-center gap-2 text-sm text-white/75">
                <input
                  type="checkbox"
                  checked={venueDraft.active}
                  onChange={(event) => {
                    setVenueDraft((current) => current ? ({ ...current, active: event.target.checked }) : current);
                    setPreview(null);
                  }}
                />
                {copy.active}
              </label>

              <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-3 text-xs text-emerald-50/75">
                <strong>{copy.reservationProtected}</strong>
                <div className="mt-1">{copy.venueType}: {venueDraft.type || "—"} · {venueDraft.reservationManaged ? "Reservation configured" : "No reservation routing"}</div>
              </div>

              <button
                type="button"
                onClick={() => void checkVenue()}
                disabled={checking}
                className="mt-4 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-50 disabled:opacity-40"
              >
                {checking ? copy.checking : copy.preview}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {editor && activeTab === "schedules" ? (
        <div className="mt-5">
          <div className="grid gap-3 lg:grid-cols-3">
            <label className="text-xs text-white/60">
              <span className="mb-1 block">{copy.department}</span>
              <select
                value={department}
                onChange={(event) => selectSchedule(event.target.value)}
                className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
              >
                {editor.schedules.map((item) => (
                  <option key={item.department} value={item.department}>{item.department}</option>
                ))}
              </select>
            </label>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60">
              <div>{copy.fallback}: <strong className="text-white">{selectedSchedule?.fallbackDepartment || copy.noFallback}</strong></div>
              <div className="mt-1">{copy.source}: {selectedSchedule?.scheduleSource || "—"}</div>
              {selectedSchedule?.fallbackConflict ? <div className="mt-2 text-rose-100">{copy.conflict}</div> : null}
            </div>
            <label className="flex items-center gap-2 self-center text-sm text-white/75">
              <input
                type="checkbox"
                checked={scheduleDraft.is24h}
                onChange={(event) => {
                  setScheduleDraft((current) => ({
                    ...current,
                    is24h: event.target.checked,
                    windows: event.target.checked ? [] : current.windows,
                  }));
                  setPreview(null);
                }}
              />
              {copy.twentyFour}
            </label>
          </div>

          {!scheduleDraft.is24h ? (
            <div className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-semibold text-white">{copy.weekly}</h4>
                <button
                  type="button"
                  onClick={() => {
                    setScheduleDraft((current) => ({
                      ...current,
                      windows: [...current.windows, { days: ALL_DAYS, open: "08:00", close: "17:00" }],
                    }));
                    setPreview(null);
                  }}
                  className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/75"
                >
                  {copy.addShift}
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {scheduleDraft.windows.map((window, index) => renderWindowEditor(window, index, "weekly"))}
              </div>
            </div>
          ) : null}

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-semibold text-white">{copy.seasons}</h4>
              <button
                type="button"
                onClick={() => {
                  setScheduleDraft((current) => ({
                    ...current,
                    seasons: [
                      ...(current.seasons || []),
                      {
                        id: `season-${(current.seasons?.length || 0) + 1}`,
                        label: "",
                        startDate: "",
                        endDate: "",
                        is24h: false,
                        windows: [{ days: ALL_DAYS, open: "08:00", close: "17:00" }],
                      },
                    ],
                  }));
                  setPreview(null);
                }}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/75"
              >
                {copy.addSeason}
              </button>
            </div>

            <div className="mt-3 space-y-4">
              {(scheduleDraft.seasons || []).map((season, seasonIndex) => (
                <div key={`${season.id}-${seasonIndex}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="grid gap-3 lg:grid-cols-4">
                    <label className="text-xs text-white/60">
                      <span className="mb-1 block">{copy.seasonId}</span>
                      <input
                        value={season.id}
                        onChange={(event) => {
                          setScheduleDraft((current) => {
                            const next = deepClone(current);
                            if (next.seasons?.[seasonIndex]) next.seasons[seasonIndex].id = event.target.value;
                            return next;
                          });
                          setPreview(null);
                        }}
                        className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                      />
                    </label>
                    <label className="text-xs text-white/60">
                      <span className="mb-1 block">{copy.seasonLabel}</span>
                      <input
                        value={season.label || ""}
                        onChange={(event) => {
                          setScheduleDraft((current) => {
                            const next = deepClone(current);
                            if (next.seasons?.[seasonIndex]) next.seasons[seasonIndex].label = event.target.value;
                            return next;
                          });
                          setPreview(null);
                        }}
                        className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                      />
                    </label>
                    <label className="text-xs text-white/60">
                      <span className="mb-1 block">{copy.startDate}</span>
                      <input
                        type="date"
                        value={season.startDate}
                        onChange={(event) => {
                          setScheduleDraft((current) => {
                            const next = deepClone(current);
                            if (next.seasons?.[seasonIndex]) next.seasons[seasonIndex].startDate = event.target.value;
                            return next;
                          });
                          setPreview(null);
                        }}
                        className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                      />
                    </label>
                    <label className="text-xs text-white/60">
                      <span className="mb-1 block">{copy.endDate}</span>
                      <input
                        type="date"
                        value={season.endDate}
                        onChange={(event) => {
                          setScheduleDraft((current) => {
                            const next = deepClone(current);
                            if (next.seasons?.[seasonIndex]) next.seasons[seasonIndex].endDate = event.target.value;
                            return next;
                          });
                          setPreview(null);
                        }}
                        className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm text-white/70">
                      <input
                        type="checkbox"
                        checked={season.is24h}
                        onChange={(event) => {
                          setScheduleDraft((current) => {
                            const next = deepClone(current);
                            const target = next.seasons?.[seasonIndex];
                            if (target) {
                              target.is24h = event.target.checked;
                              if (event.target.checked) target.windows = [];
                            }
                            return next;
                          });
                          setPreview(null);
                        }}
                      />
                      {copy.twentyFour}
                    </label>
                    <div className="flex gap-2">
                      {!season.is24h ? (
                        <button
                          type="button"
                          onClick={() => {
                            setScheduleDraft((current) => {
                              const next = deepClone(current);
                              next.seasons?.[seasonIndex]?.windows.push({ days: ALL_DAYS, open: "08:00", close: "17:00" });
                              return next;
                            });
                            setPreview(null);
                          }}
                          className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/70"
                        >
                          {copy.addShift}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setScheduleDraft((current) => {
                            const next = deepClone(current);
                            next.seasons?.splice(seasonIndex, 1);
                            return next;
                          });
                          setPreview(null);
                        }}
                        className="rounded-lg border border-rose-300/20 px-3 py-2 text-xs font-semibold text-rose-100"
                      >
                        {copy.remove}
                      </button>
                    </div>
                  </div>

                  {!season.is24h ? (
                    <div className="mt-3 space-y-3">
                      {season.windows.map((window, windowIndex) => renderWindowEditor(window, windowIndex, "season", seasonIndex))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-white">{copy.exceptions}</h4>
                <p className="mt-1 text-xs text-white/45">{copy.exactDateHint}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setScheduleDraft((current) => ({
                    ...current,
                    dateOverrides: [
                      ...(current.dateOverrides || []),
                      { date: "", mode: "closed", windows: [] },
                    ],
                  }));
                  setPreview(null);
                }}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/75"
              >
                {copy.addException}
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {(scheduleDraft.dateOverrides || []).map((override, index) => (
                <div key={`${override.date}-${index}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <label className="text-xs text-white/60">
                      <span className="mb-1 block">{copy.date}</span>
                      <input
                        type="date"
                        value={override.date}
                        onChange={(event) => {
                          setScheduleDraft((current) => {
                            const next = deepClone(current);
                            if (next.dateOverrides?.[index]) next.dateOverrides[index].date = event.target.value;
                            return next;
                          });
                          setPreview(null);
                        }}
                        className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                      />
                    </label>
                    <label className="text-xs text-white/60">
                      <span className="mb-1 block">{copy.mode}</span>
                      <select
                        value={override.mode}
                        onChange={(event) => {
                          const mode = event.target.value as DateOverride["mode"];
                          setScheduleDraft((current) => {
                            const next = deepClone(current);
                            const target = next.dateOverrides?.[index];
                            if (target) {
                              target.mode = mode;
                              target.windows = mode === "custom"
                                ? (target.windows?.length ? target.windows : [{ open: "08:00", close: "17:00" }])
                                : [];
                            }
                            return next;
                          });
                          setPreview(null);
                        }}
                        className="min-h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                      >
                        <option value="closed">{copy.closed}</option>
                        <option value="24h">{copy.twentyFour}</option>
                        <option value="custom">{copy.custom}</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleDraft((current) => {
                          const next = deepClone(current);
                          next.dateOverrides?.splice(index, 1);
                          return next;
                        });
                        setPreview(null);
                      }}
                      className="self-end rounded-lg border border-rose-300/20 px-3 py-2 text-xs font-semibold text-rose-100"
                    >
                      {copy.remove}
                    </button>
                  </div>

                  {override.mode === "custom" ? (
                    <div className="mt-3 space-y-2">
                      {(override.windows || []).map((window, windowIndex) => (
                        <div key={windowIndex} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                          <input
                            type="time"
                            value={window.open}
                            onChange={(event) => {
                              setScheduleDraft((current) => {
                                const next = deepClone(current);
                                const target = next.dateOverrides?.[index]?.windows?.[windowIndex];
                                if (target) target.open = event.target.value;
                                return next;
                              });
                              setPreview(null);
                            }}
                            className="min-h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                          />
                          <input
                            type="time"
                            value={window.close}
                            onChange={(event) => {
                              setScheduleDraft((current) => {
                                const next = deepClone(current);
                                const target = next.dateOverrides?.[index]?.windows?.[windowIndex];
                                if (target) target.close = event.target.value;
                                return next;
                              });
                              setPreview(null);
                            }}
                            className="min-h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setScheduleDraft((current) => {
                                const next = deepClone(current);
                                next.dateOverrides?.[index]?.windows?.splice(windowIndex, 1);
                                return next;
                              });
                              setPreview(null);
                            }}
                            className="rounded-lg border border-rose-300/15 px-3 py-2 text-xs text-rose-100"
                          >
                            {copy.remove}
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setScheduleDraft((current) => {
                            const next = deepClone(current);
                            next.dateOverrides?.[index]?.windows?.push({ open: "08:00", close: "17:00" });
                            return next;
                          });
                          setPreview(null);
                        }}
                        className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/65"
                      >
                        {copy.addShift}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void checkSchedule()}
            disabled={checking || Boolean(selectedSchedule?.fallbackConflict)}
            className="mt-5 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-50 disabled:opacity-40"
          >
            {checking ? copy.checking : copy.preview}
          </button>
        </div>
      ) : null}

      {preview ? (
        <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-emerald-50">
                {preview.diff.changed ? copy.valid : copy.noChange}
              </p>
              <p className="mt-1 text-xs text-emerald-50/55">
                {preview.diff.changedCategories?.join(", ") || "—"} · {diffCount(preview.diff)} change(s)
              </p>
            </div>
            <span className="rounded-full border border-emerald-300/20 px-3 py-1 text-xs font-semibold text-emerald-50/70">
              {copy.protectedNote}
            </span>
          </div>

          {scheduleImpact ? (
            <div className="mt-4 border-t border-emerald-300/10 pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50/55">{copy.impact}</p>
              <p className="mt-2 text-sm text-white/75">{copy.precedence}</p>
              {selectedSchedule?.fallbackDepartment ? (
                <p className="mt-2 text-sm text-white/65">
                  {copy.fallbackConsequence} <strong className="text-white">{selectedSchedule.fallbackDepartment}</strong>.
                </p>
              ) : (
                <p className="mt-2 text-sm text-amber-100">{copy.noFallbackWarning}</p>
              )}

              {(() => {
                const weekly = scheduleImpact.weekly as {
                  gapsByDay?: Record<string, Array<{ start: string; end: string }>>;
                } | undefined;
                if (!weekly?.gapsByDay) return null;
                return (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {WEEKDAYS.map((day) => {
                      const gaps = weekly.gapsByDay?.[day] || [];
                      return (
                        <div key={day} className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-white/60">
                          <strong className="text-white">{DAY_LABELS[lang][day]}</strong>
                          <div className="mt-1">
                            {gaps.length
                              ? gaps.map((gap) => `${gap.start}–${gap.end}`).join(", ")
                              : copy.noGaps}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          ) : null}

          <p className="mt-4 text-xs text-white/45">{copy.futurePublish}</p>
        </div>
      ) : null}
    </section>
  );
}
