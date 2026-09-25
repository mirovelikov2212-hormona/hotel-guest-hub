"use client";

import { useEffect, useMemo, useState } from "react";

import { useStaffUi } from "@/components/staff/StaffUiProvider";

type Measurement = {
  schemaVersion: "gostaya-value-measurement-v1";
  period: { from: string; to: string };
  baseline: {
    revision: number;
    currency: string;
    baselinePeriod: { from: string; to: string };
    goLiveAt: string;
    source: {
      type: string;
      reference: string;
      notes: string;
    };
  };
  measuredOperationalImpact: {
    guestRequests: number;
    directDepartmentRequests: number;
    receptionRequests: number;
    directDepartmentRoutingRate: number | null;
    aiQuestions: number;
    aiSuccessfulAnswers: number;
    aiContainedInteractions: number;
    aiContainmentRate: number | null;
    aiErrors: number;
    aiLegacyUnscoredAnswers: number;
    returnedServiceIncidents: number;
    recoveredServiceIncidents: number;
    unresolvedReturnedServiceIncidents: number;
    averageActualRecoveryMinutes: number | null;
  };
  estimatedOperationalImpact: {
    attributableReceptionBypassRequests: number;
    attributableAiContainedInteractions: number;
    receptionBypassMinutesSaved: number;
    aiContainmentMinutesSaved: number;
    coordinationMinutesSaved: number;
    serviceRecoveryMinutesSaved: number;
    staffTimeSavedMinutes: number;
  };
  valueMinor: {
    currency: string;
    measured: {
      ancillaryRevenue: number;
      total: number;
    };
    estimated: {
      receptionBypass: number;
      aiContainment: number;
      avoidedCoordination: number;
      serviceRecovery: number;
      total: number;
    };
    combined: number;
    gostayaCost: number;
    excludedRevenueCurrencies: string[];
  };
  roi: {
    measured: number | null;
    combined: number | null;
    measuredValueToCost: number | null;
    combinedValueToCost: number | null;
  };
  classification: {
    measuredValue: string;
    estimatedValue: string;
    benchmarkValue: string;
  };
};

type Result = {
  status: "ready" | "baseline_missing" | "not_live";
  hotel: {
    id: string;
    slug: string;
    publicSlug: string;
    name: string;
    timezone: string;
  };
  goLiveAt: string | null;
  baseline: {
    revision: number;
    currency: string;
    baselinePeriod: { from: string; to: string };
    source: { type: string; reference: string; notes: string };
    metadata?: Record<string, unknown>;
  } | null;
  period: {
    requestedDays: number;
    from: string;
    to: string;
    clippedToGoLive: boolean;
  } | null;
  measurement: Measurement | null;
  dataQuality?: {
    requestRows: number;
    eventRows: number;
    revenueLedgerNativeEvents: number;
    revenueLedgerReconstructedEvents: number;
    revenueDeltaMismatches: number;
  };
};

