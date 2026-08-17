"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  propertyId: string;
  displayName: string;
  productionLive: boolean;
  commercial: CommercialState;
};

const ACTION_LABELS: Record<CommercialAction, string> = {
  initialize: "Initialize commercial control",
  start_trial: "Start trial",
  extend_trial: "Extend trial",
  convert_to_customer: "Convert to customer",
  suspend: "Suspend access",
  resume: "Resume access",
  end: "End commercial service",
};

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

function apiErrorMessage(code: unknown) {
  if (code === "production_not_live") return "Production средата трябва първо да е LIVE.";
  if (code === "commercial_state_conflict") return "Статусът е променен междувременно. Обнови страницата и опитай отново.";
  if (code === "commercial_transition_rejected") return "Преходът е отказан от commercial state machine.";
  if (code === "unauthorized" || code === "forbidden") return "Нямаш валидно Platform Admin право за тази операция.";
  return "Операцията не беше завършена. Провери текущия статус и опитай отново.";
}

export default function CommercialLifecyclePanel({
  propertyId,
  displayName,
  productionLive,
  commercial,
}: Props) {
  const router = useRouter();
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
      setFeedback("Добави кратка причина за audit историята.");
      return;
    }
    if (!confirmed) {
      setFeedback("Потвърди изрично промяната.");
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
        setFeedback("Trial периодът трябва да е между 1 и 60 дни.");
        return;
      }
      body.trialDays = days;
      if (planCode.trim()) body.planCode = planCode.trim();
    }

    if (selectedAction === "extend_trial") {
      const parsed = new Date(trialEndsAt);
      if (!trialEndsAt || Number.isNaN(parsed.getTime())) {
        setFeedback("Избери валидна нова крайна дата.");
        return;
      }
      body.trialEndsAt = parsed.toISOString();
    }

    if (selectedAction === "convert_to_customer") {
      if (!planCode.trim()) {
        setFeedback("Въведи plan code за договорния клиент.");
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

      setFeedback("Промяната е записана успешно.");
      setSelectedAction(null);
      router.refresh();
    } catch {
      setFeedback("Няма връзка с Control Plane API.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
            Commercial actions
          </p>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            Explicit Platform Admin transitions. No browser-side database writes.
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            productionLive
              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
              : "border-amber-400/25 bg-amber-400/10 text-amber-200"
          }`}
        >
          Production {productionLive ? "LIVE" : "NOT LIVE"}
        </span>
      </div>

      {commercial.status === "trial" && daysRemaining !== null ? (
        <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs text-cyan-100">
          Trial: <strong>{daysRemaining}</strong> дни остават
          {commercial.effectiveStatus === "trial_expired" ? " · срокът е изтекъл" : ""}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {actions.length ? (
          actions.map((action) => {
            const blocked = requiresLiveProduction(action) && !productionLive;
            return (
              <button
                key={action}
                type="button"
                disabled={blocked}
                onClick={() => openAction(action)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${actionTone(action)}`}
                title={blocked ? "Production трябва първо да е LIVE." : undefined}
              >
                {action === "start_trial" ? "Start 14-day trial" : ACTION_LABELS[action]}
              </button>
            );
          })
        ) : (
          <p className="text-xs text-neutral-500">Няма разрешени commercial действия за този статус.</p>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-5 text-neutral-600">
        Commercial entitlement е отделно от техническия runtime. Автоматичното runtime enforcement при
        изтичане на trial е отделен защитен етап.
      </p>

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
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/70">Commercial transition</p>
                <h4 id={`commercial-dialog-${propertyId}`} className="mt-1 text-lg font-semibold text-neutral-100">
                  {ACTION_LABELS[selectedAction]}
                </h4>
                <p className="mt-1 text-xs text-neutral-500">{displayName}</p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                disabled={submitting}
                className="rounded-xl border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:border-neutral-600"
              >
                Затвори
              </button>
            </div>

            {selectedAction === "start_trial" ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-xs text-neutral-400">
                  Trial days
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
                  Trial plan code
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
                New trial end
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
                Contract plan code
                <input
                  value={planCode}
                  onChange={(event) => setPlanCode(event.target.value)}
                  placeholder="Въведи договорния plan code"
                  className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 outline-none focus:border-emerald-500"
                />
              </label>
            ) : null}

            <label className="mt-5 block text-xs text-neutral-400">
              Причина / бележка за audit
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Напр. 14-дневен тест по договорка с хотелския мениджър"
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
                Потвърждавам изрично commercial промяната за <strong>{displayName}</strong>.
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
              {submitting ? "Записване…" : `Потвърди: ${ACTION_LABELS[selectedAction]}`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
