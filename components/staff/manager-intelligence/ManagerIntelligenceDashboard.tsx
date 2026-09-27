"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStaffUi } from "@/components/staff/StaffUiProvider";

type Signal = {
  key: string;
  severity: "info" | "warning" | "critical";
  module: string;
  title: string;
  detail: string;
  occurredAt: string | null;
};

type Brief = {
  summary: string;
  yesterdayHighlights: string[];
  attentionToday: string[];
  recommendedChecks: string[];
  source?: string;
};

type DashboardResponse = {
  ok?: boolean;
  result?: {
    snapshot: {
      generatedAt: string;
      reportingDay: string;
      entitlement: { enabledModules: string[] };
      yesterday: {
        operations: { requests: number; completed: number; returned: number; unresolved: number; averageResolutionMinutes: number | null };
        quality: { surveys: number; averageRating: number | null; lowRatings: number; unresolvedProblems: number };
        automation: { aiQuestions: number; aiAnswers: number; aiErrors: number };
        revenue: { enabled: boolean; chargedCount?: number; chargedAmount?: number; pendingCount?: number; pendingAmount?: number; currency?: string };
        staffDevelopment: { enabled: boolean; pendingHumanReviews: number; overdueTrainingAssignments: number; hrEvaluationsYesterday: number };
        incidents: { total: number; warnings: number; errors: number; critical: number };
        integrations: { enabled: boolean; configuredConnections: number; activeConnections: number; unverifiedConnections: number };
      };
      live: { openRequests: number; signals: Signal[]; criticalSignals: number; warningSignals: number };
    };
    history: Array<{ id: string; reportingDay: string; createdAt: string; brief: Brief | null }>;
  };
  error?: string;
};

const MODULE_LABELS = {
  bg: {
    guest_hub: "Портал за госта",
    staff_operations: "Хотелски екип",
    operational_ai: "Оперативен ИИ",
    staff_development: "Развитие на персонала",
    manager_intelligence: "Manager Intelligence",
    revenue_intelligence: "Допълнителни приходи",
    integration_layer: "Интеграции",
  },
  en: {
    guest_hub: "Guest Hub",
    staff_operations: "Staff Operations",
    operational_ai: "Operational AI",
    staff_development: "Staff Development",
    manager_intelligence: "Manager Intelligence",
    revenue_intelligence: "Revenue Intelligence",
    integration_layer: "Integrations",
  },
  de: {
    guest_hub: "Guest Hub",
    staff_operations: "Hotelteam",
    operational_ai: "Operative KI",
    staff_development: "Personalentwicklung",
    manager_intelligence: "Manager Intelligence",
    revenue_intelligence: "Zusatzumsatz",
    integration_layer: "Integrationen",
  },
} as const;

