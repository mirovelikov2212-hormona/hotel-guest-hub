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
  type StaffRequestType,
} from "@/lib/staff/types";
import {
  staffText,
  translateDepartment,
  translateRequestType,
} from "@/lib/staff/ui-copy";

type DepartmentFilter = "all" | StaffDepartment;
type StatusFilter = "all" | "active" | StaffRequestStatus;
type SortMode = "newest" | "oldest";
type ReportView =
  | "requests_snapshot"
  | "top_requests"
  | "request_rooms"
  | "issues_snapshot"
  | "top_issues"
  | "problem_rooms"
  | "room_issue_breakdown";

type RequestTypeStat = {
  type: StaffRequestType;
  label: string;
  total: number;
  active: number;
  returned: number;
};

type RoomStat = {
  room: string;
  total: number;
  active: number;
  returned: number;
  issues: { label: string; count: number }[];
};

const departmentOrder: StaffDepartment[] = [
  "housekeeping",
  "maintenance",
  "reception",
  "restaurant",
];

const technicalTypes = new Set<StaffRequestType>([
  "air_conditioning",
  "light_not_working",
  "no_hot_water",
  "tv_issue",
  "bathroom_issue",
  "other_technical_issue",
]);

function isActiveStatus(status: StaffRequestStatus) {
  return status !== "completed";
}

function isTechnicalProblem(request: StaffRequest) {
  return request.department === "maintenance" || technicalTypes.has(request.type);
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

function buildRequestTypeStats(
  requests: StaffRequest[],
  lang: ReturnType<typeof useStaffUi>["lang"]
): RequestTypeStat[] {
  const map = new Map<StaffRequestType, RequestTypeStat>();

  for (const request of requests) {
    const existing = map.get(request.type) ?? {
      type: request.type,
      label: translateRequestType(request.type, lang, request.typeLabel),
      total: 0,
      active: 0,
      returned: 0,
    };

    existing.total += 1;
    if (isActiveStatus(request.status)) existing.active += 1;
    if (request.status === "returned") existing.returned += 1;

    map.set(request.type, existing);
  }

  return [...map.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.returned !== a.returned) return b.returned - a.returned;
    return a.label.localeCompare(b.label);
  });
}

