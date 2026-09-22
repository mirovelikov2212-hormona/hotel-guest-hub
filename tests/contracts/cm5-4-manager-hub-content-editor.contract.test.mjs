import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("CM5.4 Manager Hub editor is mounted and exposes Services Venues and Schedules", async () => {
  const managerPage = await readProjectFile("components/staff/pages/ManagerPageContent.tsx");
  const editor = await readProjectFile("components/staff/ManagerHubContentEditor.tsx");
  const scheduleServer = await readProjectFile("lib/server/manager-operational-schedule-changes.mjs");

  assertContains(managerPage, 'import ManagerHubContentEditor from "@/components/staff/ManagerHubContentEditor"');
  assertContains(managerPage, "<ManagerHubContentEditor");

  for (const fragment of [
    '"services"',
    '"venues"',
    '"schedules"',
    "manager-service-change-v1",
    "manager-venue-change-v1",
    "dateOverrides",
    "seasons",
    "fallbackDepartment",
    "coverage",
  ]) {
    assertContains(editor, fragment);
  }
  assertContains(scheduleServer, "set_department_schedule");
});

test("CM5.4 Manager Hub editor previews server-side and never writes LIVE directly", async () => {
  const editor = await readProjectFile("components/staff/ManagerHubContentEditor.tsx");
  const route = await readProjectFile("app/api/staff/content-changes/editor-state/route.ts");
  const server = await readProjectFile("lib/server/manager-hub-content-editor.ts");

  assertContains(editor, 'fetch("/api/staff/content-changes/editor-state"');
  assertContains(route, "previewManagerHubContentChange");
  assertContains(route, "enforceStaffSameOrigin(req)");
  assertContains(server, "prepareManagerServiceContentCandidate");
  assertContains(server, "prepareManagerVenueContentCandidate");
  assertContains(server, "prepareManagerOperationalScheduleChange");

  for (const forbidden of [
    ".update({ config_json",
    "p_config_json",
    "jsonPatch",
    "PlatformAdminAuthority",
  ]) {
    assertNotContains(editor + route + server, forbidden);
  }
});

test("CM5.4 schedule UI follows configured hours instead of hardcoded pilot cutoffs", async () => {
  const editor = await readProjectFile("components/staff/ManagerHubContentEditor.tsx");
  const server = await readProjectFile("lib/server/manager-hub-content-editor.ts");

  for (const forbidden of [
    "aquamarine",
    "aquamarin",
    "kranevo",
    "kirman",
    "wagrainerhof",
  ]) {
    assertNotContains((editor + server).toLowerCase(), forbidden);
  }

  assertContains(editor, "WEEKDAYS");
  assertContains(editor, "scheduleDraft.windows");
  assertContains(editor, "scheduleDraft.seasons");
  assertContains(editor, "scheduleDraft.dateOverrides");
  assertContains(server, "departmentSchedules");
  assertContains(server, "departmentHours");
});

test("CM5.4 Manager scope now includes schedules without exposing arbitrary config mutation", async () => {
  const source = await readProjectFile("lib/server/manager-content-changes.ts");
  for (const fragment of ['"offers"', '"services"', '"venues"', '"schedules"']) {
    assertContains(source, fragment);
  }
  assertNotContains(source, ".update({ config_json");
});
