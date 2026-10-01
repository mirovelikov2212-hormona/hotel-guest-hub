"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useStaffUi } from "@/components/staff/StaffUiProvider";

type Recommendation = {
  id: string;
  sourceType: string;
  sourceRef: string | null;
  incidentId: string | null;
  module: string;
  department: string | null;
  actionMode: string;
  actionType: string;
  status: string;
  title: string;
  problem: string;
  recommendation: string;
  expectedOutcome: string;
  evidenceQuality: string;
  confidence: number | null;
  evidence: Record<string, any>;
  baseline: Record<string, any>;
  managerDecision: string | null;
  decisionAt: string | null;
  viewedAt: string | null;
  executionStatus: string;
  executionReferenceType: string | null;
  executionReferenceId: string | null;
  executedAt: string | null;
  impactBasis: string | null;
  impactOutcome: string | null;
  impact: Record<string, any> | null;
  createdAt: string;
};

type ActionLoopResponse = {
  ok?: boolean;
  result?: {
    recommendedActions: Recommendation[];
    history: Recommendation[];
    events: Array<{
      id: string;
      recommendationId: string;
      eventType: string;
      actorSessionId: string | null;
      payload: Record<string, any>;
      createdAt: string;
    }>;
    kpis: Record<string, number | null>;
  };
};

