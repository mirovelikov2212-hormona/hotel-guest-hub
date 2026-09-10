from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected exactly one anchor, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_all_exact(path: str, old: str, new: str, expected: int) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{path}: expected {expected} anchors, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new), encoding="utf-8")


# RequestDef becomes the hotel-owned source for first-response SLA and explicit escalation recipients.
replace_once(
    "lib/types.ts",
    "  requiresBilling?: boolean;\n  notifyDepartments?: string[];\n",
    "  requiresBilling?: boolean;\n  /** Hotel-owned first-response SLA in minutes. */\n  slaMinutes?: number;\n  /** Explicit hotel-owned escalation recipients. Operational AI never invents these. */\n  escalationDepartments?: string[];\n  notifyDepartments?: string[];\n",
)

replace_once(
    "lib/request-defs.ts",
    "      requiresBilling: toBool(readFirst(row, [\"requires_billing\", \"requiresBilling\", \"billing\", \"Billing\"])),\n      notifyDepartments: parseList(readFirst(row, [\"notify_departments\", \"notifyDepartments\", \"Notify Departments\"])),\n",
    "      requiresBilling: toBool(readFirst(row, [\"requires_billing\", \"requiresBilling\", \"billing\", \"Billing\"])),\n      slaMinutes: toNumber(readFirst(row, [\"sla_minutes\", \"slaMinutes\", \"SLA Minutes\", \"first_response_sla_minutes\", \"First Response SLA Minutes\"])),\n      escalationDepartments: parseList(readFirst(row, [\"escalation_departments\", \"escalationDepartments\", \"Escalation Departments\"])),\n      notifyDepartments: parseList(readFirst(row, [\"notify_departments\", \"notifyDepartments\", \"Notify Departments\"])),\n",
)

# Canonical guest request creation snapshots SLA policy from the exact LIVE RequestDef.
replace_once(
    "app/api/guest/request-create/route.ts",
    "import { createApiStageTiming } from \"@/lib/server/api-stage-timing\";\n",
    "import { createApiStageTiming } from \"@/lib/server/api-stage-timing\";\nimport { buildOperationalRequestSlaSnapshot } from \"@/lib/server/operational-request-sla.mjs\";\n",
)
replace_once(
    "app/api/guest/request-create/route.ts",
    "    const sourceRequestDef = requestAuthority.sourceRequestDef;\n    const authoritativeStaffLabels = requestAuthority.staffLabels;\n",
    "    const sourceRequestDef = requestAuthority.sourceRequestDef;\n    const authoritativeRequestDef = sourceRequestDef\n      ? (hotelConfig.requestDefs ?? []).find((def) => def.id === sourceRequestDef) ?? null\n      : null;\n    const operationalSla = buildOperationalRequestSlaSnapshot({\n      requestDef: authoritativeRequestDef,\n      sourceRequestDef,\n    });\n    const authoritativeStaffLabels = requestAuthority.staffLabels;\n",
)
replace_once(
    "app/api/guest/request-create/route.ts",
    "      sourceRequestDef,\n      serviceTime,\n",
    "      sourceRequestDef,\n      operationalSla,\n      serviceTime,\n",
)

# Staff request DTO carries canonical lifecycle timestamps plus the immutable SLA snapshot.
replace_once(
    "lib/staff/types.ts",
    "import type { CanonicalStaffRequestType } from \"@/lib/staff/request-contract.mjs\";\n",
    "import type { CanonicalStaffRequestType } from \"@/lib/staff/request-contract.mjs\";\nimport type { OperationalRequestSlaPolicy } from \"@/lib/server/operational-request-sla.mjs\";\n",
)
replace_once(
    "lib/staff/types.ts",
    "  createdAtIso: string;\n  createdDateKey: string;\n",
    "  createdAtIso: string;\n  startedAtIso?: string | null;\n  resolvedAtIso?: string | null;\n  operationalSla?: OperationalRequestSlaPolicy | null;\n  createdDateKey: string;\n",
)

