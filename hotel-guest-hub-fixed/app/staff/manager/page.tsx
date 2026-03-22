"use client";

import { useMemo, useState } from "react";
import StaffRequestCard from "@/components/staff/StaffRequestCard";
import StaffSummaryCard from "@/components/staff/StaffSummaryCard";
import StaffFilterButton from "@/components/staff/StaffFilterButton";
import { useStaffStore } from "@/components/staff/store/StaffStoreProvider";
import { useStaffUi } from "@/components/staff/StaffUiProvider";
import { getRequestSummary } from "@/lib/staff/mock-data";
import {
  type StaffDepartment,
  type StaffRequest,
  type StaffRequestStatus,
} from "@/lib/staff/types";
import { staffText, translateDepartment } from "@/lib/staff/ui-copy";

type DepartmentFilter = "all" | StaffDepartment;
type StatusFilter = "all" | "active" | StaffRequestStatus;
type SortMode = "newest" | "oldest";

const departmentOrder: StaffDepartment[] = [
  "housekeeping",
  "maintenance",
  "reception",
  "restaurant",
];

function isActiveStatus(status: StaffRequestStatus) {
  return status !== "completed";
}

function getTimeValue(value: string) {
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  return hours * 60 + minutes;
}

function sortByTime(requests: StaffRequest[], sortMode: SortMode) {
  const next = [...requests];

  return next.sort((a, b) =>
    sortMode === "oldest"
      ? getTimeValue(a.createdAt) - getTimeValue(b.createdAt)
      : getTimeValue(b.createdAt) - getTimeValue(a.createdAt)
  );
}

export default function ManagerPage() {
  const { lang } = useStaffUi();
  const t = staffText(lang);
  const [activeDepartment, setActiveDepartment] = useState<DepartmentFilter>("all");
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  const { getAllRequests } = useStaffStore();
  const requests = getAllRequests();

  const summary = useMemo(() => getRequestSummary(requests), [requests]);
  const activeRequests = useMemo(
    () => requests.filter((request) => isActiveStatus(request.status)),
    [requests]
  );

  const oldestActiveRequests = useMemo(
    () => sortByTime(activeRequests, "oldest").slice(0, 6),
    [activeRequests]
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

    return sortByTime(base, sortMode);
  }, [requests, activeDepartment, activeStatus, sortMode]);

  const departmentStats = useMemo(
    () =>
      departmentOrder.map((department) => {
        const departmentRequests = requests.filter(
          (request) => request.department === department
        );
        const stats = getRequestSummary(departmentRequests);
        const activeCount = departmentRequests.filter((request) =>
          isActiveStatus(request.status)
        ).length;

        return {
          department,
          stats,
          activeCount,
        };
      }),
    [requests]
  );

  return (
    <main className="space-y-6 pb-safe">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {t.managerDashboard}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
              {t.managerIntro}
            </p>
          </div>

          <div className="rounded-2xl border border-violet-400/20 bg-violet-400/10 px-4 py-3 text-sm text-violet-100">
            {t.allDepartmentsOverview}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StaffSummaryCard label={t.total} value={summary.total} active={activeStatus === "all"} onClick={() => setActiveStatus("all")} />
        <StaffSummaryCard label={t.new} value={summary.newCount} active={activeStatus === "new"} onClick={() => setActiveStatus("new")} />
        <StaffSummaryCard label={t.inProgress} value={summary.inProgressCount} active={activeStatus === "in_progress"} onClick={() => setActiveStatus("in_progress")} />
        <StaffSummaryCard label={t.completed} value={summary.completedCount} active={activeStatus === "completed"} onClick={() => setActiveStatus("completed")} />
        <StaffSummaryCard label={t.returned} value={summary.returnedCount} danger active={activeStatus === "returned"} onClick={() => setActiveStatus("returned")} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {departmentStats.map(({ department, stats, activeCount }) => (
          <button
            type="button"
            key={department}
            onClick={() => setActiveDepartment(department)}
            className={`rounded-2xl border bg-white/5 p-5 text-left transition hover:border-white/20 hover:bg-white/10 ${activeDepartment === department ? "border-violet-300/40 ring-2 ring-violet-300/40" : "border-white/10"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">
                {translateDepartment(department, lang)}
              </h3>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">
                {t.active} {activeCount}
              </span>
            </div>

            <div className="mt-4 space-y-2 text-sm text-white/70">
              <p>{t.total}: {stats.total}</p>
              <p>{t.new}: {stats.newCount}</p>
              <p>{t.inProgress}: {stats.inProgressCount}</p>
              <p>{t.completed}: {stats.completedCount}</p>
              <p className="text-rose-300">{t.returned}: {stats.returnedCount}</p>
            </div>
          </button>
        ))}
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-100">
            {t.oldestActiveRequests}
          </h3>
          <p className="mt-1 text-sm text-rose-50/80">{t.oldestActiveRequestsText}</p>
        </div>

        {oldestActiveRequests.length ? (
          oldestActiveRequests.map((request) => (
            <StaffRequestCard key={request.id} request={request} mode="manager" />
          ))
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/60">
            {t.noActiveRequests}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/40">
              {t.departmentFilter}
            </p>
            <div className="flex flex-wrap gap-2">
              <StaffFilterButton label={t.all} active={activeDepartment === "all"} onClick={() => setActiveDepartment("all")} />
              <StaffFilterButton label={t.housekeeping} active={activeDepartment === "housekeeping"} onClick={() => setActiveDepartment("housekeeping")} />
              <StaffFilterButton label={t.maintenance} active={activeDepartment === "maintenance"} onClick={() => setActiveDepartment("maintenance")} />
              <StaffFilterButton label={t.reception} active={activeDepartment === "reception"} onClick={() => setActiveDepartment("reception")} />
              <StaffFilterButton label={t.restaurant} active={activeDepartment === "restaurant"} onClick={() => setActiveDepartment("restaurant")} />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/40">
              {t.sort}
            </p>
            <div className="flex flex-wrap gap-2">
              <StaffFilterButton label={t.newest} active={sortMode === "newest"} onClick={() => setSortMode("newest")} />
              <StaffFilterButton label={t.oldest} active={sortMode === "oldest"} onClick={() => setSortMode("oldest")} />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/80">
            {t.filteredRequestView}
          </h3>
          <p className="mt-1 text-sm text-white/60">{t.filteredRequestViewText}</p>
        </div>

        {filteredRequests.length ? (
          filteredRequests.map((request) => (
            <StaffRequestCard key={request.id} request={request} mode="manager" />
          ))
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/60">
            {t.noRequestsForFilter}
          </div>
        )}
      </section>
    </main>
  );
}
