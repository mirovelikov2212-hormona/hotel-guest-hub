"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import StaffCollapsiblePanel from "@/components/staff/StaffCollapsiblePanel";
import { useStaffUi } from "@/components/staff/StaffUiProvider";

type CapabilityMap = Record<string, boolean>;
type MessageRow = {
  id: string;
  actor_role: string;
  category: string;
  source_language: string;
  title: string;
  body: string;
  translation_status: string;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  delivery_total: number;
  delivery_sent: number;
  delivery_failed: number;
  delivery_expired: number;
  created_at: string;
  departments?: { name?: string | null; code?: string | null } | null;
};

type WorkspacePayload = {
  ok?: boolean;
  pushReach?: number;
  capabilities?: CapabilityMap;
  messages?: MessageRow[];
  department?: { name?: string | null; code?: string | null } | null;
  hotelSourceLanguage?: string;
  deliveryEnabled?: boolean;
};

const COPY = {
  bg: {
    title: "Съобщения към гостите",
    intro: "Информация, промени, събития и оферти от вашия отдел към активните гости.",
    reach: "Push обхват",
    devices: "активни устройства",
    newMessage: "Ново съобщение",
    sourceLanguage: "Език на хотела",
    sourceLanguageHelp: "Пишете на основния език на хотела. StayHub превежда автоматично съобщението и всеки активен гост го получава на езика на своя Hub.",
    category: "Тип",
    messageTitle: "Заглавие",
    messageBody: "Съобщение",
    titlePlaceholder: "Напр. Промяна в работното време",
    bodyPlaceholder: "Напишете ясното съобщение към гостите…",
    saveDraft: "Запази чернова",
    send: "Изпрати",
    schedule: "Насрочи",
    scheduledFor: "Дата и час",
    history: "История",
    noMessages: "Все още няма съобщения от този обхват.",
    refresh: "Обнови",
    cancel: "Отмени",
    translating: "При изпращане StayHub подготвя BG, EN, DE, RO, CS и RU и избира правилния вариант за всеки гост.",
    deliveryOff: "Реалното изпращане е временно изключено в текущия тестов етап. Бутонът „Изпрати“ ще се активира при финалното включване на delivery.",
    deliveryOn: "Изпращането е активно. Съобщението ще бъде доставено само до валидните активни гост устройства.",
    loadError: "Съобщенията временно не са достъпни.",
    actionError: "Действието не беше записано. Опитайте отново.",
  },
  en: {
    title: "Guest communications",
    intro: "Information, changes, events and offers from your department to active guests.",
    reach: "Push reach",
    devices: "active devices",
    newMessage: "New message",
    sourceLanguage: "Hotel language",
    sourceLanguageHelp: "Write in the hotel's primary language. StayHub translates automatically and each active guest receives the message in their Hub language.",
    category: "Type",
    messageTitle: "Title",
    messageBody: "Message",
    titlePlaceholder: "Example: Opening hours change",
    bodyPlaceholder: "Write a clear message for guests…",
    saveDraft: "Save draft",
    send: "Send",
    schedule: "Schedule",
    scheduledFor: "Date and time",
    history: "History",
    noMessages: "No messages in this scope yet.",
    refresh: "Refresh",
    cancel: "Cancel",
    translating: "When sending, StayHub prepares BG, EN, DE, RO, CS and RU and selects the correct version for each guest.",
    deliveryOff: "Real delivery is temporarily disabled during this test stage. The Send button will activate when delivery is enabled for release.",
    deliveryOn: "Delivery is active. The message will be sent only to valid active guest devices.",
    loadError: "Guest communications are temporarily unavailable.",
    actionError: "The action could not be saved. Please try again.",
  },
  de: {
    title: "Gästekommunikation",
    intro: "Informationen, Änderungen, Veranstaltungen und Angebote Ihrer Abteilung für aktive Gäste.",
    reach: "Push-Reichweite",
    devices: "aktive Geräte",
    newMessage: "Neue Nachricht",
    sourceLanguage: "Hotelsprache",
    sourceLanguageHelp: "Schreiben Sie in der Hauptsprache des Hotels. StayHub übersetzt automatisch und jeder aktive Gast erhält die Nachricht in seiner Hub-Sprache.",
    category: "Typ",
    messageTitle: "Titel",
    messageBody: "Nachricht",
    titlePlaceholder: "Beispiel: Änderung der Öffnungszeiten",
    bodyPlaceholder: "Schreiben Sie eine klare Nachricht für die Gäste…",
    saveDraft: "Entwurf speichern",
    send: "Senden",
    schedule: "Planen",
    scheduledFor: "Datum und Uhrzeit",
    history: "Verlauf",
    noMessages: "In diesem Bereich gibt es noch keine Nachrichten.",
    refresh: "Aktualisieren",
    cancel: "Stornieren",
    translating: "Beim Senden erstellt StayHub BG, EN, DE, RO, CS und RU und wählt für jeden Gast die richtige Version.",
    deliveryOff: "Die reale Zustellung ist in dieser Testphase vorübergehend deaktiviert. Der Senden-Button wird beim finalen Delivery-Start aktiviert.",
    deliveryOn: "Die Zustellung ist aktiv. Die Nachricht wird nur an gültige aktive Gastgeräte gesendet.",
    loadError: "Die Gästekommunikation ist vorübergehend nicht verfügbar.",
    actionError: "Die Aktion konnte nicht gespeichert werden. Bitte erneut versuchen.",
  },
} as const;

