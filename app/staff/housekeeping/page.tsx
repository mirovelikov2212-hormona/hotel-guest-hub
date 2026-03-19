"use client";

import { useMemo } from "react";
import StaffRequestCard from "@/components/staff/StaffRequestCard";
import StaffSummaryCard from "@/components/staff/StaffSummaryCard";
import { useStaffStore } from "@/components/staff/store/StaffStoreProvider";
import {
  getRequestSummary,
  sortStaffRequests,
} from "@/lib/staff/mock-data";

export default function HousekeepingPage() {
  const { getRequestsByDepartment, updateRequestStatus } = useStaffStore();

  const requests = getRequestsByDepartment("housekeeping");

  const sortedRequests = useMemo(() => sortStaffRequests(requests), [requests]);
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
              Housekeeping
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
              Optional guest requests only. No standard room cleaning workflow
              here. Keep it fast, readable and easy to use on any phone.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            Active shift: <span className="font-semibold">Zone B</span>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StaffSummaryCard label="Total" value={summary.total} />
        <StaffSummaryCard label="New" value={summary.newCount} />
        <StaffSummaryCard
          label="In Progress"
          value={summary.inProgressCount}
        />
        <StaffSummaryCard label="Completed" value={summary.completedCount} />
        <StaffSummaryCard
          label="Returned"
          value={summary.returnedCount}
          danger
        />
      </section>

      <section className="space-y-4">
        {sortedRequests.map((request) => (
          <StaffRequestCard
            key={request.id}
            request={request}
            mode="department"
            canAct
            onStart={(id) => updateRequestStatus(id, "in_progress")}
            onDone={(id) => updateRequestStatus(id, "completed")}
            onReturn={(id) => updateRequestStatus(id, "returned")}
          />
        ))}
      </section>
    </main>
  );
}