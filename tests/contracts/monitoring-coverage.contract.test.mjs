import assert from "node:assert/strict";
import test from "node:test";

import {
  assertContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("Incident Center distinguishes intervention, verification and automatic recovery", async () => {
  const model = await readProjectFile("lib/incidents/incident-model.mjs");
  const server = await readProjectFile("lib/server/incident-center.ts");
  const ui = await readProjectFile("app/control-plane/IncidentCenterPanel.tsx");

  assertContains(model, "deriveIncidentActionState");
  assertContains(model, '"needs_intervention"');
  assertContains(model, '"awaiting_verification"');
  assertContains(model, '"auto_resolved"');
  assertContains(model, 'reporterKind === "automatic"');
  assertContains(server, "needsIntervention");
  assertContains(server, "autoResolved");
  assertContains(ui, 'needsIntervention: "Изискват намеса"');
  assertContains(ui, 'autoResolved: "Решени автоматично"');
});

test("system recovery can resolve error incidents and AI Concierge uses it", async () => {
  const resolution = await readProjectFile("lib/server/system-event-resolution.ts");
  const ai = await readProjectFile("app/api/ai/route.ts");

  assertContains(resolution, "resolveOpenSystemEvents");
  assertContains(resolution, '.in("severity"');
  assertContains(ai, 'eventType: "ai_router_provider_failed"');
  assertContains(ai, "resolveOpenSystemEvents");
  assertContains(ai, "logSystemError");
});

test("covered operational modules route system failures into centralized monitoring", async () => {
  const requestCreate = await readProjectFile("app/api/guest/request-create/route.ts");
  const requestStatus = await readProjectFile("app/api/staff/request-status/route.ts");
  const billing = await readProjectFile("app/api/staff/request-billing/route.ts");
  const massage = await readProjectFile("app/api/guest/massages/route.ts");
  const massageStaff = await readProjectFile("app/api/staff/massage-reservations/route.ts");
  const survey = await readProjectFile("app/api/guest/day3-survey/route.ts");
  const communications = await readProjectFile("app/api/staff/guest-communications/route.ts");
  const directCommunications = await readProjectFile("app/api/staff/guest-direct-communications/route.ts");
  const contentSafety = await readProjectFile("lib/server/manager-change-safety.ts");
  const managerIntelligence = await readProjectFile("lib/server/manager-intelligence.ts");
  const managerIntelligenceApi = await readProjectFile("app/api/staff/manager-intelligence/route.ts");
  const revenue = await readProjectFile("app/api/staff/revenue/summary/route.ts");

  assertContains(requestCreate, "logSystemError");
  assertContains(requestStatus, "staff_request_status_update_failed");
  assertContains(billing, "staff_billing_update_failed");
  assertContains(massage, "logSystemError");
  assertContains(massageStaff, "massage_staff_reservations_read_failed");
  assertContains(survey, "logSystemError");
  assertContains(communications, "guest_communications_write_failed");
  assertContains(directCommunications, "guest_direct_communications_write_failed");
  assertContains(contentSafety, "manager_content_change_system_failure");
  assertContains(managerIntelligence, "manager_intelligence_morning_brief_failed");
  assertContains(managerIntelligenceApi, "manager_intelligence_dashboard_failed");
  assertContains(revenue, "revenue_intelligence_read_failed");
});

test("Control Plane exposes an explicit monitoring coverage audit and does not hide partial areas", async () => {
  const registry = await readProjectFile("lib/monitoring/coverage-registry.ts");
  const panel = await readProjectFile("app/control-plane/MonitoringCoveragePanel.tsx");
  const page = await readProjectFile("app/control-plane/page.tsx");

  assertContains(registry, "MONITORING_COVERAGE_AUDIT_VERSION");
  assertContains(registry, 'key: "client_runtime"');
  assertContains(registry, 'key: "staff_development"');
  assertContains(registry, 'status: "partial"');
  assertContains(panel, "Покритие на системното наблюдение");
  assertContains(page, "<MonitoringCoveragePanel");
});

test("coverage registry keeps partial areas visible until centralized incident logging exists", async () => {
  const registry = await readProjectFile("lib/monitoring/coverage-registry.ts");
  const partialMatches = registry.match(/status: "partial"/g) || [];
  const coveredMatches = registry.match(/status: "covered"/g) || [];

  assert.ok(coveredMatches.length >= 10, "Expected the core operational platform to have broad centralized monitoring.");
  assert.ok(partialMatches.length >= 2, "Expected known partial monitoring areas to remain explicit rather than being presented as covered.");
});
