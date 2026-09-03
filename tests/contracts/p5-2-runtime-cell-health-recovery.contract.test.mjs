import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const RECOVERY_MIGRATION = "supabase/migrations/20260903184000_refine_runtime_cell_health_recovery_semantics.sql";

test("P5.2 Cell Health closes recovered massage failures without erasing diagnostic history", async () => {
  const migration = await readProjectFile(RECOVERY_MIGRATION);

  assertContains(migration, "latest_massage_failure_at");
  assertContains(migration, "latest_massage_critical_at");
  assertContains(migration, "latest_massage_success_at");
  assertContains(migration, "'massage_calendar_snapshot_refreshed'");
  assertContains(migration, "'massage_calendar_snapshot_recovered'");
  assertContains(migration, "re.latest_massage_failure_at > coalesce(re.latest_massage_success_at");
  assertContains(migration, "re.latest_massage_critical_at > coalesce(re.latest_massage_success_at");
  assertContains(migration, "se.metadata_json ->> 'stage' = 'snapshot'");
  assertContains(migration, "count(*) filter (where se.severity = 'error')::integer as error_count");
  assertContains(migration, "count(*) filter (where se.severity = 'critical')::integer as critical_count");
  assertNotContains(migration, "create table");
  assertNotContains(migration.toLowerCase(), "update public.system_events");
});

test("P5.2 recovery refinement remains a read-only service-role health contract", async () => {
  const migration = await readProjectFile(RECOVERY_MIGRATION);

  assertContains(migration, "create or replace function public.get_runtime_cell_fleet_health_v1()");
  assertContains(migration, "language sql");
  assertContains(migration, "stable");
  assertContains(migration, "security definer");
  assertContains(migration, "revoke all on function public.get_runtime_cell_fleet_health_v1() from public, anon, authenticated");
  assertContains(migration, "grant execute on function public.get_runtime_cell_fleet_health_v1() to service_role");
  assertNotContains(migration.toLowerCase(), "move_hotel_runtime_cell_v1");
}
);
