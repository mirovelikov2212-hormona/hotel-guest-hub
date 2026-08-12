import test from "node:test";

import {
  assertBefore,
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const migrationPath =
  "supabase/migrations/20260812193050_m10_1_normalized_schema_integrity.sql";
const projectionRevisionIndexMigrationPath =
  "supabase/migrations/20260812204720_m10_1_projection_revision_fk_index.sql";

test("M10.1 keeps projection activation revision-aware and service-role only", async () => {
  const source = await readProjectFile(migrationPath);

  assertContains(source, "create table public.hotel_config_projection_state");
  assertContains(source, "projected_revision_id uuid not null");
  assertContains(source, "projected_source_checksum text not null");
  assertContains(source, "foreign key (hotel_id, projected_revision_id)");
  assertContains(source, "references public.hotel_config_revisions (hotel_id, id)");
  assertContains(source, "projection_status in ('pending', 'ready', 'failed')");
  assertContains(source, "alter table public.hotel_config_projection_state enable row level security");
  assertContains(source, "from anon, authenticated, service_role");
  assertContains(source, "grant select, insert, update on table public.hotel_config_projection_state");
  assertNotContains(source, "grant delete");
  assertNotContains(source, "grant truncate");
});

test("M10.1 adds tenant-safe room and department relationships", async () => {
  const source = await readProjectFile(migrationPath);

  assertContains(source, "rooms_hotel_id_id_key unique (hotel_id, id)");
  assertContains(source, "departments_hotel_id_id_key unique (hotel_id, id)");
  assertContains(source, "foreign key (hotel_id, room_id)");
  assertContains(source, "references public.rooms (hotel_id, id)");
  assertContains(source, "on delete set null (room_id)");
  assertContains(source, "foreign key (hotel_id, department_id)");
  assertContains(source, "references public.departments (hotel_id, id)");
  assertContains(source, "on delete set null (department_id)");
  assertContains(source, "after_hours_department_id uuid");
  assertContains(source, "foreign key (hotel_id, after_hours_department_id)");
  assertContains(source, "on delete set null (after_hours_department_id)");
});

test("M10.1 models hours and closes the generic routing uniqueness gap", async () => {
  const source = await readProjectFile(migrationPath);

  assertContains(source, "opens_at time without time zone");
  assertContains(source, "closes_at time without time zone");
  assertContains(source, "is_24h boolean not null default false");
  assertContains(source, "create unique index routing_rules_generic_route_uidx");
  assertContains(source, "on public.routing_rules (hotel_id, request_type)");
  assertContains(source, "where venue_type is null");
});

test("M10.1 validates constraints before creating a trustworthy READY gate", async () => {
  const source = await readProjectFile(migrationPath);

  assertBefore(
    source,
    "validate constraint guest_requests_hotel_room_id_fkey",
    "create table public.hotel_config_projection_state",
  );
  assertContains(source, "projection_status <> 'ready'");
  assertContains(source, "active_rooms_count > 0");
  assertContains(source, "active_departments_count > 0");
  assertContains(source, "active_routing_rules_count > 0");
});

test("M10.1 remains schema-only", async () => {
  const source = await readProjectFile(migrationPath);

  assertNotContains(source, "insert into public.rooms");
  assertNotContains(source, "insert into public.departments");
  assertNotContains(source, "insert into public.routing_rules");
  assertNotContains(source, "update public.guest_requests");
  assertNotContains(source, "delete from public.");
});

test("M10.1 covers the composite projection revision foreign key", async () => {
  const source = await readProjectFile(projectionRevisionIndexMigrationPath);

  assertContains(
    source,
    "create index hotel_config_projection_state_revision_idx",
  );
  assertContains(
    source,
    "on public.hotel_config_projection_state (hotel_id, projected_revision_id)",
  );
  assertNotContains(source, "insert into public.");
  assertNotContains(source, "update public.");
  assertNotContains(source, "delete from public.");
});
