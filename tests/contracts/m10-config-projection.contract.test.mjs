import test from "node:test";

import {
  assertBefore,
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const migrationPath =
  "supabase/migrations/20260813104939_m10_2_published_config_projection.sql";

test("M10.2 locks and verifies the exact published revision before mutation", async () => {
  const source = await readProjectFile(migrationPath);

  assertContains(source, "project_published_hotel_config(");
  assertContains(source, "where state.hotel_id = p_hotel_id");
  assertContains(source, "for update");
  assertContains(source, "v_published_revision_id <> p_expected_revision_id");
  assertContains(source, "lower(v_revision_checksum) <> lower(p_expected_source_checksum)");
  assertContains(source, "v_revision_status <> 'published'");
  assertContains(source, "v_revision_validation->>'ok'");

  assertBefore(
    source,
    "for update",
    "insert into public.rooms",
    "The publication pointer must be locked before normalized writes.",
  );
});

test("M10.2 upserts tenant natural keys and only deactivates stale rows", async () => {
  const source = await readProjectFile(migrationPath);

  assertContains(source, "on conflict (hotel_id, room_number) do update");
  assertContains(source, "on conflict (hotel_id, code) do update");
  assertContains(
    source,
    "on conflict (hotel_id, request_type) where venue_type is null do update",
  );
  assertContains(source, "where room.hotel_id = p_hotel_id");
  assertContains(source, "where department.hotel_id = p_hotel_id");
  assertContains(source, "where routing.hotel_id = p_hotel_id");
  assertNotContains(source, "delete from public.");
});

test("M10.2 records READY only after room, department and routing parity", async () => {
  const source = await readProjectFile(migrationPath);

  assertContains(source, "M10_2_ROOM_PARITY_FAILED");
  assertContains(source, "M10_2_DEPARTMENT_PARITY_FAILED");
  assertContains(source, "M10_2_ROUTING_PARITY_FAILED");
  assertBefore(
    source,
    "M10_2_ROUTING_COUNT_PARITY_FAILED",
    "insert into public.hotel_config_projection_state",
  );
  assertContains(source, "'projection_only'");
  assertContains(source, "'runtimeReadsActivated', false");
  assertContains(source, "projection_status = excluded.projection_status");
});

test("M10.2 projection RPC is service-role only and fail-closed", async () => {
  const source = await readProjectFile(migrationPath);

  assertContains(source, "security invoker");
  assertContains(source, "set search_path = ''");
  assertContains(source, ") from public, anon, authenticated;");
  assertContains(source, ") to service_role;");
  assertContains(source, "when others then");
  assertContains(source, "'failed'");
  assertNotContains(source, "security definer");
});

test("M10.2 admin endpoint defaults to dry-run and requires internal auth", async () => {
  const routeSource = await readProjectFile(
    "app/api/admin/config-projections/project/route.ts",
  );
  const projectorSource = await readProjectFile(
    "lib/server/config-projection.ts",
  );

  assertContains(routeSource, "process.env.CONFIG_ADMIN_SECRET");
  assertContains(routeSource, "authorization === `Bearer ${configuredSecret}`");
  assertContains(routeSource, "dryRun: body.dryRun !== false");
  assertBefore(
    routeSource,
    "if (!isAuthorizedInternalRequest(req))",
    "projectPublishedHotelConfig({",
  );

  assertContains(projectorSource, "getPublishedHotelConfigSnapshot(hotel.id)");
  assertContains(projectorSource, '"project_published_hotel_config"');
  assertContains(projectorSource, "p_hotel_id: hotel.id");
  assertContains(
    projectorSource,
    "p_expected_revision_id: published.revisionId",
  );
  assertContains(
    projectorSource,
    "p_expected_source_checksum: published.sourceChecksum",
  );
  assertContains(projectorSource, "runtimeReadsActivated: false");
});
