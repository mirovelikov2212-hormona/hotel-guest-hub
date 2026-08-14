import test from "node:test";

import {
  assertBefore,
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("M10.3 production path returns before normalized database reads", async () => {
  const runtimeSource = await readProjectFile(
    "lib/server/normalized-config-runtime.ts",
  );
  const configSource = await readProjectFile("lib/config.ts");

  assertBefore(
    runtimeSource,
    "if (!input.isSandbox)",
    "getNormalizedProjectionState(input.hotelId)",
  );
  assertContains(configSource, "if (hotel.isSandbox)");
  assertBefore(
    configSource,
    "if (hotel.isSandbox)",
    "resolveNormalizedRoomConfigForRuntime({",
  );
  assertContains(
    configSource,
    "Normalized sandbox room read failed; using M9 snapshot",
  );
});

test("M10.3 reads only normalized rooms after activation and scopes every query", async () => {
  const source = await readProjectFile(
    "lib/server/normalized-config-runtime.ts",
  );
  const roomRowsStart = source.indexOf(
    "export async function getActiveNormalizedRoomRows",
  );
  const roomRowsEnd = source.indexOf(
    "export async function getActiveNormalizedDepartmentRoutingRows",
  );
  const roomRowsSource = source.slice(roomRowsStart, roomRowsEnd);

  assertBefore(
    source,
    "if (!metadataActivatesRoomReads(projectionState))",
    "getActiveNormalizedRoomRows(input.hotelId)",
  );
  assertContains(source, '.from("hotel_config_projection_state")');
  assertContains(roomRowsSource, '.from("rooms")');
  assertNotContains(roomRowsSource, '.from("departments")');
  assertNotContains(roomRowsSource, '.from("routing_rules")');
  assertContains(roomRowsSource, '.eq("hotel_id", hotelId)');
  assertContains(roomRowsSource, '.eq("active", true)');
});

test("M10.3 activation is secret-protected, sandbox-only and exact-version gated", async () => {
  const routeSource = await readProjectFile(
    "app/api/admin/config-projections/room-runtime-reads/route.ts",
  );
  const activationSource = await readProjectFile(
    "lib/server/normalized-config-runtime-activation.ts",
  );

  assertContains(routeSource, "process.env.CONFIG_ADMIN_SECRET");
  assertContains(routeSource, "authorization === `Bearer ${configuredSecret}`");
  assertContains(routeSource, 'typeof (body as { enabled?: unknown }).enabled !== "boolean"');
  assertBefore(
    routeSource,
    "if (!isAuthorizedInternalRequest(req))",
    "setSandboxNormalizedRoomReads({",
  );

  assertContains(activationSource, "hotel.is_sandbox !== true");
  assertContains(activationSource, 'error: "SANDBOX_HOTEL_REQUIRED"');
  assertContains(
    activationSource,
    "buildSandboxNormalizedRoomRuntimeConfig({",
  );
  assertContains(activationSource, "runtimeReadsActivated: false");
  assertContains(activationSource, "runtimeRoomReadsActivated: input.enabled");
  assertNotContains(activationSource, '.from("departments")');
  assertNotContains(activationSource, '.from("routing_rules")');
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
