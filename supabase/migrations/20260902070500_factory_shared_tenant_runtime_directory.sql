begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.get_factory_tenant_runtime_v1(p_hotel_slug text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $get_factory_tenant_runtime_v1$
declare
  v_hotel public.hotels%rowtype;
  v_current_revision_id uuid;
  v_current_checksum text;
  v_row public.hotel_tenant_runtime_materialized%rowtype;
  v_runtime jsonb;
begin
  select h.* into v_hotel
  from public.hotels h
  where h.active is true
    and h.is_sandbox is true
    and (
      lower(h.slug) = lower(btrim(coalesce(p_hotel_slug, '')))
      or lower(coalesce(h.public_slug, '')) = lower(btrim(coalesce(p_hotel_slug, '')))
    )
  order by case when lower(h.slug) = lower(btrim(coalesce(p_hotel_slug, ''))) then 0 else 1 end
  limit 1;

  if not found then return null; end if;

  select ps.published_revision_id, lower(r.source_checksum)
    into v_current_revision_id, v_current_checksum
  from public.hotel_config_publication_state ps
  join public.hotel_config_revisions r
    on r.id = ps.published_revision_id
   and r.hotel_id = ps.hotel_id
  where ps.hotel_id = v_hotel.id
    and r.status = 'published';

  select * into v_row
  from public.hotel_tenant_runtime_materialized m
  where m.hotel_id = v_hotel.id
    and m.published_revision_id = v_current_revision_id
    and m.source_checksum = v_current_checksum;

  if found and exists (
    select 1
    from public.hotel_config_projection_state s
    where s.hotel_id = v_hotel.id
      and s.projection_status = 'ready'
      and s.projected_revision_id = v_current_revision_id
      and lower(s.projected_source_checksum) = v_current_checksum
      and coalesce((s.metadata_json->>'runtimeRoomReadsActivated')::boolean, false) is true
      and coalesce((s.metadata_json->>'runtimeDepartmentRoutingReadsActivated')::boolean, false) is true
  ) then
    v_runtime := jsonb_build_object(
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
  else
    v_runtime := public.refresh_factory_tenant_runtime_v1(v_hotel.id);
  end if;

  if v_runtime is null then return null; end if;

  return v_runtime || jsonb_build_object(
    'hotelName', v_hotel.name,
    'hotelTimezone', v_hotel.timezone,
    'configUrl', v_hotel.config_csv_url,
    'venuesUrl', v_hotel.venues_csv_url,
    'i18nUrl', v_hotel.i18n_csv_url,
    'hotelSetupUrl', v_hotel.hotel_setup_csv_url,
    'requestDefsUrl', v_hotel.request_defs_csv_url
  );
end;
$get_factory_tenant_runtime_v1$;

revoke all on function public.get_factory_tenant_runtime_v1(text) from public, anon, authenticated;
grant execute on function public.get_factory_tenant_runtime_v1(text) to service_role;

comment on function public.get_factory_tenant_runtime_v1(text) is
'Sandbox-only one-call runtime bootstrap. Returns current materialized guest runtime plus the existing hotel directory contract; stale projections return projection_stale for application reconciliation.';

commit;
