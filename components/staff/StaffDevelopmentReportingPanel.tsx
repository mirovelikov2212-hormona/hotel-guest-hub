"use client";

import { useCallback, useEffect, useState } from "react";

type Brief = {
  schemaVersion: string;
  hotelId: string;
  timeZone: string;
  generatedAt: string;
  reportingDay: string;
  yesterday: {
    assignments: number;
    completions: number;
    assessmentsSubmitted: number;
    verifiedResults: number;
    passed: number;
    failed: number;
    hrEvaluations: number;
  };
  current: {
    pendingHumanReviews: number;
    overdueTrainingAssignments: number;
    hrRuleFindings: number;
  };
  attentionItems: Array<{
    kind: string;
    severity: string;
    staffUserId: string;
    staffName: string;
    sourceId: string;
    occurredAt: string;
    ruleId?: string;
    action?: string;
  }>;
  notificationCandidates: Array<{
    key: string;
    reason: string;
    severity: string;
    staffUserId: string;
    sourceId: string;
    humanActionRequired: boolean;
  }>;
  history: Array<{
    day: string;
    assignments: number;
    completions: number;
    assessmentsSubmitted: number;
    verifiedResults: number;
    passed: number;
    failed: number;
    hrEvaluations: number;
  }>;
  decisionAuthority: string;
  automatedEmploymentDecision: boolean;
  notificationDeliveryStatus: string;
};

const COPY = {
  bg: {
    title: "Manager Morning Brief",
    subtitle: "Детерминистичен отчет от проверимите Staff Development данни",
    yesterday: "Вчера",
    hotelTime: "Хотелско време",
    assigned: "Възложени",
    completed: "Завършени",
    submitted: "Предадени тестове",
    verified: "Проверени резултати",
    passed: "Издържани",
    failed: "Неиздържани",
    hr: "HR оценки",
    attention: "Нужда от внимание",
    noAttention: "Няма текущи Staff Development задачи за внимание.",
    pendingReview: "Тест чака Manager проверка",
    overdueTraining: "Просрочено обучение",
    hrRule: "HR правило изисква Manager преглед",
    history: "Последни 7 дни",
    notifications: "Notification candidates",
    notificationsHelp:
      "Кандидатите са изчислени, но не се изпращат преди финалния системен E2E.",
    noNotifications: "Няма кандидати за известяване.",
    refresh: "Обнови отчета",
    loading: "Зареждане на Manager brief…",
    humanDecision:
      "Отчетът и HR сигналите са помощни. Решенията остават изцяло при Manager-а.",
  },
  en: {
    title: "Manager Morning Brief",
    subtitle: "Deterministic report from verified Staff Development evidence",
    yesterday: "Yesterday",
    hotelTime: "Hotel time",
    assigned: "Assigned",
    completed: "Completed",
    submitted: "Assessments submitted",
    verified: "Verified results",
    passed: "Passed",
    failed: "Failed",
    hr: "HR evaluations",
    attention: "Needs attention",
    noAttention: "No current Staff Development attention items.",
    pendingReview: "Assessment awaiting Manager review",
    overdueTraining: "Training assignment overdue",
    hrRule: "HR rule requires Manager review",
    history: "Last 7 days",
    notifications: "Notification candidates",
    notificationsHelp:
      "Candidates are calculated but are not delivered before the final system E2E.",
    noNotifications: "No notification candidates.",
    refresh: "Refresh brief",
    loading: "Loading Manager brief…",
    humanDecision:
      "The brief and HR signals are advisory. Decisions remain with the Manager.",
  },
  de: {
    title: "Manager Morning Brief",
    subtitle:
      "Deterministischer Bericht aus verifizierten Staff-Development-Daten",
    yesterday: "Gestern",
    hotelTime: "Hotelzeit",
    assigned: "Zugewiesen",
    completed: "Abgeschlossen",
    submitted: "Tests abgegeben",
    verified: "Verifizierte Ergebnisse",
    passed: "Bestanden",
    failed: "Nicht bestanden",
    hr: "HR-Auswertungen",
    attention: "Handlungsbedarf",
    noAttention: "Aktuell gibt es keine Staff-Development-Hinweise.",
    pendingReview: "Test wartet auf Manager-Prüfung",
    overdueTraining: "Schulung überfällig",
    hrRule: "HR-Regel erfordert Manager-Prüfung",
    history: "Letzte 7 Tage",
    notifications: "Notification candidates",
    notificationsHelp:
      "Kandidaten werden berechnet, aber vor dem finalen System-E2E nicht versendet.",
    noNotifications: "Keine Notification-Kandidaten.",
    refresh: "Bericht aktualisieren",
    loading: "Manager Brief wird geladen…",
    humanDecision:
      "Bericht und HR-Signale sind unterstützend. Entscheidungen bleiben beim Manager.",
  },
} as const;