# Main staff feed extends its existing tenant-scoped read; it does not add a second query.
replace_once(
    "app/api/staff/requests/route.ts",
    "import { translateGuestText } from \"@/lib/server/staff-translation\";\n",
    "import { translateGuestText } from \"@/lib/server/staff-translation\";\nimport { normalizeOperationalRequestSlaPolicy } from \"@/lib/server/operational-request-sla.mjs\";\n",
)
replace_once(
    "app/api/staff/requests/route.ts",
    "  status: StaffRequestStatus;\n  created_at: string;\n",
    "  status: StaffRequestStatus;\n  created_at: string;\n  started_at?: string | null;\n  resolved_at?: string | null;\n",
)
replace_all_exact(
    "app/api/staff/requests/route.ts",
    "message_bg, message_en, message_de, status, created_at, is_test",
    "message_bg, message_en, message_de, status, created_at, started_at, resolved_at, is_test",
    2,
)
replace_once(
    "app/api/staff/requests/route.ts",
    "    createdAtIso: row.created_at,\n    createdDateKey: created.toLocaleDateString(\"sv-SE\"),\n",
    "    createdAtIso: row.created_at,\n    startedAtIso: row.started_at ?? null,\n    resolvedAtIso: row.resolved_at ?? null,\n    operationalSla: normalizeOperationalRequestSlaPolicy(\n      metadata.operationalSla && typeof metadata.operationalSla === \"object\"\n        ? metadata.operationalSla as Record<string, unknown>\n        : undefined,\n    ),\n    createdDateKey: created.toLocaleDateString(\"sv-SE\"),\n",
)

# Generic department feed receives the same evidence through its existing hotel+department query.
replace_once(
    "app/api/staff/department-runtime/requests/route.ts",
    "import { supabaseAdmin } from \"@/lib/server/supabase-admin\";\n",
    "import { supabaseAdmin } from \"@/lib/server/supabase-admin\";\nimport { normalizeOperationalRequestSlaPolicy } from \"@/lib/server/operational-request-sla.mjs\";\n",
)
replace_once(
    "app/api/staff/department-runtime/requests/route.ts",
    "  status: string;\n  created_at: string;\n",
    "  status: string;\n  created_at: string;\n  started_at?: string | null;\n  resolved_at?: string | null;\n",
)
replace_once(
    "app/api/staff/department-runtime/requests/route.ts",
    "    createdAtIso: row.created_at,\n    department: departmentCode,\n",
    "    createdAtIso: row.created_at,\n    startedAtIso: row.started_at ?? null,\n    resolvedAtIso: row.resolved_at ?? null,\n    operationalSla: normalizeOperationalRequestSlaPolicy(\n      metadata.operationalSla && typeof metadata.operationalSla === \"object\"\n        ? metadata.operationalSla as Record<string, unknown>\n        : undefined,\n    ),\n    department: departmentCode,\n",
)
replace_once(
    "app/api/staff/department-runtime/requests/route.ts",
    ".select(\"id, room_number_snapshot, request_type, title, message, title_original, message_original, title_bg, status, created_at, is_test, test_expires_at, metadata_json\")",
    ".select(\"id, room_number_snapshot, request_type, title, message, title_original, message_original, title_bg, status, created_at, started_at, resolved_at, is_test, test_expires_at, metadata_json\")",
)

# Reception uses the shared evaluator instead of its own hard-coded threshold.
replace_once(
    "components/staff/pages/ReceptionPageContent.tsx",
    "import { buildSurveyAlertRequests } from \"@/lib/staff/survey-display\";\n",
    "import { buildSurveyAlertRequests } from \"@/lib/staff/survey-display\";\nimport { evaluateOperationalRequestSla } from \"@/lib/server/operational-request-sla.mjs\";\n",
)
replace_once(
    "components/staff/pages/ReceptionPageContent.tsx",
    "const RECEPTION_OVERDUE_AFTER_MINUTES = 10;\n\n",
    "",
)
replace_once(
    "components/staff/pages/ReceptionPageContent.tsx",
    "function getRequestAgeMinutes(request: StaffRequest, nowMs: number) {\n  const createdAtMs = new Date(request.createdAtIso).getTime();\n\n  if (!Number.isFinite(createdAtMs)) return 0;\n\n  return Math.max(0, Math.floor((nowMs - createdAtMs) / 60000));\n}\n\nfunction isOverdueForReception(request: StaffRequest, nowMs: number) {\n  if (request.status !== \"new\") return false;\n\n  return (\n    getRequestAgeMinutes(request, nowMs) >= RECEPTION_OVERDUE_AFTER_MINUTES\n  );\n}\n",
    "function getRequestSlaEvidence(request: StaffRequest, nowMs: number) {\n  return evaluateOperationalRequestSla({\n    status: request.status,\n    createdAtIso: request.createdAtIso,\n    startedAtIso: request.startedAtIso,\n    resolvedAtIso: request.resolvedAtIso,\n    now: new Date(nowMs),\n    policy: request.operationalSla ?? undefined,\n  });\n}\n\nfunction getRequestAgeMinutes(request: StaffRequest, nowMs: number) {\n  return getRequestSlaEvidence(request, nowMs).ageMinutes ?? 0;\n}\n\nfunction isOverdueForReception(request: StaffRequest, nowMs: number) {\n  return getRequestSlaEvidence(request, nowMs).escalationRequired;\n}\n",
)

