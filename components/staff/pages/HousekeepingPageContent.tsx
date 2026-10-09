"use client";

import { useSearchParams } from "next/navigation";
import DemoCompactPanel from "../DemoCompactPanel";
import { useEffect, useMemo, useState } from "react";
import StaffRequestCard from "@/components/staff/StaffRequestCard";
import StaffSummaryCard from "@/components/staff/StaffSummaryCard";
import DepartmentExperience from "../manager/DepartmentExperience";
import { useStaffAlertSound } from "@/components/staff/useStaffAlertSound";
import { useStaffTabTitleAlert } from "@/components/staff/useStaffTabTitleAlert";
import { useStaffStore } from "@/components/staff/store/StaffStoreProvider";
import { useStaffUi } from "@/components/staff/StaffUiProvider";
import { getRequestSummary, sortStaffRequests } from "@/lib/staff/mock-data";
import { staffText } from "@/lib/staff/ui-copy";
import type { StaffRequest } from "@/lib/staff/types";
import { evaluateOperationalRequestSla } from "@/lib/server/operational-request-sla.mjs";

type SummaryFilter = "active" | "new" | "in_progress" | "returned";

function getRequestSlaEvidence(request: StaffRequest, nowMs: number) {
  return evaluateOperationalRequestSla({
    status: request.status,
    createdAtIso: request.createdAtIso,
    startedAtIso: request.startedAtIso,
    resolvedAtIso: request.resolvedAtIso,
    now: new Date(nowMs),
    policy: request.operationalSla ?? undefined,
  });
}

function FullHousekeepingPage() {
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

  const operations = (
    <div className="space-y-6">
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
            const slaEvidence = getRequestSlaEvidence(request, nowMs);
            const requestAgeMinutes = slaEvidence.ageMinutes ?? 0;

            return (
              <StaffRequestCard
                key={request.id}
                request={request}
                mode="department"
                canAct
                isOverdue={slaEvidence.escalationRequired}
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
    </div>
  );

  return <DepartmentExperience
    role="housekeeping"
    operations={operations}
    count={activeRequests.length}
    soundEnabled={soundEnabled}
    onToggleSound={() => void toggleSound()}
  />;
}

export default function HousekeepingPage() {
  const query=useSearchParams();
  const {hotelSlug}=useStaffStore();
  if(hotelSlug==="demo" && query.get("demoCompact")==="1") return <DemoCompactPanel role="housekeeping"/>;
  return <FullHousekeepingPage/>;
}