const COPY = {
  bg: {
    eyebrow: "MANAGER INTELLIGENCE · OPERATIONAL VALUE",
    title: "Оперативна стойност и спестено време",
    intro:
      "Измерва ефекта на GOSTAYA спрямо baseline-а на конкретния хотел: Direct Routing, Reception Bypass, AI Containment, service recovery, моделирано спестено време и доказуеми приходи от допълнителни услуги. Това не е хотелски P&L и не включва приходите от стаи. Измерените данни и моделираните оценки остават отделени.",
    measured: "Measured Value",
    measuredHelp: "Реално признат ancillary revenue от billing ledger.",
    estimated: "Estimated Value",
    estimatedHelp: "Hotel-specific baseline × измерена operational activity.",
    combined: "Combined Value",
    cost: "GOSTAYA Cost",
    measuredRoi: "Measured ROI",
    combinedRoi: "Combined ROI",
    measuredRatio: "Measured value / cost",
    combinedRatio: "Combined value / cost",
    impact: "Operational impact",
    receptionBypass: "Reception Bypass",
    directRouting: "Direct Department Routing",
    aiContainment: "AI Containment",
    coordination: "Avoided Coordination",
    staffTime: "Staff Time Saved",
    recovery: "Service Recovery",
    measuredCount: "Measured",
    estimatedCount: "Estimated attributable",
    guestRequests: "Guest requests",
    directRequests: "Direct department requests",
    routingRate: "Direct routing rate",
    aiQuestions: "AI questions",
    contained: "Contained interactions",
    containmentRate: "Containment rate",
    legacyUnscored: "Legacy AI answers без interaction ID",
    returned: "Returned incidents",
    recovered: "Recovered incidents",
    unresolved: "Unresolved returned incidents",
    avgRecovery: "Средно recovery време",
    minutesSaved: "спестени минути",
    hoursSaved: "спестени часа",
    baseline: "Hotel baseline",
    baselineRevision: "Baseline revision",
    baselinePeriod: "Baseline период",
    baselineSource: "Източник",
    goLive: "Actual Go-Live",
    reportingPeriod: "Reporting period",
    clipped: "Периодът е ограничен до реалния Go-Live.",
    quality: "Data quality",
    requestRows: "Request rows",
    eventRows: "Event rows",
    nativeLedger: "Native revenue ledger",
    reconstructedLedger: "Reconstructed ledger",
    mismatches: "Revenue delta mismatches",
    excludedCurrencies: "Изключени валути от ROI",
    excludedCurrenciesHelp:
      "Не правим FX conversion без authoritative rate. Тези приходи остават видими в Revenue модула, но не влизат в този ROI.",
    benchmarks: "Industry Benchmarks",
    benchmarksUnavailable:
      "Все още не се използват. Ще бъдат добавени само след достатъчно хотели и анонимизирани cohort данни.",
    baselineMissingTitle: "Липсва Value Baseline",
    baselineMissing:
      "ROI не се изчислява, докато хотелът няма заключен pre-Go-Live baseline в Control Plane.",
    notLiveTitle: "Хотелът още не е Go-Live",
    notLive:
      "Baseline-ът е готов, но Value Measurement започва от реалния Production Go-Live.",
    unavailable: "Value report не е наличен в момента.",
    datasetTooLarge:
      "Отчетът е спрян, защото dataset-ът надвишава безопасния лимит. Не е върнат частичен ROI.",
    period7: "7 дни",
    period30: "30 дни",
    period90: "90 дни",
    period365: "365 дни",
    negativeNote:
      "Estimated Value може да бъде отрицателна, ако operational резултатът е по-слаб от baseline-а.",
  },
  en: {
    eyebrow: "MANAGER INTELLIGENCE · OPERATIONAL VALUE",
    title: "Operational Value & Time Saved",
    intro:
      "Measures GOSTAYA's effect against the hotel's own baseline: Direct Routing, Reception Bypass, AI Containment, service recovery, modeled staff time saved and evidenced additional-service revenue. This is not the hotel's P&L and excludes room revenue. Measured facts and modeled estimates remain separate.",
    measured: "Measured Value",
    measuredHelp: "Actual recognized ancillary revenue from the billing ledger.",
    estimated: "Estimated Value",
    estimatedHelp: "Hotel-specific baseline × measured operational activity.",
    combined: "Combined Value",
    cost: "GOSTAYA Cost",
    measuredRoi: "Measured ROI",
    combinedRoi: "Combined ROI",
    measuredRatio: "Measured value / cost",
    combinedRatio: "Combined value / cost",
    impact: "Operational impact",
    receptionBypass: "Reception Bypass",
    directRouting: "Direct Department Routing",
    aiContainment: "AI Containment",
    coordination: "Avoided Coordination",
    staffTime: "Staff Time Saved",
    recovery: "Service Recovery",
    measuredCount: "Measured",
    estimatedCount: "Estimated attributable",
    guestRequests: "Guest requests",
    directRequests: "Direct department requests",
    routingRate: "Direct routing rate",
    aiQuestions: "AI questions",
    contained: "Contained interactions",
    containmentRate: "Containment rate",
    legacyUnscored: "Legacy AI answers without interaction ID",
    returned: "Returned incidents",
    recovered: "Recovered incidents",
    unresolved: "Unresolved returned incidents",
    avgRecovery: "Average recovery time",
    minutesSaved: "minutes saved",
    hoursSaved: "hours saved",
    baseline: "Hotel baseline",
    baselineRevision: "Baseline revision",
    baselinePeriod: "Baseline period",
    baselineSource: "Source",
    goLive: "Actual Go-Live",
    reportingPeriod: "Reporting period",
    clipped: "The period is clipped to the actual Go-Live.",
    quality: "Data quality",
    requestRows: "Request rows",
    eventRows: "Event rows",
    nativeLedger: "Native revenue ledger",
    reconstructedLedger: "Reconstructed ledger",
    mismatches: "Revenue delta mismatches",
    excludedCurrencies: "Currencies excluded from ROI",
    excludedCurrenciesHelp:
      "No FX conversion is performed without an authoritative rate. Those revenues remain visible in Revenue, but are excluded from this ROI.",
    benchmarks: "Industry Benchmarks",
    benchmarksUnavailable:
      "Not used yet. They will be added only after enough hotels exist for anonymized cohort data.",
    baselineMissingTitle: "Value Baseline missing",
    baselineMissing:
      "ROI is not calculated until the hotel has a locked pre-Go-Live baseline in Control Plane.",
    notLiveTitle: "Hotel is not Go-Live yet",
    notLive:
      "The baseline is ready, but Value Measurement starts at the actual Production Go-Live.",
    unavailable: "The Value report is currently unavailable.",
    datasetTooLarge:
      "The report stopped because the dataset exceeded the safe limit. No partial ROI was returned.",
    period7: "7 days",
    period30: "30 days",
    period90: "90 days",
    period365: "365 days",
    negativeNote:
      "Estimated Value can be negative when operational performance is worse than the hotel baseline.",
  },
  de: {
    eyebrow: "MANAGER INTELLIGENCE · OPERATIONAL VALUE",
    title: "Operativer Wert & Zeitersparnis",
    intro:
      "Misst den Effekt von GOSTAYA gegenüber der hotelspezifischen Baseline: Direct Routing, Reception Bypass, AI Containment, Service Recovery, modellierte Zeitersparnis und belegte Umsätze aus Zusatzleistungen. Kein Hotel-P&L und keine Zimmerumsätze. Gemessene Fakten und modellierte Schätzungen bleiben getrennt.",
    measured: "Measured Value",
    measuredHelp: "Tatsächlich erfasster Ancillary Revenue aus dem Billing Ledger.",
    estimated: "Estimated Value",
    estimatedHelp: "Hotelspezifische Baseline × gemessene operative Aktivität.",
    combined: "Combined Value",
    cost: "GOSTAYA Cost",
    measuredRoi: "Measured ROI",
    combinedRoi: "Combined ROI",
    measuredRatio: "Measured value / cost",
    combinedRatio: "Combined value / cost",
    impact: "Operational impact",
    receptionBypass: "Reception Bypass",
    directRouting: "Direct Department Routing",
    aiContainment: "AI Containment",
    coordination: "Avoided Coordination",
    staffTime: "Staff Time Saved",
    recovery: "Service Recovery",
    measuredCount: "Gemessen",
    estimatedCount: "Geschätzt zurechenbar",
    guestRequests: "Guest requests",
    directRequests: "Direct department requests",
    routingRate: "Direct routing rate",
    aiQuestions: "AI questions",
    contained: "Contained interactions",
    containmentRate: "Containment rate",
    legacyUnscored: "Legacy AI answers ohne interaction ID",
    returned: "Returned incidents",
    recovered: "Recovered incidents",
    unresolved: "Unresolved returned incidents",
    avgRecovery: "Durchschn. recovery time",
    minutesSaved: "gesparte Minuten",
    hoursSaved: "gesparte Stunden",
    baseline: "Hotel baseline",
    baselineRevision: "Baseline revision",
    baselinePeriod: "Baseline period",
    baselineSource: "Quelle",
    goLive: "Actual Go-Live",
    reportingPeriod: "Reporting period",
    clipped: "Der Zeitraum ist auf den tatsächlichen Go-Live begrenzt.",
    quality: "Data quality",
    requestRows: "Request rows",
    eventRows: "Event rows",
    nativeLedger: "Native revenue ledger",
    reconstructedLedger: "Reconstructed ledger",
    mismatches: "Revenue delta mismatches",
    excludedCurrencies: "Vom ROI ausgeschlossene Währungen",
    excludedCurrenciesHelp:
      "Ohne autoritativen FX-Kurs erfolgt keine Umrechnung. Diese Umsätze bleiben im Revenue-Modul sichtbar, fließen aber nicht in diesen ROI ein.",
    benchmarks: "Industry Benchmarks",
    benchmarksUnavailable:
      "Noch nicht verwendet. Sie werden erst mit ausreichend vielen Hotels als anonymisierte Cohort-Daten ergänzt.",
    baselineMissingTitle: "Value Baseline fehlt",
    baselineMissing:
      "ROI wird erst berechnet, wenn eine gesperrte Pre-Go-Live-Baseline im Control Plane vorhanden ist.",
    notLiveTitle: "Hotel ist noch nicht Go-Live",
    notLive:
      "Die Baseline ist bereit, Value Measurement startet aber erst mit dem tatsächlichen Production Go-Live.",
    unavailable: "Der Value-Bericht ist derzeit nicht verfügbar.",
    datasetTooLarge:
      "Der Bericht wurde wegen Überschreitung des sicheren Dataset-Limits gestoppt. Es wurde kein Teil-ROI geliefert.",
    period7: "7 Tage",
    period30: "30 Tage",
    period90: "90 Tage",
    period365: "365 Tage",
    negativeNote:
      "Estimated Value kann negativ sein, wenn die operative Leistung schwächer als die Hotel-Baseline ist.",
  },
} as const;