# Housekeeping and Maintenance share the same evaluator and policy snapshot.
for path in [
    "components/staff/pages/HousekeepingPageContent.tsx",
    "components/staff/pages/MaintenancePageContent.tsx",
]:
    replace_once(
        path,
        "import { staffText } from \"@/lib/staff/ui-copy\";\n",
        "import { staffText } from \"@/lib/staff/ui-copy\";\nimport type { StaffRequest } from \"@/lib/staff/types\";\nimport { evaluateOperationalRequestSla } from \"@/lib/server/operational-request-sla.mjs\";\n",
    )
    replace_once(path, "const DEPARTMENT_OVERDUE_AFTER_MINUTES = 10;\n\n", "")
    replace_once(
        path,
        "function getRequestAgeMinutes(createdAtIso: string, nowMs: number) {\n  const createdAtMs = new Date(createdAtIso).getTime();\n\n  if (!Number.isFinite(createdAtMs)) return 0;\n\n  return Math.max(0, Math.floor((nowMs - createdAtMs) / 60000));\n}\n\nfunction isDepartmentRequestOverdue(\n  status: string,\n  createdAtIso: string,\n  nowMs: number,\n) {\n  return (\n    status === \"new\" &&\n    getRequestAgeMinutes(createdAtIso, nowMs) >= DEPARTMENT_OVERDUE_AFTER_MINUTES\n  );\n}\n",
        "function getRequestSlaEvidence(request: StaffRequest, nowMs: number) {\n  return evaluateOperationalRequestSla({\n    status: request.status,\n    createdAtIso: request.createdAtIso,\n    startedAtIso: request.startedAtIso,\n    resolvedAtIso: request.resolvedAtIso,\n    now: new Date(nowMs),\n    policy: request.operationalSla ?? undefined,\n  });\n}\n",
    )
    replace_once(
        path,
        "            const requestAgeMinutes = getRequestAgeMinutes(\n              request.createdAtIso,\n              nowMs,\n            );\n",
        "            const slaEvidence = getRequestSlaEvidence(request, nowMs);\n            const requestAgeMinutes = slaEvidence.ageMinutes ?? 0;\n",
    )
    replace_once(
        path,
        "                isOverdue={isDepartmentRequestOverdue(\n                  request.status,\n                  request.createdAtIso,\n                  nowMs,\n                )}\n",
        "                isOverdue={slaEvidence.escalationRequired}\n",
    )