const COPY = {
  bg: {
    recommended: "Препоръчани действия",
    recommendedHint: "Препоръки само когато има достатъчно проверими данни. Няма автономна промяна на хотелска конфигурация.",
    history: "Действия и резултат",
    historyHint: "Препоръка → Решение → Действие → Резултат",
    problem: "Проблем / възможност",
    evidence: "Доказателства",
    action: "Препоръчано действие",
    expected: "Очакван резултат",
    approve: "Одобри",
    reject: "Отхвърли",
    execute: "Маркирай изпълнено",
    executeConfig: "Изпълни одобрената промяна",
    details: "Детайли",
    hide: "Скрий",
    measuredImpact: "Измерен ефект",
    estimatedImpact: "Оценен ефект",
    insufficient: "Недостатъчно данни",
    noActions: "В момента няма препоръка с достатъчно надеждни данни.",
    loading: "Проверка за препоръчани действия…",
    unavailable: "Цикълът за действия и измерване временно не е наличен.",
    generated: "Генерирана",
    viewed: "Прегледана",
    approved: "Одобрена",
    rejected: "Отхвърлена",
    expired: "Изтекла",
    executionPending: "Изпълнение",
    executionFailed: "Неуспешно изпълнение",
    measurementPending: "Измерване",
    measured: "Измерена",
    positive: "Подобрение",
    noChange: "Без съществена промяна",
    negative: "Влошаване",
    manual: "Ръчно действие",
    config: "Конфигурационно действие",
    recommendationOnly: "Само препоръка",
    confidence: "Качество на доказателствата",
    before: "Преди",
    after: "След",
    change: "Промяна",
    linkedIncident: "Свързан инцидент",
    generatedKpi: "Препоръки",
    acceptance: "Процент одобрени препоръки",
    executionRate: "Процент изпълнени действия",
    measuredRate: "Процент измерени резултати",
    positiveRate: "Процент положителен ефект",
    viewedKpi: "Прегледани",
    executedKpi: "Изпълнени",
    avgDecision: "Средно до решение",
    avgExecution: "Средно до изпълнение",
    ignoredExpired: "Игнорирани / изтекли",
    minutesShort: "мин",
    observedRevenue: "Наблюдаван приход",
    revenueNote: "Сравнение преди/след; не се отчита автоматично като причинен допълнителен приход.",
    noMeasuredYet: "Все още няма завършен период за измерване.",
  },
  en: {
    recommended: "Recommended Actions",
    recommendedHint: "Recommendations appear only when verified evidence is sufficient. Hotel configuration is never changed autonomously.",
    history: "Maßnahmen & Wirkung",
    historyHint: "Empfehlung → Entscheidung → Maßnahme → Ergebnis",
    problem: "Problem / opportunity",
    evidence: "Evidence",
    action: "Recommended action",
    expected: "Expected outcome",
    approve: "Approve",
    reject: "Reject",
    execute: "Mark executed",
    executeConfig: "Execute approved change",
    details: "Details",
    hide: "Hide",
    measuredImpact: "Gemessene Wirkung",
    estimatedImpact: "Geschätzte Wirkung",
    insufficient: "Insufficient data",
    noActions: "There are no recommendations with sufficient evidence right now.",
    loading: "Checking recommended actions…",
    unavailable: "The Action/Impact loop is temporarily unavailable.",
    generated: "Generated",
    viewed: "Viewed",
    approved: "Approved",
    rejected: "Rejected",
    expired: "Expired",
    executionPending: "Executing",
    executionFailed: "Execution failed",
    measurementPending: "Measuring",
    measured: "Measured",
    positive: "Improvement",
    noChange: "No material change",
    negative: "Negative result",
    manual: "Manual action",
    config: "Configuration action",
    recommendationOnly: "Recommendation only",
    confidence: "Evidence quality",
    before: "Before",
    after: "After",
    change: "Change",
    linkedIncident: "Linked incident",
    generatedKpi: "Recommendations",
    acceptance: "Acceptance rate",
    executionRate: "Execution rate",
    measuredRate: "Measured impact rate",
    positiveRate: "Positive impact rate",
    viewedKpi: "Viewed",
    executedKpi: "Executed",
    avgDecision: "Avg. time to decision",
    avgExecution: "Avg. time to execution",
    ignoredExpired: "Ignored / expired",
    minutesShort: "min",
    observedRevenue: "Observed revenue",
    revenueNote: "Before/after comparison; not automatically treated as causal incremental revenue.",
    noMeasuredYet: "No completed measurement window yet.",
  },
  de: {
    recommended: "Empfohlene Maßnahmen",
    recommendedHint: "Empfehlungen erscheinen nur bei ausreichender überprüfbarer Evidenz. Die Hotelkonfiguration wird nie autonom geändert.",
    history: "Actions & Impact",
    historyHint: "Recommendation → Decision → Action → Result",
    problem: "Problem / Chance",
    evidence: "Evidenz",
    action: "Empfohlene Aktion",
    expected: "Erwartetes Ergebnis",
    approve: "Genehmigen",
    reject: "Ablehnen",
    execute: "Als ausgeführt markieren",
    executeConfig: "Genehmigte Änderung ausführen",
    details: "Details",
    hide: "Ausblenden",
    measuredImpact: "Measured Impact",
    estimatedImpact: "Estimated Impact",
    insufficient: "Unzureichende Daten",
    noActions: "Derzeit gibt es keine Empfehlung mit ausreichender Evidenz.",
    loading: "Empfehlungen werden geprüft…",
    unavailable: "Der Action/Impact-Loop ist vorübergehend nicht verfügbar.",
    generated: "Erstellt",
    viewed: "Gesehen",
    approved: "Genehmigt",
    rejected: "Abgelehnt",
    expired: "Abgelaufen",
    executionPending: "Ausführung",
    executionFailed: "Ausführung fehlgeschlagen",
    measurementPending: "Messung läuft",
    measured: "Gemessen",
    positive: "Verbesserung",
    noChange: "Keine wesentliche Änderung",
    negative: "Negatives Ergebnis",
    manual: "Manuelle Aktion",
    config: "Konfigurationsaktion",
    recommendationOnly: "Nur Empfehlung",
    confidence: "Evidenzqualität",
    before: "Vorher",
    after: "Nachher",
    change: "Änderung",
    linkedIncident: "Verknüpfter Incident",
    generatedKpi: "Empfehlungen",
    acceptance: "Freigabequote",
    executionRate: "Ausführungsquote",
    measuredRate: "Quote gemessener Wirkung",
    positiveRate: "Quote positiver Wirkung",
    viewedKpi: "Gesehen",
    executedKpi: "Ausgeführt",
    avgDecision: "Ø bis Entscheidung",
    avgExecution: "Ø bis Ausführung",
    ignoredExpired: "Ignoriert / abgelaufen",
    minutesShort: "Min.",
    observedRevenue: "Beobachteter Umsatz",
    revenueNote: "Vorher-/Nachher-Vergleich; wird nicht automatisch als kausal zusätzlicher Umsatz gewertet.",
    noMeasuredYet: "Noch kein abgeschlossenes Messfenster.",
  },
} as const;