const COPY = {
  bg: {
    eyebrow: "MANAGER INTELLIGENCE",
    title: "ИИ оперативен център за мениджъра",
    intro: "GOSTAYA следи проверимите сигнали от активните модули на хотела. Важните отклонения се показват през деня, а всяка сутрин се подготвя отчет за предходния хотелски ден.",
    live: "Нужно внимание сега",
    noSignals: "В момента няма критични или предупредителни сигнали.",
    morning: "Сутрешен отчет",
    generate: "Генерирай / обнови отчета",
    generating: "AI анализ…",
    yesterday: "Вчера в числа",
    requests: "Заявки",
    completed: "Завършени",
    avgTime: "Средно време",
    rating: "Средна оценка",
    lowRatings: "Ниски оценки",
    revenue: "Начислени доп. услуги",
    incidents: "Проблеми / инциденти",
    staff: "Развитие на персонала",
    modules: "Следени модули",
    history: "Предишни сутрешни отчети",
    unavailable: "Manager Intelligence не е наличен в момента.",
    minutes: "мин.",
    attention: "Какво изисква внимание днес",
    checks: "Какво да се провери",
    highlights: "Какво се случи вчера",
  },
  en: {
    eyebrow: "MANAGER INTELLIGENCE",
    title: "AI operations center for the manager",
    intro: "GOSTAYA monitors verified signals from enabled hotel modules. Important exceptions surface during the day and a morning brief covers the previous hotel day.",
    live: "Needs attention now",
    noSignals: "There are no critical or warning signals right now.",
    morning: "Morning brief",
    generate: "Generate / refresh brief",
    generating: "AI analysis…",
    yesterday: "Yesterday in numbers",
    requests: "Requests",
    completed: "Completed",
    avgTime: "Avg. resolution",
    rating: "Average rating",
    lowRatings: "Low ratings",
    revenue: "Charged extras",
    incidents: "Problems / incidents",
    staff: "Staff Development",
    modules: "Monitored modules",
    history: "Previous morning briefs",
    unavailable: "Manager Intelligence is currently unavailable.",
    minutes: "min",
    attention: "What needs attention today",
    checks: "What to review",
    highlights: "What happened yesterday",
  },
  de: {
    eyebrow: "MANAGER INTELLIGENCE",
    title: "AI Operations Center für das Management",
    intro: "GOSTAYA überwacht verifizierte Signale aus den aktivierten Hotelmodulen. Wichtige Abweichungen erscheinen tagsüber, morgens folgt der Bericht zum Vortag.",
    live: "Jetzt erforderlich",
    noSignals: "Aktuell gibt es keine kritischen oder Warnsignale.",
    morning: "Morgenbericht",
    generate: "Bericht erstellen / aktualisieren",
    generating: "AI-Analyse…",
    yesterday: "Gestern in Zahlen",
    requests: "Anfragen",
    completed: "Abgeschlossen",
    avgTime: "Ø Lösungszeit",
    rating: "Ø Bewertung",
    lowRatings: "Niedrige Bewertungen",
    revenue: "Gebuchte Extras",
    incidents: "Probleme / Incidents",
    staff: "Staff Development",
    modules: "Überwachte Module",
    history: "Frühere Morgenberichte",
    unavailable: "Manager Intelligence ist derzeit nicht verfügbar.",
    minutes: "Min.",
    attention: "Was heute Aufmerksamkeit braucht",
    checks: "Was geprüft werden sollte",
    highlights: "Was gestern passiert ist",
  },
} as const;

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-black text-[#102a43]">{value}</div>
    </div>
  );
}

