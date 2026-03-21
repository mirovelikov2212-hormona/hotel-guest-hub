"use client";

import { useMemo, useState } from "react";
import StaffRequestCard from "@/components/staff/StaffRequestCard";
import StaffSummaryCard from "@/components/staff/StaffSummaryCard";
import StaffFilterButton from "@/components/staff/StaffFilterButton";
import { useStaffStore } from "@/components/staff/store/StaffStoreProvider";
import type {
  StaffDepartment,
  StaffRequest,
  StaffRequestStatus,
} from "@/lib/staff/types";

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

function getTimeValue(value: string) {
  const match = value.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  return hours * 60 + minutes;
}

function sortRequests(requests: StaffRequest[], sortMode: SortMode) {
  const next = [...requests];

  if (sortMode === "newest") {
    return next.sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt));
  }

  if (sortMode === "oldest") {
    return next.sort((a, b) => getTimeValue(a.createdAt) - getTimeValue(b.createdAt));
  }

  return next.sort((a, b) => {
    if (priorityOrder[a.status] !== priorityOrder[b.status]) {
      return priorityOrder[a.status] - priorityOrder[b.status];
    }

    return getTimeValue(b.createdAt) - getTimeValue(a.createdAt);
  });
}

export default function ReceptionPage() {
  const [activeDepartment, setActiveDepartment] = useState<DepartmentFilter>("all");
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("active");
  const [sortMode, setSortMode] = useState<SortMode>("priority");

  const { getOperationalAllRequests, updateRequestStatus } = useStaffStore();
  const requests = getOperationalAllRequests();

  const activeRequests = useMemo(
    () => requests.filter((request) => isActiveStatus(request.status)),
    [requests]
  );

  const receptionActiveRequests = useMemo(
    () =>
      activeRequests.filter((request) => request.department === "reception"),
    [activeRequests]
  );

  const otherDepartmentActiveRequests = useMemo(
    () =>
      activeRequests.filter((request) => request.department !== "reception"),
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

  const actionableRequests = useMemo(
    () => filteredRequests.filter((request) => request.department === "reception"),
    [filteredRequests]
  );

  const monitoringRequests = useMemo(
    () => filteredRequests.filter((request) => request.department !== "reception"),
    [filteredRequests]
  );

  return (
    <main className="space-y-6 pb-safe">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/50">
              Department
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Reception
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
              Operational control view. Reception executes only reception tasks
              and monitors the rest of the hotel in read-only mode.
            </p>
          </div>

          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Control center + monitoring
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StaffSummaryCard label="Total" value={requests.length} />
        <StaffSummaryCard label="Active" value={activeRequests.length} />
        <StaffSummaryCard
          label="Reception Open"
          value={receptionActiveRequests.length}
        />
        <StaffSummaryCard
          label="Other Departments Open"
          value={otherDepartmentActiveRequests.length}
        />
        <StaffSummaryCard
          label="Returned"
          value={returnedRequests.length}
          danger
        />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/40">
              Department filter
            </p>
            <div className="flex flex-wrap gap-2">
              <StaffFilterButton
                label="All"
                active={activeDepartment === "all"}
                onClick={() => setActiveDepartment("all")}
              />
              <StaffFilterButton
                label="Housekeeping"
                active={activeDepartment === "housekeeping"}
                onClick={() => setActiveDepartment("housekeeping")}
              />
              <StaffFilterButton
                label="Maintenance"
                active={activeDepartment === "maintenance"}
                onClick={() => setActiveDepartment("maintenance")}
              />
              <StaffFilterButton
                label="Reception"
                active={activeDepartment === "reception"}
                onClick={() => setActiveDepartment("reception")}
              />
              <StaffFilterButton
                label="Restaurant"
                active={activeDepartment === "restaurant"}
                onClick={() => setActiveDepartment("restaurant")}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/40">
              Status filter
            </p>
            <div className="flex flex-wrap gap-2">
              <StaffFilterButton
                label="Active"
                active={activeStatus === "active"}
                onClick={() => setActiveStatus("active")}
              />
              <StaffFilterButton
                label="All"
                active={activeStatus === "all"}
                onClick={() => setActiveStatus("all")}
              />
              <StaffFilterButton
                label="New"
                active={activeStatus === "new"}
                onClick={() => setActiveStatus("new")}
              />
              <StaffFilterButton
                label="In Progress"
                active={activeStatus === "in_progress"}
                onClick={() => setActiveStatus("in_progress")}
              />
              <StaffFilterButton
                label="Returned"
                active={activeStatus === "returned"}
                onClick={() => setActiveStatus("returned")}
              />
              <StaffFilterButton
                label="Completed"
                active={activeStatus === "completed"}
                onClick={() => setActiveStatus("completed")}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/40">
              Sort
            </p>
            <div className="flex flex-wrap gap-2">
              <StaffFilterButton
                label="Priority"
                active={sortMode === "priority"}
                onClick={() => setSortMode("priority")}
              />
              <StaffFilterButton
                label="Newest"
                active={sortMode === "newest"}
                onClick={() => setSortMode("newest")}
              />
              <StaffFilterButton
                label="Oldest"
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
            Reception actions
          </h3>
          <p className="mt-1 text-sm text-amber-50/80">
            These requests can be handled directly by reception.
          </p>
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
            No reception requests in the current filter.
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/80">
            Monitoring only
          </h3>
          <p className="mt-1 text-sm text-white/60">
            Reception can monitor these requests, but execution stays inside the
            assigned department.
          </p>
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
            No monitoring requests in the current filter.
          </div>
        )}
      </section>
    </main>
  );
}