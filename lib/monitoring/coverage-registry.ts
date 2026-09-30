export type MonitoringCoverageStatus = "covered" | "partial";

export type MonitoringCoverageRow = {
  key: string;
  labelBg: string;
  labelEn: string;
  status: MonitoringCoverageStatus;
  incidentCenter: boolean;
  criticalEmail: boolean;
  recovery: "automatic" | "fallback" | "manual" | "none";
  evidence: string[];
  noteBg: string;
  noteEn: string;
};

export const MONITORING_COVERAGE_AUDIT_VERSION = "2026-09-30-v1";

export const MONITORING_COVERAGE: readonly MonitoringCoverageRow[] = Object.freeze([
  {
    key: "guest_requests",
    labelBg: "Заявки от гости и routing",
    labelEn: "Guest requests and routing",
    status: "covered",
    incidentCenter: true,
    criticalEmail: true,
    recovery: "manual",
    evidence: [
      "app/api/guest/request-create/route.ts",
      "app/api/staff/request-status/route.ts",
    ],
    noteBg: "Грешките при създаване, routing и staff status mutation се записват по hotel_id.",
    noteEn: "Create, routing and staff status mutation failures are recorded by hotel_id.",
  },
  {
    key: "ai_concierge",
    labelBg: "AI Concierge",
    labelEn: "AI Concierge",
    status: "covered",
    incidentCenter: true,
    criticalEmail: true,
    recovery: "fallback",
    evidence: ["app/api/ai/route.ts"],
    noteBg: "Provider failure създава incident; deterministic fallback пази услугата, а следващ успешен AI call затваря incident-а като auto-resolved.",
    noteEn: "Provider failure creates an incident; deterministic fallback preserves service and the next successful AI call auto-resolves it.",
  },
  {
    key: "massage",
    labelBg: "Масажи и резервации",
    labelEn: "Massage booking",
    status: "covered",
    incidentCenter: true,
    criticalEmail: true,
    recovery: "automatic",
    evidence: [
      "app/api/guest/massages/route.ts",
      "app/api/cron/massage-snapshot-sync/route.ts",
      "app/api/staff/massage-reservations/route.ts",
    ],
    noteBg: "Guest booking, snapshot sync/recovery и staff reservation feed са наблюдавани.",
    noteEn: "Guest booking, snapshot sync/recovery and staff reservation feed are monitored.",
  },
  {
    key: "surveys",
    labelBg: "Анкети и guest feedback",
    labelEn: "Surveys and guest feedback",
    status: "covered",
    incidentCenter: true,
    criticalEmail: true,
    recovery: "manual",
    evidence: ["app/api/guest/day3-survey/route.ts"],
    noteBg: "Записът и критичните survey потоци имат централен system-event слой.",
    noteEn: "Survey writes and critical feedback flows use the central system-event layer.",
  },
  {
    key: "staff_operations_billing",
    labelBg: "Staff operations и billing",
    labelEn: "Staff operations and billing",
    status: "covered",
    incidentCenter: true,
    criticalEmail: true,
    recovery: "manual",
    evidence: [
      "app/api/staff/request-status/route.ts",
      "app/api/staff/request-billing/route.ts",
    ],
    noteBg: "Status mutation, operational config failures, billing и revenue-ledger write failures влизат в Incident Center.",
    noteEn: "Status mutation, operational config, billing and revenue-ledger write failures enter Incident Center.",
  },
  {
    key: "guest_communications",
    labelBg: "Съобщения към гости и push",
    labelEn: "Guest communications and push",
    status: "covered",
    incidentCenter: true,
    criticalEmail: true,
    recovery: "manual",
    evidence: [
      "app/api/staff/guest-communications/route.ts",
      "app/api/staff/guest-direct-communications/route.ts",
      "lib/guest-push/web-push.ts",
      "lib/staff-push/web-push.ts",
    ],
    noteBg: "Read/write/translation failures и push delivery инфраструктурата се наблюдават.",
    noteEn: "Read/write/translation failures and push delivery infrastructure are monitored.",
  },
  {
    key: "content_changes",
    labelBg: "Change Management и оферти",
    labelEn: "Change Management and offers",
    status: "covered",
    incidentCenter: true,
    criticalEmail: true,
    recovery: "manual",
    evidence: [
      "lib/server/manager-change-safety.ts",
      "app/api/staff/content-changes/lifecycle/route.ts",
      "app/api/staff/content-changes/offers/route.ts",
    ],
    noteBg: "Неочакваните system failures се логват като critical и блокират директна LIVE mutation.",
    noteEn: "Unexpected system failures are logged as critical and direct LIVE mutation remains blocked.",
  },
  {
    key: "manager_intelligence",
    labelBg: "Manager Intelligence",
    labelEn: "Manager Intelligence",
    status: "covered",
    incidentCenter: true,
    criticalEmail: true,
    recovery: "fallback",
    evidence: [
      "lib/server/manager-intelligence.ts",
      "app/api/staff/manager-intelligence/route.ts",
    ],
    noteBg: "Dashboard, on-demand brief и cron failures вече са hotel-scoped incidents; AI brief има deterministic fallback.",
    noteEn: "Dashboard, on-demand brief and cron failures are hotel-scoped incidents; the AI brief has a deterministic fallback.",
  },
  {
    key: "revenue_roi",
    labelBg: "Revenue / ROI",
    labelEn: "Revenue / ROI",
    status: "covered",
    incidentCenter: true,
    criticalEmail: true,
    recovery: "manual",
    evidence: [
      "app/api/staff/request-billing/route.ts",
      "app/api/staff/revenue/summary/route.ts",
      "lib/revenue/ancillary-revenue-model.mjs",
    ],
    noteBg: "Revenue ledger write failures и Revenue Intelligence read failures се проследяват по хотел.",
    noteEn: "Revenue ledger write failures and Revenue Intelligence read failures are tracked by hotel.",
  },
  {
    key: "runtime_tenant",
    labelBg: "Runtime / tenant isolation / config",
    labelEn: "Runtime / tenant isolation / config",
    status: "covered",
    incidentCenter: true,
    criticalEmail: true,
    recovery: "automatic",
    evidence: [
      "lib/server/system-events.ts",
      "supabase/migrations/20260903184000_refine_runtime_cell_health_recovery_semantics.sql",
      "tests/contracts/factory-runtime-self-healing.contract.test.mjs",
    ],
    noteBg: "Има runtime health, invalidation/reconciliation и self-healing проверки за tenant runtime.",
    noteEn: "Runtime health, invalidation/reconciliation and self-healing checks cover tenant runtime.",
  },
  {
    key: "integrations",
    labelBg: "Интеграции",
    labelEn: "Integrations",
    status: "partial",
    incidentCenter: true,
    criticalEmail: true,
    recovery: "none",
    evidence: ["app/api/staff/integrations/status/route.ts"],
    noteBg: "Manager status read failures се следят, но всички бъдещи външни provider execution paths трябва да използват същия incident contract.",
    noteEn: "Manager status read failures are monitored, but every future external provider execution path must use the same incident contract.",
  },
  {
    key: "staff_development",
    labelBg: "Staff Development / Training",
    labelEn: "Staff Development / Training",
    status: "partial",
    incidentCenter: false,
    criticalEmail: false,
    recovery: "none",
    evidence: ["app/api/staff/development"],
    noteBg: "Функционалният модул има contract tests, но server failures още не са централизирани в Incident Center.",
    noteEn: "The functional module has contract tests, but server failures are not yet centralized in Incident Center.",
  },
  {
    key: "client_runtime",
    labelBg: "Guest/Staff client runtime и PWA",
    labelEn: "Guest/Staff client runtime and PWA",
    status: "partial",
    incidentCenter: false,
    criticalEmail: false,
    recovery: "none",
    evidence: ["components/GuestHub.tsx", "components/InstallAppButton.tsx"],
    noteBg: "Има продуктова analytics/PWA telemetry, но няма глобален collector за browser runtime exceptions и unhandled promise errors.",
    noteEn: "Product analytics/PWA telemetry exists, but there is no global collector for browser runtime exceptions and unhandled promise errors.",
  },
]);

export function monitoringCoverageSummary() {
  const covered = MONITORING_COVERAGE.filter((row) => row.status === "covered").length;
  const partial = MONITORING_COVERAGE.length - covered;
  return {
    total: MONITORING_COVERAGE.length,
    covered,
    partial,
  };
}