export default function ManagerIntelligenceDashboard({ hotelSlug }: { hotelSlug: string }) {
  const { lang } = useStaffUi();
  const safeLang = lang === "de" || lang === "en" ? lang : "bg";
  const copy = COPY[safeLang];
  const [data, setData] = useState<DashboardResponse["result"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/staff/manager-intelligence?hotelSlug=${encodeURIComponent(hotelSlug)}&language=${safeLang}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const body = await response.json().catch(() => null) as DashboardResponse | null;
      if (!response.ok || !body?.ok || !body.result) throw new Error("unavailable");
      setData(body.result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [hotelSlug, safeLang]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function generate() {
    setGenerating(true);
    try {
      await fetch("/api/staff/manager-intelligence", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelSlug, language: safeLang }),
      });
      await load();
    } finally {
      setGenerating(false);
    }
  }

  const currentBrief =
    data?.history?.find((item) => item.reportingDay === data.snapshot.reportingDay)?.brief
    || null;
  const visibleSignals = useMemo(
    () => (data?.snapshot.live.signals || []).filter((signal) => signal.severity !== "info").slice(0, 12),
    [data],
  );

  if (loading) {
    return <section className="rounded-2xl border border-sky-200 bg-white p-6 text-slate-500">{copy.unavailable.replace("не е наличен в момента", "се зарежда…")}</section>;
  }
  if (!data) {
    return <section className="rounded-2xl border border-rose-200 bg-white p-6 text-rose-700">{copy.unavailable}</section>;
  }

  const y = data.snapshot.yesterday;
  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-sky-200 bg-gradient-to-r from-sky-50 via-white to-violet-50 p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#1479d3]">{copy.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-black text-[#102a43]">{copy.title}</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{copy.intro}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.snapshot.entitlement.enabledModules.map((module) => (
            <span key={module} className="rounded-full border border-sky-100 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
              {MODULE_LABELS[safeLang][module as keyof typeof MODULE_LABELS.bg] || module.replaceAll("_", " ")}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-[#102a43]">{copy.live}</h2>
            <p className="mt-1 text-xs text-slate-500">Auto-refresh · 60 sec</p>
          </div>
          <div className="flex gap-2 text-xs font-bold">
            <span className="rounded-full bg-rose-50 px-3 py-1.5 text-rose-700">
              {data.snapshot.live.criticalSignals} {safeLang === "bg" ? "критични" : safeLang === "de" ? "kritisch" : "critical"}
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">
              {data.snapshot.live.warningSignals} {safeLang === "bg" ? "предупреждения" : safeLang === "de" ? "Warnungen" : "warning"}
            </span>
          </div>
        </div>
        {visibleSignals.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {visibleSignals.map((signal) => (
              <article key={signal.key} className={"rounded-2xl border p-4 " + (signal.severity === "critical" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50")}>
                <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                  {MODULE_LABELS[safeLang][signal.module as keyof typeof MODULE_LABELS.bg] || signal.module.replaceAll("_", " ")}
                </div>
                <div className="mt-1 font-bold text-[#102a43]">{signal.title}</div>
                <div className="mt-1 text-sm text-slate-600">{signal.detail}</div>
              </article>
            ))}
          </div>
        ) : <p className="mt-4 text-sm text-slate-500">{copy.noSignals}</p>}
      </section>

      <section className="rounded-2xl border border-violet-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-[#102a43]">{copy.morning} · {data.snapshot.reportingDay}</h2>
            {currentBrief?.source ? <p className="mt-1 text-xs text-slate-400">{currentBrief.source}</p> : null}
          </div>
          <button
            type="button"
            disabled={generating}
            onClick={() => void generate()}
            className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-800 hover:bg-violet-100 disabled:opacity-60"
          >
            {generating ? copy.generating : copy.generate}
          </button>
        </div>

        {currentBrief ? (
          <div className="mt-4 space-y-4">
            <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">{currentBrief.summary}</p>
            {[
              [copy.highlights, currentBrief.yesterdayHighlights],
              [copy.attention, currentBrief.attentionToday],
              [copy.checks, currentBrief.recommendedChecks],
            ].map(([title, items]) => (
              <div key={String(title)}>
                <h3 className="text-sm font-bold text-[#102a43]">{title}</h3>
                <ul className="mt-2 grid gap-2">
                  {(items as string[]).map((item, index) => (
                    <li key={index} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">{copy.generate}</p>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold text-[#102a43]">{copy.yesterday}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label={copy.requests} value={y.operations.requests} />
          <Metric label={copy.completed} value={y.operations.completed} />
          <Metric label={copy.avgTime} value={y.operations.averageResolutionMinutes === null ? "—" : `${y.operations.averageResolutionMinutes} ${copy.minutes}`} />
          <Metric label={copy.rating} value={y.quality.averageRating ?? "—"} />
          <Metric label={copy.lowRatings} value={y.quality.lowRatings} />
          <Metric label={copy.incidents} value={y.incidents.errors + y.incidents.critical} />
          <Metric label={copy.staff} value={y.staffDevelopment.enabled ? y.staffDevelopment.pendingHumanReviews + y.staffDevelopment.overdueTrainingAssignments : "—"} />
          <Metric label={copy.revenue} value={y.revenue.enabled ? `${Number(y.revenue.chargedAmount || 0).toFixed(2)} ${y.revenue.currency || ""}` : "—"} />
        </div>
      </section>

      {data.history.length > 1 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-bold text-[#102a43]">{copy.history}</h2>
          <div className="mt-3 grid gap-2">
            {data.history
              .filter((item) => item.reportingDay !== data.snapshot.reportingDay)
              .map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="text-xs font-bold text-slate-400">{item.reportingDay}</div>
                <div className="mt-1 text-sm text-slate-600">{item.brief?.summary || "—"}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