type ActionCopy = (typeof COPY)[keyof typeof COPY];

function pct(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(0)}%` : "—";
}

function metricValue(value: unknown, metric: string) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  if (metric.endsWith("_rate")) return `${(number * 100).toFixed(1)}%`;
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

type ActionLang = keyof typeof COPY;

const DEPARTMENT_LABELS: Record<ActionLang, Record<string, string>> = {
  bg: {
    housekeeping: "Камериерки",
    maintenance: "Технически отдел",
    reception: "Рецепция",
  },
  en: {
    housekeeping: "Housekeeping",
    maintenance: "Maintenance",
    reception: "Reception",
  },
  de: {
    housekeeping: "Housekeeping",
    maintenance: "Technischer Dienst",
    reception: "Rezeption",
  },
};

function departmentLabel(value: unknown, language: ActionLang) {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase();
  return DEPARTMENT_LABELS[language][key] || raw || "—";
}

function evidenceQualityLabel(value: unknown, language: ActionLang) {
  const key = String(value || "").trim().toLowerCase();
  const labels: Record<ActionLang, Record<string, string>> = {
    bg: { high: "високо", medium: "средно", low: "ниско" },
    en: { high: "high", medium: "medium", low: "low" },
    de: { high: "hoch", medium: "mittel", low: "niedrig" },
  };
  return labels[language][key] || String(value || "—");
}

function evidencePeriod(row: Recommendation, language: ActionLang) {
  const from = String(row.evidence?.periodStart || "");
  const to = String(row.evidence?.periodEnd || "");
  if (!from || !to) return null;
  const locale = language === "bg" ? "bg-BG" : language === "de" ? "de-DE" : "en-GB";
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) return null;
  return `${fromDate.toLocaleDateString(locale)} – ${toDate.toLocaleDateString(locale)}`;
}

function recommendationPresentation(row: Recommendation, language: ActionLang) {
  const raw = {
    title: row.title,
    problem: row.problem,
    recommendation: row.recommendation,
    expectedOutcome: row.expectedOutcome,
  };
  if (language === "en") return raw;

  const evidence = row.evidence || {};
  const pattern = String(evidence.pattern || "");
  if (pattern === "delayed_request_window") {
    const department = departmentLabel(evidence.department || row.department, language);
    const windowLabel = String(evidence.windowLabel || "");
    const concentration = Math.round(Number(evidence.delayedConcentration || 0) * 100);
    if (language === "bg") {
      return {
        title: `Забавени заявки · ${department} · ${windowLabel}`,
        problem: `${concentration}% от забавените заявки за ${department} през наблюдавания период са възникнали между ${windowLabel}.`,
        recommendation: `Прегледайте покритието на персонала, работното време и настроеното пренасочване за ${department} между ${windowLabel}. Всяка конфигурационна промяна минава през съществуващия Manager Change процес.`,
        expectedOutcome: "Намаляване на забавените заявки в същия часови диапазон.",
      };
    }
    return {
      title: `Verzögerte Anfragen · ${department} · ${windowLabel}`,
      problem: `${concentration}% der verzögerten Anfragen für ${department} im Beobachtungszeitraum traten zwischen ${windowLabel} auf.`,
      recommendation: `Prüfen Sie Personalabdeckung, Arbeitszeiten und konfigurierte Weiterleitung für ${department} zwischen ${windowLabel}. Jede Konfigurationsänderung läuft über den bestehenden Manager-Change-Prozess.`,
      expectedOutcome: "Weniger verzögerte Anfragen im gleichen Zeitfenster.",
    };
  }

  if (pattern === "ai_high_intent_low_conversion") {
    const intent = String(evidence.intent || row.sourceRef || "—");
    const questions = Number(evidence.questions || 0);
    const converted = Number(evidence.convertedRequests || 0);
    if (language === "bg") {
      return {
        title: `Висок интерес към ИИ + ниска конверсия · ${intent}`,
        problem: `${questions} ИИ взаимодействия са класифицирани като ${intent}, но само ${converted} са довели до заявка или резервация.`,
        recommendation: "Прегледайте наличността, представянето на цената, текста на услугата и призива към действие. Хотелски процедури не се променят автоматично.",
        expectedOutcome: "По-висока конверсия към действие или заявка за същото намерение.",
      };
    }
    return {
      title: `Hohes KI-Interesse + niedrige Konversion · ${intent}`,
      problem: `${questions} KI-Interaktionen wurden als ${intent} klassifiziert, aber nur ${converted} führten zu einer Anfrage oder Buchung.`,
      recommendation: "Prüfen Sie Verfügbarkeit, Preisdarstellung, Service-Text und Handlungsaufforderung. Hotelabläufe werden nicht automatisch geändert.",
      expectedOutcome: "Höhere Konversion zu einer Aktion oder Anfrage für dieselbe Absicht.",
    };
  }

  if (pattern === "recurring_incident") {
    const occurrences = Number(evidence.occurrences || 0);
    const incidentType = String(evidence.eventType || row.module || "incident");
    if (language === "bg") {
      return {
        title: `Повтарящ се инцидент · ${incidentType}`,
        problem: `Открити са ${occurrences} повторения на един и същ инцидент в наблюдавания период.`,
        recommendation: "Прегледайте основната причина и коригиращото действие, след което наблюдавайте дали инцидентът се повтаря.",
        expectedOutcome: "Намаляване на повторните прояви на същия инцидент.",
      };
    }
    return {
      title: `Wiederkehrender Vorfall · ${incidentType}`,
      problem: `${occurrences} Wiederholungen desselben Vorfalls wurden im Beobachtungszeitraum erkannt.`,
      recommendation: "Prüfen Sie Grundursache und Korrekturmaßnahme und beobachten Sie anschließend, ob der Vorfall erneut auftritt.",
      expectedOutcome: "Weniger Wiederholungen desselben Vorfalls.",
    };
  }

  return raw;
}

function statusLabel(row: Recommendation, copy: ActionCopy) {
  if (row.executionStatus === "failed") return copy.executionFailed;
  if (row.status === "execution_pending") return copy.executionPending;
  if (row.status === "approved") return copy.approved;
  if (row.status === "rejected") return copy.rejected;
  if (row.status === "expired") return copy.expired;
  if (row.status === "measurement_pending") return copy.measurementPending;
  if (row.status === "measured") return copy.measured;
  if (row.status === "viewed") return copy.viewed;
  return copy.generated;
}

function actionModeLabel(row: Recommendation, copy: ActionCopy) {
  if (row.actionMode === "manager_approved_configuration") return copy.config;
  if (row.actionMode === "manual_action") return copy.manual;
  return copy.recommendationOnly;
}

function impactLabel(row: Recommendation, copy: ActionCopy) {
  if (row.impactBasis === "insufficient_data") return copy.insufficient;
  if (row.impactBasis === "estimated") return copy.estimatedImpact;
  if (row.impactBasis === "measured") return copy.measuredImpact;
  return copy.noMeasuredYet;
}

function outcomeLabel(row: Recommendation, copy: ActionCopy) {
  if (row.impactOutcome === "positive") return copy.positive;
  if (row.impactOutcome === "negative") return copy.negative;
  if (row.impactOutcome === "no_material_change") return copy.noChange;
  if (row.impactOutcome === "insufficient_data") return copy.insufficient;
  return null;
}

function evidenceSummary(row: Recommendation, language: ActionLang) {
  const evidence = row.evidence || {};
  if (evidence.pattern === "delayed_request_window") {
    const delayedWord = language === "bg" ? "забавени" : language === "de" ? "verzögert" : "delayed";
    return `${evidence.windowDelayedRequests || 0}/${evidence.departmentDelayedRequests || 0} ${delayedWord} · ${evidence.windowLabel || ""} · ${Math.round(Number(evidence.delayedConcentration || 0) * 100)}%`;
  }
  if (evidence.pattern === "ai_high_intent_low_conversion") {
    const interactions = language === "bg" ? "ИИ взаимодействия" : language === "de" ? "KI-Interaktionen" : "AI interactions";
    const converted = language === "bg" ? "заявки" : language === "de" ? "konvertiert" : "converted";
    return `${evidence.questions || 0} ${interactions} · ${evidence.convertedRequests || 0} ${converted} · ${pct(evidence.conversionRate)}`;
  }
  if (evidence.pattern === "recurring_incident") {
    const occurrences = language === "bg" ? "повторения" : language === "de" ? "Wiederholungen" : "occurrences";
    return `${evidence.occurrences || 0} ${occurrences} · ${evidence.eventType || (language === "bg" ? "инцидент" : language === "de" ? "Vorfall" : "incident")}`;
  }
  return row.evidenceQuality;
}

export default function ManagerIntelligenceActionsPanel({
  hotelSlug,
}: {
  hotelSlug: string;
}) {
  const { lang } = useStaffUi();
  const safeLang = lang === "de" || lang === "en" ? lang : "bg";
  const copy = COPY[safeLang];
  const [data, setData] = useState<ActionLoopResponse["result"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/staff/manager-intelligence/actions?hotelSlug=${encodeURIComponent(hotelSlug)}`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const body = await response.json().catch(() => null) as ActionLoopResponse | null;
      if (!response.ok || !body?.ok || !body.result) throw new Error("unavailable");
      setData(body.result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [hotelSlug]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 90_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function mutate(action: string, recommendationId: string) {
    setBusyId(recommendationId);
    try {
      const response = await fetch("/api/staff/manager-intelligence/actions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelSlug, action, recommendationId }),
      });
      if (!response.ok) throw new Error("action_failed");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleDetails(row: Recommendation) {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    if (!row.viewedAt) {
      await mutate("view", row.id).catch(() => undefined);
    }
  }

  const recentHistory = useMemo(
    () => (data?.history || []).slice(0, 12),
    [data],
  );

  if (loading) {
    return (
      <section className="rounded-2xl border border-sky-200 bg-white p-5 text-sm text-slate-500">
        {copy.loading}
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-white p-5 text-sm text-rose-700">
        {copy.unavailable}
      </section>
    );
  }

  const k = data.kpis || {};
  const kpiCards = [
    [copy.generatedKpi, k.recommendationsGenerated ?? 0],
    [copy.viewedKpi, k.recommendationsViewed ?? 0],
    [copy.executedKpi, k.actionsExecuted ?? 0],
    [copy.ignoredExpired, k.recommendationsIgnoredOrExpired ?? 0],
    [copy.acceptance, pct(k.recommendationAcceptanceRate)],
    [copy.executionRate, pct(k.executionRate)],
    [copy.measuredRate, pct(k.measuredImpactRate)],
    [copy.positiveRate, pct(k.positiveImpactRate)],
    [
      copy.avgDecision,
      k.averageMinutesRecommendationToDecision == null
        ? "—"
        : `${Number(k.averageMinutesRecommendationToDecision).toFixed(1)} ${copy.minutesShort}`,
    ],
    [
      copy.avgExecution,
      k.averageMinutesApprovalToExecution == null
        ? "—"
        : `${Number(k.averageMinutesApprovalToExecution).toFixed(1)} ${copy.minutesShort}`,
    ],
  ];

  return (
    <>
      <section className="rounded-2xl border border-sky-200 bg-white p-5">
        <div>
          <h2 className="text-xl font-bold text-slate-950">{copy.recommended}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{copy.recommendedHint}</p>
        </div>

        {data.recommendedActions.length ? (
          <div className="mt-4 grid gap-3">
            {data.recommendedActions.map((row) => {
              const presentation = recommendationPresentation(row, safeLang);
              const expanded = expandedId === row.id;
              const canDecide = !row.managerDecision && ["generated", "viewed"].includes(row.status);
              const canExecute =
                row.managerDecision === "approved"
                && ["manual_action", "manager_approved_configuration"].includes(row.actionMode)
                && !row.executedAt
                && (
                  row.actionMode !== "manager_approved_configuration"
                  || !row.executionReferenceId
                );

              return (
                <article key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2 text-xs font-bold">
                        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">
                          {statusLabel(row, copy)}
                        </span>
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
                          {actionModeLabel(row, copy)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                          {copy.confidence}: {evidenceQualityLabel(row.evidenceQuality, safeLang)}
                        </span>
                      </div>
                      <h3 className="mt-3 text-base font-bold text-slate-950">{presentation.title}</h3>
                      <p className="mt-2 text-sm text-slate-600">
                        <strong>{copy.problem}:</strong> {presentation.problem}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        <strong>{copy.evidence}:</strong> {evidenceSummary(row, safeLang)}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        <strong>{copy.action}:</strong> {presentation.recommendation}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {canDecide ? (
                        <>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void mutate("approve", row.id)}
                            className="rounded-xl bg-[#1479d3] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                          >
                            {copy.approve}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => void mutate("reject", row.id)}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50"
                          >
                            {copy.reject}
                          </button>
                        </>
                      ) : null}
                      {canExecute ? (
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => void mutate("execute", row.id)}
                          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 disabled:opacity-50"
                        >
                          {row.actionMode === "manager_approved_configuration"
                            ? copy.executeConfig
                            : copy.execute}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void toggleDetails(row)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600"
                      >
                        {expanded ? copy.hide : copy.details}
                      </button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-2">
                      <div className="rounded-xl bg-white p-3">
                        <div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">{copy.expected}</div>
                        <div className="mt-1 text-sm text-slate-600">{presentation.expectedOutcome}</div>
                      </div>
                      <div className="rounded-xl bg-white p-3">
                        <div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">{copy.evidence}</div>
                        <div className="mt-1 text-sm text-slate-600">
                          {evidenceSummary(row, safeLang)}
                        </div>
                        {evidencePeriod(row, safeLang) ? (
                          <div className="mt-1 text-xs text-slate-400">
                            {evidencePeriod(row, safeLang)}
                          </div>
                        ) : null}
                      </div>
                      {row.incidentId ? (
                        <div className="rounded-xl bg-white p-3 text-sm text-slate-600 md:col-span-2">
                          <strong>{copy.linkedIncident}:</strong> {row.incidentId}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">{copy.noActions}</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-xl font-bold text-slate-950">{copy.history}</h2>
          <p className="mt-1 text-sm text-slate-500">{copy.historyHint}</p>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {kpiCards.map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</div>
              <div className="mt-1 text-lg font-black text-slate-950">{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-2">
          {recentHistory.map((row) => {
            const presentation = recommendationPresentation(row, safeLang);
            const impact = row.impact || {};
            const metric = String(impact.metric || row.baseline?.metric || "");
            const outcome = outcomeLabel(row, copy);
            return (
              <article key={row.id} className="rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-slate-400">
                      {new Date(row.createdAt).toLocaleDateString()}
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-950">{presentation.title}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-bold">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                      {statusLabel(row, copy)}
                    </span>
                    {outcome ? (
                      <span className={
                        "rounded-full px-2.5 py-1 "
                        + (row.impactOutcome === "positive"
                          ? "bg-emerald-50 text-emerald-700"
                          : row.impactOutcome === "negative"
                            ? "bg-rose-50 text-rose-700"
                            : "bg-slate-100 text-slate-700")
                      }>
                        {outcome}
                      </span>
                    ) : null}
                  </div>
                </div>

                {row.impact ? (
                  <div className="mt-2 text-sm text-slate-600">
                    <div>
                      <strong>{impactLabel(row, copy)}:</strong>{" "}
                      {copy.before} {metricValue(impact.before?.value, metric)}
                      {" → "}
                      {copy.after} {metricValue(impact.after?.value, metric)}
                      {Number.isFinite(Number(impact.deltaPercentagePoints))
                        ? ` · ${copy.change} ${Number(impact.deltaPercentagePoints).toFixed(1)} pp`
                        : Number.isFinite(Number(impact.delta))
                          ? ` · ${copy.change} ${Number(impact.delta).toFixed(2)}`
                          : ""}
                    </div>
                    {impact.businessValue?.currency ? (
                      <div className="mt-1 text-xs text-slate-500">
                        <strong>{copy.observedRevenue}:</strong>{" "}
                        {Number(impact.businessValue.beforeAmount || 0).toFixed(2)} {impact.businessValue.currency}
                        {" → "}
                        {Number(impact.businessValue.afterAmount || 0).toFixed(2)} {impact.businessValue.currency}
                        {" · "}
                        {copy.revenueNote}
                      </div>
                    ) : null}
                  </div>
                ) : row.executedAt ? (
                  <div className="mt-2 text-sm text-slate-500">{impactLabel(row, copy)}</div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