# Generic departments gain the same live SLA evidence without another request lifecycle path.
replace_once(
    "components/staff/pages/GenericDepartmentPageContent.tsx",
    "import { useStaffTabTitleAlert } from \"@/components/staff/useStaffTabTitleAlert\";\n",
    "import { useStaffTabTitleAlert } from \"@/components/staff/useStaffTabTitleAlert\";\nimport { evaluateOperationalRequestSla } from \"@/lib/server/operational-request-sla.mjs\";\nimport type { OperationalRequestSlaPolicy } from \"@/lib/server/operational-request-sla.mjs\";\n",
)
replace_once(
    "components/staff/pages/GenericDepartmentPageContent.tsx",
    "  createdAtIso: string;\n  department: string;\n",
    "  createdAtIso: string;\n  startedAtIso?: string | null;\n  resolvedAtIso?: string | null;\n  operationalSla?: OperationalRequestSlaPolicy | null;\n  department: string;\n",
)
replace_once(
    "components/staff/pages/GenericDepartmentPageContent.tsx",
    "  const [requestOpenState, setRequestOpenState] = useState<Record<string, boolean>>({});\n  const versionRef = useRef<number | null>(null);\n",
    "  const [requestOpenState, setRequestOpenState] = useState<Record<string, boolean>>({});\n  const [nowMs, setNowMs] = useState(() => Date.now());\n  const versionRef = useRef<number | null>(null);\n\n  useEffect(() => {\n    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);\n    return () => window.clearInterval(timer);\n  }, []);\n",
)
replace_once(
    "components/staff/pages/GenericDepartmentPageContent.tsx",
    "          {visibleRequests.map((request) => {\n            const open = isRequestOpen(request);\n            return (\n              <article key={request.id} className=\"overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-sm\">\n",
    "          {visibleRequests.map((request) => {\n            const open = isRequestOpen(request);\n            const slaEvidence = evaluateOperationalRequestSla({\n              status: request.status,\n              createdAtIso: request.createdAtIso,\n              startedAtIso: request.startedAtIso,\n              resolvedAtIso: request.resolvedAtIso,\n              now: new Date(nowMs),\n              policy: request.operationalSla ?? undefined,\n            });\n            const isOverdue = slaEvidence.escalationRequired;\n            return (\n              <article\n                key={request.id}\n                className={`overflow-hidden rounded-2xl border shadow-sm ${\n                  isOverdue\n                    ? \"border-rose-500/90 bg-rose-950/35 ring-2 ring-rose-500/30 animate-pulse\"\n                    : \"border-white/10 bg-white/5\"\n                }`}\n              >\n",
)
replace_once(
    "components/staff/pages/GenericDepartmentPageContent.tsx",
    "                      {request.isTest ? <span className=\"rounded-lg bg-amber-300/10 px-2 py-1 text-xs text-amber-100\">TEST</span> : null}\n",
    "                      {request.isTest ? <span className=\"rounded-lg bg-amber-300/10 px-2 py-1 text-xs text-amber-100\">TEST</span> : null}\n                      {isOverdue ? (\n                        <span className=\"rounded-lg border border-rose-300/40 bg-rose-500/20 px-2 py-1 text-xs font-semibold text-rose-50\">\n                          SLA · {slaEvidence.ageMinutes ?? 0} min\n                        </span>\n                      ) : null}\n",
)

# Manager operational board shows the same deterministic evidence; it does not auto-escalate or push.
replace_once(
    "components/staff/pages/ManagerPageContent.tsx",
    "import { useMemo, useState } from \"react\";\n",
    "import { useEffect, useMemo, useState } from \"react\";\n",
)
replace_once(
    "components/staff/pages/ManagerPageContent.tsx",
    "import { buildSurveyAlertRequests } from \"@/lib/staff/survey-display\";\n",
    "import { buildSurveyAlertRequests } from \"@/lib/staff/survey-display\";\nimport { evaluateOperationalRequestSla } from \"@/lib/server/operational-request-sla.mjs\";\n",
)
replace_once(
    "components/staff/pages/ManagerPageContent.tsx",
    "  const [selectedDrilldown, setSelectedDrilldown] = useState<DrilldownSelection | null>(null);\n  const summary = useMemo(() => getRequestSummary(reportRequests), [reportRequests]);\n",
    "  const [selectedDrilldown, setSelectedDrilldown] = useState<DrilldownSelection | null>(null);\n  const [nowMs, setNowMs] = useState(() => Date.now());\n\n  useEffect(() => {\n    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);\n    return () => window.clearInterval(timer);\n  }, []);\n\n  const summary = useMemo(() => getRequestSummary(reportRequests), [reportRequests]);\n",
)
replace_once(
    "components/staff/pages/ManagerPageContent.tsx",
    "          {operationalRequests.length ? (\n            operationalRequests.map((request) => (\n              <StaffRequestCard\n                key={`manager-operational-${request.id}`}\n                request={request}\n                mode=\"manager\"\n                canAct\n                forceBillingOnly={isMassageBookingLikeRequest(request)}\n                canCharge\n                onStart={(id) => void updateRequestStatus(id, \"in_progress\")}\n                onDone={(id) => void updateRequestStatus(id, \"completed\")}\n                onReturn={(id) => void updateRequestStatus(id, \"returned\")}\n                onCharge={(id) => void setRequestBillingStatus(id, \"charged\")}\n                onWaive={(id) => void setRequestBillingStatus(id, \"waived\")}\n                onCancelBilling={(id) => void setRequestBillingStatus(id, \"cancelled\")}\n              />\n            ))\n",
    "          {operationalRequests.length ? (\n            operationalRequests.map((request) => {\n              const slaEvidence = evaluateOperationalRequestSla({\n                status: request.status,\n                createdAtIso: request.createdAtIso,\n                startedAtIso: request.startedAtIso,\n                resolvedAtIso: request.resolvedAtIso,\n                now: new Date(nowMs),\n                policy: request.operationalSla ?? undefined,\n              });\n\n              return (\n                <StaffRequestCard\n                  key={`manager-operational-${request.id}`}\n                  request={request}\n                  mode=\"manager\"\n                  canAct\n                  forceBillingOnly={isMassageBookingLikeRequest(request)}\n                  canCharge\n                  isOverdue={slaEvidence.escalationRequired}\n                  overdueMinutes={slaEvidence.ageMinutes ?? 0}\n                  onStart={(id) => void updateRequestStatus(id, \"in_progress\")}\n                  onDone={(id) => void updateRequestStatus(id, \"completed\")}\n                  onReturn={(id) => void updateRequestStatus(id, \"returned\")}\n                  onCharge={(id) => void setRequestBillingStatus(id, \"charged\")}\n                  onWaive={(id) => void setRequestBillingStatus(id, \"waived\")}\n                  onCancelBilling={(id) => void setRequestBillingStatus(id, \"cancelled\")}\n                />\n              );\n            })\n",
)

