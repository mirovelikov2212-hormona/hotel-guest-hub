"use client";

import { useMemo, useState } from "react";
import StaffRequestCard from "@/components/staff/StaffRequestCard";
import StaffSummaryCard from "@/components/staff/StaffSummaryCard";
import { useStaffStore } from "@/components/staff/store/StaffStoreProvider";
import { useStaffUi } from "@/components/staff/StaffUiProvider";
import { getRequestSummary } from "@/lib/staff/mock-data";
import type { StaffRequest, StaffRequestType, StaffRequestStatus } from "@/lib/staff/types";
import { isTechnicalRequestType } from "@/lib/staff/request-type-utils";
import { staffText, translateRequestType } from "@/lib/staff/ui-copy";

type ReportView =
  | "requests_snapshot"
  | "top_requests"
  | "request_rooms"
  | "issues_snapshot"
  | "top_issues"
  | "problem_rooms";

type DrilldownSelection =
  | { kind: "request_status"; status: "all" | "new" | "in_progress" | "completed" | "returned" | "open" }
  | { kind: "issue_status"; status: "new" | "in_progress" | "completed" | "returned" | "open" }
  | { kind: "request_type"; type: StaffRequestType }
  | { kind: "request_room"; room: string }
  | { kind: "issue_type"; type: StaffRequestType }
  | { kind: "issue_room"; room: string };

type RequestTypeStat = {
  type: StaffRequestType;
  label: string;
  total: number;
  open: number;
  returned: number;
  completed: number;
};

type RoomStat = {
  room: string;
  total: number;
  open: number;
  returned: number;
  completed: number;
};

function isOpenStatus(status: StaffRequestStatus) {
  return status === "new" || status === "in_progress";
}

function isTechnicalProblem(request: StaffRequest) {
  return isTechnicalRequestType(request.type);
}

function sortByTime(requests: StaffRequest[], sort: "newest" | "oldest" = "newest") {
  const next = [...requests];
  return next.sort((a, b) => {
    const ta = new Date(a.createdAtIso).getTime();
    const tb = new Date(b.createdAtIso).getTime();
    return sort === "oldest" ? ta - tb : tb - ta;
  });
}

