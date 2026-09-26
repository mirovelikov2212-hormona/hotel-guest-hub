"use client";

import { useState } from "react";
import { useStaffUi } from "@/components/staff/StaffUiProvider";

type Lang = "bg" | "en" | "de";

const COPY = {
  bg: {
    eyebrow: "ПРОБЛЕМ / INCIDENT CENTER",
    title: "Съобщи проблем",
    intro: "Опиши какво не работи както трябва. GOSTAYA ще запази хотела, модула и контекста към сигнала.",
    where: "1. Къде се случва?",
    what: "2. Какъв е проблемът?",
    urgency: "3. Колко е спешно?",
    summary: "Опиши проблема накратко",
    summaryPlaceholder: "Напр. Housekeeping не вижда нова заявка от стая 901",
    details: "Допълнителни подробности (по желание)",
    detailsPlaceholder: "Какво очакваше да се случи и какво се случи вместо това?",
    send: "Изпрати проблема",
    sending: "Изпращане…",
    sent: "Проблемът е регистриран в Incident Center.",
    failed: "Проблемът не можа да бъде регистриран.",
    open: "Съобщи проблем",
    close: "Затвори",
  },
  en: {
    eyebrow: "PROBLEM / INCIDENT CENTER",
    title: "Report a problem",
    intro: "Describe what is not working as expected. GOSTAYA keeps the hotel, module and operational context with the report.",
    where: "1. Where did it happen?",
    what: "2. What kind of problem is it?",
    urgency: "3. How urgent is it?",
    summary: "Describe the problem briefly",
    summaryPlaceholder: "Example: Housekeeping cannot see a new request from room 901",
    details: "Additional details (optional)",
    detailsPlaceholder: "What did you expect and what happened instead?",
    send: "Send problem",
    sending: "Sending…",
    sent: "The problem was registered in Incident Center.",
    failed: "The problem could not be registered.",
    open: "Report problem",
    close: "Close",
  },
  de: {
    eyebrow: "PROBLEM / INCIDENT CENTER",
    title: "Problem melden",
    intro: "Beschreibe, was nicht wie erwartet funktioniert. GOSTAYA speichert Hotel, Modul und operativen Kontext zum Hinweis.",
    where: "1. Wo ist das Problem aufgetreten?",
    what: "2. Um welche Art Problem geht es?",
    urgency: "3. Wie dringend ist es?",
    summary: "Problem kurz beschreiben",
    summaryPlaceholder: "Beispiel: Housekeeping sieht eine neue Anfrage aus Zimmer 901 nicht",
    details: "Weitere Details (optional)",
    detailsPlaceholder: "Was wurde erwartet und was ist stattdessen passiert?",
    send: "Problem senden",
    sending: "Wird gesendet…",
    sent: "Das Problem wurde im Incident Center registriert.",
    failed: "Das Problem konnte nicht registriert werden.",
    open: "Problem melden",
    close: "Schließen",
  },
} as const;

const OPTIONS = {
  bg: {
    modules: [
      ["guest_hub", "Guest Hub"],
      ["reception", "Рецепция"],
      ["housekeeping", "Камериерки"],
      ["maintenance", "Технически отдел"],
      ["manager", "Manager панел"],
      ["offers", "Оферти / Upsell"],
      ["staff_development", "Обучение и персонал"],
      ["notifications", "Съобщения / известия"],
      ["integration", "Интеграция"],
      ["other", "Друго"],
    ],
    kinds: [
      ["human_error", "Човешка грешка"],
      ["workflow", "Процесът не работи правилно"],
      ["technical", "Технически проблем"],
      ["configuration", "Грешна настройка"],
      ["integration", "Външна интеграция"],
      ["data_quality", "Неточни / липсващи данни"],
    ],
    severity: [
      ["info", "Ниско · не пречи на работата"],
      ["warning", "Средно · затруднява работата"],
      ["error", "Високо · важна функция не работи"],
      ["critical", "Критично · работата е блокирана"],
    ],
  },
  en: {
    modules: [
      ["guest_hub", "Guest Hub"],
      ["reception", "Reception"],
      ["housekeeping", "Housekeeping"],
      ["maintenance", "Maintenance"],
      ["manager", "Manager dashboard"],
      ["offers", "Offers / Upsell"],
      ["staff_development", "Training & staff"],
      ["notifications", "Messages / notifications"],
      ["integration", "Integration"],
      ["other", "Other"],
    ],
    kinds: [
      ["human_error", "Human error"],
      ["workflow", "Workflow does not work as expected"],
      ["technical", "Technical problem"],
      ["configuration", "Wrong configuration"],
      ["integration", "External integration"],
      ["data_quality", "Wrong / missing data"],
    ],
    severity: [
      ["info", "Low · work can continue"],
      ["warning", "Medium · work is affected"],
      ["error", "High · important function is unavailable"],
      ["critical", "Critical · work is blocked"],
    ],
  },
  de: {
    modules: [
      ["guest_hub", "Guest Hub"],
      ["reception", "Rezeption"],
      ["housekeeping", "Housekeeping"],
      ["maintenance", "Technik"],
      ["manager", "Manager-Dashboard"],
      ["offers", "Angebote / Upsell"],
      ["staff_development", "Training & Personal"],
      ["notifications", "Nachrichten / Benachrichtigungen"],
      ["integration", "Integration"],
      ["other", "Sonstiges"],
    ],
    kinds: [
      ["human_error", "Bedienfehler"],
      ["workflow", "Prozess funktioniert nicht wie erwartet"],
      ["technical", "Technisches Problem"],
      ["configuration", "Falsche Konfiguration"],
      ["integration", "Externe Integration"],
      ["data_quality", "Falsche / fehlende Daten"],
    ],
    severity: [
      ["info", "Niedrig · Arbeit kann fortgesetzt werden"],
      ["warning", "Mittel · Arbeit ist beeinträchtigt"],
      ["error", "Hoch · wichtige Funktion fällt aus"],
      ["critical", "Kritisch · Arbeit ist blockiert"],
    ],
  },
} satisfies Record<Lang, {
  modules: string[][];
  kinds: string[][];
  severity: string[][];
}>;

