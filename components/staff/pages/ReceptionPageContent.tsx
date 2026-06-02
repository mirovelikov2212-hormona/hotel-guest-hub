"use client";

import { useEffect, useMemo, useState } from "react";
import StaffRequestCard from "@/components/staff/StaffRequestCard";
import StaffSummaryCard from "@/components/staff/StaffSummaryCard";
import StaffFilterButton from "@/components/staff/StaffFilterButton";
import { useStaffStore } from "@/components/staff/store/StaffStoreProvider";
import { useStaffUi } from "@/components/staff/StaffUiProvider";
import type {
  StaffDepartment,
  StaffRequest,
  StaffRequestStatus,
} from "@/lib/staff/types";
import {
  staffText,
  translateDepartment,
  translateStaffStatus,
} from "@/lib/staff/ui-copy";
import { isReceptionBackupHours } from "@/lib/staff/operations-hours";

type DepartmentFilter = "all" | StaffDepartment;
type StatusFilter = "all" | "active" | StaffRequestStatus;
type SortMode = "priority" | "newest" | "oldest";

type ReceptionHistoryCopy = {
  title: string;
  subtitle: string;
  open: string;
  close: string;
  empty: string;
  details: string;
  note: string;
  billing: string;
  noBilling: string;
};

const HOTEL_TIME_ZONE = "Europe/Sofia";

const receptionHistoryCopy: Record<"bg" | "en" | "de", ReceptionHistoryCopy> = {
  bg: {
    title: "Дневна история",
    subtitle:
      "Всички заявки за текущия хотелски ден. Само за справка — без оперативни действия.",
    open: "Покажи историята",
    close: "Скрий историята",
    empty: "Все още няма заявки за текущия хотелски ден.",
    details: "Детайли",
    note: "Бележка / избор",
    billing: "Начисляване",
    noBilling: "Без начисляване",
  },
  en: {
    title: "Daily history",
    subtitle:
      "All requests for the current hotel day. Reference only — no operational actions.",
    open: "Show history",
    close: "Hide history",
    empty: "There are no requests for the current hotel day yet.",
    details: "Details",
    note: "Note / selection",
    billing: "Billing",
    noBilling: "No billing",
  },
  de: {
    title: "Tageshistorie",
    subtitle:
      "Alle Anfragen des aktuellen Hoteltages. Nur zur Übersicht — keine operativen Aktionen.",
    open: "Historie anzeigen",
    close: "Historie ausblenden",
    empty: "Für den aktuellen Hoteltag gibt es noch keine Anfragen.",
    details: "Details",
    note: "Notiz / Auswahl",
    billing: "Buchung",
    noBilling: "Keine Buchung",
  },
};

const hotelDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: HOTEL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const hotelTimeFormatter = new Intl.DateTimeFormat("bg-BG", {
  timeZone: HOTEL_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const RECEPTION_OVERDUE_AFTER_MINUTES = 10;

const priorityOrder: Record<StaffRequestStatus, number> = {
  new: 0,
  returned: 1,
  in_progress: 2,
  completed: 3,
};

function isActiveStatus(status: StaffRequestStatus) {
  return status !== "completed";
}

function getRequestAgeMinutes(request: StaffRequest, nowMs: number) {
  const createdAtMs = new Date(request.createdAtIso).getTime();

  if (!Number.isFinite(createdAtMs)) return 0;

  return Math.max(0, Math.floor((nowMs - createdAtMs) / 60000));
}

function isOverdueForReception(request: StaffRequest, nowMs: number) {
  if (request.status !== "new") return false;

  return (
    getRequestAgeMinutes(request, nowMs) >= RECEPTION_OVERDUE_AFTER_MINUTES
  );
}

function getHotelDateKey(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return hotelDateFormatter.format(date);
}

function formatHotelTime(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "--:--";
  return hotelTimeFormatter.format(date);
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

function getBillingStatusLabel(
  request: StaffRequest,
  lang: "bg" | "en" | "de",
) {
  if (!request.requiresBilling) {
    return receptionHistoryCopy[lang].noBilling;
  }

  if (request.billingStatus === "charged") {
    return lang === "de" ? "Gebucht" : lang === "en" ? "Charged" : "Начислено";
  }

  if (request.billingStatus === "waived") {
    return lang === "de"
      ? "Ohne Buchung"
      : lang === "en"
        ? "No charge"
        : "Без начисляване";
  }

  if (request.billingStatus === "cancelled") {
    return lang === "de"
      ? "Storniert"
      : lang === "en"
        ? "Cancelled"
        : "Отказана";
  }

  return lang === "de"
    ? "Wartet"
    : lang === "en"
      ? "Pending"
      : "Чака начисляване";
}

function sortNewestFirst(requests: StaffRequest[]) {
  return [...requests].sort(
    (a, b) =>
      new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime(),
  );
}

function sortRequests(
  requests: StaffRequest[],
  sortMode: SortMode,
  nowMs: number,
) {
  const next = [...requests];

  return next.sort((a, b) => {
    const ta = new Date(a.createdAtIso).getTime();
    const tb = new Date(b.createdAtIso).getTime();

    if (sortMode === "newest") {
      return tb - ta;
    }

    if (sortMode === "oldest") {
      return ta - tb;
    }

    const aOverdue = isOverdueForReception(a, nowMs);
    const bOverdue = isOverdueForReception(b, nowMs);

    if (aOverdue !== bOverdue) {
      return aOverdue ? -1 : 1;
    }

    if (priorityOrder[a.status] !== priorityOrder[b.status]) {
      return priorityOrder[a.status] - priorityOrder[b.status];
    }

    return tb - ta;
  });
}

function ReceptionDailyHistory({
  requests,
  lang,
  todayKey,
}: {
  requests: StaffRequest[];
  lang: "bg" | "en" | "de";
  todayKey: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const copy = receptionHistoryCopy[lang];
  const dailyRequests = useMemo(
    () =>
      sortNewestFirst(
        requests.filter(
          (request) => getHotelDateKey(request.createdAtIso) === todayKey,
        ),
      ),
    [requests, todayKey],
  );

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">
            {copy.title}
          </p>
          <h3 className="mt-1 text-xl font-semibold text-white">
            {copy.title} · {dailyRequests.length}
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-white/60">
            {copy.subtitle}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className="rounded-2xl border border-white/15 bg-black/20 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          {isOpen ? copy.close : copy.open}
        </button>
      </div>

      {isOpen ? (
        <div className="mt-4 space-y-3">
          {dailyRequests.length ? (
            dailyRequests.map((request) => (
              <details
                key={request.id}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {formatHotelTime(request.createdAtIso)} ·{" "}
                        {request.typeLabel}
                      </p>
                      <p className="mt-1 text-xs text-white/50">
                        {translateDepartment(request.department, lang)} ·{" "}
                        {translateStaffStatus(request.status, lang)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                      <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-white/70">
                        {staffText(lang).room} {request.room}
                      </span>
                      {request.requiresBilling ? (
                        <span className="rounded-full border border-amber-400/30 bg-amber-400/15 px-3 py-1 text-amber-100">
                          {getBillingStatusLabel(request, lang)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </summary>

                <div className="mt-3 grid gap-3 border-t border-white/10 pt-3 text-sm text-white/70 md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-white/35">
                      {copy.details}
                    </p>
                    <p className="mt-1">
                      {translateDepartment(request.department, lang)} ·{" "}
                      {translateStaffStatus(request.status, lang)}
                    </p>
                    <p className="mt-1 text-white/50">
                      {staffText(lang).requestedAt}{" "}
                      {formatRequestDateTime(request.createdAtIso, lang)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-white/35">
                      {copy.billing}
                    </p>
                    <p className="mt-1">
                      {getBillingStatusLabel(request, lang)}
                    </p>
                    {request.price || request.currency ? (
                      <p className="mt-1 text-white/50">
                        {[request.price, request.currency]
                          .filter(Boolean)
                          .join(" ")}
                      </p>
                    ) : null}
                  </div>

                  {request.note ? (
                    <div className="md:col-span-2">
                      <p className="text-xs uppercase tracking-[0.16em] text-white/35">
                        {copy.note}
                      </p>
                      <p className="mt-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white/75">
                        {request.note}
                      </p>
                    </div>
                  ) : null}
                </div>
              </details>
            ))
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">
              {copy.empty}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

export default function ReceptionPage() {
  const { lang } = useStaffUi();
  const t = staffText(lang);
  const [activeDepartment, setActiveDepartment] =
    useState<DepartmentFilter>("all");
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  const {
    getAllRequests,
    getOperationalAllRequests,
    updateRequestStatus,
    setRequestBillingStatus,
  } = useStaffStore();
  const requests = getOperationalAllRequests();
  const allRequests = getAllRequests();
  const todayHotelDateKey = useMemo(
    () => hotelDateFormatter.format(new Date(nowMs)),
    [nowMs],
  );

  const activeRequests = useMemo(
    () => requests.filter((request) => isActiveStatus(request.status)),
    [requests],
  );

  const receptionActiveRequests = useMemo(
    () =>
      activeRequests.filter((request) => request.department === "reception"),
    [activeRequests],
  );

  const otherDepartmentActiveRequests = useMemo(
    () =>
      activeRequests.filter((request) => request.department !== "reception"),
    [activeRequests],
  );

  const returnedRequests = useMemo(
    () => requests.filter((request) => request.status === "returned"),
    [requests],
  );

  const filteredRequests = useMemo(() => {
    let base =
      activeDepartment === "all"
        ? requests
        : requests.filter((request) => request.department === activeDepartment);

    if (activeStatus === "active") {
      base = base.filter((request) => isActiveStatus(request.status));
    } else if (activeStatus !== "all") {
      base = base.filter((request) => request.status === activeStatus);
    }

    return sortRequests(base, sortMode, nowMs);
  }, [requests, activeDepartment, activeStatus, sortMode, nowMs]);

  const afterHours = useMemo(
    () => isReceptionBackupHours(new Date(nowMs)),
    [nowMs],
  );

  const actionableRequests = useMemo(
    () =>
      filteredRequests.filter((request) => {
        if (request.department === "reception") return true;
        if (!afterHours) return false;
        if (request.serviceTime === "tomorrow") return false;
        return (
          request.department === "housekeeping" ||
          request.department === "maintenance"
        );
      }),
    [afterHours, filteredRequests],
  );

  const monitoringRequests = useMemo(
    () =>
      filteredRequests.filter((request) => {
        if (request.department === "reception") return false;
        if (
          afterHours &&
          request.serviceTime !== "tomorrow" &&
          (request.department === "housekeeping" ||
            request.department === "maintenance")
        ) {
          return false;
        }
        return true;
      }),
    [afterHours, filteredRequests],
  );

  return (
    <main className="space-y-6 pb-safe">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/50">
              {t.department}
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              {t.reception}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
              {t.receptionIntro}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {t.controlCenterMonitoring}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StaffSummaryCard
          label={t.total}
          value={requests.length}
          active={activeStatus === "all"}
          onClick={() => setActiveStatus("all")}
        />
        <StaffSummaryCard
          label={t.new}
          value={requests.filter((request) => request.status === "new").length}
          active={activeStatus === "new"}
          onClick={() => setActiveStatus("new")}
        />
        <StaffSummaryCard
          label={t.inProgress}
          value={
            requests.filter((request) => request.status === "in_progress")
              .length
          }
          active={activeStatus === "in_progress"}
          onClick={() => setActiveStatus("in_progress")}
        />
        <StaffSummaryCard
          label={t.completed}
          value={
            requests.filter((request) => request.status === "completed").length
          }
          active={activeStatus === "completed"}
          onClick={() => setActiveStatus("completed")}
        />
        <StaffSummaryCard
          label={t.returned}
          value={returnedRequests.length}
          danger
          active={activeStatus === "returned"}
          onClick={() => setActiveStatus("returned")}
        />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/40">
              {t.departmentFilter}
            </p>
            <div className="flex flex-wrap gap-2">
              <StaffFilterButton
                label={t.all}
                active={activeDepartment === "all"}
                onClick={() => setActiveDepartment("all")}
              />
              <StaffFilterButton
                label={t.housekeeping}
                active={activeDepartment === "housekeeping"}
                onClick={() => setActiveDepartment("housekeeping")}
              />
              <StaffFilterButton
                label={t.maintenance}
                active={activeDepartment === "maintenance"}
                onClick={() => setActiveDepartment("maintenance")}
              />
              <StaffFilterButton
                label={t.reception}
                active={activeDepartment === "reception"}
                onClick={() => setActiveDepartment("reception")}
              />
              <StaffFilterButton
                label={t.restaurant}
                active={activeDepartment === "restaurant"}
                onClick={() => setActiveDepartment("restaurant")}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/40">
              {t.sort}
            </p>
            <div className="flex flex-wrap gap-2">
              <StaffFilterButton
                label={t.priority}
                active={sortMode === "priority"}
                onClick={() => setSortMode("priority")}
              />
              <StaffFilterButton
                label={t.newest}
                active={sortMode === "newest"}
                onClick={() => setSortMode("newest")}
              />
              <StaffFilterButton
                label={t.oldest}
                active={sortMode === "oldest"}
                onClick={() => setSortMode("oldest")}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-100">
            {t.receptionActions}
          </h3>
          <p className="mt-1 text-sm text-amber-50/80">
            {t.receptionActionsText}
          </p>
        </div>

        {actionableRequests.length ? (
          actionableRequests.map((request) => {
            const requestAgeMinutes = getRequestAgeMinutes(request, nowMs);

            return (
              <StaffRequestCard
                key={request.id}
                request={request}
                mode="reception"
                canAct
                isOverdue={isOverdueForReception(request, nowMs)}
                overdueMinutes={requestAgeMinutes}
                onStart={(id) => void updateRequestStatus(id, "in_progress")}
                onDone={(id) => void updateRequestStatus(id, "completed")}
                onReturn={(id) => void updateRequestStatus(id, "returned")}
                canCharge={Boolean(request.requiresBilling)}
                onCharge={(id) => void setRequestBillingStatus(id, "charged")}
                onWaive={(id) => void setRequestBillingStatus(id, "waived")}
                onCancelBilling={(id) =>
                  void setRequestBillingStatus(id, "cancelled")
                }
              />
            );
          })
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/60">
            {t.noReceptionRequests}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/80">
            {t.monitoringOnly}
          </h3>
          <p className="mt-1 text-sm text-white/60">{t.monitoringOnlyText}</p>
        </div>

        {monitoringRequests.length ? (
          monitoringRequests.map((request) => {
            const requestAgeMinutes = getRequestAgeMinutes(request, nowMs);

            return (
              <StaffRequestCard
                key={request.id}
                request={request}
                mode="reception"
                canAct={false}
                isOverdue={isOverdueForReception(request, nowMs)}
                overdueMinutes={requestAgeMinutes}
                canCharge={Boolean(request.requiresBilling)}
                onCharge={(id) => void setRequestBillingStatus(id, "charged")}
                onWaive={(id) => void setRequestBillingStatus(id, "waived")}
                onCancelBilling={(id) =>
                  void setRequestBillingStatus(id, "cancelled")
                }
              />
            );
          })
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/60">
            {t.noMonitoringRequests}
          </div>
        )}
      </section>

      <ReceptionDailyHistory
        requests={allRequests}
        lang={lang}
        todayKey={todayHotelDateKey}
      />
    </main>
  );
}
