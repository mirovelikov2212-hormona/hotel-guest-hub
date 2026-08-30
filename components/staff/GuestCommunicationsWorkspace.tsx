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
};

const COPY = {
  bg: {
    title: "Съобщения към гостите",
    intro: "Информация, промени, събития и оферти от вашия отдел към активните гости.",
    reach: "Push обхват",
    devices: "активни устройства",
    newMessage: "Ново съобщение",
    sourceLanguage: "Език на текста",
    category: "Тип",
    messageTitle: "Заглавие",
    messageBody: "Съобщение",
    titlePlaceholder: "Напр. Промяна в работното време",
    bodyPlaceholder: "Напишете ясното съобщение към гостите…",
    saveDraft: "Запази чернова",
    queue: "Подготви за изпращане",
    schedule: "Насрочи",
    scheduledFor: "Дата и час",
    history: "История",
    noMessages: "Все още няма съобщения от този обхват.",
    refresh: "Обнови",
    cancel: "Отмени",
    translating: "Преводите ще бъдат проверени преди реална доставка.",
    queuedSafety: "Подготвените съобщения не се изпращат автоматично, докато delivery gate-ът не е активен.",
    loadError: "Съобщенията временно не са достъпни.",
    actionError: "Действието не беше записано. Опитайте отново.",
  },
  en: {
    title: "Guest communications",
    intro: "Information, changes, events and offers from your department to active guests.",
    reach: "Push reach",
    devices: "active devices",
    newMessage: "New message",
    sourceLanguage: "Source language",
    category: "Type",
    messageTitle: "Title",
    messageBody: "Message",
    titlePlaceholder: "Example: Opening hours change",
    bodyPlaceholder: "Write a clear message for guests…",
    saveDraft: "Save draft",
    queue: "Prepare for delivery",
    schedule: "Schedule",
    scheduledFor: "Date and time",
    history: "History",
    noMessages: "No messages in this scope yet.",
    refresh: "Refresh",
    cancel: "Cancel",
    translating: "Translations will be checked before real delivery.",
    queuedSafety: "Prepared messages are not sent automatically until the delivery gate is active.",
    loadError: "Guest communications are temporarily unavailable.",
    actionError: "The action could not be saved. Please try again.",
  },
  de: {
    title: "Gästekommunikation",
    intro: "Informationen, Änderungen, Veranstaltungen und Angebote Ihrer Abteilung für aktive Gäste.",
    reach: "Push-Reichweite",
    devices: "aktive Geräte",
    newMessage: "Neue Nachricht",
    sourceLanguage: "Ausgangssprache",
    category: "Typ",
    messageTitle: "Titel",
    messageBody: "Nachricht",
    titlePlaceholder: "Beispiel: Änderung der Öffnungszeiten",
    bodyPlaceholder: "Schreiben Sie eine klare Nachricht für die Gäste…",
    saveDraft: "Entwurf speichern",
    queue: "Für Versand vorbereiten",
    schedule: "Planen",
    scheduledFor: "Datum und Uhrzeit",
    history: "Verlauf",
    noMessages: "In diesem Bereich gibt es noch keine Nachrichten.",
    refresh: "Aktualisieren",
    cancel: "Stornieren",
    translating: "Übersetzungen werden vor der tatsächlichen Zustellung geprüft.",
    queuedSafety: "Vorbereitete Nachrichten werden nicht automatisch gesendet, solange das Delivery-Gate nicht aktiv ist.",
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
  const [sourceLanguage, setSourceLanguage] = useState(uiLang);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  useEffect(() => {
    setSourceLanguage((current) => current || uiLang);
  }, [uiLang]);

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
  const categoryOptions = useMemo(
    () => ["information", "event", "change", "offer", "operational", ...(canEmergency ? ["emergency"] : [])],
    [canEmergency],
  );

  async function submit(action: "draft" | "send_now" | "schedule") {
    if (!canCreate || !title.trim() || !body.trim()) return;
    if (action === "send_now" && !canSend) return;
    if (action === "schedule" && (!canSchedule || !scheduledAt)) return;
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
          sourceLanguage,
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
                    <label className="text-sm">
                      <span className="mb-1 block text-[var(--staff-muted)]">{copy.sourceLanguage}</span>
                      <select value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)} className="w-full rounded-xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-3 py-2.5">
                        <option value="bg">BG</option><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="cs">CS</option><option value="ru">RU</option>
                      </select>
                    </label>
                  </div>
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
                    <button disabled={busy || !title.trim() || !body.trim()} onClick={() => void submit("draft")} className="rounded-xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-3 py-2 text-sm font-semibold disabled:opacity-40">{copy.saveDraft}</button>
                    {canSend ? <button disabled={busy || !title.trim() || !body.trim()} onClick={() => void submit("send_now")} className="rounded-xl border border-sky-400/25 bg-sky-400/10 px-3 py-2 text-sm font-semibold text-sky-700 disabled:opacity-40">{copy.queue}</button> : null}
                    {canSchedule ? <button disabled={busy || !title.trim() || !body.trim() || !scheduledAt} onClick={() => void submit("schedule")} className="rounded-xl border border-violet-400/25 bg-violet-400/10 px-3 py-2 text-sm font-semibold text-violet-700 disabled:opacity-40">{copy.schedule}</button> : null}
                  </div>
                  <p className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-700">{copy.queuedSafety}</p>
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