function buildRequestTypeStats(requests: StaffRequest[], lang: "bg" | "en" | "de"): RequestTypeStat[] {
  const map = new Map<StaffRequestType, RequestTypeStat>();

  for (const request of requests) {
    const existing = map.get(request.type) ?? {
      type: request.type,
      label: translateRequestType(request.type, lang, request.typeLabel),
      total: 0,
      open: 0,
      returned: 0,
      completed: 0,
    };

    existing.total += 1;
    if (isOpenStatus(request.status)) existing.open += 1;
    if (request.status === "returned") existing.returned += 1;
    if (request.status === "completed") existing.completed += 1;
    map.set(request.type, existing);
  }

  return [...map.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function buildRoomStats(requests: StaffRequest[]): RoomStat[] {
  const map = new Map<string, RoomStat>();

  for (const request of requests) {
    const entry = map.get(request.room) ?? {
      room: request.room,
      total: 0,
      open: 0,
      returned: 0,
      completed: 0,
    };

    entry.total += 1;
    if (isOpenStatus(request.status)) entry.open += 1;
    if (request.status === "returned") entry.returned += 1;
    if (request.status === "completed") entry.completed += 1;
    map.set(request.room, entry);
  }

  return [...map.values()].sort((a, b) => b.total - a.total || a.room.localeCompare(b.room, undefined, { numeric: true }));
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
          .map((cell) => `<${rowIndex === 0 ? "th" : "td"}>${escape(cell)}</${rowIndex === 0 ? "th" : "td"}>`)
          .join("")}</tr>`
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escape(title)}</title></head><body><table>${body}</table></body></html>`;
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
  const { getAllRequests } = useStaffStore();
  const requests = getAllRequests();
  const [activeReport, setActiveReport] = useState<ReportView>("requests_snapshot");
  const [selectedDrilldown, setSelectedDrilldown] = useState<DrilldownSelection | null>(null);
  const summary = useMemo(() => getRequestSummary(requests), [requests]);
  const problemRequests = useMemo(() => requests.filter(isTechnicalProblem), [requests]);
  const problemSummary = useMemo(() => getRequestSummary(problemRequests), [problemRequests]);

  const requestTypeStats = useMemo(() => buildRequestTypeStats(requests, lang), [requests, lang]);
  const issueTypeStats = useMemo(() => buildRequestTypeStats(problemRequests, lang), [problemRequests, lang]);
  const requestRoomStats = useMemo(() => buildRoomStats(requests), [requests]);
  const problemRoomStats = useMemo(() => buildRoomStats(problemRequests), [problemRequests]);

  const reportTabs = [
    { id: "requests_snapshot" as const, label: t.requestsSnapshot },
    { id: "top_requests" as const, label: t.topRequestTypes },
    { id: "request_rooms" as const, label: t.requestHeavyRooms },
    { id: "issues_snapshot" as const, label: t.problemsSnapshot },
    { id: "top_issues" as const, label: t.topProblemTypes },
    { id: "problem_rooms" as const, label: t.problematicRooms },
  ];

  const drilldownData = useMemo(() => {
    if (!selectedDrilldown) return null;

    switch (selectedDrilldown.kind) {
      case "request_status": {
        const matching = sortByTime(requests.filter((request) => {
          if (selectedDrilldown.status === "all") return true;
          if (selectedDrilldown.status === "open") return isOpenStatus(request.status);
          return request.status === selectedDrilldown.status;
        }));
        return { title: t.reportDetails, subtitle: t.reportDetailsIntro, requests: matching };
      }
      case "issue_status": {
        const matching = sortByTime(problemRequests.filter((request) => {
          if (selectedDrilldown.status === "open") return isOpenStatus(request.status);
          return request.status === selectedDrilldown.status;
        }));
        return { title: t.reportDetails, subtitle: t.reportDetailsIntro, requests: matching };
      }
      case "request_type":
        return {
          title: translateRequestType(selectedDrilldown.type, lang),
          subtitle: t.topRequestTypesText,
          requests: sortByTime(requests.filter((request) => request.type === selectedDrilldown.type)),
        };
      case "request_room":
        return {
          title: `${t.room} ${selectedDrilldown.room}`,
          subtitle: t.requestRoomsText,
          requests: sortByTime(requests.filter((request) => request.room === selectedDrilldown.room)),
        };
      case "issue_type":
        return {
          title: translateRequestType(selectedDrilldown.type, lang),
          subtitle: t.problemTypesText,
          requests: sortByTime(problemRequests.filter((request) => request.type === selectedDrilldown.type)),
        };
      case "issue_room":
        return {
          title: `${t.room} ${selectedDrilldown.room}`,
          subtitle: t.problemRoomText,
          requests: sortByTime(problemRequests.filter((request) => request.room === selectedDrilldown.room)),
        };
    }
  }, [lang, problemRequests, requests, selectedDrilldown, t]);

  const reportRows = useMemo(() => {
    switch (activeReport) {
      case "requests_snapshot":
        return [
          [t.room, t.requestType, "Status", "Date", "Time"],
          ...sortByTime(requests).map((request) => {
            const created = new Date(request.createdAtIso);
            return [
              `${t.room} ${request.room}`,
              translateRequestType(request.type, lang, request.typeLabel),
              request.status,
              created.toLocaleDateString(lang),
              created.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }),
            ];
          }),
        ];
      case "top_requests":
        return [[t.requestType, t.totalRequests, t.openRequests, t.returnedRequests, t.completedRequests], ...requestTypeStats.map((item) => [item.label, item.total, item.open, item.returned, item.completed])];
      case "request_rooms":
        return [[t.room, t.totalRequests, t.openRequests, t.returnedRequests, t.completedRequests], ...requestRoomStats.map((room) => [`${t.room} ${room.room}`, room.total, room.open, room.returned, room.completed])];
      case "issues_snapshot":
        return [
          [t.room, t.problemType, "Status", "Date", "Time"],
          ...sortByTime(problemRequests).map((request) => {
            const created = new Date(request.createdAtIso);
            return [
              `${t.room} ${request.room}`,
              translateRequestType(request.type, lang, request.typeLabel),
              request.status,
              created.toLocaleDateString(lang),
              created.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }),
            ];
          }),
        ];
      case "top_issues":
        return [[t.problemType, t.totalIssues, t.openIssues, t.returnedIssues, t.completedIssues], ...issueTypeStats.map((item) => [item.label, item.total, item.open, item.returned, item.completed])];
      case "problem_rooms":
        return [[t.room, t.totalIssues, t.openIssues, t.returnedIssues, t.completedIssues], ...problemRoomStats.map((room) => [`${t.room} ${room.room}`, room.total, room.open, room.returned, room.completed])];
    }
  }, [activeReport, issueTypeStats, lang, problemRequests, problemRoomStats, requestRoomStats, requestTypeStats, requests, t]);

  function exportCsv() {
    downloadFile(`manager-${activeReport}.csv`, rowsToCsv(reportRows), "text/csv;charset=utf-8;");
  }

  function exportExcel() {
    const activeLabel = reportTabs.find((tab) => tab.id === activeReport)?.label ?? t.reports;
    downloadFile(`manager-${activeReport}.xls`, rowsToExcelHtml(activeLabel, reportRows), "application/vnd.ms-excel;charset=utf-8;");
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
        <StaffSummaryCard label={t.total} value={summary.total} onClick={() => setSelectedDrilldown({ kind: "request_status", status: "all" })} />
        <StaffSummaryCard label={t.new} value={summary.newCount} onClick={() => setSelectedDrilldown({ kind: "request_status", status: "new" })} />
        <StaffSummaryCard label={t.inProgress} value={summary.inProgressCount} onClick={() => setSelectedDrilldown({ kind: "request_status", status: "in_progress" })} />
        <StaffSummaryCard label={t.completed} value={summary.completedCount} onClick={() => setSelectedDrilldown({ kind: "request_status", status: "completed" })} />
        <StaffSummaryCard label={t.returned} value={summary.returnedCount} danger onClick={() => setSelectedDrilldown({ kind: "request_status", status: "returned" })} />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/40">{t.reportsCompactLabel}</p>
            <h3 className="mt-1 text-xl font-semibold text-white">{t.reports}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">{t.reportsCompactIntro}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportCsv} className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white/85 transition hover:border-white/20 hover:bg-black/30">{t.exportCsv}</button>
            <button type="button" onClick={exportExcel} className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:border-emerald-300/30 hover:bg-emerald-400/15">{t.exportExcel}</button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {reportTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveReport(tab.id);
                setSelectedDrilldown(null);
              }}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${activeReport === tab.id ? "border-violet-300/40 bg-violet-300/15 text-violet-100" : "border-white/10 bg-black/20 text-white/75 hover:border-white/20 hover:bg-black/30"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5">
          {activeReport === "requests_snapshot" ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <button type="button" onClick={() => setSelectedDrilldown({ kind: "request_status", status: "new" })} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30"><p className="text-sm text-white/50">{t.new}</p><p className="mt-2 text-3xl font-semibold text-white">{summary.newCount}</p></button>
              <button type="button" onClick={() => setSelectedDrilldown({ kind: "request_status", status: "in_progress" })} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30"><p className="text-sm text-white/50">{t.inProgress}</p><p className="mt-2 text-3xl font-semibold text-white">{summary.inProgressCount}</p></button>
              <button type="button" onClick={() => setSelectedDrilldown({ kind: "request_status", status: "returned" })} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30"><p className="text-sm text-white/50">{t.returned}</p><p className="mt-2 text-3xl font-semibold text-white">{summary.returnedCount}</p></button>
              <button type="button" onClick={() => setSelectedDrilldown({ kind: "request_status", status: "completed" })} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30"><p className="text-sm text-white/50">{t.completed}</p><p className="mt-2 text-3xl font-semibold text-white">{summary.completedCount}</p></button>
              <button type="button" onClick={() => setSelectedDrilldown({ kind: "request_status", status: "all" })} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30"><p className="text-sm text-white/50">{t.total}</p><p className="mt-2 text-3xl font-semibold text-white">{summary.total}</p></button>
            </div>
          ) : null}

          {activeReport === "top_requests" ? (
            requestTypeStats.length ? (
              <div className="space-y-3">
                {requestTypeStats.map((item) => (
                  <button key={item.type} type="button" onClick={() => setSelectedDrilldown({ kind: "request_type", type: item.type })} className="grid w-full gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] sm:items-center">
                    <div><p className="font-medium text-white">{item.label}</p></div>
                    <div className="text-sm text-white/60">{t.totalRequests}: <span className="font-semibold text-white">{item.total}</span></div>
                    <div className="text-sm text-white/60">{t.openRequests}: <span className="font-semibold text-white">{item.open}</span></div>
                    <div className="text-sm text-white/60">{t.returnedRequests}: <span className="font-semibold text-white">{item.returned}</span></div>
                    <div className="text-sm text-white/60">{t.completedRequests}: <span className="font-semibold text-white">{item.completed}</span></div>
                  </button>
                ))}
              </div>
            ) : <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">{t.noRequestData}</div>
          ) : null}

          {activeReport === "request_rooms" ? (
            requestRoomStats.length ? (
              <div className="space-y-3">
                {requestRoomStats.map((room) => (
                  <button key={room.room} type="button" onClick={() => setSelectedDrilldown({ kind: "request_room", room: room.room })} className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{t.room} {room.room}</p>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">{t.totalRequests} {room.total}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/65">
                      <span>{t.openRequests}: <span className="font-semibold text-white">{room.open}</span></span>
                      <span>{t.returnedRequests}: <span className="font-semibold text-white">{room.returned}</span></span>
                      <span>{t.completedRequests}: <span className="font-semibold text-white">{room.completed}</span></span>
                    </div>
                  </button>
                ))}
              </div>
            ) : <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">{t.noRequestData}</div>
          ) : null}

          {activeReport === "issues_snapshot" ? (
            problemRequests.length ? (
              <div className="space-y-3">
                {sortByTime(problemRequests).map((request) => {
                  const created = new Date(request.createdAtIso);
                  return (
                    <button key={request.id} type="button" onClick={() => setSelectedDrilldown({ kind: "issue_type", type: request.type })} className="grid w-full gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
                      <div><p className="font-medium text-white">{translateRequestType(request.type, lang, request.typeLabel)}</p></div>
                      <div className="text-sm text-white/60">{t.room}: <span className="font-semibold text-white">{request.room}</span></div>
                      <div className="text-sm text-white/60">{created.toLocaleDateString(lang)} • {created.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })}</div>
                      <div className="text-sm text-white/60">{request.status}</div>
                    </button>
                  );
                })}
              </div>
            ) : <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">{t.noProblemData}</div>
          ) : null}

          {activeReport === "top_issues" ? (
            issueTypeStats.length ? (
              <div className="space-y-3">
                {issueTypeStats.map((item) => (
                  <button key={item.type} type="button" onClick={() => setSelectedDrilldown({ kind: "issue_type", type: item.type })} className="grid w-full gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] sm:items-center">
                    <div><p className="font-medium text-white">{item.label}</p></div>
                    <div className="text-sm text-white/60">{t.totalIssues}: <span className="font-semibold text-white">{item.total}</span></div>
                    <div className="text-sm text-white/60">{t.openIssues}: <span className="font-semibold text-white">{item.open}</span></div>
                    <div className="text-sm text-white/60">{t.returnedIssues}: <span className="font-semibold text-white">{item.returned}</span></div>
                    <div className="text-sm text-white/60">{t.completedIssues}: <span className="font-semibold text-white">{item.completed}</span></div>
                  </button>
                ))}
              </div>
            ) : <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">{t.noProblemData}</div>
          ) : null}

          {activeReport === "problem_rooms" ? (
            problemRoomStats.length ? (
              <div className="space-y-3">
                {problemRoomStats.map((room) => (
                  <button key={room.room} type="button" onClick={() => setSelectedDrilldown({ kind: "issue_room", room: room.room })} className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-violet-300/30 hover:bg-black/30">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{t.room} {room.room}</p>
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">{t.totalIssues} {room.total}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/65">
                      <span>{t.openIssues}: <span className="font-semibold text-white">{room.open}</span></span>
                      <span>{t.returnedIssues}: <span className="font-semibold text-white">{room.returned}</span></span>
                      <span>{t.completedIssues}: <span className="font-semibold text-white">{room.completed}</span></span>
                    </div>
                  </button>
                ))}
              </div>
            ) : <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">{t.noProblemData}</div>
          ) : null}
        </div>

        {selectedDrilldown && drilldownData ? (
          <div className="mt-5 rounded-2xl border border-violet-300/25 bg-violet-300/5 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-violet-100/70">{t.reportDetails}</p>
                <h4 className="mt-1 text-xl font-semibold text-white">{drilldownData.title}</h4>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">{drilldownData.subtitle}</p>
              </div>
              <button type="button" onClick={() => setSelectedDrilldown(null)} className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white/85 transition hover:border-white/20 hover:bg-black/30">{t.closeDetails}</button>
            </div>

            <div className="mt-4 space-y-4">
              {drilldownData.requests.length ? (
                drilldownData.requests.map((request) => (
                  <StaffRequestCard key={`${selectedDrilldown.kind}-${request.id}`} request={request} mode="manager" />
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-white/60">{t.reportDetailsEmpty}</div>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