const CATEGORY_LABELS: Record<string, Record<"bg" | "en" | "de", string>> = {
  information: { bg: "Информация", en: "Information", de: "Information" },
  event: { bg: "Събитие", en: "Event", de: "Veranstaltung" },
  change: { bg: "Промяна", en: "Change", de: "Änderung" },
  offer: { bg: "Оферта", en: "Offer", de: "Angebot" },
  operational: { bg: "Оперативно", en: "Operational", de: "Betrieblich" },
  emergency: { bg: "Спешно", en: "Emergency", de: "Dringend" },
};

const LANGUAGE_LABELS: Record<string, Record<"bg" | "en" | "de", string>> = {
  bg: { bg: "Български", en: "Bulgarian", de: "Bulgarisch" },
  en: { bg: "Английски", en: "English", de: "Englisch" },
  de: { bg: "Немски", en: "German", de: "Deutsch" },
  ro: { bg: "Румънски", en: "Romanian", de: "Rumänisch" },
  cs: { bg: "Чешки", en: "Czech", de: "Tschechisch" },
  ru: { bg: "Руски", en: "Russian", de: "Russisch" },
};

function statusTone(status: string) {
  if (status === "sent") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-700";
  if (status === "failed" || status === "partial_failed") return "border-rose-400/25 bg-rose-400/10 text-rose-700";
  if (status === "queued" || status === "sending") return "border-sky-400/25 bg-sky-400/10 text-sky-700";
  if (status === "scheduled") return "border-violet-400/25 bg-violet-400/10 text-violet-700";
  if (status === "cancelled") return "border-neutral-400/25 bg-neutral-400/10 text-neutral-600";
  return "border-amber-400/25 bg-amber-400/10 text-amber-700";
}

