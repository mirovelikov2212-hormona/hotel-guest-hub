"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";

type Baseline = {
  schemaVersion: "gostaya-value-baseline-v1";
  revision: number;
  currency: string;
  baselinePeriod: { from: string; to: string };
  source: {
    type: string;
    reference: string;
    notes: string;
  };
  assumptions: {
    receptionMinutesPerGuestRequest: number;
    receptionInfoMinutesPerQuestion: number;
    coordinationMinutesPerDirectDepartmentRequest: number;
    baselineDirectDepartmentRoutingRate: number;
    baselineInfoSelfServiceRate: number;
    serviceRecoveryResolutionMinutes: number;
    laborCostMinorPerHour: {
      reception: number;
      coordination: number;
      serviceRecovery: number;
    };
    gostayaMonthlyCostMinor: number;
    gostayaOneTimeCostMinor: number;
    oneTimeAmortizationMonths: number;
  };
};

type Result = {
  propertyId: string;
  organizationId: string;
  hotelId: string;
  stored: boolean;
  revision: number;
  baseline: Baseline | null;
  metadata?: Record<string, unknown>;
  goLiveAt: string | null;
  locked: boolean;
  historicalBackfillAvailable: boolean;
};

type FormState = {
  fromDate: string;
  toDate: string;
  currency: string;
  sourceType: string;
  sourceReference: string;
  sourceNotes: string;
  receptionMinutes: string;
  infoMinutes: string;
  coordinationMinutes: string;
  baselineDirectRatePct: string;
  baselineSelfServiceRatePct: string;
  recoveryMinutes: string;
  receptionCostPerHour: string;
  coordinationCostPerHour: string;
  recoveryCostPerHour: string;
  monthlyCost: string;
  oneTimeCost: string;
  amortizationMonths: string;
};

const EMPTY_FORM: FormState = {
  fromDate: "",
  toDate: "",
  currency: "EUR",
  sourceType: "mixed",
  sourceReference: "",
  sourceNotes: "",
  receptionMinutes: "",
  infoMinutes: "",
  coordinationMinutes: "",
  baselineDirectRatePct: "0",
  baselineSelfServiceRatePct: "0",
  recoveryMinutes: "",
  receptionCostPerHour: "",
  coordinationCostPerHour: "",
  recoveryCostPerHour: "",
  monthlyCost: "",
  oneTimeCost: "0",
  amortizationMonths: "12",
};

const COPY = {
  bg: {
    title: "GOSTAYA Value Baseline",
    subtitle:
      "Хотелският baseline се записва преди Go-Live и става основа за ROI. След Go-Live не може да бъде редактиран.",
    period: "Baseline период",
    from: "От",
    to: "До",
    currency: "Валута",
    source: "Източник на baseline",
    reference: "Референция / документ",
    notes: "Бележки",
    assumptions: "Оперативен baseline",
    receptionMinutes: "Reception минути / guest request",
    infoMinutes: "Reception минути / информационен въпрос",
    coordinationMinutes: "Координационни минути / заявка към отдел",
    directRate: "Директно routing преди GOSTAYA (%)",
    selfServiceRate: "Self-service преди GOSTAYA (%)",
    recoveryMinutes: "Средно service recovery време (минути)",
    costs: "Labor cost / час",
    receptionCost: "Reception",
    coordinationCost: "Coordination",
    recoveryCost: "Service recovery",
    gostayaCost: "GOSTAYA разход",
    monthlyCost: "Месечен разход",
    oneTimeCost: "Еднократен разход",
    amortization: "Амортизация на еднократния разход (месеци)",
    save: "Запази baseline",
    saving: "Записване…",
    reload: "Обнови",
    saved: "Baseline-ът е записан.",
    locked: "Baseline-ът е заключен след Production Go-Live.",
    backfill:
      "Хотелът вече е LIVE и няма baseline. Разрешен е само еднократен historical backfill за период преди реалния Go-Live.",
    conflict:
      "Baseline-ът е променен междувременно. Обнови страницата и опитай отново.",
    rejected: "Baseline данните не са валидни.",
    unavailable: "Baseline API не е достъпен.",
    goLive: "Actual Go-Live",
    revision: "Ревизия",
  },
  en: {
    title: "GOSTAYA Value Baseline",
    subtitle:
      "The hotel baseline is captured before Go-Live and becomes the ROI authority. It cannot be edited after Go-Live.",
    period: "Baseline period",
    from: "From",
    to: "To",
    currency: "Currency",
    source: "Baseline evidence source",
    reference: "Reference / document",
    notes: "Notes",
    assumptions: "Operational baseline",
    receptionMinutes: "Reception minutes / guest request",
    infoMinutes: "Reception minutes / information question",
    coordinationMinutes: "Coordination minutes / department request",
    directRate: "Direct routing before GOSTAYA (%)",
    selfServiceRate: "Self-service before GOSTAYA (%)",
    recoveryMinutes: "Average service recovery time (minutes)",
    costs: "Labor cost / hour",
    receptionCost: "Reception",
    coordinationCost: "Coordination",
    recoveryCost: "Service recovery",
    gostayaCost: "GOSTAYA cost",
    monthlyCost: "Monthly cost",
    oneTimeCost: "One-time cost",
    amortization: "One-time cost amortization (months)",
    save: "Save baseline",
    saving: "Saving…",
    reload: "Reload",
    saved: "Baseline saved.",
    locked: "The baseline is locked after Production Go-Live.",
    backfill:
      "This hotel is already LIVE and has no baseline. Only a one-time historical backfill for a pre-Go-Live period is allowed.",
    conflict:
      "The baseline changed in the meantime. Reload and try again.",
    rejected: "The baseline data is invalid.",
    unavailable: "The baseline API is unavailable.",
    goLive: "Actual Go-Live",
    revision: "Revision",
  },
} as const;