function money(minor: number, currency: string, lang: string) {
  try {
    return new Intl.NumberFormat(lang, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

function pct(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function ratio(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}×`;
}

function minutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

function dates(from: string, to: string, lang: string) {
  return `${new Date(from).toLocaleDateString(lang)} – ${new Date(to).toLocaleDateString(lang)}`;
}

export default function GostayaValueDashboard({
  hotelSlug,
}: {
  hotelSlug: string;
}) {
  const { lang } = useStaffUi();
  const copy = COPY[lang] || COPY.en;
  const [days, setDays] = useState(30);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          hotelSlug,
          days: String(days),
        });
        const response = await fetch(
          `/api/staff/value/summary?${params.toString()}`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => null)) as
          | { ok?: boolean; result?: Result; error?: string }
          | null;

        if (!response.ok || !body?.ok || !body.result) {
          if (!cancelled) setError(body?.error || "value_unavailable");
          return;
        }

        if (!cancelled) setResult(body.result);
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          setError("value_unavailable");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [days, hotelSlug]);

  const m = result?.measurement;
  const currency = m?.valueMinor.currency || result?.baseline?.currency || "EUR";
  const reportingPeriod = useMemo(() => {
    if (!result?.period) return "—";
    return dates(result.period.from, result.period.to, lang);
  }, [lang, result?.period]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/60">
        GOSTAYA Value Measurement…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-300/25 bg-rose-400/10 p-5 text-sm text-rose-100">
        {error === "value_dataset_too_large"
          ? copy.datasetTooLarge
          : copy.unavailable}
      </div>
    );
  }

  if (!result) return null;

  if (result.status === "baseline_missing") {
    return (
      <section className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-5">
        <h2 className="text-lg font-semibold text-white">
          {copy.baselineMissingTitle}
        </h2>
        <p className="mt-2 text-sm leading-6 text-white/65">
          {copy.baselineMissing}
        </p>
      </section>
    );
  }

  if (result.status === "not_live") {
    return (
      <section className="rounded-2xl border border-sky-300/25 bg-sky-400/10 p-5">
        <h2 className="text-lg font-semibold text-white">
          {copy.notLiveTitle}
        </h2>
        <p className="mt-2 text-sm leading-6 text-white/65">
          {copy.notLive}
        </p>
      </section>
    );
  }

  if (!m || !result.period) return null;

  const measured = m.measuredOperationalImpact;
  const estimated = m.estimatedOperationalImpact;
  const values = m.valueMinor;

  return (
    <main className="space-y-5 pb-safe">
      <section className="rounded-2xl border border-cyan-300/20 bg-cyan-400/5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/65">
              {copy.eyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {copy.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
              {copy.intro}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              [7, copy.period7],
              [30, copy.period30],
              [90, copy.period90],
              [365, copy.period365],
            ].map(([value, label]) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => setDays(Number(value))}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  days === value
                    ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-50"
                    : "border-white/10 bg-black/20 text-white/60 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/50">
          <span>{copy.reportingPeriod}: {reportingPeriod}</span>
          <span>·</span>
          <span>{copy.goLive}: {new Date(m.baseline.goLiveAt).toLocaleString(lang)}</span>
          {result.period.clippedToGoLive ? (
            <>
              <span>·</span>
              <span className="text-cyan-100/70">{copy.clipped}</span>
            </>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-4">
          <p className="text-sm font-semibold text-emerald-100">{copy.measured}</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {money(values.measured.total, currency, lang)}
          </p>
          <p className="mt-2 text-xs leading-5 text-white/50">
            {copy.measuredHelp}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4">
          <p className="text-sm font-semibold text-amber-100">{copy.estimated}</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {money(values.estimated.total, currency, lang)}
          </p>
          <p className="mt-2 text-xs leading-5 text-white/50">
            {copy.estimatedHelp}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm text-white/50">{copy.combined}</p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {money(values.combined, currency, lang)}
          </p>
          <p className="mt-2 text-xs leading-5 text-white/40">
            {copy.negativeNote}
          </p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          [copy.cost, money(values.gostayaCost, currency, lang)],
          [copy.measuredRoi, pct(m.roi.measured)],
          [copy.combinedRoi, pct(m.roi.combined)],
          [copy.measuredRatio, ratio(m.roi.measuredValueToCost)],
          [copy.combinedRatio, ratio(m.roi.combinedValueToCost)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-white/45">{label}</p>
            <p className="mt-2 text-xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h3 className="text-lg font-semibold text-white">{copy.impact}</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-semibold text-white">{copy.receptionBypass}</p>
            <p className="mt-2 text-xs text-white/45">
              {copy.measuredCount}: {measured.directDepartmentRequests} / {measured.guestRequests}
            </p>
            <p className="mt-1 text-xs text-white/45">
              {copy.estimatedCount}: {estimated.attributableReceptionBypassRequests.toFixed(1)}
            </p>
            <p className="mt-3 text-lg font-semibold text-amber-100">
              {money(values.estimated.receptionBypass, currency, lang)}
            </p>
          </article>

          <article className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-semibold text-white">{copy.directRouting}</p>
            <p className="mt-2 text-xs text-white/45">
              {copy.guestRequests}: {measured.guestRequests}
            </p>
            <p className="mt-1 text-xs text-white/45">
              {copy.directRequests}: {measured.directDepartmentRequests}
            </p>
            <p className="mt-3 text-lg font-semibold text-white">
              {pct(measured.directDepartmentRoutingRate)}
            </p>
          </article>

          <article className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-semibold text-white">{copy.aiContainment}</p>
            <p className="mt-2 text-xs text-white/45">
              {copy.aiQuestions}: {measured.aiQuestions}
            </p>
            <p className="mt-1 text-xs text-white/45">
              {copy.contained}: {measured.aiContainedInteractions}
            </p>
            <p className="mt-1 text-xs text-white/45">
              {copy.containmentRate}: {pct(measured.aiContainmentRate)}
            </p>
            <p className="mt-3 text-lg font-semibold text-amber-100">
              {money(values.estimated.aiContainment, currency, lang)}
            </p>
          </article>

          <article className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-semibold text-white">{copy.coordination}</p>
            <p className="mt-2 text-xs text-white/45">
              {minutes(estimated.coordinationMinutesSaved)} {copy.minutesSaved}
            </p>
            <p className="mt-3 text-lg font-semibold text-amber-100">
              {money(values.estimated.avoidedCoordination, currency, lang)}
            </p>
          </article>

          <article className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-semibold text-white">{copy.staffTime}</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {(estimated.staffTimeSavedMinutes / 60).toFixed(1)}
            </p>
            <p className="mt-1 text-xs text-white/45">{copy.hoursSaved}</p>
          </article>

          <article className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-semibold text-white">{copy.recovery}</p>
            <div className="mt-2 space-y-1 text-xs text-white/45">
              <p>{copy.returned}: {measured.returnedServiceIncidents}</p>
              <p>{copy.recovered}: {measured.recoveredServiceIncidents}</p>
              <p>{copy.unresolved}: {measured.unresolvedReturnedServiceIncidents}</p>
              <p>{copy.avgRecovery}: {minutes(measured.averageActualRecoveryMinutes)} min</p>
            </div>
            <p className="mt-3 text-lg font-semibold text-amber-100">
              {money(values.estimated.serviceRecovery, currency, lang)}
            </p>
          </article>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-lg font-semibold text-white">{copy.baseline}</h3>
          <div className="mt-4 space-y-2 text-sm text-white/60">
            <p>{copy.baselineRevision}: <strong className="text-white">{m.baseline.revision}</strong></p>
            <p>{copy.baselinePeriod}: <strong className="text-white">{dates(m.baseline.baselinePeriod.from, m.baseline.baselinePeriod.to, lang)}</strong></p>
            <p>{copy.baselineSource}: <strong className="text-white">{m.baseline.source.type}</strong></p>
            {m.baseline.source.reference ? (
              <p className="break-words text-xs text-white/45">{m.baseline.source.reference}</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-lg font-semibold text-white">{copy.quality}</h3>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <p className="text-white/50">{copy.requestRows}: <strong className="text-white">{result.dataQuality?.requestRows ?? 0}</strong></p>
            <p className="text-white/50">{copy.eventRows}: <strong className="text-white">{result.dataQuality?.eventRows ?? 0}</strong></p>
            <p className="text-white/50">{copy.nativeLedger}: <strong className="text-white">{result.dataQuality?.revenueLedgerNativeEvents ?? 0}</strong></p>
            <p className="text-white/50">{copy.reconstructedLedger}: <strong className="text-white">{result.dataQuality?.revenueLedgerReconstructedEvents ?? 0}</strong></p>
            <p className="text-white/50">{copy.mismatches}: <strong className="text-white">{result.dataQuality?.revenueDeltaMismatches ?? 0}</strong></p>
            <p className="text-white/50">{copy.legacyUnscored}: <strong className="text-white">{measured.aiLegacyUnscoredAnswers}</strong></p>
          </div>
        </div>
      </section>

      {values.excludedRevenueCurrencies.length ? (
        <section className="rounded-2xl border border-amber-300/20 bg-amber-400/5 p-5">
          <h3 className="text-sm font-semibold text-white">{copy.excludedCurrencies}</h3>
          <p className="mt-2 text-sm text-white/65">
            {values.excludedRevenueCurrencies.join(", ")}
          </p>
          <p className="mt-2 text-xs leading-5 text-white/45">
            {copy.excludedCurrenciesHelp}
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h3 className="text-lg font-semibold text-white">{copy.benchmarks}</h3>
        <p className="mt-2 text-sm leading-6 text-white/55">
          {copy.benchmarksUnavailable}
        </p>
      </section>
    </main>
  );
}
