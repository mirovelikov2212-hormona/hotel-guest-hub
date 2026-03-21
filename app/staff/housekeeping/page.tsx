"use client";

import { useEffect, useMemo, useState } from "react";
import StaffRequestCard from "@/components/staff/StaffRequestCard";
import StaffSummaryCard from "@/components/staff/StaffSummaryCard";
import { useStaffStore } from "@/components/staff/store/StaffStoreProvider";
import {
  getRequestSummary,
  sortStaffRequests,
} from "@/lib/staff/mock-data";
import type { StaffRequestStatus } from "@/lib/staff/types";

const HOUSEKEEPING_SUPERVISOR_PIN = "2580";
const HOUSEKEEPING_SUPERVISOR_SESSION_KEY =
  "guesthub_housekeeping_supervisor_ok";

export default function HousekeepingPage() {
  const { getOperationalRequestsByDepartment, updateRequestStatus } = useStaffStore();
  const [supervisorUnlocked, setSupervisorUnlocked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const unlocked =
      window.sessionStorage.getItem(
        HOUSEKEEPING_SUPERVISOR_SESSION_KEY
      ) === "1";

    setSupervisorUnlocked(unlocked);
  }, []);

  const requests = getOperationalRequestsByDepartment("housekeeping");

  const sortedRequests = useMemo(() => sortStaffRequests(requests), [requests]);
  const summary = useMemo(() => getRequestSummary(requests), [requests]);

  const requestSupervisorPin = () => {
    if (typeof window === "undefined") return false;

    const entered = window.prompt(
      "Supervisor PIN required to update housekeeping requests."
    );

    if (!entered) return false;

    if (entered !== HOUSEKEEPING_SUPERVISOR_PIN) {
      window.alert("Incorrect PIN.");
      return false;
    }

    window.sessionStorage.setItem(
      HOUSEKEEPING_SUPERVISOR_SESSION_KEY,
      "1"
    );
    setSupervisorUnlocked(true);
    return true;
  };

  const ensureSupervisorAccess = () => {
    if (supervisorUnlocked) return true;
    return requestSupervisorPin();
  };

  const handleStatusChange = (
    id: string,
    status: StaffRequestStatus
  ) => {
    if (!ensureSupervisorAccess()) return;
    void updateRequestStatus(id, status);
  };

  const lockSupervisorMode = () => {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(
      HOUSEKEEPING_SUPERVISOR_SESSION_KEY
    );
    setSupervisorUnlocked(false);
  };

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
              Shared supervisor board for optional guest requests only. No standard room
              cleaning workflow here. Keep it fast, readable and easy to use on any
              phone.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              Shared housekeeping board
            </div>

            {supervisorUnlocked ? (
              <button
                type="button"
                onClick={lockSupervisorMode}
                className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/15"
              >
                Lock supervisor mode
              </button>
            ) : (
              <button
                type="button"
                onClick={requestSupervisorPin}
                className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/15"
              >
                Unlock supervisor actions
              </button>
            )}
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

      {!supervisorUnlocked ? (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-4 text-sm leading-6 text-amber-100">
          All housekeeping staff can monitor incoming requests. Status changes
          require supervisor PIN.
        </section>
      ) : null}

      <section className="space-y-4">
        {sortedRequests.map((request) => (
          <StaffRequestCard
            key={request.id}
            request={request}
            mode="department"
            canAct
            onStart={(id) => handleStatusChange(id, "in_progress")}
            onDone={(id) => handleStatusChange(id, "completed")}
            onReturn={(id) => handleStatusChange(id, "returned")}
          />
        ))}
      </section>
    </main>
  );
}