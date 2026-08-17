"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { ControlPlaneLang } from "@/lib/control-plane-i18n";

type CommercialAction =
  | "initialize"
  | "start_trial"
  | "extend_trial"
  | "convert_to_customer"
  | "suspend"
  | "resume"
  | "end";

type CommercialState = {
  managed: boolean;
  status: "unmanaged" | "pending" | "trial" | "active_customer" | "suspended" | "ended";
  effectiveStatus:
    | "unmanaged"
    | "pending"
    | "trial_active"
    | "trial_expired"
    | "customer_active"
    | "suspended"
    | "ended";
  version: number | null;
  planCode: string | null;
  trialEndsAt: string | null;
};

type Props = {
  lang: ControlPlaneLang;
  propertyId: string;
  displayName: string;
  productionLive: boolean;
  commercial: CommercialState;
};

const ACTION_LABELS: Record<ControlPlaneLang, Record<CommercialAction, string>> = {
  bg: {
    initialize: "Активирай търговско управление",
    start_trial: "Стартирай пробен период",
    extend_trial: "Удължи пробния период",
    convert_to_customer: "Преобразувай в клиент",
    suspend: "Спри достъпа",
    resume: "Възстанови достъпа",
    end: "Прекрати услугата",
  },
  en: {
    initialize: "Initialize commercial control",
    start_trial: "Start trial",
    extend_trial: "Extend trial",
    convert_to_customer: "Convert to customer",
    suspend: "Suspend access",
    resume: "Resume access",
    end: "End commercial service",
  },
};

const COPY = {
  bg: {
    actions: "Търговски действия",
    actionSubtitle: "Изрични Platform Admin промени. Няма директни записи в базата от браузъра.",
    production: "Продукция",
    live: "LIVE",
    notLive: "НЕ Е LIVE",
    trial: "Пробен период",
    daysLeft: "дни остават",
    expired: "срокът е изтекъл",
    noActions: "Няма разрешени търговски действия за този статус.",
    runtimeNote: "Търговското право за достъп е отделно от техническия runtime и се прилага автоматично в Production.",
    transition: "Търговска промяна",
    close: "Затвори",
    trialDays: "Дни на пробния период",
    trialPlan: "Код на тестовия план",
    newTrialEnd: "Нов край на пробния период",
    contractPlan: "Код на договорния план",
    contractPlanPlaceholder: "Въведи договорния plan code",
    auditReason: "Причина / бележка за audit",
    auditPlaceholder: "Напр. 14-дневен тест по договорка с хотелския мениджър",
    explicitConfirm: "Потвърждавам изрично търговската промяна за",
    saving: "Записване…",
    confirm: "Потвърди",
    productionRequired: "Production трябва първо да е LIVE.",
    reasonRequired: "Добави кратка причина за audit историята.",
    confirmRequired: "Потвърди изрично промяната.",
    trialDaysInvalid: "Пробният период трябва да е между 1 и 60 дни.",
    trialEndInvalid: "Избери валидна нова крайна дата.",
    planRequired: "Въведи plan code за договорния клиент.",
    success: "Промяната е записана успешно.",
    noConnection: "Няма връзка с Control Plane API.",
    stateConflict: "Статусът е променен междувременно. Обнови страницата и опитай отново.",
    transitionRejected: "Промяната е отказана от търговската state machine.",
    forbidden: "Нямаш валидно Platform Admin право за тази операция.",
    genericError: "Операцията не беше завършена. Провери текущия статус и опитай отново.",
  },
  en: {
    actions: "Commercial actions",
    actionSubtitle: "Explicit Platform Admin transitions. No browser-side database writes.",
    production: "Production",
    live: "LIVE",
    notLive: "NOT LIVE",
    trial: "Trial",
    daysLeft: "days left",
    expired: "expired",
    noActions: "No commercial actions are allowed for this status.",
    runtimeNote: "Commercial entitlement is separate from technical runtime and is enforced automatically in Production.",
    transition: "Commercial transition",
    close: "Close",
    trialDays: "Trial days",
    trialPlan: "Trial plan code",
    newTrialEnd: "New trial end",
    contractPlan: "Contract plan code",
    contractPlanPlaceholder: "Enter the contracted plan code",
    auditReason: "Reason / audit note",
    auditPlaceholder: "Example: 14-day trial agreed with the hotel manager",
    explicitConfirm: "I explicitly confirm the commercial change for",
    saving: "Saving…",
    confirm: "Confirm",
    productionRequired: "Production must be LIVE first.",
    reasonRequired: "Add a short reason for the audit history.",
    confirmRequired: "Explicitly confirm the change.",
    trialDaysInvalid: "The trial period must be between 1 and 60 days.",
    trialEndInvalid: "Choose a valid new trial end date.",
    planRequired: "Enter a plan code for the contracted customer.",
    success: "The change was saved successfully.",
    noConnection: "Cannot connect to the Control Plane API.",
    stateConflict: "The status changed in the meantime. Refresh the page and try again.",
    transitionRejected: "The transition was rejected by the commercial state machine.",
    forbidden: "You do not have valid Platform Admin authority for this operation.",
    genericError: "The operation was not completed. Check the current status and try again.",
  },
} as const;

