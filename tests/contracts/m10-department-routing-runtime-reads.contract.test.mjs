import test from "node:test";

import {
  assertBefore,
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("M10.4 production path returns before department/routing database reads", async () => {
  const runtimeSource = await readProjectFile(
    "lib/server/normalized-config-runtime.ts",
  );
  const configSource = await readProjectFile("lib/config.ts");

  assertBefore(
    runtimeSource,
    "if (!input.isSandbox)",
    "getActiveNormalizedDepartmentRoutingRows(input.hotelId)",
  );
  assertContains(configSource, "if (hotel.isSandbox)");
  assertContains(
    configSource,
    "resolveNormalizedDepartmentRoutingConfigForRuntime({",
  );
  assertContains(
    configSource,
    "preserving current room authority over the M9 snapshot",
  );
});

test("M10.4 reads active tenant-scoped departments and routing rules only after activation", async () => {
  const source = await readProjectFile(
    "lib/server/normalized-config-runtime.ts",
  );

  assertBefore(
    source,
    "if (!metadataActivatesDepartmentRoutingReads(projectionState))",
    "getActiveNormalizedDepartmentRoutingRows(input.hotelId)",
  );
  assertContains(source, '.from("departments")');
  assertContains(source, '.from("routing_rules")');
  assertContains(source, '.eq("hotel_id", hotelId)');
  assertContains(source, '.is("venue_type", null)');
  assertContains(source, '.eq("active", true)');
});

test("M10.4 activation is secret-protected, sandbox-only and exact-version gated", async () => {
  const routeSource = await readProjectFile(
    "app/api/admin/config-projections/department-routing-runtime-reads/route.ts",
  );
  const activationSource = await readProjectFile(
    "lib/server/normalized-department-routing-runtime-activation.ts",
  );

  assertContains(routeSource, "process.env.CONFIG_ADMIN_SECRET");
  assertContains(routeSource, "authorization === `Bearer ${configuredSecret}`");
  assertBefore(
    routeSource,
    "if (!isAuthorizedInternalRequest(req))",
    "setSandboxNormalizedDepartmentRoutingReads({",
  );

  assertContains(activationSource, "hotel.is_sandbox !== true");
  assertContains(activationSource, 'error: "SANDBOX_HOTEL_REQUIRED"');
  assertContains(
    activationSource,
    "buildSandboxNormalizedDepartmentRoutingRuntimeConfig({",
  );
  assertContains(activationSource, "runtimeReadsActivated: false");
  assertContains(
    activationSource,
    "runtimeDepartmentRoutingReadsActivated: input.enabled",
  );
  assertNotContains(activationSource, "runtimeRoomReadsActivated: false");
  assertContains(activationSource, '.eq("hotel_id", hotel.id)');
  assertContains(activationSource, '.eq("projection_status", "ready")');
  assertContains(
    activationSource,
    '.eq("projected_revision_id", published.revisionId)',
  );
  assertContains(
    activationSource,
    '.eq("projected_source_checksum", published.sourceChecksum)',
  );
  assertNotContains(activationSource, '.from("hotels").update');
});

test("M10.4 routes with normalized hotel timezone and department hours", async () => {
  const modelSource = await readProjectFile(
    "lib/server/normalized-config-runtime-model.mjs",
  );
  const hoursSource = await readProjectFile(
    "lib/staff/operations-hours-model.mjs",
  );
  const guestRouteSource = await readProjectFile(
    "app/api/guest/request-create/route.ts",
  );
  const staffListSource = await readProjectFile(
    "app/api/staff/requests/route.ts",
  );
  const staffStatusSource = await readProjectFile(
    "app/api/staff/request-status/route.ts",
  );

  assertContains(modelSource, "afterHoursDepartment:");
  assertContains(modelSource, "departmentRoutingRuntimeActivated: true");
  assertContains(hoursSource, "config.hotelTimezone");
  assertContains(hoursSource, "config?.departmentHours?.[department]");
  assertContains(guestRouteSource, "requestAuthority.afterHoursDepartment");
  assertContains(guestRouteSource, "isDepartmentWorkingHoursForConfig({");
  assertContains(staffListSource, "isDepartmentWorkingHoursForConfig({");
  assertContains(staffStatusSource, "isDepartmentWorkingHoursForConfig({");
});