function attentionLabel(kind: string, copy: typeof COPY.en) {
  if (kind === "pending_review") return copy.pendingReview;
  if (kind === "overdue_training") return copy.overdueTraining;
  if (kind === "hr_rule") return copy.hrRule;
  return kind;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value || "—";
  return date.toLocaleString();
}

export default function StaffDevelopmentReportingPanel({
  hotelSlug,
  lang,
}: {
  hotelSlug: string;
  lang: string;
}) {
  const copy = COPY[lang as keyof typeof COPY] || COPY.en;
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/staff/development/reporting?hotelSlug=${encodeURIComponent(hotelSlug)}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const body = await response.json().catch(() => null) as {
        ok?: boolean;
        brief?: Brief;
        error?: string;
      } | null;

      if (!response.ok || !body?.ok || !body.brief) {
        throw new Error(body?.error || "STAFF_REPORTING_LOAD_FAILED");
      }
      setBrief(body.brief);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [hotelSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !brief) {
    return (
      <section className="rounded-3xl border p-5 shadow-sm">
        <p className="text-sm opacity-60">{copy.loading}</p>
      </section>
    );
  }

  if (error && !brief) {
    return (
      <section className="rounded-3xl border border-rose-500/20 p-5 shadow-sm">
        <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-xl border px-3 py-2 text-sm font-semibold"
        >
          {copy.refresh}
        </button>
      </section>
    );
  }

  if (!brief) return null;

  const summary = [
    [copy.assigned, brief.yesterday.assignments],
    [copy.completed, brief.yesterday.completions],
    [copy.submitted, brief.yesterday.assessmentsSubmitted],
    [copy.verified, brief.yesterday.verifiedResults],
    [copy.passed, brief.yesterday.passed],
    [copy.failed, brief.yesterday.failed],
    [copy.hr, brief.yesterday.hrEvaluations],
  ];

  return (
    <section className="rounded-3xl border p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">{copy.title}</h3>
          <p className="mt-1 text-sm opacity-65">{copy.subtitle}</p>
          <p className="mt-1 text-xs opacity-50">
            {copy.yesterday}: {brief.reportingDay} · {copy.hotelTime}: {brief.timeZone}
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-40"
        >
          {copy.refresh}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {summary.map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border p-3">
            <p className="text-xs font-semibold opacity-55">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border p-4">
          <h4 className="font-semibold">{copy.attention}</h4>
          {!brief.attentionItems.length ? (
            <p className="mt-2 text-sm opacity-60">{copy.noAttention}</p>
          ) : (
            <div className="mt-3 space-y-2">
              {brief.attentionItems.map((item) => (
                <div
                  key={`${item.kind}:${item.sourceId}:${item.ruleId || ""}`}
                  className="rounded-xl border p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {attentionLabel(item.kind, copy)}
                    </p>
                    <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase opacity-70">
                      {item.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-sm opacity-75">{item.staffName || item.staffUserId}</p>
                  <p className="mt-1 text-xs opacity-50">
                    {formatDate(item.occurredAt)}
                    {item.ruleId ? ` · ${item.ruleId}` : ""}
                    {item.action ? ` · ${item.action}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border p-4">
          <h4 className="font-semibold">{copy.notifications}</h4>
          <p className="mt-1 text-xs opacity-55">{copy.notificationsHelp}</p>
          {!brief.notificationCandidates.length ? (
            <p className="mt-3 text-sm opacity-60">{copy.noNotifications}</p>
          ) : (
            <div className="mt-3 space-y-2">
              {brief.notificationCandidates.map((candidate) => (
                <div key={candidate.key} className="rounded-xl border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{candidate.reason}</span>
                    <span className="text-xs uppercase opacity-60">
                      {candidate.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-xs opacity-55">
                    {candidate.staffUserId} · {candidate.sourceId}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border">
        <div className="border-b px-4 py-3">
          <h4 className="font-semibold">{copy.history}</h4>
        </div>
        <table className="min-w-[760px] w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs opacity-55">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">{copy.assigned}</th>
              <th className="px-3 py-2">{copy.completed}</th>
              <th className="px-3 py-2">{copy.submitted}</th>
              <th className="px-3 py-2">{copy.verified}</th>
              <th className="px-3 py-2">{copy.passed}</th>
              <th className="px-3 py-2">{copy.failed}</th>
              <th className="px-3 py-2">{copy.hr}</th>
            </tr>
          </thead>
          <tbody>
            {brief.history.map((row) => (
              <tr key={row.day} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{row.day}</td>
                <td className="px-3 py-2">{row.assignments}</td>
                <td className="px-3 py-2">{row.completions}</td>
                <td className="px-3 py-2">{row.assessmentsSubmitted}</td>
                <td className="px-3 py-2">{row.verifiedResults}</td>
                <td className="px-3 py-2">{row.passed}</td>
                <td className="px-3 py-2">{row.failed}</td>
                <td className="px-3 py-2">{row.hrEvaluations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs opacity-55">{copy.humanDecision}</p>
    </section>
  );
}
