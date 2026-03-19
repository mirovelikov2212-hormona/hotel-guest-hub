"use client";

import { useMemo, useState } from "react";
import StaffRequestCard from "@/components/staff/StaffRequestCard";
import StaffSummaryCard from "@/components/staff/StaffSummaryCard";
import StaffFilterButton from "@/components/staff/StaffFilterButton";
import { useStaffStore } from "@/components/staff/store/StaffStoreProvider";
import { getRequestSummary, sortStaffRequests } from "@/lib/staff/mock-data";
import type { StaffDepartment } from "@/lib/staff/types";

export default function ReceptionPage() {
  const [activeFilter, setActiveFilter] = useState<"all" | StaffDepartment>(
    "all"
  );

  const { getAllRequests, updateRequestStatus } = useStaffStore();

  const requests = getAllRequests();

  const filteredRequests = useMemo(() => {
    const base =
      activeFilter === "all"
        ? requests
        : requests.filter((r) => r.department === activeFilter);

    return sortStaffRequests(base);
  }, [requests, activeFilter]);

  const summary = useMemo(() => getRequestSummary(requests), [requests]);

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
              Control center. Monitor all requests. Execute only reception tasks.
            </p>
          </div>

          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            All requests overview
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StaffSummaryCard label="Total" value={summary.total} />
        <StaffSummaryCard label="New" value={summary.newCount} />
        <StaffSummaryCard label="In Progress" value={summary.inProgressCount} />
        <StaffSummaryCard label="Completed" value={summary.completedCount} />
        <StaffSummaryCard label="Returned" value={summary.returnedCount} danger />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap gap-2">
          <StaffFilterButton
            label="All"
            active={activeFilter === "all"}
            onClick={() => setActiveFilter("all")}
          />
          <StaffFilterButton
            label="Housekeeping"
            active={activeFilter === "housekeeping"}
            onClick={() => setActiveFilter("housekeeping")}
          />
          <StaffFilterButton
            label="Maintenance"
            active={activeFilter === "maintenance"}
            onClick={() => setActiveFilter("maintenance")}
          />
          <StaffFilterButton
            label="Reception"
            active={activeFilter === "reception"}
            onClick={() => setActiveFilter("reception")}
          />
          <StaffFilterButton
            label="Restaurant"
            active={activeFilter === "restaurant"}
            onClick={() => setActiveFilter("restaurant")}
          />
        </div>
      </section>

      <section className="space-y-4">
        {filteredRequests.map((request) => {
          const canAct = request.department === "reception";

          return (
            <StaffRequestCard
              key={request.id}
              request={request}
              mode="reception"
              canAct={canAct}
              onStart={(id) => updateRequestStatus(id, "in_progress")}
              onDone={(id) => updateRequestStatus(id, "completed")}
              onReturn={(id) => updateRequestStatus(id, "returned")}
            />
          );
        })}
      </section>
    </main>
  );
}