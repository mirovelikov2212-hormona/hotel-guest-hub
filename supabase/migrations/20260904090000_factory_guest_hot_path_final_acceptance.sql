-- Final Factory guest hot-path optimization.
--
-- This keeps the existing projector/reconciler as the only authority. A
-- materialized row is safe to serve directly only because every mutable input
-- capable of invalidating it is fail-closed at write time below.

create index if not exists hotels_factory_sandbox_public_slug_idx
  on public.hotels (lower(public_slug))
  where active is true and is_sandbox is true and public_slug is not null;

create or replace function public.invalidate_factory_tenant_runtime_hotel_identity_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.hotel_tenant_runtime_materialized m
  where m.hotel_id in (old.id, new.id);
  return new;
end;
$$;

revoke all on function public.invalidate_factory_tenant_runtime_hotel_identity_v1()
  from public, anon, authenticated;

drop trigger if exists trg_invalidate_factory_runtime_hotel_identity_v1 on public.hotels;
create trigger trg_invalidate_factory_runtime_hotel_identity_v1
after update of active, is_sandbox, slug, public_slug, production_hotel_id on public.hotels
for each row
when (
  old.active is distinct from new.active
  or old.is_sandbox is distinct from new.is_sandbox
  or old.slug is distinct from new.slug
  or old.public_slug is distinct from new.public_slug
  or old.production_hotel_id is distinct from new.production_hotel_id
)
execute function public.invalidate_factory_tenant_runtime_hotel_identity_v1();

create or replace function public.invalidate_factory_tenant_runtime_projection_delete_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.hotel_tenant_runtime_materialized m
  where m.hotel_id = old.hotel_id;
  return old;
end;
$$;

revoke all on function public.invalidate_factory_tenant_runtime_projection_delete_v1()
  from public, anon, authenticated;

drop trigger if exists trg_invalidate_factory_runtime_projection_delete_v1
  on public.hotel_config_projection_state;
create trigger trg_invalidate_factory_runtime_projection_delete_v1
after delete on public.hotel_config_projection_state
for each row execute function public.invalidate_factory_tenant_runtime_projection_delete_v1();

-- Publication INSERT/DELETE must be as fail-closed as publication replacement.
create or replace function public.invalidate_factory_tenant_runtime_publication_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hotel_id uuid;
  v_changed boolean := true;
begin
  v_hotel_id := case when tg_op = 'DELETE' then old.hotel_id else new.hotel_id end;
  if tg_op = 'UPDATE' then
    v_changed := new.published_revision_id is distinct from old.published_revision_id;
  end if;

  if v_changed and exists (
    select 1 from public.hotels h
    where h.id = v_hotel_id and h.is_sandbox is true
  ) then
    delete from public.hotel_tenant_runtime_materialized m
    where m.hotel_id = v_hotel_id;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.invalidate_factory_tenant_runtime_publication_v1()
  from public, anon, authenticated;

drop trigger if exists trg_invalidate_factory_tenant_runtime_publication_v1
  on public.hotel_config_publication_state;
create trigger trg_invalidate_factory_tenant_runtime_publication_v1
after insert or update or delete on public.hotel_config_publication_state
for each row execute function public.invalidate_factory_tenant_runtime_publication_v1();

-- READY is now a single materialized-row read plus the canonical hotel identity
-- row. Missing materialization still enters the existing refresh/reconciliation
-- path. Semantic validation is therefore paid on mutation/reconciliation, not
-- on every guest operation.
create or replace function public.get_factory_tenant_runtime_v1(p_hotel_slug text)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_slug text := lower(btrim(coalesce(p_hotel_slug, '')));
  v_hotel public.hotels%rowtype;
  v_row public.hotel_tenant_runtime_materialized%rowtype;
  v_runtime jsonb;
  v_validation jsonb;
  v_certified boolean := false;