function buildRoomStats(
  requests: StaffRequest[],
  lang: ReturnType<typeof useStaffUi>["lang"]
): RoomStat[] {
  const map = new Map<
    string,
    {
      room: string;
      total: number;
      active: number;
      returned: number;
      issueMap: Map<string, number>;
    }
  >();

  for (const request of requests) {
    const existing = map.get(request.room) ?? {
      room: request.room,
      total: 0,
      active: 0,
      returned: 0,
      issueMap: new Map<string, number>(),
    };

    existing.total += 1;
    if (isActiveStatus(request.status)) existing.active += 1;
    if (request.status === "returned") existing.returned += 1;

    const label = translateRequestType(request.type, lang, request.typeLabel);
    existing.issueMap.set(label, (existing.issueMap.get(label) ?? 0) + 1);
    map.set(request.room, existing);
  }

  return [...map.values()]
    .map((entry) => ({
      room: entry.room,
      total: entry.total,
      active: entry.active,
      returned: entry.returned,
      issues: [...entry.issueMap.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) =>
          b.count !== a.count ? b.count - a.count : a.label.localeCompare(b.label)
        )
        .slice(0, 3),
    }))
    .sort((a, b) => {
      if (b.returned !== a.returned) return b.returned - a.returned;
      if (b.active !== a.active) return b.active - a.active;
      if (b.total !== a.total) return b.total - a.total;
      return a.room.localeCompare(b.room, undefined, { numeric: true });
    });
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowsToCsv(rows: Array<Array<string | number>>) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function rowsToExcelHtml(title: string, rows: Array<Array<string | number>>) {
  const escape = (value: string | number) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");

  const body = rows
    .map(
      (row, rowIndex) =>
        `<tr>${row
          .map(
            (cell) =>
              `<${rowIndex === 0 ? "th" : "td"}>${escape(cell)}</${
                rowIndex === 0 ? "th" : "td"
              }>`
          )
          .join("")}</tr>`
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escape(
    title
  )}</title></head><body><table>${body}</table></body></html>`;
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ManagerPage() {
  const { lang } = useStaffUi();
  const t = staffText(lang);
  const [activeDepartment, setActiveDepartment] = useState<DepartmentFilter>("all");
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [activeReport, setActiveReport] = useState<ReportView>("requests_snapshot");

  const { getAllRequests } = useStaffStore();
  const requests = getAllRequests();
  const problemRequests = useMemo(
    () => requests.filter((request) => isTechnicalProblem(request)),
    [requests]
  );

  const summary = useMemo(() => getRequestSummary(requests), [requests]);
  const problemSummary = useMemo(() => getRequestSummary(problemRequests), [problemRequests]);

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

  const requestTypeStats = useMemo(
    () => buildRequestTypeStats(requests, lang).slice(0, 8),
    [requests, lang]
  );
  const requestRoomStats = useMemo(() => buildRoomStats(requests, lang), [requests, lang]);
  const topRequestRooms = requestRoomStats.slice(0, 8);

  const issueTypeStats = useMemo(
    () => buildRequestTypeStats(problemRequests, lang).slice(0, 8),
    [problemRequests, lang]
  );
  const issueRoomStats = useMemo(
    () => buildRoomStats(problemRequests, lang),
    [problemRequests, lang]
  );
  const topIssueRooms = issueRoomStats.slice(0, 8);

  const topRequest = requestTypeStats[0];
  const busiestRoom = topRequestRooms[0];
  const roomsWithOpenRequests = requestRoomStats.filter((room) => room.active > 0).length;

  const topIssue = issueTypeStats[0];
  const topIssueRoom = topIssueRooms[0];
  const roomsWithOpenProblems = issueRoomStats.filter((room) => room.active > 0).length;

  const reportTabs = [
    { id: "requests_snapshot" as const, label: t.requestsSnapshot },
    { id: "top_requests" as const, label: t.topRequestTypes },
    { id: "request_rooms" as const, label: t.requestHeavyRooms },
    { id: "issues_snapshot" as const, label: t.problemsSnapshot },
    { id: "top_issues" as const, label: t.topProblemTypes },
    { id: "problem_rooms" as const, label: t.problematicRooms },
    { id: "room_issue_breakdown" as const, label: t.roomIssueBreakdown },
  ];

  const reportRows = useMemo(() => {
    switch (activeReport) {
      case "requests_snapshot":
        return [
          [t.metric, t.value],
          [t.topRequest, topRequest ? topRequest.label : "—"],
          [t.requestCount, topRequest ? topRequest.total : 0],
          [t.requestHeavyRoom, busiestRoom ? `${t.room} ${busiestRoom.room}` : "—"],
          [t.requestHeavyRoomCount, busiestRoom ? busiestRoom.total : 0],
          [t.returnedRequests, summary.returnedCount],
          [t.roomsWithOpenRequests, roomsWithOpenRequests],
        ];
      case "top_requests":
        return [
          [t.requestType, t.requestCount, t.openRequests, t.returnedRequests],
          ...requestTypeStats.map((item) => [item.label, item.total, item.active, item.returned]),
        ];
      case "request_rooms":
        return [
          [t.room, t.requestCount, t.openRequests, t.returnedRequests],
          ...topRequestRooms.map((room) => [
            `${t.room} ${room.room}`,
            room.total,
            room.active,
            room.returned,
          ]),
        ];
      case "issues_snapshot":
        return [
          [t.metric, t.value],
          [t.topIssue, topIssue ? topIssue.label : "—"],
          [t.topIssueCount, topIssue ? topIssue.total : 0],
          [t.problemRoom, topIssueRoom ? `${t.room} ${topIssueRoom.room}` : "—"],
          [t.problemRoomCount, topIssueRoom ? topIssueRoom.total : 0],
          [t.returnedIssues, problemSummary.returnedCount],
          [t.activeRooms, roomsWithOpenProblems],
        ];
      case "top_issues":
        return [
          [t.problemType, t.requestCount, t.openIssues, t.returnedIssues],
          ...issueTypeStats.map((item) => [item.label, item.total, item.active, item.returned]),
        ];
      case "problem_rooms":
        return [
          [t.room, t.requestCount, t.openIssues, t.returnedIssues],
          ...topIssueRooms.map((room) => [
            `${t.room} ${room.room}`,
            room.total,
            room.active,
            room.returned,
          ]),
        ];
      case "room_issue_breakdown":
        return [
          [t.room, t.problemType, t.requestCount],
          ...topIssueRooms.flatMap((room) =>
            room.issues.map((issue) => [`${t.room} ${room.room}`, issue.label, issue.count])
          ),
        ];
    }
  }, [
    activeReport,
    busiestRoom,
    issueTypeStats,
    problemSummary.returnedCount,
    requestTypeStats,
    roomsWithOpenProblems,
    roomsWithOpenRequests,
    summary.returnedCount,
    t,
    topIssue,
    topIssueRoom,
    topIssueRooms,
    topRequest,
    topRequestRooms,
  ]);

  const reportFileBase = useMemo(() => {
    switch (activeReport) {
      case "requests_snapshot":
        return "manager-report-requests-snapshot";
      case "top_requests":
        return "manager-report-top-requests";
      case "request_rooms":
        return "manager-report-request-rooms";
      case "issues_snapshot":
        return "manager-report-problems-snapshot";
      case "top_issues":
        return "manager-report-top-problems";
      case "problem_rooms":
        return "manager-report-problem-rooms";
      case "room_issue_breakdown":
        return "manager-report-room-problem-breakdown";
    }
  }, [activeReport]);

  function exportCsv() {
    downloadFile(`${reportFileBase}.csv`, rowsToCsv(reportRows), "text/csv;charset=utf-8;");
  }

  function exportExcel() {
    const activeLabel = reportTabs.find((tab) => tab.id === activeReport)?.label ?? t.reports;
    downloadFile(
      `${reportFileBase}.xls`,
      rowsToExcelHtml(activeLabel, reportRows),
      "application/vnd.ms-excel;charset=utf-8;"
    );
  }

  return (
    <main className="space-y-6 pb-safe">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{t.managerDashboard}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">{t.managerIntro}</p>
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

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/40">{t.reportsCompactLabel}</p>
            <h3 className="mt-1 text-xl font-semibold text-white">{t.reports}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">{t.reportsCompactIntro}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white/85 transition hover:border-white/20 hover:bg-black/30"
            >
              {t.exportCsv}
            </button>
            <button
              type="button"
              onClick={exportExcel}
              className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:border-emerald-300/30 hover:bg-emerald-400/15"
            >
              {t.exportExcel}
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {reportTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveReport(tab.id)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                activeReport === tab.id
                  ? "border-violet-300/40 bg-violet-300/15 text-violet-100"
                  : "border-white/10 bg-black/20 text-white/75 hover:border-white/20 hover:bg-black/30"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5">
          {activeReport === "requests_snapshot" ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">{t.topRequest}</p>
                <p className="mt-3 text-lg font-semibold text-white">{topRequest ? topRequest.label : "—"}</p>
                <p className="mt-2 text-sm text-white/60">
                  {topRequest ? `${t.requestCount}: ${topRequest.total}` : t.noReportData}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">{t.requestHeavyRoom}</p>
                <p className="mt-3 text-lg font-semibold text-white">
                  {busiestRoom ? `${t.room} ${busiestRoom.room}` : "—"}
                </p>
                <p className="mt-2 text-sm text-white/60">
                  {busiestRoom ? `${t.requestCount}: ${busiestRoom.total}` : t.noReportData}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">{t.returnedRequests}</p>
                <p className="mt-3 text-2xl font-semibold text-white">{summary.returnedCount}</p>
                <p className="mt-2 text-sm text-white/60">{t.returnedRequestsText}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">{t.roomsWithOpenRequests}</p>
                <p className="mt-3 text-2xl font-semibold text-white">{roomsWithOpenRequests}</p>
                <p className="mt-2 text-sm text-white/60">{t.openRequestsText}</p>
              </div>
            </div>
          ) : null}

          {activeReport === "top_requests" ? (
            requestTypeStats.length ? (
              <div className="space-y-3">
                {requestTypeStats.map((item) => (
                  <div
                    key={item.type}
                    className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"
                  >
                    <div>
                      <p className="font-medium text-white">{item.label}</p>
                    </div>
                    <div className="text-sm text-white/60">
                      {t.requestCount}: <span className="font-semibold text-white">{item.total}</span>
                    </div>
                    <div className="text-sm text-white/60">
                      {t.openRequests}: <span className="font-semibold text-white">{item.active}</span>
                    </div>
                    <div className="text-sm text-rose-200/90">
                      {t.returnedRequests}: <span className="font-semibold text-white">{item.returned}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">
                {t.noReportData}
              </div>
            )
          ) : null}

          {activeReport === "request_rooms" ? (
            topRequestRooms.length ? (
              <div className="space-y-3">
                {topRequestRooms.map((room) => (
                  <div key={room.room} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{t.room} {room.room}</p>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">
                        {t.requestCount} {room.total}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/65">
                      <span>{t.openRequests}: <span className="font-semibold text-white">{room.active}</span></span>
                      <span>{t.returnedRequests}: <span className="font-semibold text-white">{room.returned}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">
                {t.noReportData}
              </div>
            )
          ) : null}

          {activeReport === "issues_snapshot" ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">{t.topIssue}</p>
                <p className="mt-3 text-lg font-semibold text-white">{topIssue ? topIssue.label : "—"}</p>
                <p className="mt-2 text-sm text-white/60">
                  {topIssue ? `${t.requestCount}: ${topIssue.total}` : t.noReportData}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">{t.problemRoom}</p>
                <p className="mt-3 text-lg font-semibold text-white">
                  {topIssueRoom ? `${t.room} ${topIssueRoom.room}` : "—"}
                </p>
                <p className="mt-2 text-sm text-white/60">
                  {topIssueRoom ? `${t.requestCount}: ${topIssueRoom.total}` : t.noReportData}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">{t.returnedIssues}</p>
                <p className="mt-3 text-2xl font-semibold text-white">{problemSummary.returnedCount}</p>
                <p className="mt-2 text-sm text-white/60">{t.returnedIssuesText}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-white/45">{t.activeRooms}</p>
                <p className="mt-3 text-2xl font-semibold text-white">{roomsWithOpenProblems}</p>
                <p className="mt-2 text-sm text-white/60">{t.openIssuesText}</p>
              </div>
            </div>
          ) : null}

          {activeReport === "top_issues" ? (
            issueTypeStats.length ? (
              <div className="space-y-3">
                {issueTypeStats.map((item) => (
                  <div
                    key={item.type}
                    className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center"
                  >
                    <div>
                      <p className="font-medium text-white">{item.label}</p>
                    </div>
                    <div className="text-sm text-white/60">
                      {t.requestCount}: <span className="font-semibold text-white">{item.total}</span>
                    </div>
                    <div className="text-sm text-white/60">
                      {t.openIssues}: <span className="font-semibold text-white">{item.active}</span>
                    </div>
                    <div className="text-sm text-rose-200/90">
                      {t.returnedIssues}: <span className="font-semibold text-white">{item.returned}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">
                {t.noProblemData}
              </div>
            )
          ) : null}

          {activeReport === "problem_rooms" ? (
            topIssueRooms.length ? (
              <div className="space-y-3">
                {topIssueRooms.map((room) => (
                  <div key={room.room} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{t.room} {room.room}</p>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">
                        {t.requestCount} {room.total}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/65">
                      <span>{t.openIssues}: <span className="font-semibold text-white">{room.active}</span></span>
                      <span>{t.returnedIssues}: <span className="font-semibold text-white">{room.returned}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">
                {t.noProblemData}
              </div>
            )
          ) : null}

          {activeReport === "room_issue_breakdown" ? (
            topIssueRooms.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {topIssueRooms.slice(0, 6).map((room) => (
                  <div key={room.room} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-white">{t.room} {room.room}</p>
                        <p className="mt-1 text-sm text-white/60">{t.issueMix}</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">
                        {t.requestCount} {room.total}
                      </span>
                    </div>

                    <div className="mt-4 space-y-2">
                      {room.issues.map((issue) => (
                        <div key={`${room.room}-${issue.label}`} className="flex items-center justify-between gap-3 text-sm text-white/75">
                          <span>{issue.label}</span>
                          <span className="font-semibold text-white">{issue.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">
                {t.noProblemData}
              </div>
            )
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {departmentStats.map(({ department, stats, activeCount }) => (
          <button
            type="button"
            key={department}
            onClick={() => setActiveDepartment(department)}
            className={`rounded-2xl border bg-white/5 p-5 text-left transition hover:border-white/20 hover:bg-white/10 ${
              activeDepartment === department
                ? "border-violet-300/40 ring-2 ring-violet-300/40"
                : "border-white/10"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">{translateDepartment(department, lang)}</h3>
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
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-100">{t.oldestActiveRequests}</h3>
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
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/40">{t.departmentFilter}</p>
            <div className="flex flex-wrap gap-2">
              <StaffFilterButton label={t.all} active={activeDepartment === "all"} onClick={() => setActiveDepartment("all")} />
              <StaffFilterButton label={t.housekeeping} active={activeDepartment === "housekeeping"} onClick={() => setActiveDepartment("housekeeping")} />
              <StaffFilterButton label={t.maintenance} active={activeDepartment === "maintenance"} onClick={() => setActiveDepartment("maintenance")} />
              <StaffFilterButton label={t.reception} active={activeDepartment === "reception"} onClick={() => setActiveDepartment("reception")} />
              <StaffFilterButton label={t.restaurant} active={activeDepartment === "restaurant"} onClick={() => setActiveDepartment("restaurant")} />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-white/40">{t.sort}</p>
            <div className="flex flex-wrap gap-2">
              <StaffFilterButton label={t.newest} active={sortMode === "newest"} onClick={() => setSortMode("newest")} />
              <StaffFilterButton label={t.oldest} active={sortMode === "oldest"} onClick={() => setSortMode("oldest")} />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/80">{t.filteredRequestView}</h3>
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
