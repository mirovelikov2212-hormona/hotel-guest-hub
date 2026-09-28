"use client";

import { useState } from "react";
import { useStaffUi } from "@/components/staff/StaffUiProvider";

type Lang = "bg" | "en" | "de";

const COPY = {
  bg: {
    eyebrow: "ПРОБЛЕМИ",
    title: "Съобщи проблем",
    intro: "Избери къде е проблемът и го опиши с няколко думи. GOSTAYA ще запази хотела и контекста към сигнала.",
    where: "1. Къде е проблемът?",
    problem: "2. Опиши проблема",
    problemPlaceholder: "Напр. Хаускипинг не вижда нова заявка от стая 901.",
    send: "Изпрати проблема",
    sending: "Изпращане…",
    sent: "Проблемът е регистриран.",
    failed: "Проблемът не можа да бъде регистриран.",
    open: "Съобщи проблем",
    close: "Затвори",
  },
  en: {
    eyebrow: "PROBLEMS",
    title: "Report a problem",
    intro: "Choose where the problem is and describe it briefly. GOSTAYA keeps the hotel and context with the report.",
    where: "1. Where is the problem?",
    problem: "2. Describe the problem",
    problemPlaceholder: "Example: Housekeeping cannot see a new request from room 901.",
    send: "Send problem",
    sending: "Sending…",
    sent: "The problem was registered.",
    failed: "The problem could not be registered.",
    open: "Report problem",
    close: "Close",
  },
  de: {
    eyebrow: "PROBLEME",
    title: "Problem melden",
    intro: "Wähle den Bereich und beschreibe das Problem kurz. GOSTAYA speichert Hotel und Kontext zum Hinweis.",
    where: "1. Wo ist das Problem?",
    problem: "2. Problem beschreiben",
    problemPlaceholder: "Beispiel: Housekeeping sieht eine neue Anfrage aus Zimmer 901 nicht.",
    send: "Problem senden",
    sending: "Wird gesendet…",
    sent: "Das Problem wurde registriert.",
    failed: "Das Problem konnte nicht registriert werden.",
    open: "Problem melden",
    close: "Schließen",
  },
} as const;

const MODULES = {
  bg: [
    ["guest_hub", "Портал за госта"],
    ["reception", "Рецепция"],
    ["housekeeping", "Камериерки"],
    ["maintenance", "Технически отдел"],
    ["manager", "Мениджърски панел"],
    ["offers", "Оферти / допълнителни услуги"],
    ["staff_development", "Обучение и персонал"],
    ["notifications", "Съобщения / известия"],
    ["integration", "Интеграции"],
    ["other", "Друго"],
  ],
  en: [
    ["guest_hub", "Guest Hub"],
    ["reception", "Reception"],
    ["housekeeping", "Housekeeping"],
    ["maintenance", "Maintenance"],
    ["manager", "Manager dashboard"],
    ["offers", "Offers / additional services"],
    ["staff_development", "Training & staff"],
    ["notifications", "Messages / notifications"],
    ["integration", "Integrations"],
    ["other", "Other"],
  ],
  de: [
    ["guest_hub", "Guest Hub"],
    ["reception", "Rezeption"],
    ["housekeeping", "Housekeeping"],
    ["maintenance", "Technik"],
    ["manager", "Manager-Dashboard"],
    ["offers", "Angebote / Zusatzleistungen"],
    ["staff_development", "Training & Personal"],
    ["notifications", "Nachrichten / Benachrichtigungen"],
    ["integration", "Integrationen"],
    ["other", "Sonstiges"],
  ],
} satisfies Record<Lang, string[][]>;

function ModuleGrid({
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
                "min-h-10 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition " +
                (selected
                  ? "border-sky-300 bg-sky-50 text-sky-800 ring-2 ring-sky-100"
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
  const modules = MODULES[safeLang];
  const [open, setOpen] = useState(false);
  const [module, setModule] = useState("guest_hub");
  const [summary, setSummary] = useState("");
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
          kind: "workflow",
          module,
          severity: "warning",
          summary: summary.trim(),
          details: "",
        }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean } | null;
      if (!response.ok || !body?.ok) {
        setFeedback(copy.failed);
        return;
      }

      setSummary("");
      setFeedback(copy.sent);
      setOpen(false);
    } catch {
      setFeedback(copy.failed);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-sky-200 bg-white p-4 shadow-[0_12px_30px_rgba(15,58,91,.06)]">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1479d3]">{copy.eyebrow}</p>
        <h3 className="mt-1.5 text-lg font-bold text-slate-900">{copy.title}</h3>
        <p className="mt-1.5 text-sm leading-6 text-slate-600">{copy.intro}</p>
      </div>

      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setFeedback(null);
        }}
        className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-bold text-sky-800 transition hover:bg-sky-100"
      >
        {open ? copy.close : copy.open}
      </button>

      {open ? (
        <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
          <ModuleGrid title={copy.where} options={modules} value={module} onChange={setModule} />

          <label className="block text-sm font-bold text-slate-800">
            {copy.problem}
            <textarea
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              rows={4}
              value={summary}
              maxLength={1800}
              placeholder={copy.problemPlaceholder}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={sending || summary.trim().length < 5}
            className="w-full rounded-xl bg-[#1479d3] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#0f68b7] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {sending ? copy.sending : copy.send}
          </button>
        </div>
      ) : null}

      {feedback ? (
        <p className="mt-3 text-xs font-medium text-slate-600">{feedback}</p>
      ) : null}
    </section>
  );
}