# A hotel can choose an SLA below ten minutes; the badge must not lie about the age.
replace_once(
    "components/staff/StaffRequestCard.tsx",
    "  const safeMinutes = Math.max(10, Math.floor(minutes || 10));\n",
    "  const safeMinutes = Math.max(1, Math.floor(minutes || 1));\n",
)

# Strengthen OA3 source contracts so future refactors cannot silently restore client/AI authority or hard-coded UI thresholds.
test_path = Path("tests/contracts/oa3-operational-sla-escalation.contract.test.mjs")
test_source = test_path.read_text(encoding="utf-8")
marker = 'test("OA3 runtime wiring snapshots only LIVE RequestDef policy and reuses canonical staff feeds", async () => {'
if marker not in test_source:
    test_source += r'''

test("OA3 runtime wiring snapshots only LIVE RequestDef policy and reuses canonical staff feeds", async () => {
  const requestCreate = await readFile(new URL("../../app/api/guest/request-create/route.ts", import.meta.url), "utf8");
  const staffFeed = await readFile(new URL("../../app/api/staff/requests/route.ts", import.meta.url), "utf8");
  const genericFeed = await readFile(new URL("../../app/api/staff/department-runtime/requests/route.ts", import.meta.url), "utf8");

  assert.match(requestCreate, /find\(\(def\) => def\.id === sourceRequestDef\)/);
  assert.match(requestCreate, /buildOperationalRequestSlaSnapshot\(\{/);
  assert.match(requestCreate, /operationalSla,/);
  assert.doesNotMatch(requestCreate, /body\.(slaMinutes|escalationDepartments|operationalSla)/);

  for (const source of [staffFeed, genericFeed]) {
    assert.match(source, /started_at/);
    assert.match(source, /resolved_at/);
    assert.match(source, /operationalSla/);
  }
});

test("OA3 RequestDef parser owns SLA and explicit escalation configuration", async () => {
  const types = await readFile(new URL("../../lib/types.ts", import.meta.url), "utf8");
  const parser = await readFile(new URL("../../lib/request-defs.ts", import.meta.url), "utf8");

  assert.match(types, /slaMinutes\?: number/);
  assert.match(types, /escalationDepartments\?: string\[\]/);
  assert.match(parser, /sla_minutes/);
  assert.match(parser, /escalation_departments/);
});

test("OA3 staff boards consume the shared evaluator instead of local ten-minute thresholds", async () => {
  const paths = [
    "../../components/staff/pages/ReceptionPageContent.tsx",
    "../../components/staff/pages/HousekeepingPageContent.tsx",
    "../../components/staff/pages/MaintenancePageContent.tsx",
    "../../components/staff/pages/GenericDepartmentPageContent.tsx",
    "../../components/staff/pages/ManagerPageContent.tsx",
  ];

  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /evaluateOperationalRequestSla/);
    assert.doesNotMatch(source, /(RECEPTION|DEPARTMENT)_OVERDUE_AFTER_MINUTES/);
  }

  const card = await readFile(new URL("../../components/staff/StaffRequestCard.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(card, /Math\.max\(10,/);
});
'''
    test_path.write_text(test_source, encoding="utf-8")

print("OA3 runtime wiring patch applied successfully")
