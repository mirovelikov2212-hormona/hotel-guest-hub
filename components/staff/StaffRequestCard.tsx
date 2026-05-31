"use client";

import { useStaffUi } from "@/components/staff/StaffUiProvider";
import type { StaffRequest } from "@/lib/staff/types";
import { staffDepartmentClasses, staffStatusClasses } from "@/lib/staff/types";
import {
  staffText,
  translateDepartment,
  translateStaffStatus,
} from "@/lib/staff/ui-copy";

type StaffRequestCardProps = {
  request: StaffRequest;
  mode: "department" | "reception" | "manager";
  canAct?: boolean;
  canCharge?: boolean;
  onCharge?: (id: string) => void;
  onStart?: (id: string) => void;
  onDone?: (id: string) => void;
  onReturn?: (id: string) => void;
  isOverdue?: boolean;
  overdueMinutes?: number;
};

function getStaffRequestIcon(type: string): string {
  switch (type) {
    case "towels":
      return "🧺";
    case "toilet_paper":
      return "🧻";
    case "extra_pillow":
      return "🛏️";
    case "extra_blanket":
      return "🧣";
    case "bathrobe":
      return "🧥";
    case "slippers":
      return "🩴";
    case "baby_cot":
      return "🍼";
    case "iron":
      return "🧼";
    case "minibar":
      return "🥤";
    case "laundry":
      return "🧺";
    case "late_checkout":
      return "🕒";
    case "taxi":
      return "🚕";
    case "wake_up_call":
      return "⏰";
    case "information_request":
    case "information":
      return "ℹ️";
    case "reservation_help":
      return "📋";
    case "other_reception":
      return "🛎️";
    case "air_conditioning":
      return "❄️";
    case "light_not_working":
      return "💡";
    case "no_hot_water":
      return "🚿";
    case "tv_issue":
      return "📺";
    case "bathroom_issue":
      return "🛁";
    case "door_lock_issue":
      return "🚪";
    case "wifi_issue":
      return "📶";
    case "power_outlet_issue":
      return "🔌";
    case "safe_issue":
      return "🔒";
    case "balcony_door_issue":
      return "🚪";
    case "minibar_not_cooling":
      return "🧊";
    case "other_technical_issue":
      return "🛠️";
    case "restaurant_reservation":
      return "🍽️";
    default:
      return "•";
  }
}

function getBillingCopy(lang: string) {
  if (lang === "bg") {
    return {
      pending: "Платена услуга: трябва да се начисли към стаята.",
      charged: "Начислено към стаята.",
      button: "НАЧИСЛЕНО",
    };
  }

  if (lang === "de") {
    return {
      pending: "Kostenpflichtige Leistung: bitte auf das Zimmer buchen.",
      charged: "Auf das Zimmer gebucht.",
      button: "GEBUCHT",
    };
  }

  return {
    pending: "Paid service: charge to the room account.",
    charged: "Charged to the room account.",
    button: "CHARGED",
  };
}

function cleanRequestTitle(value: string) {
  return value.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

function formatRequestDateTime(iso: string, locale: string) {
  const date = new Date(iso);
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatOverdueText(minutes: number | undefined, locale: string) {
  const safeMinutes = Math.max(10, Math.floor(minutes || 10));

  if (locale === "bg") return `Чака ${safeMinutes} мин.`;
  if (locale === "de") return `Wartet ${safeMinutes} Min.`;

  return `Waiting ${safeMinutes} min.`;
}

export default function StaffRequestCard({
  request,
  mode,
  canAct = false,
  canCharge = false,
  onCharge,
  onStart,
  onDone,
  onReturn,
  isOverdue = false,
  overdueMinutes,
}: StaffRequestCardProps) {
  const { lang } = useStaffUi();
  const t = staffText(lang);
  const isNew = request.status === "new";
  const isInProgress = request.status === "in_progress";
  const billingCopy = getBillingCopy(lang);
  const hasBilling = Boolean(request.requiresBilling || request.price);
  const isCharged = request.billingStatus === "charged";
  const cardClassName = isOverdue
    ? "rounded-3xl border border-rose-500/90 bg-rose-950/35 p-5 shadow-lg shadow-rose-500/20 ring-2 ring-rose-500/30 animate-pulse"
    : "rounded-3xl border border-white/10 bg-white/5 p-5 shadow-sm";

  return (
    <article className={cardClassName}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">
              {t.room} {request.room}
            </span>

            {mode !== "department" ? (
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${staffDepartmentClasses[request.department]}`}
              >
                {translateDepartment(request.department, lang)}
              </span>
            ) : null}

            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${staffStatusClasses[request.status]}`}
            >
              {translateStaffStatus(request.status, lang)}
            </span>

            {isOverdue ? (
              <span className="rounded-full border border-rose-300/50 bg-rose-500/25 px-3 py-1 text-xs font-bold uppercase tracking-wide text-rose-50">
                {formatOverdueText(overdueMinutes, lang)}
              </span>
            ) : null}
          </div>

          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl leading-none">
                {getStaffRequestIcon(request.type)}
              </span>
              <h3 className="text-2xl font-semibold tracking-tight text-white">
                {cleanRequestTitle(request.typeLabel)}
              </h3>
            </div>
            <p className="mt-1 text-sm text-white/50">
              {t.requestedAt}{" "}
              {formatRequestDateTime(request.createdAtIso, lang)}
            </p>
          </div>

          {request.note ? (
            <div className="max-w-2xl rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white/75">
              {request.note}
            </div>
          ) : null}

          {hasBilling ? (
            <div className={`max-w-2xl rounded-2xl border px-4 py-3 text-sm leading-6 ${
              isCharged
                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                : "border-amber-400/25 bg-amber-400/10 text-amber-100"
            }`}>
              <span className="font-semibold">
                {isCharged ? billingCopy.charged : billingCopy.pending}
              </span>
              {request.price ? (
                <span> {request.price}{request.currency ? ` ${request.currency}` : ""}</span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-72">
          {mode === "manager" ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-white/70">
              {t.managerViewOnly}
            </div>
          ) : null}

          {mode === "reception" && !canAct ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-white/70">
              {t.receptionMonitoringOnly}
            </div>
          ) : null}

          {canCharge ? (
            <button
              type="button"
              onClick={() => onCharge?.(request.id)}
              className="min-h-14 rounded-2xl border border-amber-300/40 bg-amber-400/20 px-4 text-base font-semibold text-amber-50 transition hover:bg-amber-400/30"
            >
              {billingCopy.button}
            </button>
          ) : null}

          {canAct && isNew ? (
            <>
              <button
                type="button"
                onClick={() => onStart?.(request.id)}
                className="min-h-14 rounded-2xl bg-sky-500 px-4 text-base font-semibold text-white transition hover:bg-sky-400"
              >
                {t.start}
              </button>

              <button
                type="button"
                onClick={() => onReturn?.(request.id)}
                className="min-h-14 rounded-2xl border border-rose-400/30 bg-rose-400/15 px-4 text-base font-semibold text-rose-100 transition hover:bg-rose-400/25"
              >
                {t.return}
              </button>
            </>
          ) : null}

          {canAct && isInProgress ? (
            <button
              type="button"
              onClick={() => onDone?.(request.id)}
              className="min-h-14 rounded-2xl bg-emerald-500 px-4 text-base font-semibold text-white transition hover:bg-emerald-400"
            >
              {t.done}
            </button>
          ) : null}

          {canAct && !isNew && !isInProgress ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-center text-sm font-medium text-white/50">
              {t.noActionsAvailable}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
