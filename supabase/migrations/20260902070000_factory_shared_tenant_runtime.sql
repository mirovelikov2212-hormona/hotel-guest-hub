begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists public.hotel_tenant_runtime_materialized (
  hotel_id uuid primary key references public.hotels(id) on delete cascade,
  hotel_slug text not null,
  public_slug text null,
  production_hotel_id uuid null references public.hotels(id) on delete cascade,
  published_revision_id uuid not null references public.hotel_config_revisions(id) on delete cascade,
  source_checksum text not null,
  config_json jsonb not null,
  relational_authority_json jsonb not null default '{}'::jsonb,
  test_room_numbers jsonb not null default '[]'::jsonb,
  materialized_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_tenant_runtime_materialized_checksum_ck
    check (source_checksum ~ '^[a-f0-9]{64}$'),
  constraint hotel_tenant_runtime_materialized_test_rooms_ck
    check (jsonb_typeof(test_room_numbers) = 'array'),
  constraint hotel_tenant_runtime_materialized_authority_ck
    check (jsonb_typeof(relational_authority_json) = 'object')
);

create unique index if not exists hotel_tenant_runtime_materialized_slug_uq
  on public.hotel_tenant_runtime_materialized (lower(hotel_slug));

create index if not exists hotel_tenant_runtime_materialized_revision_idx
  on public.hotel_tenant_runtime_materialized (published_revision_id, source_checksum);

alter table public.hotel_tenant_runtime_materialized enable row level security;
revoke all on table public.hotel_tenant_runtime_materialized from public, anon, authenticated;
grant select, insert, update, delete on table public.hotel_tenant_runtime_materialized to service_role;

