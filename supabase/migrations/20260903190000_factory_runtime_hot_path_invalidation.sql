-- Factory materialized runtime hot-path hardening.
--
-- The published projector/reconciler remains the semantic authority. Guest hot
-- reads may use the already-materialized runtime only after authoritative
-- normalized drift is fail-closed at write time. This migration does not add a
-- second runtime engine or a second readiness model.

create or replace function public.invalidate_factory_tenant_runtime_authority_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source_hotel_id uuid;
  v_target_hotel_id uuid;
  v_hard_projection_drift boolean := tg_table_name in ('rooms', 'departments', 'routing_rules');
  v_now timestamptz := clock_timestamp();
begin
  v_source_hotel_id := case
    when tg_op = 'DELETE' then old.hotel_id
    else new.hotel_id
  end;

  if v_source_hotel_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  for v_target_hotel_id in
    select h.id
    from public.hotels h
    where h.active is true
      and h.is_sandbox is true
      and (
        h.id = v_source_hotel_id
        or (
          tg_table_name = 'hotel_test_rooms'
          and h.production_hotel_id = v_source_hotel_id
        )
      )
  loop
    if v_hard_projection_drift then
      update public.hotel_config_projection_state ps
      set projection_status = 'failed',
          projected_at = null,
          last_verified_at = v_now,
          last_error_code = 'FACTORY_RUNTIME_AUTHORITY_DRIFT',
          last_error_message = left(
            'Authoritative normalized runtime dependency changed: ' || tg_table_name,
            500
          ),
          metadata_json = coalesce(ps.metadata_json, '{}'::jsonb) || jsonb_build_object(
            'runtimeReadsActivated', false,
            'runtimeRoomReadsActivated', false,
            'runtimeDepartmentRoutingReadsActivated', false,
            'runtimeInvalidatedBy', 'normalized_authority_drift',
            'runtimeInvalidatedTable', tg_table_name,
            'runtimeInvalidatedAt', v_now
          ),
          updated_at = v_now
      where ps.hotel_id = v_target_hotel_id
        and ps.projection_status = 'ready'
        and (
          coalesce((ps.metadata_json->>'runtimeRoomReadsActivated')::boolean, false) is true
          or coalesce((ps.metadata_json->>'runtimeDepartmentRoutingReadsActivated')::boolean, false) is true
        );
    end if;

    -- Test-room policy is intentionally operational and may change without a
    -- config revision. Deleting only the materialized row lets the existing
    -- refresh path re-read that authority safely. Hard normalized config drift
    -- is additionally blocked by the failed projection state above.
    delete from public.hotel_tenant_runtime_materialized m
    where m.hotel_id = v_target_hotel_id;
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.invalidate_factory_tenant_runtime_authority_v1()
  from public, anon, authenticated;

-- Row-level triggers are deliberate: hotel_id is the partition key and the
-- canonical projector finishes by restoring one exact READY projection state.
drop trigger if exists trg_invalidate_factory_runtime_rooms_v1 on public.rooms;
create trigger trg_invalidate_factory_runtime_rooms_v1
after insert or update or delete on public.rooms
for each row execute function public.invalidate_factory_tenant_runtime_authority_v1();

drop trigger if exists trg_invalidate_factory_runtime_departments_v1 on public.departments;
create trigger trg_invalidate_factory_runtime_departments_v1
after insert or update or delete on public.departments
for each row execute function public.invalidate_factory_tenant_runtime_authority_v1();

drop trigger if exists trg_invalidate_factory_runtime_routing_v1 on public.routing_rules;
create trigger trg_invalidate_factory_runtime_routing_v1
after insert or update or delete on public.routing_rules
for each row execute function public.invalidate_factory_tenant_runtime_authority_v1();

drop trigger if exists trg_invalidate_factory_runtime_test_rooms_v1 on public.hotel_test_rooms;
create trigger trg_invalidate_factory_runtime_test_rooms_v1
after insert or update or delete on public.hotel_test_rooms
for each row execute function public.invalidate_factory_tenant_runtime_authority_v1();

-- Fast ready path over the existing materialized runtime. The expensive semantic
-- comparison stays in projector/reconciliation authority; it is no longer
-- repeated on every Guest read. A missing materialization still uses the
-- existing refresh function, preserving self-healing without weakening drift.
create or replace function public.get_factory_tenant_runtime_v1(p_hotel_slug text)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_hotel public.hotels%rowtype;
  v_projection public.hotel_config_projection_state%rowtype;
  v_row public.hotel_tenant_runtime_materialized%rowtype;
  v_validation jsonb;
  v_certified boolean := false;
  v_runtime jsonb;
  v_fast_ready boolean := false;