function dateInput(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function moneyMajor(minor: number | undefined) {
  return typeof minor === "number" ? (minor / 100).toFixed(2) : "";
}

function numberValue(value: string) {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function toMinor(value: string) {
  const parsed = numberValue(value);
  if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN;
  return Math.round(parsed * 100);
}

function toIsoStart(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

function toIsoEnd(date: string) {
  return new Date(`${date}T23:59:59.999Z`).toISOString();
}

function formFromBaseline(baseline: Baseline | null): FormState {
  if (!baseline) return EMPTY_FORM;
  const a = baseline.assumptions;
  return {
    fromDate: dateInput(baseline.baselinePeriod.from),
    toDate: dateInput(baseline.baselinePeriod.to),
    currency: baseline.currency,
    sourceType: baseline.source.type,
    sourceReference: baseline.source.reference || "",
    sourceNotes: baseline.source.notes || "",
    receptionMinutes: String(a.receptionMinutesPerGuestRequest),
    infoMinutes: String(a.receptionInfoMinutesPerQuestion),
    coordinationMinutes: String(a.coordinationMinutesPerDirectDepartmentRequest),
    baselineDirectRatePct: String(a.baselineDirectDepartmentRoutingRate * 100),
    baselineSelfServiceRatePct: String(a.baselineInfoSelfServiceRate * 100),
    recoveryMinutes: String(a.serviceRecoveryResolutionMinutes),
    receptionCostPerHour: moneyMajor(a.laborCostMinorPerHour.reception),
    coordinationCostPerHour: moneyMajor(a.laborCostMinorPerHour.coordination),
    recoveryCostPerHour: moneyMajor(a.laborCostMinorPerHour.serviceRecovery),
    monthlyCost: moneyMajor(a.gostayaMonthlyCostMinor),
    oneTimeCost: moneyMajor(a.gostayaOneTimeCostMinor),
    amortizationMonths: String(a.oneTimeAmortizationMonths),
  };
}

export default function GostayaValueBaselinePanel({
  lang,
  propertyId,
}: {
  lang: ControlPlaneLang;
  propertyId: string;
}) {
  const copy = COPY[lang] || COPY.en;
  const [result, setResult] = useState<Result | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/control-plane/value-baseline?propertyId=${encodeURIComponent(propertyId)}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; result?: Result; error?: string }
        | null;

      if (!response.ok || !body?.ok || !body.result) {
        throw new Error(body?.error || "unavailable");
      }

      setResult(body.result);
      setForm(formFromBaseline(body.result.baseline));
    } catch {
      setFeedback(copy.unavailable);
    } finally {
      setLoading(false);
    }
  }, [copy.unavailable, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canEdit = Boolean(
    result
    && (!result.locked || result.historicalBackfillAvailable),
  );

  const valid = useMemo(() => {
    const numeric = [
      form.receptionMinutes,
      form.infoMinutes,
      form.coordinationMinutes,
      form.baselineDirectRatePct,
      form.baselineSelfServiceRatePct,
      form.recoveryMinutes,
      form.receptionCostPerHour,
      form.coordinationCostPerHour,
      form.recoveryCostPerHour,
      form.monthlyCost,
      form.oneTimeCost,
      form.amortizationMonths,
    ].map(numberValue);

    return Boolean(
      form.fromDate
      && form.toDate
      && /^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())
      && numeric.every((value) => Number.isFinite(value) && value >= 0)
      && numberValue(form.baselineDirectRatePct) <= 100
      && numberValue(form.baselineSelfServiceRatePct) <= 100
      && numberValue(form.amortizationMonths) >= 1,
    );
  }, [form]);

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFeedback(null);
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!result || !canEdit || !valid || saving) return;

    setSaving(true);
    setFeedback(null);

    try {
      const baseline = {
        schemaVersion: "gostaya-value-baseline-v1",
        revision: result.revision + 1,
        currency: form.currency.trim().toUpperCase(),
        baselinePeriod: {
          from: toIsoStart(form.fromDate),
          to: toIsoEnd(form.toDate),
        },
        source: {
          type: form.sourceType,
          reference: form.sourceReference.trim(),
          notes: form.sourceNotes.trim(),
        },
        assumptions: {
          receptionMinutesPerGuestRequest: numberValue(form.receptionMinutes),
          receptionInfoMinutesPerQuestion: numberValue(form.infoMinutes),
          coordinationMinutesPerDirectDepartmentRequest:
            numberValue(form.coordinationMinutes),
          baselineDirectDepartmentRoutingRate:
            numberValue(form.baselineDirectRatePct) / 100,
          baselineInfoSelfServiceRate:
            numberValue(form.baselineSelfServiceRatePct) / 100,
          serviceRecoveryResolutionMinutes:
            numberValue(form.recoveryMinutes),
          laborCostMinorPerHour: {
            reception: toMinor(form.receptionCostPerHour),
            coordination: toMinor(form.coordinationCostPerHour),
            serviceRecovery: toMinor(form.recoveryCostPerHour),
          },
          gostayaMonthlyCostMinor: toMinor(form.monthlyCost),
          gostayaOneTimeCostMinor: toMinor(form.oneTimeCost),
          oneTimeAmortizationMonths:
            Math.round(numberValue(form.amortizationMonths)),
        },
      };

      const response = await fetch("/api/control-plane/value-baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          expectedRevision: result.revision,
          baseline,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; result?: Result; error?: string }
        | null;

      if (!response.ok || !body?.ok || !body.result) {
        if (body?.error === "baseline_revision_conflict") {
          setFeedback(copy.conflict);
        } else if (body?.error === "baseline_rejected") {
          setFeedback(copy.rejected);
        } else if (body?.error === "baseline_locked_after_go_live") {
          setFeedback(copy.locked);
        } else {
          setFeedback(copy.unavailable);
        }
        return;
      }

      setResult(body.result);
      setForm(formFromBaseline(body.result.baseline));
      setFeedback(copy.saved);
    } catch {
      setFeedback(copy.unavailable);
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none disabled:opacity-45";

  return (
    <section className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
            {copy.title}
          </p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-neutral-500">
            {copy.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || saving}
          className="rounded-xl border border-neutral-700 px-3 py-2 text-xs font-semibold text-neutral-300 disabled:opacity-40"
        >
          {copy.reload}
        </button>
      </div>

      {result?.goLiveAt ? (
        <p className="mt-3 text-xs text-neutral-400">
          {copy.goLive}:{" "}
          <span className="text-neutral-200">
            {new Date(result.goLiveAt).toLocaleString()}
          </span>
          {" · "}
          {copy.revision}:{" "}
          <span className="text-neutral-200">{result.revision}</span>
        </p>
      ) : null}

      {result?.historicalBackfillAvailable ? (
        <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
          {copy.backfill}
        </p>
      ) : null}

      {result?.locked && result.stored ? (
        <p className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">
          {copy.locked}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
          <p className="text-xs font-semibold text-neutral-400">{copy.period}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs text-neutral-500">
              {copy.from}
              <input type="date" className={inputClass} value={form.fromDate} disabled={!canEdit} onChange={(e) => field("fromDate", e.target.value)} />
            </label>
            <label className="text-xs text-neutral-500">
              {copy.to}
              <input type="date" className={inputClass} value={form.toDate} disabled={!canEdit} onChange={(e) => field("toDate", e.target.value)} />
            </label>
          </div>
          <label className="mt-2 block text-xs text-neutral-500">
            {copy.currency}
            <input className={inputClass} maxLength={3} value={form.currency} disabled={!canEdit} onChange={(e) => field("currency", e.target.value.toUpperCase())} />
          </label>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
          <p className="text-xs font-semibold text-neutral-400">{copy.source}</p>
          <select className={inputClass} value={form.sourceType} disabled={!canEdit} onChange={(e) => field("sourceType", e.target.value)}>
            <option value="mixed">Mixed evidence</option>
            <option value="manual_time_study">Manual time study</option>
            <option value="call_log">Call log</option>
            <option value="staff_roster">Staff roster</option>
            <option value="finance_report">Finance report</option>
          </select>
          <label className="mt-2 block text-xs text-neutral-500">
            {copy.reference}
            <input className={inputClass} value={form.sourceReference} disabled={!canEdit} onChange={(e) => field("sourceReference", e.target.value)} />
          </label>
          <label className="mt-2 block text-xs text-neutral-500">
            {copy.notes}
            <textarea className={inputClass} rows={3} value={form.sourceNotes} disabled={!canEdit} onChange={(e) => field("sourceNotes", e.target.value)} />
          </label>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
          <p className="text-xs font-semibold text-neutral-400">{copy.gostayaCost}</p>
          <label className="mt-2 block text-xs text-neutral-500">
            {copy.monthlyCost}
            <input type="number" min="0" step="0.01" className={inputClass} value={form.monthlyCost} disabled={!canEdit} onChange={(e) => field("monthlyCost", e.target.value)} />
          </label>
          <label className="mt-2 block text-xs text-neutral-500">
            {copy.oneTimeCost}
            <input type="number" min="0" step="0.01" className={inputClass} value={form.oneTimeCost} disabled={!canEdit} onChange={(e) => field("oneTimeCost", e.target.value)} />
          </label>
          <label className="mt-2 block text-xs text-neutral-500">
            {copy.amortization}
            <input type="number" min="1" step="1" className={inputClass} value={form.amortizationMonths} disabled={!canEdit} onChange={(e) => field("amortizationMonths", e.target.value)} />
          </label>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
        <p className="text-xs font-semibold text-neutral-400">{copy.assumptions}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ["receptionMinutes", copy.receptionMinutes],
            ["infoMinutes", copy.infoMinutes],
            ["coordinationMinutes", copy.coordinationMinutes],
            ["baselineDirectRatePct", copy.directRate],
            ["baselineSelfServiceRatePct", copy.selfServiceRate],
            ["recoveryMinutes", copy.recoveryMinutes],
          ].map(([key, label]) => (
            <label key={key} className="text-xs text-neutral-500">
              {label}
              <input
                type="number"
                min="0"
                step="0.1"
                className={inputClass}
                value={form[key as keyof FormState]}
                disabled={!canEdit}
                onChange={(e) => field(key as keyof FormState, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
        <p className="text-xs font-semibold text-neutral-400">{copy.costs}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            ["receptionCostPerHour", copy.receptionCost],
            ["coordinationCostPerHour", copy.coordinationCost],
            ["recoveryCostPerHour", copy.recoveryCost],
          ].map(([key, label]) => (
            <label key={key} className="text-xs text-neutral-500">
              {label}
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
                value={form[key as keyof FormState]}
                disabled={!canEdit}
                onChange={(e) => field(key as keyof FormState, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={!canEdit || !valid || saving || loading}
        className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-35"
      >
        {saving ? copy.saving : copy.save}
      </button>

      {feedback ? (
        <p className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300">
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
