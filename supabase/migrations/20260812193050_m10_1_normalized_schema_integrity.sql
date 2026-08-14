-- M10.1: normalized rooms / departments / routing integrity foundation.
--
-- This migration is intentionally schema-only. It does not project published
-- configuration, backfill guest requests, or activate normalized runtime reads.
-- The materializer and dual-read parity gate belong to M10.2.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $m10_1_preflight$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'M10.1 requires PostgreSQL 15 or newer';
  end if;

  if to_regclass('public.rooms') is null
    or to_regclass('public.departments') is null
    or to_regclass('public.routing_rules') is null
    or to_regclass('public.guest_requests') is null
    or to_regclass('public.hotel_config_revisions') is null
    or to_regclass('public.hotel_config_publication_state') is null then
    raise exception 'M10.1 normalized or M9 revision prerequisites are missing';
  end if;
end
$m10_1_preflight$;

-- Composite candidate keys make hotel identity part of every normalized
-- relationship. The UUID primary keys remain available for legacy reads.
alter table public.rooms
  add constraint rooms_hotel_id_id_key unique (hotel_id, id);

alter table public.departments
  add constraint departments_hotel_id_id_key unique (hotel_id, id);

-- NULL hours mean that a department schedule has not been projected yet.
-- A projected department is either explicitly 24/7 or has a complete interval.
alter table public.departments
  add column opens_at time without time zone,
  add column closes_at time without time zone,
  add column is_24h boolean not null default false,
  add constraint departments_working_hours_check check (
    (
      is_24h = true
      and opens_at is null
      and closes_at is null
    )
    or
    (
      is_24h = false
      and (
        (opens_at is null and closes_at is null)
        or
        (
          opens_at is not null
          and closes_at is not null
          and opens_at <> closes_at
        )
      )
    )
  );

alter table public.routing_rules
  add column after_hours_department_id uuid,
  add constraint routing_rules_after_hours_department_check check (
    after_hours_department_id is null
    or after_hours_department_id <> department_id
  ) not valid;

-- The original UNIQUE(hotel_id, request_type, venue_type) treats NULL venue
-- values as distinct. This partial index closes only that generic-route gap
-- without replacing the existing constraint for venue-specific routes.
create unique index routing_rules_generic_route_uidx
  on public.routing_rules (hotel_id, request_type)
  where venue_type is null;

-- Preserve the current single-column foreign keys during the dual-read period,
-- while adding tenant-safe composite guarantees for every M10 relationship.
alter table public.guest_requests
  add constraint guest_requests_hotel_room_id_fkey
  foreign key (hotel_id, room_id)
  references public.rooms (hotel_id, id)
  on delete set null (room_id)
  not valid,
  add constraint guest_requests_hotel_department_id_fkey
  foreign key (hotel_id, department_id)
  references public.departments (hotel_id, id)
  on delete set null (department_id)
  not valid;

alter table public.routing_rules
  add constraint routing_rules_hotel_department_id_fkey
  foreign key (hotel_id, department_id)
  references public.departments (hotel_id, id)
  on delete cascade
  not valid,
  add constraint routing_rules_hotel_after_hours_department_id_fkey
  foreign key (hotel_id, after_hours_department_id)
  references public.departments (hotel_id, id)
  on delete set null (after_hours_department_id)
  not valid;

create index guest_requests_hotel_room_id_idx
  on public.guest_requests (hotel_id, room_id)
  where room_id is not null;

create index guest_requests_hotel_department_id_idx
  on public.guest_requests (hotel_id, department_id)
  where department_id is not null;

create index routing_rules_hotel_department_id_idx
  on public.routing_rules (hotel_id, department_id);

create index routing_rules_hotel_after_hours_department_id_idx
  on public.routing_rules (hotel_id, after_hours_department_id)
  where after_hours_department_id is not null;

alter table public.guest_requests
  validate constraint guest_requests_hotel_room_id_fkey,
  validate constraint guest_requests_hotel_department_id_fkey;

alter table public.routing_rules
  validate constraint routing_rules_after_hours_department_check,
  validate constraint routing_rules_hotel_department_id_fkey,
  validate constraint routing_rules_hotel_after_hours_department_id_fkey;

-- Runtime may trust a projection only when this row says READY and both the
-- revision id and checksum still match the current publication pointer.
create table public.hotel_config_projection_state (
  hotel_id uuid primary key
    references public.hotels (id) on delete cascade,
  projected_revision_id uuid not null,
  projected_source_checksum text not null,
  projection_status text not null default 'pending',
  rooms_count integer not null default 0,
  active_rooms_count integer not null default 0,
  departments_count integer not null default 0,
  active_departments_count integer not null default 0,
  routing_rules_count integer not null default 0,
  active_routing_rules_count integer not null default 0,
  projected_at timestamp with time zone,
  last_verified_at timestamp with time zone,
  last_error_code text,
  last_error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint hotel_config_projection_state_revision_fkey
    foreign key (hotel_id, projected_revision_id)
    references public.hotel_config_revisions (hotel_id, id)
    on delete restrict,
  constraint hotel_config_projection_state_checksum_check
    check (projected_source_checksum ~ '^[A-Fa-f0-9]{64}$'),
  constraint hotel_config_projection_state_status_check
    check (projection_status in ('pending', 'ready', 'failed')),
  constraint hotel_config_projection_state_counts_check check (
    rooms_count >= 0
    and active_rooms_count >= 0
    and active_rooms_count <= rooms_count
    and departments_count >= 0
    and active_departments_count >= 0
    and active_departments_count <= departments_count
    and routing_rules_count >= 0
    and active_routing_rules_count >= 0
    and active_routing_rules_count <= routing_rules_count
  ),
  constraint hotel_config_projection_state_metadata_check
    check (jsonb_typeof(metadata_json) = 'object'),
  constraint hotel_config_projection_state_ready_check check (
    projection_status <> 'ready'
    or (
      projected_at is not null
      and rooms_count > 0
      and active_rooms_count > 0
      and departments_count > 0
      and active_departments_count > 0
      and routing_rules_count > 0
      and active_routing_rules_count > 0
      and last_error_code is null
      and last_error_message is null
    )
  )
);

alter table public.hotel_config_projection_state enable row level security;

revoke all on table public.hotel_config_projection_state
  from anon, authenticated, service_role;

grant select, insert, update on table public.hotel_config_projection_state
  to service_role;

create policy service_role_hotel_config_projection_state_all
  on public.hotel_config_projection_state
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.hotel_config_projection_state is
  'M10 revision/checksum gate for normalized room, department and routing projections.';

comment on column public.hotel_config_projection_state.projected_source_checksum is
  'Checksum copied from the immutable published revision after a successful projection.';

comment on column public.departments.is_24h is
  'True only for explicitly projected 24-hour departments; NULL hours with false means not configured.';

commit;