begin
  select h.* into v_hotel
  from public.hotels h
  where h.active is true
    and h.is_sandbox is true
    and (
      lower(h.slug) = lower(btrim(coalesce(p_hotel_slug, '')))
      or lower(coalesce(h.public_slug, '')) = lower(btrim(coalesce(p_hotel_slug, '')))
    )
  order by case
    when lower(h.slug) = lower(btrim(coalesce(p_hotel_slug, ''))) then 0
    else 1
  end
  limit 1;

  if not found then return null; end if;

  select * into v_projection
  from public.hotel_config_projection_state ps
  where ps.hotel_id = v_hotel.id;

  select * into v_row
  from public.hotel_tenant_runtime_materialized m
  where m.hotel_id = v_hotel.id;

  v_fast_ready := v_projection.hotel_id is not null
    and v_projection.projection_status = 'ready'
    and coalesce((v_projection.metadata_json->>'runtimeRoomReadsActivated')::boolean, false) is true
    and coalesce((v_projection.metadata_json->>'runtimeDepartmentRoutingReadsActivated')::boolean, false) is true
    and v_row.hotel_id is not null
    and v_row.published_revision_id = v_projection.projected_revision_id
    and lower(v_row.source_checksum) = lower(v_projection.projected_source_checksum)
    and v_row.production_hotel_id is not distinct from v_hotel.production_hotel_id;

  if not v_fast_ready then
    v_runtime := public.refresh_factory_tenant_runtime_v1(v_hotel.id);

    if v_runtime is null then return null; end if;

    if v_runtime->>'status' <> 'ready' then
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
    end if;

    select * into v_projection
    from public.hotel_config_projection_state ps
    where ps.hotel_id = v_hotel.id;

    select * into v_row
    from public.hotel_tenant_runtime_materialized m
    where m.hotel_id = v_hotel.id;

    v_fast_ready := v_projection.hotel_id is not null
      and v_projection.projection_status = 'ready'
      and coalesce((v_projection.metadata_json->>'runtimeRoomReadsActivated')::boolean, false) is true
      and coalesce((v_projection.metadata_json->>'runtimeDepartmentRoutingReadsActivated')::boolean, false) is true
      and v_row.hotel_id is not null
      and v_row.published_revision_id = v_projection.projected_revision_id
      and lower(v_row.source_checksum) = lower(v_projection.projected_source_checksum)
      and v_row.production_hotel_id is not distinct from v_hotel.production_hotel_id;
  end if;

  if not v_fast_ready then
    return jsonb_build_object(
      'status', 'projection_stale',
      'hotelId', v_hotel.id,
      'hotelSlug', v_hotel.slug,
      'hotelName', v_hotel.name,
      'hotelTimezone', v_hotel.timezone
    );
  end if;

  -- Published Factory revisions are immutable. This indexed lookup retains the
  -- certification bit required by the existing application fail-closed guard
  -- without re-scanning normalized routing semantics.
  select r.validation_json into v_validation
  from public.hotel_config_revisions r
  where r.hotel_id = v_hotel.id
    and r.id = v_row.published_revision_id
    and r.status = 'published';

  if v_validation is null or coalesce((v_validation->>'ok')::boolean, false) is not true then
    delete from public.hotel_tenant_runtime_materialized m
    where m.hotel_id = v_hotel.id;

    return jsonb_build_object(
      'status', 'projection_stale',
      'reason', 'published_revision_invalid',
      'hotelId', v_hotel.id,
      'hotelSlug', v_hotel.slug,
      'publishedRevisionId', v_row.published_revision_id,
      'sourceChecksum', v_row.source_checksum,
      'factorySandboxAcceptanceCertified', false,
      'hotelName', v_hotel.name,
      'hotelTimezone', v_hotel.timezone
    );
  end if;

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
    'requestDefsUrl', v_hotel.request_defs_csv_url,
    'factorySandboxAcceptanceCertified', v_certified
  );
end;
$$;

revoke all on function public.get_factory_tenant_runtime_v1(text)
  from public, anon, authenticated;
grant execute on function public.get_factory_tenant_runtime_v1(text) to service_role;
