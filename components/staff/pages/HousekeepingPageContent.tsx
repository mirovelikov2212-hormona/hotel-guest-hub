"use client";

import { useEffect, useMemo, useState } from "react";
import StaffAlertSoundButton from "@/components/staff/StaffAlertSoundButton";
import StaffRequestCard from "@/components/staff/StaffRequestCard";
import StaffSummaryCard from "@/components/staff/StaffSummaryCard";
import { useStaffAlertSound } from "@/components/staff/useStaffAlertSound";
import { useStaffTabTitleAlert } from "@/components/staff/useStaffTabTitleAlert";
import { useStaffStore } from "@/components/staff/store/StaffStoreProvider";
import { useStaffUi } from "@/components/staff/StaffUiProvider";
import { getRequestSummary, sortStaffRequests } from "@/lib/staff/mock-data";
import { staffText } from "@/lib/staff/ui-copy";

type SummaryFilter = "active" | "new" | "in_progress" | "returned";

const DEPARTMENT_OVERDUE_AFTER_MINUTES = 10;

function getRequestAgeMinutes(createdAtIso: string, nowMs: number) {
  const createdAtMs = new Date(createdAtIso).getTime();

  if (!Number.isFinite(createdAtMs)) return 0;

  return Math.max(0, Math.floor((nowMs - createdAtMs) / 60000));
}

function isDepartmentRequestOverdue(
  status: string,
  createdAtIso: string,
  nowMs: number,
) {
  return (
    status === "new" &&
    getRequestAgeMinutes(createdAtIso, nowMs) >= DEPARTMENT_OVERDUE_AFTER_MINUTES
  );
}

export default function HousekeepingPage() {
  const { lang } = useStaffUi();
  const t = staffText(lang);
  const {
    hotelSlug,
    getOperationalRequestsByDepartment,
    updateRequestStatus,
  } = useStaffStore();
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>("active");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  const requests = useMemo(
    () => sortStaffRequests(getOperationalRequestsByDepartment("housekeeping")),
    [getOperationalRequestsByDepartment]
  );

  const { soundEnabled, toggleSound } = useStaffAlertSound({
    hotelSlug,
    department: "housekeeping",
    requests,
  });

  useStaffTabTitleAlert(requests);

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

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              {t.sharedHousekeepingBoard}
            </div>
            <StaffAlertSoundButton soundEnabled={soundEnabled} onToggle={toggleSound} />
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

      <section className="space-y-4">
        {visibleRequests.length ? (
          visibleRequests.map((request) => {
            const requestAgeMinutes = getRequestAgeMinutes(
              request.createdAtIso,
              nowMs,
            );

            return (
              <StaffRequestCard
                key={request.id}
                request={request}
                mode="department"
                canAct
                isOverdue={isDepartmentRequestOverdue(
                  request.status,
                  request.createdAtIso,
                  nowMs,
                )}
                overdueMinutes={requestAgeMinutes}
                onStart={(id) => void updateRequestStatus(id, "in_progress")}
                onDone={(id) => void updateRequestStatus(id, "completed")}
                onReturn={(id) => void updateRequestStatus(id, "returned")}
              />
            );
          })
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/60">
            {t.noRequestsForFilter}
          </div>
        )}
      </section>
    </main>
  );
}