create or replace function public.refresh_factory_tenant_runtime_v1(p_hotel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $refresh_factory_tenant_runtime_v1$
declare
  v_hotel public.hotels%rowtype;
  v_revision_id uuid;
  v_checksum text;
  v_config jsonb;
  v_validation jsonb;
  v_projection public.hotel_config_projection_state%rowtype;
  v_room_ids jsonb;
  v_department_ids jsonb;
  v_routing_ids jsonb;
  v_test_rooms jsonb;
  v_row public.hotel_tenant_runtime_materialized%rowtype;
begin
  select * into v_hotel
  from public.hotels h
  where h.id = p_hotel_id
    and h.active is true
    and h.is_sandbox is true;

  if not found then
    delete from public.hotel_tenant_runtime_materialized m where m.hotel_id = p_hotel_id;
    return null;
  end if;

  select ps.published_revision_id, r.source_checksum, r.config_json, r.validation_json
    into v_revision_id, v_checksum, v_config, v_validation
  from public.hotel_config_publication_state ps
  join public.hotel_config_revisions r
    on r.id = ps.published_revision_id
   and r.hotel_id = ps.hotel_id
  where ps.hotel_id = p_hotel_id
    and r.status = 'published';

  if v_revision_id is null
     or v_checksum !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(v_config) <> 'object'
     or coalesce((v_validation->>'ok')::boolean, false) is not true then
    delete from public.hotel_tenant_runtime_materialized m where m.hotel_id = p_hotel_id;
    return null;
  end if;

  select * into v_projection
  from public.hotel_config_projection_state s
  where s.hotel_id = p_hotel_id;

  if not found
     or v_projection.projection_status <> 'ready'
     or v_projection.projected_revision_id <> v_revision_id
     or lower(v_projection.projected_source_checksum) <> lower(v_checksum)
     or coalesce((v_projection.metadata_json->>'runtimeRoomReadsActivated')::boolean, false) is not true
     or coalesce((v_projection.metadata_json->>'runtimeDepartmentRoutingReadsActivated')::boolean, false) is not true then
    delete from public.hotel_tenant_runtime_materialized m where m.hotel_id = p_hotel_id;
    return jsonb_build_object(
      'status', 'projection_stale',
      'hotelId', p_hotel_id,
      'hotelSlug', v_hotel.slug,
      'publishedRevisionId', v_revision_id,
      'sourceChecksum', lower(v_checksum)
    );
  end if;

  select coalesce(jsonb_object_agg(r.room_number, r.id::text order by r.room_number), '{}'::jsonb)
    into v_room_ids
  from public.rooms r
  where r.hotel_id = p_hotel_id and r.active is true;

  select coalesce(jsonb_object_agg(d.code, d.id::text order by d.code), '{}'::jsonb)
    into v_department_ids
  from public.departments d
  where d.hotel_id = p_hotel_id and d.active is true;

  select coalesce(jsonb_object_agg(rr.request_type, rr.department_id::text order by rr.request_type), '{}'::jsonb)
    into v_routing_ids
  from public.routing_rules rr
  where rr.hotel_id = p_hotel_id
    and rr.venue_type is null
    and rr.active is true;

  select coalesce(jsonb_agg(distinct tr.room_number order by tr.room_number), '[]'::jsonb)
    into v_test_rooms
  from public.hotel_test_rooms tr
  where tr.is_active is true
    and tr.hotel_id in (p_hotel_id, v_hotel.production_hotel_id);

  insert into public.hotel_tenant_runtime_materialized (
    hotel_id,
    hotel_slug,
    public_slug,
    production_hotel_id,
    published_revision_id,
    source_checksum,
    config_json,
    relational_authority_json,
    test_room_numbers,
    materialized_at,
    updated_at
  ) values (
    p_hotel_id,
    v_hotel.slug,
    v_hotel.public_slug,
    v_hotel.production_hotel_id,
    v_revision_id,
    lower(v_checksum),
    v_config,
    jsonb_build_object(
      'revisionId', v_revision_id,
      'sourceChecksum', lower(v_checksum),
      'roomIdByNumber', v_room_ids,
      'departmentIdByCode', v_department_ids,
      'routingDepartmentIdByRequestType', v_routing_ids
    ),
    v_test_rooms,
    now(),
    now()
  )
  on conflict (hotel_id) do update set
    hotel_slug = excluded.hotel_slug,
    public_slug = excluded.public_slug,
    production_hotel_id = excluded.production_hotel_id,
    published_revision_id = excluded.published_revision_id,
    source_checksum = excluded.source_checksum,
    config_json = excluded.config_json,
    relational_authority_json = excluded.relational_authority_json,
    test_room_numbers = excluded.test_room_numbers,
    materialized_at = excluded.materialized_at,
    updated_at = excluded.updated_at
  returning * into v_row;

  return jsonb_build_object(
    'status', 'ready',
    'hotelId', v_row.hotel_id,
    'hotelSlug', v_row.hotel_slug,
    'publicSlug', v_row.public_slug,
    'isSandbox', true,
    'productionHotelId', v_row.production_hotel_id,
    'publishedRevisionId', v_row.published_revision_id,
    'sourceChecksum', v_row.source_checksum,
    'config', v_row.config_json,
    'relationalAuthority', v_row.relational_authority_json,
    'testRoomNumbers', v_row.test_room_numbers,
    'materializedAt', v_row.materialized_at
  );
end;
$refresh_factory_tenant_runtime_v1$;

revoke all on function public.refresh_factory_tenant_runtime_v1(uuid) from public, anon, authenticated;
grant execute on function public.refresh_factory_tenant_runtime_v1(uuid) to service_role;

create or replace function public.get_factory_tenant_runtime_v1(p_hotel_slug text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $get_factory_tenant_runtime_v1$
declare
  v_hotel_id uuid;
  v_current_revision_id uuid;
  v_current_checksum text;
  v_row public.hotel_tenant_runtime_materialized%rowtype;
begin
  select h.id into v_hotel_id
  from public.hotels h
  where h.active is true
    and h.is_sandbox is true
    and (
      lower(h.slug) = lower(btrim(coalesce(p_hotel_slug, '')))
      or lower(coalesce(h.public_slug, '')) = lower(btrim(coalesce(p_hotel_slug, '')))
    )
  order by case when lower(h.slug) = lower(btrim(coalesce(p_hotel_slug, ''))) then 0 else 1 end
  limit 1;

  if v_hotel_id is null then return null; end if;

  select ps.published_revision_id, lower(r.source_checksum)
    into v_current_revision_id, v_current_checksum
  from public.hotel_config_publication_state ps
  join public.hotel_config_revisions r
    on r.id = ps.published_revision_id
   and r.hotel_id = ps.hotel_id
  where ps.hotel_id = v_hotel_id
    and r.status = 'published';

  select * into v_row
  from public.hotel_tenant_runtime_materialized m
  where m.hotel_id = v_hotel_id
    and m.published_revision_id = v_current_revision_id
    and m.source_checksum = v_current_checksum;

  if found then
    if exists (
      select 1
      from public.hotel_config_projection_state s
      where s.hotel_id = v_hotel_id
        and s.projection_status = 'ready'
        and s.projected_revision_id = v_current_revision_id
        and lower(s.projected_source_checksum) = v_current_checksum
        and coalesce((s.metadata_json->>'runtimeRoomReadsActivated')::boolean, false) is true
        and coalesce((s.metadata_json->>'runtimeDepartmentRoutingReadsActivated')::boolean, false) is true
    ) then
      return jsonb_build_object(
        'status', 'ready',
        'hotelId', v_row.hotel_id,
        'hotelSlug', v_row.hotel_slug,
        'publicSlug', v_row.public_slug,
        'isSandbox', true,
        'productionHotelId', v_row.production_hotel_id,
        'publishedRevisionId', v_row.published_revision_id,
        'sourceChecksum', v_row.source_checksum,
        'config', v_row.config_json,
        'relationalAuthority', v_row.relational_authority_json,
        'testRoomNumbers', v_row.test_room_numbers,
        'materializedAt', v_row.materialized_at
      );
    end if;
  end if;

  return public.refresh_factory_tenant_runtime_v1(v_hotel_id);
end;
$get_factory_tenant_runtime_v1$;

revoke all on function public.get_factory_tenant_runtime_v1(text) from public, anon, authenticated;
grant execute on function public.get_factory_tenant_runtime_v1(text) to service_role;

create or replace function public.sync_factory_tenant_runtime_projection_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $sync_factory_tenant_runtime_projection_v1$
begin
  if exists (select 1 from public.hotels h where h.id = new.hotel_id and h.is_sandbox is true) then
    perform public.refresh_factory_tenant_runtime_v1(new.hotel_id);
  end if;
  return new;
end;
$sync_factory_tenant_runtime_projection_v1$;

revoke all on function public.sync_factory_tenant_runtime_projection_v1() from public, anon, authenticated;

create trigger trg_sync_factory_tenant_runtime_projection_v1
after insert or update of projected_revision_id, projected_source_checksum, projection_status, metadata_json
on public.hotel_config_projection_state
for each row execute function public.sync_factory_tenant_runtime_projection_v1();

create or replace function public.invalidate_factory_tenant_runtime_publication_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $invalidate_factory_tenant_runtime_publication_v1$
begin
  if new.published_revision_id is distinct from old.published_revision_id
     and exists (select 1 from public.hotels h where h.id = new.hotel_id and h.is_sandbox is true) then
    delete from public.hotel_tenant_runtime_materialized m where m.hotel_id = new.hotel_id;
  end if;
  return new;
end;
$invalidate_factory_tenant_runtime_publication_v1$;

revoke all on function public.invalidate_factory_tenant_runtime_publication_v1() from public, anon, authenticated;

create trigger trg_invalidate_factory_tenant_runtime_publication_v1
after update of published_revision_id on public.hotel_config_publication_state
for each row execute function public.invalidate_factory_tenant_runtime_publication_v1();

-- Backfill only current Sandbox tenants. Production rows are deliberately excluded.
do $backfill_factory_tenant_runtime_v1$
declare
  v_hotel_id uuid;
begin
  for v_hotel_id in
    select h.id
    from public.hotels h
    join public.hotel_config_publication_state ps on ps.hotel_id = h.id
    join public.hotel_config_projection_state s on s.hotel_id = h.id
    where h.active is true
      and h.is_sandbox is true
      and s.projection_status = 'ready'
      and s.projected_revision_id = ps.published_revision_id
  loop
    perform public.refresh_factory_tenant_runtime_v1(v_hotel_id);
  end loop;
end;
$backfill_factory_tenant_runtime_v1$;

comment on table public.hotel_tenant_runtime_materialized is
'Sandbox-only derived read model for one-call StayHub tenant runtime resolution. Authoritative truth remains hotel_config_publication_state + hotel_config_projection_state and normalized resources.';

commit;