function actionsFor(state: CommercialState): CommercialAction[] {
  if (!state.managed) return ["initialize"];
  if (state.status === "pending") return ["start_trial", "convert_to_customer", "end"];
  if (state.status === "trial") return ["extend_trial", "convert_to_customer", "suspend", "end"];
  if (state.status === "active_customer") return ["suspend", "end"];
  if (state.status === "suspended") return ["resume", "convert_to_customer", "end"];
  return [];
}

function requiresLiveProduction(action: CommercialAction) {
  return ["start_trial", "convert_to_customer", "resume"].includes(action);
}

function actionTone(action: CommercialAction) {
  if (action === "start_trial" || action === "resume") {
    return "border-cyan-400/30 bg-cyan-400/10 text-cyan-100 hover:border-cyan-300/60";
  }
  if (action === "convert_to_customer") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100 hover:border-emerald-300/60";
  }
  if (action === "suspend" || action === "end") {
    return "border-rose-400/30 bg-rose-400/10 text-rose-100 hover:border-rose-300/60";
  }
  return "border-neutral-700 bg-neutral-950 text-neutral-200 hover:border-neutral-500";
}

function toLocalInputValue(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function defaultExtensionValue(trialEndsAt: string | null) {
  const now = Date.now();
  const parsed = trialEndsAt ? Date.parse(trialEndsAt) : Number.NaN;
  const base = Number.isFinite(parsed) && parsed > now ? parsed : now;
  return toLocalInputValue(new Date(base + 7 * 24 * 60 * 60 * 1000));
}

export default function CommercialLifecyclePanel({
  lang,
  propertyId,
  displayName,
  productionLive,
  commercial,
}: Props) {
  const router = useRouter();
  const copy = COPY[lang];
  const labels = ACTION_LABELS[lang];
  const [selectedAction, setSelectedAction] = useState<CommercialAction | null>(null);
  const [trialDays, setTrialDays] = useState("14");
  const [trialEndsAt, setTrialEndsAt] = useState(defaultExtensionValue(commercial.trialEndsAt));
  const [planCode, setPlanCode] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const actions = useMemo(() => actionsFor(commercial), [commercial]);
  const daysRemaining = useMemo(() => {
    if (!commercial.trialEndsAt) return null;
    const remaining = Date.parse(commercial.trialEndsAt) - Date.now();
    return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
  }, [commercial.trialEndsAt]);

  function apiErrorMessage(code: unknown) {
    if (code === "production_not_live") return copy.productionRequired;
    if (code === "commercial_state_conflict") return copy.stateConflict;
    if (code === "commercial_transition_rejected") return copy.transitionRejected;
    if (code === "unauthorized" || code === "forbidden") return copy.forbidden;
    return copy.genericError;
  }

  function openAction(action: CommercialAction) {
    setSelectedAction(action);
    setReason("");
    setConfirmed(false);
    setFeedback(null);
    if (action === "start_trial") setTrialDays("14");
    if (action === "extend_trial") setTrialEndsAt(defaultExtensionValue(commercial.trialEndsAt));
    if (action === "convert_to_customer") setPlanCode("");
  }

  function closeDialog() {
    if (submitting) return;
    setSelectedAction(null);
    setConfirmed(false);
  }

  async function submitTransition() {
    if (!selectedAction || submitting) return;
    if (reason.trim().length < 3) {
      setFeedback(copy.reasonRequired);
      return;
    }
    if (!confirmed) {
      setFeedback(copy.confirmRequired);
      return;
    }

    const body: Record<string, unknown> = {
      propertyId,
      requestId: crypto.randomUUID(),
      action: selectedAction,
      reason: reason.trim(),
    };

    if (selectedAction !== "initialize") body.expectedVersion = commercial.version;

    if (selectedAction === "start_trial") {
      const days = Number(trialDays);
      if (!Number.isInteger(days) || days < 1 || days > 60) {
        setFeedback(copy.trialDaysInvalid);
        return;
      }
      body.trialDays = days;
      if (planCode.trim()) body.planCode = planCode.trim();
    }

    if (selectedAction === "extend_trial") {
      const parsed = new Date(trialEndsAt);
      if (!trialEndsAt || Number.isNaN(parsed.getTime())) {
        setFeedback(copy.trialEndInvalid);
        return;
      }
      body.trialEndsAt = parsed.toISOString();
    }

    if (selectedAction === "convert_to_customer") {
      if (!planCode.trim()) {
        setFeedback(copy.planRequired);
        return;
      }
      body.planCode = planCode.trim();
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/control-plane/commercial/property-lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !result.ok) {
        setFeedback(apiErrorMessage(result.error));
        return;
      }

      setFeedback(copy.success);
      setSelectedAction(null);
      router.refresh();
    } catch {
      setFeedback(copy.noConnection);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
            {copy.actions}
          </p>
          <p className="mt-1 text-xs leading-5 text-neutral-500">{copy.actionSubtitle}</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            productionLive
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
              : "border-amber-400/25 bg-amber-400/10 text-amber-200"
          }`}
        >
          {copy.production} {productionLive ? copy.live : copy.notLive}
        </span>
      </div>

      {commercial.status === "trial" && daysRemaining !== null ? (
        <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs text-cyan-100">
          {copy.trial}: <strong>{daysRemaining}</strong> {copy.daysLeft}
          {commercial.effectiveStatus === "trial_expired" ? ` · ${copy.expired}` : ""}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {actions.length ? (
          actions.map((action) => {
            const blocked = requiresLiveProduction(action) && !productionLive;
            const label =
              action === "start_trial"
                ? lang === "bg"
                  ? "Стартирай 14-дневен тест"
                  : "Start 14-day trial"
                : labels[action];
            return (
              <button
                key={action}
                type="button"
                disabled={blocked}
                onClick={() => openAction(action)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${actionTone(action)}`}
                title={blocked ? copy.productionRequired : undefined}
              >
                {label}
              </button>
            );
          })
        ) : (
          <p className="text-xs text-neutral-500">{copy.noActions}</p>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-5 text-neutral-600">{copy.runtimeNote}</p>

      {feedback && !selectedAction ? (
        <p className="mt-3 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-neutral-200">
          {feedback}
        </p>
      ) : null}

      {selectedAction ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`commercial-dialog-${propertyId}`}
        >
          <div className="w-full max-w-lg rounded-3xl border border-neutral-700 bg-neutral-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/70">{copy.transition}</p>
                <h4 id={`commercial-dialog-${propertyId}`} className="mt-1 text-lg font-semibold text-neutral-100">
                  {labels[selectedAction]}
                </h4>
                <p className="mt-1 text-xs text-neutral-500">{displayName}</p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                disabled={submitting}
                className="rounded-xl border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:border-neutral-600"
              >
                {copy.close}
              </button>
            </div>

            {selectedAction === "start_trial" ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-xs text-neutral-400">
                  {copy.trialDays}
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={trialDays}
                    onChange={(event) => setTrialDays(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-cyan-500"
                  />
                </label>
                <label className="text-xs text-neutral-400">
                  {copy.trialPlan}
                  <input
                    value={planCode}
                    onChange={(event) => setPlanCode(event.target.value)}
                    placeholder="full_trial"
                    className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-cyan-500"
                  />
                </label>
              </div>
            ) : null}

            {selectedAction === "extend_trial" ? (
              <label className="mt-5 block text-xs text-neutral-400">
                {copy.newTrialEnd}
                <input
                  type="datetime-local"
                  value={trialEndsAt}
                  onChange={(event) => setTrialEndsAt(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-cyan-500"
                />
              </label>
            ) : null}

            {selectedAction === "convert_to_customer" ? (
              <label className="mt-5 block text-xs text-neutral-400">
                {copy.contractPlan}
                <input
                  value={planCode}
                  onChange={(event) => setPlanCode(event.target.value)}
                  placeholder={copy.contractPlanPlaceholder}
                  className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-emerald-500"
                />
              </label>
            ) : null}

            <label className="mt-5 block text-xs text-neutral-400">
              {copy.auditReason}
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder={copy.auditPlaceholder}
                className="mt-1.5 w-full resize-none rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-cyan-500"
              />
            </label>

            <label className="mt-4 flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-xs text-neutral-300">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                {copy.explicitConfirm} <strong>{displayName}</strong>.
              </span>
            </label>

            {feedback ? (
              <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-100">
                {feedback}
              </p>
            ) : null}

            <button
              type="button"
              onClick={submitTransition}
              disabled={submitting || !confirmed}
              className="mt-4 w-full rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? copy.saving : `${copy.confirm}: ${labels[selectedAction]}`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
