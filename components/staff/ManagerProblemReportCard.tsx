"use client";

import { useState } from "react";

import { useStaffUi } from "@/components/staff/StaffUiProvider";

const COPY = {
  bg: {
    title: "Report a problem",
    intro:
      "Ако видиш системен, конфигурационен или човешки проблем, изпрати го към GOSTAYA Incident Center.",
    kind: "Тип",
    module: "Модул",
    severity: "Тежест",
    summary: "Какъв е проблемът?",
    details: "Подробности",
    send: "Изпрати проблема",
    sending: "Изпращане…",
    sent: "Проблемът е регистриран.",
    failed: "Проблемът не можа да бъде регистриран.",
  },
  en: {
    title: "Report a problem",
    intro:
      "Report a system, configuration, integration or human-error issue to the GOSTAYA Incident Center.",
    kind: "Type",
    module: "Module",
    severity: "Severity",
    summary: "What is the problem?",
    details: "Details",
    send: "Report problem",
    sending: "Sending…",
    sent: "The problem was registered.",
    failed: "The problem could not be registered.",
  },
  de: {
    title: "Problem melden",
    intro:
      "Melde System-, Konfigurations-, Integrations- oder Bedienfehler an das GOSTAYA Incident Center.",
    kind: "Typ",
    module: "Modul",
    severity: "Schweregrad",
    summary: "Was ist das Problem?",
    details: "Details",
    send: "Problem melden",
    sending: "Wird gesendet…",
    sent: "Das Problem wurde registriert.",
    failed: "Das Problem konnte nicht registriert werden.",
  },
} as const;

export default function ManagerProblemReportCard({
  hotelSlug,
}: {
  hotelSlug: string;
}) {
  const { lang } = useStaffUi();
  const copy = COPY[lang] || COPY.en;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("human_error");
  const [module, setModule] = useState("staff_operations");
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

      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean }
        | null;

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

  const inputClass =
    "mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none";

  return (
    <section className="rounded-2xl border border-amber-300/20 bg-amber-400/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-100/70">
            {copy.title}
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/60">
            {copy.intro}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((value) => !value);
            setFeedback(null);
          }}
          className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-50"
        >
          {open ? "×" : "+"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-xs text-white/45">
              {copy.kind}
              <select
                className={inputClass}
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="human_error">Human error</option>
                <option value="technical">Technical</option>
                <option value="configuration">Configuration</option>
                <option value="integration">Integration</option>
                <option value="data_quality">Data quality</option>
                <option value="workflow">Workflow</option>
              </select>
            </label>

            <label className="text-xs text-white/45">
              {copy.module}
              <input
                className={inputClass}
                value={module}
                onChange={(e) => setModule(e.target.value)}
                placeholder="staff_operations"
              />
            </label>

            <label className="text-xs text-white/45">
              {copy.severity}
              <select
                className={inputClass}
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="critical">Critical</option>
              </select>
            </label>
          </div>

          <label className="block text-xs text-white/45">
            {copy.summary}
            <input
              className={inputClass}
              value={summary}
              maxLength={500}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>

          <label className="block text-xs text-white/45">
            {copy.details}
            <textarea
              className={inputClass}
              rows={4}
              value={details}
              maxLength={3000}
              onChange={(e) => setDetails(e.target.value)}
            />
          </label>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={sending || summary.trim().length < 5}
            className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-2.5 text-sm font-semibold text-amber-50 disabled:opacity-35"
          >
            {sending ? copy.sending : copy.send}
          </button>
        </div>
      ) : null}

      {feedback ? (
        <p className="mt-3 text-xs text-white/55">{feedback}</p>
      ) : null}
    </section>
  );
}
