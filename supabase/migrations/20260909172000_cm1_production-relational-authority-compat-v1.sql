-- CM1 — keep the canonical Production relational authority valid across
-- both the accepted first-LIVE P2.6.4 state and post-LIVE version upgrades.
--
-- This replaces the implementation of the existing authority function in-place;
-- it does not add a second runtime authority or change the public RPC signature.

create or replace function public.get_factory_production_relational_authority_v1(
  p_hotel_id uuid,
  p_revision_id uuid,
  p_source_checksum text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_projection public.hotel_config_projection_state%rowtype;
  v_room_map jsonb;
  v_department_map jsonb;
  v_routing_map jsonb;
  v_version_upgrade boolean := false;
begin
  if p_hotel_id is null or p_revision_id is null then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_ID_MISSING';
  end if;

  p_source_checksum := lower(btrim(coalesce(p_source_checksum,'')));
  if p_source_checksum !~ '^[a-f0-9]{64}$' then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_CHECKSUM_INVALID';
  end if;

  if not exists (
    select 1
    from public.hotels h
    join public.hotel_public_identity_configs i on i.hotel_id=h.id
    join public.hotel_health_certification_state hc on hc.hotel_id=h.id
    join public.hotel_config_publication_state ps on ps.hotel_id=h.id
    join public.hotel_config_revisions r on r.id=ps.published_revision_id and r.hotel_id=h.id
    where h.id=p_hotel_id
      and h.active=true
      and h.is_sandbox=false
      and h.is_demo=false
      and i.status='active'
      and hc.status='healthy'
      and hc.certification_status='passed'
      and hc.certified_revision_id=p_revision_id
      and ps.published_revision_id=p_revision_id
      and ps.last_known_good_revision_id=p_revision_id
      and r.id=p_revision_id
      and r.status='published'
      and r.source_checksum=p_source_checksum
      and coalesce((r.validation_json->>'ok')::boolean,false)=true
  ) then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_LIVE_STATE_INVALID';
  end if;

  select exists (
    select 1
    from public.factory_production_live_activation_runs a
    where a.production_hotel_id=p_hotel_id
      and a.production_revision_id=p_revision_id
      and a.status='live'
      and a.release_mode='version_upgrade'
  ) into v_version_upgrade;

  select * into v_projection
  from public.hotel_config_projection_state
  where hotel_id=p_hotel_id;

  if not found
     or v_projection.projected_revision_id<>p_revision_id
     or lower(v_projection.projected_source_checksum)<>p_source_checksum then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_PROJECTION_INVALID';
  end if;

  if v_version_upgrade then
    if v_projection.projection_status<>'ready'
       or v_projection.active_rooms_count<1
       or v_projection.active_departments_count<1
       or v_projection.active_routing_rules_count<1
       or v_projection.metadata_json->>'actor'<>'cm1_atomic_version_activation'
       or v_projection.metadata_json->>'mode'<>'projection_only'
       or v_projection.metadata_json->>'runtimeReadsActivated'<>'false'
       or v_projection.metadata_json->'parity'->>'status'<>'passed' then
      raise exception 'CM1_RELATIONAL_AUTHORITY_VERSION_PROJECTION_INVALID';
    end if;

    if v_projection.rooms_count<>(
         select count(*) from public.rooms r where r.hotel_id=p_hotel_id
       )
       or v_projection.active_rooms_count<>(
         select count(*) from public.rooms r where r.hotel_id=p_hotel_id and r.active=true
       )
       or v_projection.departments_count<>(
         select count(*) from public.departments d where d.hotel_id=p_hotel_id
       )
       or v_projection.active_departments_count<>(
         select count(*) from public.departments d where d.hotel_id=p_hotel_id and d.active=true
       )
       or v_projection.routing_rules_count<>(
         select count(*) from public.routing_rules rr where rr.hotel_id=p_hotel_id and rr.venue_type is null
       )
       or v_projection.active_routing_rules_count<>(
         select count(*) from public.routing_rules rr where rr.hotel_id=p_hotel_id and rr.venue_type is null and rr.active=true
       ) then
      raise exception 'CM1_RELATIONAL_AUTHORITY_VERSION_RESOURCE_DRIFT';
    end if;
  else
    -- Preserve the accepted first-LIVE P2.6.4 authority contract exactly.
    if v_projection.projection_status<>'pending'
       or v_projection.active_routing_rules_count<>0
       or v_projection.metadata_json->>'factoryStage'<>'p2.6.4'
       or v_projection.metadata_json->>'runtimeCertification'<>'passed'
       or v_projection.metadata_json->>'publishedConfigAuthority'<>'true'
       or v_projection.metadata_json->>'productionRelationalAuthority'<>'true'
       or v_projection.metadata_json->>'normalizedProductionAuthority'<>'false'
       or v_projection.metadata_json->>'factoryOperationalResourcesEnabled'<>'false'
       or v_projection.metadata_json->>'publicActivation'<>'true'
       or v_projection.metadata_json->>'productionDark'<>'false' then
      raise exception 'P2_6_4_RELATIONAL_AUTHORITY_PROJECTION_INVALID';
    end if;

    if v_projection.active_rooms_count<>(
         select count(*) from public.rooms r where r.hotel_id=p_hotel_id and r.active=true
       )
       or v_projection.active_departments_count<>(
         select count(*) from public.departments d where d.hotel_id=p_hotel_id and d.active=true
       )
       or v_projection.routing_rules_count<>(
         select count(*) from public.routing_rules rr where rr.hotel_id=p_hotel_id
       )
       or exists (
         select 1 from public.routing_rules rr
         where rr.hotel_id=p_hotel_id and rr.active=true
       ) then
      raise exception 'P2_6_4_RELATIONAL_AUTHORITY_RESOURCE_DRIFT';
    end if;
  end if;

  if exists (
    select 1
    from public.routing_rules rr
    left join public.departments d
      on d.id=rr.department_id and d.hotel_id=rr.hotel_id and d.active=true
    left join public.departments ah
      on ah.id=rr.after_hours_department_id and ah.hotel_id=rr.hotel_id and ah.active=true
    where rr.hotel_id=p_hotel_id
      and rr.venue_type is null
      and (not v_version_upgrade or rr.active=true)
      and (
        d.id is null
        or (rr.after_hours_department_id is not null and ah.id is null)
      )
  ) then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_ROUTING_DEPARTMENT_INVALID';
  end if;

  if exists (
    select 1
    from public.routing_rules rr
    where rr.hotel_id=p_hotel_id
      and rr.venue_type is null
      and (not v_version_upgrade or rr.active=true)
    group by rr.request_type
    having count(*)<>1
  ) then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_ROUTING_DUPLICATE';
  end if;

  select jsonb_object_agg(r.room_number,r.id::text order by r.room_number)
    into v_room_map
  from public.rooms r
  where r.hotel_id=p_hotel_id and r.active=true;

  select jsonb_object_agg(d.code,d.id::text order by d.code)
    into v_department_map
  from public.departments d
  where d.hotel_id=p_hotel_id and d.active=true;

  select jsonb_object_agg(rr.request_type,rr.department_id::text order by rr.request_type)
    into v_routing_map
  from public.routing_rules rr
  where rr.hotel_id=p_hotel_id
    and rr.venue_type is null
    and (not v_version_upgrade or rr.active=true);

  if coalesce(v_room_map,'{}'::jsonb)='{}'::jsonb
     or coalesce(v_department_map,'{}'::jsonb)='{}'::jsonb
     or coalesce(v_routing_map,'{}'::jsonb)='{}'::jsonb then
    raise exception 'P2_6_4_RELATIONAL_AUTHORITY_EMPTY';
  end if;

  return jsonb_build_object(
    'revisionId',p_revision_id,
    'sourceChecksum',p_source_checksum,
    'roomIdByNumber',v_room_map,
    'departmentIdByCode',v_department_map,
    'routingDepartmentIdByRequestType',v_routing_map
  );
end
$function$;

revoke all on function public.get_factory_production_relational_authority_v1(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.get_factory_production_relational_authority_v1(uuid,uuid,text)
  to service_role;
