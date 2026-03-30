"use client";

import { useMemo, useState } from "react";
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
import { staffText } from "@/lib/staff/ui-copy";

type DepartmentFilter = "all" | StaffDepartment;
type StatusFilter = "all" | "active" | StaffRequestStatus;
type SortMode = "priority" | "newest" | "oldest";

const priorityOrder: Record<StaffRequestStatus, number> = {
  new: 0,
  returned: 1,
  in_progress: 2,
  completed: 3,
};

function isActiveStatus(status: StaffRequestStatus) {
  return status !== "completed";
}

function sortRequests(requests: StaffRequest[], sortMode: SortMode) {
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

    if (priorityOrder[a.status] !== priorityOrder[b.status]) {
      return priorityOrder[a.status] - priorityOrder[b.status];
    }

    return tb - ta;
  });
}

function isAfterOperationsHours() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes < 8 * 60 || minutes >= 17 * 60;
}

export default function ReceptionPage() {
  const { lang } = useStaffUi();
  const t = staffText(lang);
  const [activeDepartment, setActiveDepartment] = useState<DepartmentFilter>("all");
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("priority");

  const { getOperationalAllRequests, updateRequestStatus } = useStaffStore();
  const requests = getOperationalAllRequests();

  const activeRequests = useMemo(
    () => requests.filter((request) => isActiveStatus(request.status)),
    [requests]
  );

  const receptionActiveRequests = useMemo(
    () => activeRequests.filter((request) => request.department === "reception"),
    [activeRequests]
  );

  const otherDepartmentActiveRequests = useMemo(
    () => activeRequests.filter((request) => request.department !== "reception"),
    [activeRequests]
  );

  const returnedRequests = useMemo(
    () => requests.filter((request) => request.status === "returned"),
    [requests]
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

    return sortRequests(base, sortMode);
  }, [requests, activeDepartment, activeStatus, sortMode]);

  const afterHours = useMemo(() => isAfterOperationsHours(), []);

  const actionableRequests = useMemo(
    () =>
      filteredRequests.filter((request) => {
        if (request.department === "reception") return true;
        if (!afterHours) return false;
        return request.department === "housekeeping" || request.department === "maintenance";
      }),
    [afterHours, filteredRequests]
  );

  const monitoringRequests = useMemo(
    () =>
      filteredRequests.filter((request) => {
        if (request.department === "reception") return false;
        if (afterHours && (request.department === "housekeeping" || request.department === "maintenance")) {
          return false;
        }
        return true;
      }),
    [afterHours, filteredRequests]
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
          value={requests.filter((request) => request.status === "in_progress").length}
          active={activeStatus === "in_progress"}
          onClick={() => setActiveStatus("in_progress")}
        />
        <StaffSummaryCard
          label={t.completed}
          value={requests.filter((request) => request.status === "completed").length}
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
              <StaffFilterButton label={t.priority} active={sortMode === "priority"} onClick={() => setSortMode("priority")} />
              <StaffFilterButton label={t.newest} active={sortMode === "newest"} onClick={() => setSortMode("newest")} />
              <StaffFilterButton label={t.oldest} active={sortMode === "oldest"} onClick={() => setSortMode("oldest")} />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-100">
            {t.receptionActions}
          </h3>
          <p className="mt-1 text-sm text-amber-50/80">{t.receptionActionsText}</p>
        </div>

        {actionableRequests.length ? (
          actionableRequests.map((request) => (
            <StaffRequestCard
              key={request.id}
              request={request}
              mode="reception"
              canAct
              onStart={(id) => void updateRequestStatus(id, "in_progress")}
              onDone={(id) => void updateRequestStatus(id, "completed")}
              onReturn={(id) => void updateRequestStatus(id, "returned")}
            />
          ))
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
          monitoringRequests.map((request) => (
            <StaffRequestCard
              key={request.id}
              request={request}
              mode="reception"
              canAct={false}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/60">
            {t.noMonitoringRequests}
          </div>
        )}
      </section>
    </main>
  );
}
