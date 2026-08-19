"use client";

import { useState } from "react";
import { useStaffHotelTimeZone } from "@/components/staff/StaffHotelTimeZoneProvider";
import { useStaffUi } from "@/components/staff/StaffUiProvider";
import type { StaffBillingStatus, StaffRequest } from "@/lib/staff/types";
import { getStaffDepartmentClass, staffStatusClasses } from "@/lib/staff/types";
import { isMassageBookingLikeRequest } from "@/lib/staff/request-type-utils";
import {
  staffText,
  translateDepartment,
  translateStaffStatus,
} from "@/lib/staff/ui-copy";

type StaffRequestCardProps = {
  request: StaffRequest;
  mode: "department" | "reception" | "manager";
  canAct?: boolean;
  onStart?: (id: string) => void;
  onDone?: (id: string) => void;
  onReturn?: (id: string) => void;
  canCharge?: boolean;
  onCharge?: (id: string) => void;
  onWaive?: (id: string) => void;
  onCancelBilling?: (id: string) => void;
  isOverdue?: boolean;
  overdueMinutes?: number;
  forceBillingOnly?: boolean;
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
    case "massage_booking":
      return "💆";
    default:
      return "•";
  }
}

function cleanRequestTitle(value: string) {
  return value.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

function formatRequestDateTime(iso: string, locale: string, timeZone?: string) {
  const date = new Date(iso);
  return date.toLocaleString(locale, {
    ...(timeZone ? { timeZone } : {}),
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

function formatBillingAmount(request: StaffRequest) {
  const price = String(request.price ?? "").trim();
  const currency = String(request.currency ?? "").trim();

  if (!price && !currency) return "";
  return [price, currency].filter(Boolean).join(" ");
}

function getBillingStatus(request: StaffRequest): StaffBillingStatus {
  return request.billingStatus ?? (request.requiresBilling ? "pending" : "pending");
}

function getBillingBadgeClasses(status: StaffBillingStatus) {
  switch (status) {
    case "charged":
      return "border-emerald-400/30 bg-emerald-400/15 text-emerald-100";
    case "waived":
      return "border-sky-400/30 bg-sky-400/15 text-sky-100";
    case "cancelled":
      return "border-rose-400/30 bg-rose-400/15 text-rose-100";
    case "pending":
    default:
      return "border-amber-400/30 bg-amber-400/15 text-amber-100";
  }
}

export default function StaffRequestCard({
  request,
  mode,
  canAct = false,
  onStart,
  onDone,
  onReturn,
  canCharge = false,
  onCharge,
  onWaive,
  onCancelBilling,
  isOverdue = false,
  overdueMinutes,
  forceBillingOnly = false,
}: StaffRequestCardProps) {
  const { lang } = useStaffUi();
  const hotelTimeZone = useStaffHotelTimeZone();
  const t = staffText(lang);
  const [billingActionsOpen, setBillingActionsOpen] = useState(false);
  const isNew = request.status === "new";
  const isInProgress = request.status === "in_progress";
  const billingAmount = formatBillingAmount(request);
  const billingStatus = getBillingStatus(request);
  const isCharged = billingStatus === "charged";
  const isWaived = billingStatus === "waived";
  const isCancelled = billingStatus === "cancelled";
  const isPendingBilling = billingStatus === "pending";
  const shouldShowBilling = (mode === "reception" || mode === "manager") && Boolean(request.requiresBilling);
  const isMassageBooking = forceBillingOnly || isMassageBookingLikeRequest(request);
  // Only massage bookings are billing-only in Reception/Manager.
  // Other paid services such as coffee capsules, pillows, minibar and late checkout keep their operational Start/Done flow.
  const shouldUseBillingOnlyFlow = shouldShowBilling && isMassageBooking;
  const shouldShowBillingActions =
    shouldShowBilling && canCharge && isPendingBilling && billingActionsOpen;
  const shouldShowBillingToggle =
    shouldShowBilling && canCharge && isPendingBilling;
  const shouldShowReturn =
    canAct &&
    isNew &&
    !shouldUseBillingOnlyFlow &&
    !((mode === "reception" || mode === "manager") && request.requiresBilling);
  const cardClassName = isOverdue
    ? "rounded-3xl border border-rose-500/90 bg-rose-950/35 p-5 shadow-lg shadow-rose-500/20 ring-2 ring-rose-500/30 animate-pulse"
    : "rounded-3xl border border-white/10 bg-white/5 p-5 shadow-sm";

  const billingLabel = isCharged
    ? t.billingCharged
    : isWaived
      ? t.billingWaived
      : isCancelled
        ? t.billingCancelled
        : t.billingPending;

  return (
    <article className={cardClassName}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">
              {t.room} {request.room}
            </span>

            {request.isTest ? (
              <span className="rounded-full border border-fuchsia-300/35 bg-fuchsia-400/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-fuchsia-100">
                {lang === "bg" ? "ТЕСТ" : "TEST"}
              </span>
            ) : null}

            {mode !== "department" ? (
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${getStaffDepartmentClass(request.department)}`}
              >
                {translateDepartment(request.department, lang)}
              </span>
            ) : null}

            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${staffStatusClasses[request.status]}`}
            >
              {translateStaffStatus(request.status, lang)}
            </span>

            {shouldShowBilling ? (
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${getBillingBadgeClasses(billingStatus)}`}
              >
                {billingLabel}
                {billingAmount ? ` · ${billingAmount}` : ""}
              </span>
            ) : null}

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
              {formatRequestDateTime(request.createdAtIso, lang, hotelTimeZone)}
            </p>
          </div>

          {request.note ? (
            <div className="max-w-2xl rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white/75">
              {request.note}
            </div>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-72">
          {mode === "manager" && !canAct ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-white/70">
              {t.managerViewOnly}
            </div>
          ) : null}

          {shouldShowBillingToggle ? (
            <button
              type="button"
              aria-expanded={billingActionsOpen}
              onClick={() => setBillingActionsOpen((value) => !value)}
              className="min-h-14 rounded-2xl border border-amber-300/35 bg-amber-400/15 px-4 text-base font-semibold text-amber-100 transition hover:bg-amber-400/25"
            >
              {t.billingActions}
              {billingAmount ? ` · ${billingAmount}` : ""}
            </button>
          ) : null}

          {shouldShowBillingActions ? (
            <div className="grid gap-2 rounded-2xl border border-amber-300/20 bg-amber-400/5 p-3">
              <button
                type="button"
                onClick={() => onCharge?.(request.id)}
                className="min-h-14 rounded-2xl bg-amber-500 px-4 text-base font-semibold text-white transition hover:bg-amber-400"
              >
                {t.charge}
                {billingAmount ? ` · ${billingAmount}` : ""}
              </button>
              <button
                type="button"
                onClick={() => onWaive?.(request.id)}
                className="min-h-12 rounded-2xl border border-sky-300/30 bg-sky-400/15 px-4 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/25"
              >
                {t.noCharge}
              </button>
              <button
                type="button"
                onClick={() => onCancelBilling?.(request.id)}
                className="min-h-12 rounded-2xl border border-rose-400/30 bg-rose-400/15 px-4 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/25"
              >
                {t.cancelPaidService}
              </button>
            </div>
          ) : null}

          {shouldShowBilling && !isPendingBilling ? (
            <div className={`rounded-2xl border px-4 py-4 text-center text-sm font-semibold ${getBillingBadgeClasses(billingStatus)}`}>
              {billingLabel}
              {billingAmount ? ` · ${billingAmount}` : ""}
            </div>
          ) : null}

          {mode === "reception" && !canAct ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-white/70">
              {t.receptionMonitoringOnly}
            </div>
          ) : null}

          {canAct && isNew && !shouldUseBillingOnlyFlow ? (
            <>
              <button
                type="button"
                onClick={() => onStart?.(request.id)}
                className="min-h-14 rounded-2xl bg-sky-500 px-4 text-base font-semibold text-white transition hover:bg-sky-400"
              >
                {t.start}
              </button>

              {shouldShowReturn ? (
                <button
                  type="button"
                  onClick={() => onReturn?.(request.id)}
                  className="min-h-14 rounded-2xl border border-rose-400/30 bg-rose-400/15 px-4 text-base font-semibold text-rose-100 transition hover:bg-rose-400/25"
                >
                  {t.return}
                </button>
              ) : null}
            </>
          ) : null}

          {canAct && isInProgress && !shouldUseBillingOnlyFlow ? (
            <button
              type="button"
              onClick={() => onDone?.(request.id)}
              className="min-h-14 rounded-2xl bg-emerald-500 px-4 text-base font-semibold text-white transition hover:bg-emerald-400"
            >
              {t.done}
            </button>
          ) : null}

          {canAct && !isNew && !isInProgress && !shouldUseBillingOnlyFlow ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-center text-sm font-medium text-white/50">
              {t.noActionsAvailable}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
