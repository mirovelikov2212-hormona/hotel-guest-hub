"use client";

import { useEffect, useMemo, useState } from "react";
import StaffRequestCard from "@/components/staff/StaffRequestCard";
import StaffSummaryCard from "@/components/staff/StaffSummaryCard";
import { useStaffStore } from "@/components/staff/store/StaffStoreProvider";
import { useStaffUi } from "@/components/staff/StaffUiProvider";
import { getRequestSummary, sortStaffRequests } from "@/lib/staff/mock-data";
import { staffText } from "@/lib/staff/ui-copy";

type SummaryFilter = "active" | "new" | "in_progress" | "returned" | "completed_today";

export default function MaintenancePage() {
  const { lang } = useStaffUi();
  const t = staffText(lang);
  const { getOperationalRequestsByDepartment, getRequestsByDepartment, updateRequestStatus } = useStaffStore();
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>("active");

  const requests = useMemo(
    () => sortStaffRequests(getOperationalRequestsByDepartment("maintenance")),
    [getOperationalRequestsByDepartment]
  );

  const departmentRequests = useMemo(
    () => sortStaffRequests(getRequestsByDepartment("maintenance")),
    [getRequestsByDepartment]
  );

  const [todayKey, setTodayKey] = useState(() =>
    new Date().toLocaleDateString("sv-SE")
  );

  useEffect(() => {
    const updateDay = () => {
      setTodayKey(new Date().toLocaleDateString("sv-SE"));
      setSummaryFilter("active");
    };

    const now = new Date();
    const nextReset = new Date(now);
    nextReset.setHours(24, 0, 10, 0);

    let intervalId: ReturnType<typeof setInterval> | undefined;

    const timeoutId = setTimeout(() => {
      updateDay();
      intervalId = setInterval(updateDay, 24 * 60 * 60 * 1000);
    }, nextReset.getTime() - now.getTime());

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const activeRequests = useMemo(
    () => requests.filter((request) => request.status !== "completed"),
    [requests]
  );

  const completedTodayRequests = useMemo(
    () =>
      departmentRequests.filter((request) => {
        if (request.status !== "completed") return false;

        const completedIso =
          (request as any).completedAtIso ??
          (request as any).updatedAtIso ??
          (request as any).createdAtIso ??
          null;

        if (!completedIso) return false;

        return new Date(completedIso).toLocaleDateString("sv-SE") === todayKey;
      }),
    [departmentRequests, todayKey]
  );

  const summary = useMemo(() => getRequestSummary(requests), [requests]);

  const visibleRequests = useMemo(() => {
    if (summaryFilter === "completed_today") {
      return sortStaffRequests(completedTodayRequests);
    }

    const base = activeRequests.filter((request) => {
      if (summaryFilter === "active") return true;
      return request.status === summaryFilter;
    });

    return sortStaffRequests(base);
  }, [activeRequests, completedTodayRequests, summaryFilter]);

  return (
    <main className="space-y-6 pb-safe">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-white/50">
              {t.department}
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              {t.maintenance}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
              {t.maintenanceIntro}
            </p>
          </div>

          <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
            {t.technicalQueue}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
        <StaffSummaryCard
          label={lang === "bg" ? "Приключени" : lang === "de" ? "Erledigt" : "Completed"}
          value={completedTodayRequests.length}
          active={summaryFilter === "completed_today"}
          onClick={() => setSummaryFilter("completed_today")}
        />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-6 text-white/70">
        {t.activeSummaryOnly}
      </section>

      <section className="space-y-4">
        {visibleRequests.length ? (
          visibleRequests.map((request) => (
            <StaffRequestCard
              key={request.id}
              request={request}
              mode="department"
              canAct
              onStart={(id) => updateRequestStatus(id, "in_progress")}
              onDone={(id) => updateRequestStatus(id, "completed")}
              onReturn={(id) => updateRequestStatus(id, "returned")}
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
