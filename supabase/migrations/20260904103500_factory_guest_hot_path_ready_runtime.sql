-- Factory guest hot-path optimization.
-- Keep the existing checked/reconciliation-aware runtime getter as the slow path,
-- but serve already-materialized healthy Sandbox tenants directly from the
-- authoritative materialized row. Drift invalidation remains fail-closed.

create index if not exists hotel_tenant_runtime_materialized_public_slug_idx
  on public.hotel_tenant_runtime_materialized (lower(public_slug))
  where public_slug is not null;

create or replace function public.get_factory_tenant_runtime_ready_v1(p_hotel_slug text)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_slug text := lower(btrim(coalesce(p_hotel_slug, '')));
  v_row public.hotel_tenant_runtime_materialized%rowtype;
begin
  if v_slug = '' then
    return null;
  end if;

  select m.*
    into v_row
  from public.hotel_tenant_runtime_materialized m
  where lower(m.hotel_slug) = v_slug
     or lower(coalesce(m.public_slug, '')) = v_slug
  order by case when lower(m.hotel_slug) = v_slug then 0 else 1 end
  limit 1;

  if not found then
    return null;
  end if;

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
    'materializedAt', v_row.materialized_at,
    'hotelName', nullif(v_row.config_json->>'hotelName', ''),
    'hotelTimezone', coalesce(nullif(v_row.config_json->>'hotelTimezone', ''), 'UTC'),
    'configUrl', null,
    'venuesUrl', null,
    'i18nUrl', null,
    'hotelSetupUrl', null,
    'requestDefsUrl', null
  );
end;
$function$;

revoke all on function public.get_factory_tenant_runtime_ready_v1(text) from public, anon, authenticated;
grant execute on function public.get_factory_tenant_runtime_ready_v1(text) to service_role;

-- Preserve the current authoritative checked getter verbatim as the fallback.
do $migration$
begin
  if to_regprocedure('public.get_factory_tenant_runtime_checked_v1(text)') is null then
    alter function public.get_factory_tenant_runtime_v1(text)
      rename to get_factory_tenant_runtime_checked_v1;
  end if;
end;
$migration$;

create or replace function public.get_factory_tenant_runtime_v1(p_hotel_slug text)
returns jsonb
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_ready jsonb;
begin
  v_ready := public.get_factory_tenant_runtime_ready_v1(p_hotel_slug);
  if v_ready is not null then
    return v_ready;
  end if;

  return public.get_factory_tenant_runtime_checked_v1(p_hotel_slug);
end;
$function$;

revoke all on function public.get_factory_tenant_runtime_v1(text) from public, anon, authenticated;
grant execute on function public.get_factory_tenant_runtime_v1(text) to service_role;

-- Any hotel identity/environment mutation that can make a materialized row lie
-- invalidates it. The existing checked getter will rebuild only when the
-- publication/projection contracts are healthy.
create or replace function public.invalidate_factory_tenant_runtime_hotel_identity_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    delete from public.hotel_tenant_runtime_materialized m where m.hotel_id = old.id;
    return old;
  end if;

  if new.active is distinct from old.active
     or new.is_sandbox is distinct from old.is_sandbox
     or new.slug is distinct from old.slug
     or new.public_slug is distinct from old.public_slug
     or new.production_hotel_id is distinct from old.production_hotel_id
     or new.name is distinct from old.name
     or new.timezone is distinct from old.timezone then
    delete from public.hotel_tenant_runtime_materialized m where m.hotel_id in (old.id, new.id);
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_invalidate_factory_runtime_hotel_identity_update_v1 on public.hotels;
create trigger trg_invalidate_factory_runtime_hotel_identity_update_v1
after update of active, is_sandbox, slug, public_slug, production_hotel_id, name, timezone
on public.hotels
for each row execute function public.invalidate_factory_tenant_runtime_hotel_identity_v1();

drop trigger if exists trg_invalidate_factory_runtime_hotel_identity_delete_v1 on public.hotels;
create trigger trg_invalidate_factory_runtime_hotel_identity_delete_v1
after delete on public.hotels
for each row execute function public.invalidate_factory_tenant_runtime_hotel_identity_v1();

create or replace function public.invalidate_factory_tenant_runtime_projection_delete_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  delete from public.hotel_tenant_runtime_materialized m where m.hotel_id = old.hotel_id;
  return old;
end;
$function$;

drop trigger if exists trg_invalidate_factory_runtime_projection_delete_v1 on public.hotel_config_projection_state;
create trigger trg_invalidate_factory_runtime_projection_delete_v1
after delete on public.hotel_config_projection_state
for each row execute function public.invalidate_factory_tenant_runtime_projection_delete_v1();

create or replace function public.invalidate_factory_tenant_runtime_publication_delete_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
begin
  delete from public.hotel_tenant_runtime_materialized m where m.hotel_id = old.hotel_id;
  return old;
end;
$function$;

drop trigger if exists trg_invalidate_factory_runtime_publication_delete_v1 on public.hotel_config_publication_state;
create trigger trg_invalidate_factory_runtime_publication_delete_v1
after delete on public.hotel_config_publication_state
for each row execute function public.invalidate_factory_tenant_runtime_publication_delete_v1();

-- Clean any row that is already inconsistent with current hotel identity before
-- the new ready-only path can observe it.
delete from public.hotel_tenant_runtime_materialized m
where not exists (
  select 1
  from public.hotels h
  where h.id = m.hotel_id
    and h.active is true
    and h.is_sandbox is true
    and h.slug = m.hotel_slug
    and h.public_slug is not distinct from m.public_slug
    and h.production_hotel_id is not distinct from m.production_hotel_id
);