export default function GuestCommunicationsWorkspace({
  hotelSlug,
  role,
}: {
  hotelSlug: string;
  role: string;
}) {
  const { lang } = useStaffUi();
  const uiLang = lang === "de" ? "de" : lang === "en" ? "en" : "bg";
  const copy = COPY[uiLang];
  const [payload, setPayload] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("information");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ hotelSlug, role, _: String(Date.now()) });
      const response = await fetch(`/api/staff/guest-communications?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) {
        setPayload(null);
        return;
      }
      if (!response.ok) throw new Error(`communications ${response.status}`);
      const next = await response.json() as WorkspacePayload;
      setPayload(next);
      setError("");
    } catch (loadError) {
      console.error("Guest Communications workspace load failed", loadError);
      setError(copy.loadError);
    } finally {
      setLoading(false);
    }
  }, [copy.loadError, hotelSlug, role]);

  useEffect(() => {
    void load();
  }, [load]);

  const capabilities = payload?.capabilities || {};
  const canCreate = Boolean(capabilities["guest_communications.create"]);
  const canSend = Boolean(capabilities["guest_communications.send"]);
  const canSchedule = Boolean(capabilities["guest_communications.schedule"]);
  const canEmergency = Boolean(capabilities["guest_communications.emergency_send"]);
  const deliveryEnabled = Boolean(payload?.deliveryEnabled);
  const hotelSourceLanguage = String(payload?.hotelSourceLanguage || "en").toLowerCase();
  const hotelSourceLanguageLabel = LANGUAGE_LABELS[hotelSourceLanguage]?.[uiLang] || hotelSourceLanguage.toUpperCase();
  const categoryOptions = useMemo(
    () => ["information", "event", "change", "offer", "operational", ...(canEmergency ? ["emergency"] : [])],
    [canEmergency],
  );

  async function submit(action: "draft" | "send_now" | "schedule") {
    if (!canCreate || !title.trim() || !body.trim()) return;
    if (action === "send_now" && (!canSend || !deliveryEnabled)) return;
    if (action === "schedule" && (!canSchedule || !deliveryEnabled || !scheduledAt)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/staff/guest-communications", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelSlug,
          role,
          action,
          category,
          title: title.trim(),
          body: body.trim(),
          scheduledAt: action === "schedule" ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      if (!response.ok) throw new Error(`communications action ${response.status}`);
      setTitle("");
      setBody("");
      setScheduledAt("");
      await load();
    } catch (submitError) {
      console.error("Guest Communications action failed", submitError);
      setError(copy.actionError);
    } finally {
      setBusy(false);
    }
  }

  async function cancelMessage(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/staff/guest-communications", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelSlug, role, action: "cancel", communicationId: id }),
      });
      if (!response.ok) throw new Error(`cancel ${response.status}`);
      await load();
    } catch (cancelError) {
      console.error("Guest Communications cancel failed", cancelError);
      setError(copy.actionError);
    } finally {
      setBusy(false);
    }
  }

  if (!payload && !loading && !error) return null;

  return (
    <div className="mb-5">
      <StaffCollapsiblePanel
        title={copy.title}
        summary={copy.intro}
        badge={payload ? (
          <span className="rounded-full border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-2.5 py-1 text-xs font-semibold">
            {copy.reach}: {payload.pushReach || 0}
          </span>
        ) : null}
      >
        {error ? <div className="mb-4 rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-700">{error}</div> : null}
        {loading && !payload ? <p className="text-sm text-[var(--staff-muted)]">…</p> : null}

        {payload ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--staff-faint)]">{copy.reach}</p>
                <p className="mt-1 text-2xl font-semibold">{payload.pushReach || 0}</p>
                <p className="mt-1 text-xs text-[var(--staff-muted)]">{copy.devices}</p>
              </div>

              {canCreate ? (
                <div className="space-y-3 rounded-2xl border border-[var(--staff-border)] bg-[var(--staff-surface)] p-4">
                  <h3 className="font-semibold">{copy.newMessage}</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      <span className="mb-1 block text-[var(--staff-muted)]">{copy.category}</span>
                      <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-3 py-2.5">
                        {categoryOptions.map((value) => <option key={value} value={value}>{CATEGORY_LABELS[value]?.[uiLang] || value}</option>)}
                      </select>
                    </label>
                    <div className="rounded-xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-3 py-2.5 text-sm">
                      <span className="block text-xs text-[var(--staff-muted)]">{copy.sourceLanguage}</span>
                      <strong className="mt-0.5 block font-semibold text-[var(--staff-text)]">{hotelSourceLanguageLabel} ({hotelSourceLanguage.toUpperCase()})</strong>
                    </div>
                  </div>
                  <p className="rounded-xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] p-3 text-xs leading-5 text-[var(--staff-muted)]">{copy.sourceLanguageHelp}</p>
                  <label className="block text-sm">
                    <span className="mb-1 block text-[var(--staff-muted)]">{copy.messageTitle}</span>
                    <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder={copy.titlePlaceholder} className="w-full rounded-xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-3 py-2.5" />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-[var(--staff-muted)]">{copy.messageBody}</span>
                    <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={1000} rows={5} placeholder={copy.bodyPlaceholder} className="w-full resize-y rounded-xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-3 py-2.5" />
                  </label>
                  {canSchedule ? (
                    <label className="block text-sm">
                      <span className="mb-1 block text-[var(--staff-muted)]">{copy.scheduledFor}</span>
                      <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="w-full rounded-xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-3 py-2.5" />
                    </label>
                  ) : null}
                  <p className="text-xs leading-5 text-[var(--staff-muted)]">{copy.translating}</p>
                  <div className="flex flex-wrap gap-2">
                    <button disabled={busy || !title.trim() || !body.trim()} onClick={() => void submit("draft")} className="rounded-xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-4 py-2.5 text-sm font-semibold disabled:opacity-40">{copy.saveDraft}</button>
                    {canSend ? <button disabled={busy || !deliveryEnabled || !title.trim() || !body.trim()} onClick={() => void submit("send_now")} className="stayhub-communication-send rounded-xl border px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45">{copy.send}</button> : null}
                    {canSchedule ? <button disabled={busy || !deliveryEnabled || !title.trim() || !body.trim() || !scheduledAt} onClick={() => void submit("schedule")} className="stayhub-communication-schedule rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45">{copy.schedule}</button> : null}
                  </div>
                  <p className={`rounded-xl border p-3 text-xs leading-5 ${deliveryEnabled ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-700" : "border-amber-400/25 bg-amber-400/10 text-amber-700"}`}>
                    {deliveryEnabled ? copy.deliveryOn : copy.deliveryOff}
                  </p>
                </div>
              ) : null}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-semibold">{copy.history}</h3>
                <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40">{copy.refresh}</button>
              </div>
              <div className="max-h-[40rem] space-y-3 overflow-y-auto pr-1">
                {(payload.messages || []).length ? (payload.messages || []).map((message) => (
                  <article key={message.id} className="rounded-2xl border border-[var(--staff-border)] bg-[var(--staff-surface)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(message.status)}`}>{message.status}</span>
                          <span className="rounded-full border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-2.5 py-1 text-xs">{CATEGORY_LABELS[message.category]?.[uiLang] || message.category}</span>
                          <span className="rounded-full border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-2.5 py-1 text-xs uppercase">{message.source_language}</span>
                        </div>
                        <h4 className="mt-3 font-semibold">{message.title}</h4>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--staff-muted)]">{message.body}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--staff-faint)]">
                      <span>{new Date(message.created_at).toLocaleString()}</span>
                      <span>{message.departments?.name || message.actor_role}</span>
                      <span>translation: {message.translation_status}</span>
                      {message.delivery_total > 0 ? <span>{message.delivery_sent}/{message.delivery_total} delivered</span> : null}
                    </div>
                    {["draft", "scheduled", "queued"].includes(message.status) && canCreate ? (
                      <button type="button" disabled={busy} onClick={() => void cancelMessage(message.id)} className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/10 px-2.5 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-40">{copy.cancel}</button>
                    ) : null}
                  </article>
                )) : <div className="rounded-2xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] p-5 text-sm text-[var(--staff-muted)]">{copy.noMessages}</div>}
              </div>
            </div>
          </div>
        ) : null}
      </StaffCollapsiblePanel>
    </div>
  );
}
