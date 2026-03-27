"use client";

import { useEffect, useMemo, useState } from "react";
import StaffRequestCard from "@/components/staff/StaffRequestCard";
import StaffSummaryCard from "@/components/staff/StaffSummaryCard";
import { useStaffStore } from "@/components/staff/store/StaffStoreProvider";
import { useStaffUi } from "@/components/staff/StaffUiProvider";
import { getRequestSummary, sortStaffRequests } from "@/lib/staff/mock-data";
import { staffText } from "@/lib/staff/ui-copy";
import type { StaffRequestStatus } from "@/lib/staff/types";

const HOUSEKEEPING_SUPERVISOR_PIN = "2580";
const HOUSEKEEPING_SUPERVISOR_SESSION_KEY =
  "guesthub_housekeeping_supervisor_ok";

type SummaryFilter = "active" | "new" | "in_progress" | "returned";

export default function HousekeepingPage() {
  const { lang } = useStaffUi();
  const t = staffText(lang);
  const { getOperationalRequestsByDepartment, updateRequestStatus } = useStaffStore();
  const [supervisorUnlocked, setSupervisorUnlocked] = useState(false);
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>("active");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const unlocked =
      window.sessionStorage.getItem(HOUSEKEEPING_SUPERVISOR_SESSION_KEY) === "1";

    setSupervisorUnlocked(unlocked);
  }, []);

  const requests = getOperationalRequestsByDepartment("housekeeping");
  const activeRequests = useMemo(
    () => requests.filter((request) => request.status !== "completed"),
    [requests]
  );
  const summary = useMemo(() => getRequestSummary(requests), [requests]);

  const visibleRequests = useMemo(() => {
    const base = activeRequests.filter((request) => {
      if (summaryFilter === "active") return true;
      return request.status === summaryFilter;
    });

    return sortStaffRequests(base);
  }, [activeRequests, summaryFilter]);

  const requestSupervisorPin = () => {
    if (typeof window === "undefined") return false;

    const entered = window.prompt(t.supervisorPinRequired);

    if (!entered) return false;

    if (entered !== HOUSEKEEPING_SUPERVISOR_PIN) {
      window.alert(t.incorrectPin);
      return false;
    }

    window.sessionStorage.setItem(HOUSEKEEPING_SUPERVISOR_SESSION_KEY, "1");
    setSupervisorUnlocked(true);
    return true;
  };

  const ensureSupervisorAccess = () => {
    if (supervisorUnlocked) return true;
    return requestSupervisorPin();
  };

  const handleStatusChange = (id: string, status: StaffRequestStatus) => {
    if (!ensureSupervisorAccess()) return;
    void updateRequestStatus(id, status);
  };

  const lockSupervisorMode = () => {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(HOUSEKEEPING_SUPERVISOR_SESSION_KEY);
    setSupervisorUnlocked(false);
  };

  return (
    <main className="space-y-6 pb-safe">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/50">
              {t.department}
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              {t.housekeeping}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
              {t.housekeepingIntro}
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              {t.sharedHousekeepingBoard}
            </div>

            {supervisorUnlocked ? (
              <button
                type="button"
                onClick={lockSupervisorMode}
                className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/15"
              >
                {t.lockSupervisorMode}
              </button>
            ) : (
              <button
                type="button"
                onClick={requestSupervisorPin}
                className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/15"
              >
                {t.unlockSupervisorActions}
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StaffSummaryCard
          label={t.active}
          value={summary.newCount + summary.inProgressCount + summary.returnedCount}
          active={summaryFilter === "active"}
          onClick={() => setSummaryFilter("active")}
        />
        <StaffSummaryCard
          label={t.new}
          value={summary.newCount}
          active={summaryFilter === "new"}
          onClick={() => setSummaryFilter("new")}
        />
        <StaffSummaryCard
          label={t.inProgress}
          value={summary.inProgressCount}
          active={summaryFilter === "in_progress"}
          onClick={() => setSummaryFilter("in_progress")}
        />
        <StaffSummaryCard
          label={t.returned}
          value={summary.returnedCount}
          danger
          active={summaryFilter === "returned"}
          onClick={() => setSummaryFilter("returned")}
        />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-6 text-white/70">
        {t.activeSummaryOnly}
      </section>

      {!supervisorUnlocked ? (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-4 text-sm leading-6 text-amber-100">
          {t.allStaffCanMonitor}
        </section>
      ) : null}

      <section className="space-y-4">
        {visibleRequests.length ? (
          visibleRequests.map((request) => (
            <StaffRequestCard
              key={request.id}
              request={request}
              mode="department"
              canAct
              onStart={(id) => handleStatusChange(id, "in_progress")}
              onDone={(id) => handleStatusChange(id, "completed")}
              onReturn={(id) => handleStatusChange(id, "returned")}
            />
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