begin
  if v_slug = '' then return null; end if;

  select h.* into v_hotel
  from public.hotels h
  where h.active is true
    and h.is_sandbox is true
    and (
      lower(h.slug) = v_slug
      or lower(coalesce(h.public_slug, '')) = v_slug
    )
  order by case when lower(h.slug) = v_slug then 0 else 1 end
  limit 1;

  if not found then return null; end if;

  select * into v_row
  from public.hotel_tenant_runtime_materialized m
  where m.hotel_id = v_hotel.id
    and lower(m.hotel_slug) = lower(v_hotel.slug)
    and m.production_hotel_id is not distinct from v_hotel.production_hotel_id;

  if found then
    return jsonb_build_object(
      'status', 'ready',
      'hotelId', v_row.hotel_id,
      'hotelSlug', v_hotel.slug,
      'publicSlug', v_hotel.public_slug,
      'isSandbox', true,
      'productionHotelId', v_hotel.production_hotel_id,
      'publishedRevisionId', v_row.published_revision_id,
      'sourceChecksum', v_row.source_checksum,
      'config', v_row.config_json,
      'relationalAuthority', v_row.relational_authority_json,
      'testRoomNumbers', v_row.test_room_numbers,
      'materializedAt', v_row.materialized_at,
      'hotelName', v_hotel.name,
      'hotelTimezone', v_hotel.timezone,
      'configUrl', v_hotel.config_csv_url,
      'venuesUrl', v_hotel.venues_csv_url,
      'i18nUrl', v_hotel.i18n_csv_url,
      'hotelSetupUrl', v_hotel.hotel_setup_csv_url,
      'requestDefsUrl', v_hotel.request_defs_csv_url
    );
  end if;

  v_runtime := public.refresh_factory_tenant_runtime_v1(v_hotel.id);
  if v_runtime is null then return null; end if;

  if v_runtime->>'status' = 'ready' then
    return v_runtime || jsonb_build_object(
      'hotelName', v_hotel.name,
      'hotelTimezone', v_hotel.timezone,
      'configUrl', v_hotel.config_csv_url,
      'venuesUrl', v_hotel.venues_csv_url,
      'i18nUrl', v_hotel.i18n_csv_url,
      'hotelSetupUrl', v_hotel.hotel_setup_csv_url,
      'requestDefsUrl', v_hotel.request_defs_csv_url
    );
  end if;

  -- The certification marker is only needed by the existing app-side
  -- automatic reconciliation decision when the runtime is stale.
  select r.validation_json into v_validation
  from public.hotel_config_publication_state publication
  join public.hotel_config_revisions r
    on r.id = publication.published_revision_id
   and r.hotel_id = publication.hotel_id
  where publication.hotel_id = v_hotel.id
    and r.status = 'published';

  v_certified := exists (
    select 1
    from jsonb_array_elements_text(
      case
        when jsonb_typeof(v_validation->'warnings') = 'array'
          then v_validation->'warnings'
        else '[]'::jsonb
      end
    ) warning(value)
    where warning.value = 'FACTORY_SANDBOX_ACCEPTANCE_CERTIFIED'
  );

  return v_runtime || jsonb_build_object(
    'hotelName', v_hotel.name,
    'hotelTimezone', v_hotel.timezone,
    'configUrl', v_hotel.config_csv_url,
    'venuesUrl', v_hotel.venues_csv_url,
    'i18nUrl', v_hotel.i18n_csv_url,
    'hotelSetupUrl', v_hotel.hotel_setup_csv_url,
    'requestDefsUrl', v_hotel.request_defs_csv_url,
    'factorySandboxAcceptanceCertified', v_certified
  );
end;
$$;

revoke all on function public.get_factory_tenant_runtime_v1(text)
  from public, anon, authenticated;
grant execute on function public.get_factory_tenant_runtime_v1(text) to service_role;

-- One indexed round-trip for guest stay + device identity. The application
-- retains lifecycle derivation and rolling-test-stay refresh semantics.
create or replace function public.validate_guest_stay_identity_v1(
  p_hotel_id uuid,
  p_room_number text,
  p_stay_id uuid,
  p_stay_device_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'stay', jsonb_build_object(
      'id', s.id,
      'hotel_id', s.hotel_id,
      'room_number', s.room_number,
      'check_in_date', s.check_in_date,
      'check_out_date', s.check_out_date,
      'check_in_at', s.check_in_at,
      'scheduled_check_out_at', s.scheduled_check_out_at,
      'effective_check_out_at', s.effective_check_out_at,
      'late_checkout_status', s.late_checkout_status,
      'late_checkout_time', s.late_checkout_time,
      'status', s.status,
      'is_test', s.is_test,
      'test_expires_at', s.test_expires_at,
      'metadata_json', s.metadata_json
    ),
    'device', jsonb_build_object(
      'id', d.id,
      'stay_id', d.stay_id,
      'hotel_id', d.hotel_id,
      'room_number', d.room_number,
      'device_token', d.device_token,
      'language', d.language,
      'is_test', d.is_test,
      'test_expires_at', d.test_expires_at
    )
  )
  from public.guest_stays s
  join public.guest_stay_devices d
    on d.id = p_stay_device_id
   and d.stay_id = s.id
   and d.hotel_id = s.hotel_id
   and d.room_number = s.room_number
  where s.id = p_stay_id
    and s.hotel_id = p_hotel_id
    and s.room_number = regexp_replace(coalesce(p_room_number, ''), '\s+', '', 'g')
  limit 1;
$$;

revoke all on function public.validate_guest_stay_identity_v1(uuid, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.validate_guest_stay_identity_v1(uuid, text, uuid, uuid)
  to service_role;