function ChoiceGrid({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: string[][];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-bold text-[#102a43]">{title}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map(([id, label]) => {
          const selected = value === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-pressed={selected}
              className={
                "min-h-11 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition " +
                (selected
                  ? "border-[#1479d3] bg-[#1479d3] text-white shadow-sm"
                   : "border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50")
              }
            >
              {label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function ManagerProblemReportCard({
  hotelSlug,
}: {
  hotelSlug: string;
}) {
  const { lang } = useStaffUi();
  const safeLang = (lang === "bg" || lang === "de" ? lang : "en") as Lang;
  const copy = COPY[safeLang];
  const options = OPTIONS[safeLang];
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("workflow");
  const [module, setModule] = useState("guest_hub");
  const [severity, setSeverity] = useState("warning");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function submit() {
    if (sending || summary.trim().length < 5) return;
    setSending(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/staff/incidents/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          hotelSlug,
          kind,
          module,
          severity,
          summary: summary.trim(),
          details: details.trim(),
        }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean } | null;
      if (!response.ok || !body?.ok) {
        setFeedback(copy.failed);
        return;
      }
      setSummary("");
      setDetails("");
      setFeedback(copy.sent);
      setOpen(false);
    } catch {
      setFeedback(copy.failed);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="h-full rounded-2xl border border-sky-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,58,91,.08)]">
      <div className="flex h-full flex-col">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1479d3]">{copy.eyebrow}</p>
          <h3 className="mt-2 text-lg font-bold text-slate-900">{copy.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{copy.intro}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((value) => !value);
            setFeedback(null);
          }}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-[#1479d3] bg-[#1479d3] px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-sky-100 transition hover:bg-[#0f68b7]"
        >
          {open ? copy.close : copy.open}
        </button>

        {open ? (
          <div className="mt-5 space-y-5 border-t border-slate-200 pt-5">
            <ChoiceGrid title={copy.where} options={options.modules} value={module} onChange={setModule} />
            <ChoiceGrid title={copy.what} options={options.kinds} value={kind} onChange={setKind} />
            <ChoiceGrid title={copy.urgency} options={options.severity} value={severity} onChange={setSeverity} />

            <label className="block text-sm font-bold text-slate-800">
              {copy.summary}
              <input
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-600"
                value={summary}
                maxLength={500}
                placeholder={copy.summaryPlaceholder}
                onChange={(e) => setSummary(e.target.value)}
              />
            </label>

            <label className="block text-sm font-bold text-slate-800">
              {copy.details}
              <textarea
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-600"
                rows={4}
                value={details}
                maxLength={3000}
                placeholder={copy.detailsPlaceholder}
                onChange={(e) => setDetails(e.target.value)}
              />
            </label>

            <button
              type="button"
              onClick={() => void submit()}
              disabled={sending || summary.trim().length < 5}
              className="w-full rounded-xl bg-[#1479d3] px-4 py-3 text-sm font-bold text-white shadow-md shadow-sky-100 transition hover:bg-[#0f68b7] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              {sending ? copy.sending : copy.send}
            </button>
          </div>
        ) : null}

        {feedback ? (
          <p className="mt-3 text-xs font-medium text-slate-600">{feedback}</p>
        ) : null}
      </div>
    </section>
  );
}
