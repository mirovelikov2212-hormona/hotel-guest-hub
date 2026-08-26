begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.project_factory_guided_native_content_venues_v1(
  p_actor_admin_id uuid,
  p_operational_projection_run_id uuid,
  p_blueprint_hash text,
  p_operational_resources_hash text,
  p_native_resources_hash text,
  p_native_resources jsonb
)
returns table (
  projection_run_id uuid,
  production_hotel_id uuid,
  sandbox_hotel_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $project_factory_guided_native_content_venues_v1$
declare
  v_actor_role text;
  v_operational public.factory_operational_resource_projection_runs%rowtype;
  v_core public.factory_core_resource_projection_runs%rowtype;
  v_onboarding public.factory_onboarding_runs%rowtype;
  v_envelope public.factory_onboarding_envelope_projection_runs%rowtype;
  v_existing public.factory_native_content_projection_runs%rowtype;
  v_expected_knowledge jsonb;
  v_placeholder_count integer;
  v_mutated_count integer;
  v_native record;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_admin_id is null or p_operational_projection_run_id is null then
    raise exception 'P2C_GUIDED_NATIVE_REQUIRED_ID_MISSING';
  end if;

  select role into v_actor_role
  from public.platform_admins
  where id = p_actor_admin_id and active = true;

  if v_actor_role is null or v_actor_role not in ('super_admin','operator') then
    raise exception 'P2C_GUIDED_NATIVE_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_blueprint_hash := lower(btrim(coalesce(p_blueprint_hash,'')));
  p_operational_resources_hash := lower(btrim(coalesce(p_operational_resources_hash,'')));
  p_native_resources_hash := lower(btrim(coalesce(p_native_resources_hash,'')));
  if p_blueprint_hash !~ '^[a-f0-9]{64}$'
     or p_operational_resources_hash !~ '^[a-f0-9]{64}$'
     or p_native_resources_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'P2C_GUIDED_NATIVE_HASH_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:step2c:guided-native:' || p_operational_projection_run_id::text, 0)
  );

  select * into v_operational
  from public.factory_operational_resource_projection_runs
  where id = p_operational_projection_run_id and status = 'completed'
  for update;
  if not found then raise exception 'P2C_GUIDED_NATIVE_OPERATIONAL_RUN_MISSING'; end if;

  select * into v_core
  from public.factory_core_resource_projection_runs
  where id = v_operational.core_projection_run_id and status = 'completed'
  for update;
  if not found then raise exception 'P2C_GUIDED_NATIVE_CORE_RUN_MISSING'; end if;

  select * into v_onboarding
  from public.factory_onboarding_runs
  where id = v_core.onboarding_run_id and status = 'completed'
  for update;
  if not found then raise exception 'P2C_GUIDED_NATIVE_ONBOARDING_RUN_MISSING'; end if;

  if v_operational.operational_resources_hash <> p_operational_resources_hash then
    raise exception 'P2C_GUIDED_NATIVE_OPERATIONAL_HASH_MISMATCH';
  end if;
  if v_onboarding.blueprint_hash <> p_blueprint_hash then
    raise exception 'P2C_GUIDED_NATIVE_BLUEPRINT_HASH_MISMATCH';
  end if;

  select * into v_envelope
  from public.factory_onboarding_envelope_projection_runs
  where operational_projection_run_id = p_operational_projection_run_id
    and status = 'completed'
  for update;
  if not found then raise exception 'P2C_GUIDED_NATIVE_ENVELOPE_REQUIRED'; end if;

  if not exists (
      select 1 from public.hotels h
      where h.id = v_onboarding.production_hotel_id
        and h.active = false and h.is_sandbox = false
    )
    or not exists (
      select 1 from public.hotels h
      where h.id = v_onboarding.sandbox_hotel_id
        and h.active = false and h.is_sandbox = true
        and h.production_hotel_id = v_onboarding.production_hotel_id
    )
    or not exists (
      select 1 from public.properties p
      where p.id = v_onboarding.property_id and p.lifecycle_state = 'draft'
    ) then
    raise exception 'P2C_GUIDED_NATIVE_STATE_NOT_FAIL_CLOSED';
  end if;

  select * into v_existing
  from public.factory_native_content_projection_runs
  where operational_projection_run_id = p_operational_projection_run_id;

  if found then
    if v_existing.native_resources_hash <> p_native_resources_hash
       or v_existing.production_hotel_id <> v_onboarding.production_hotel_id
       or v_existing.sandbox_hotel_id <> v_onboarding.sandbox_hotel_id then
      raise exception 'P2C_GUIDED_NATIVE_IDEMPOTENCY_CONFLICT';
    end if;

    if (select count(*) from public.hotel_knowledge_configs k
        where k.hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id)
          and k.factory_managed = true
          and k.factory_projection_run_id = v_existing.id
          and k.status = 'placeholder') <> 2
       or exists (
         select 1 from public.venues venue
         where venue.factory_projection_run_id = v_existing.id and venue.active = true
       ) then
      raise exception 'P2C_GUIDED_NATIVE_REPLAY_STATE_INVALID';
    end if;

    return query select v_existing.id, v_existing.production_hotel_id,
      v_existing.sandbox_hotel_id, true;
    return;
  end if;

  select r.config_json #> '{factoryOnboardingEnvelope,knowledge}'
    into v_expected_knowledge
  from public.hotel_config_revisions r
  where r.id = v_envelope.production_revision_id
    and r.hotel_id = v_onboarding.production_hotel_id
    and r.revision_no = 4
    and r.status = 'draft'
    and r.source_type = 'factory_blueprint';

  if v_expected_knowledge is null
     or jsonb_typeof(v_expected_knowledge) <> 'object'
     or v_expected_knowledge->>'status' <> 'placeholder' then
    raise exception 'P2C_GUIDED_NATIVE_ENVELOPE_KNOWLEDGE_INVALID';
  end if;

  if not exists (
    select 1 from public.hotel_config_revisions r
    where r.id = v_envelope.sandbox_revision_id
      and r.hotel_id = v_onboarding.sandbox_hotel_id
      and r.revision_no = 4
      and r.status = 'draft'
      and r.source_type = 'factory_blueprint'
      and r.config_json #> '{factoryOnboardingEnvelope,knowledge}' = v_expected_knowledge
  ) then
    raise exception 'P2C_GUIDED_NATIVE_ENVELOPE_KNOWLEDGE_DRIFT';
  end if;

  select count(*) into v_placeholder_count
  from public.hotel_knowledge_configs k
  where k.hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id)
    and k.status = 'placeholder'
    and k.factory_managed = false
    and k.factory_projection_run_id is null
    and k.config_json = v_expected_knowledge;

  if v_placeholder_count <> 2
     or (select count(*) from public.hotel_knowledge_configs k
         where k.hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id)) <> 2 then
    raise exception 'P2C_GUIDED_NATIVE_EXACT_PLACEHOLDER_OWNERSHIP_REQUIRED';
  end if;

  delete from public.hotel_knowledge_configs k
  where k.hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id)
    and k.status = 'placeholder'
    and k.factory_managed = false
    and k.factory_projection_run_id is null
    and k.config_json = v_expected_knowledge;
  get diagnostics v_mutated_count = row_count;
  if v_mutated_count <> 2 then
    raise exception 'P2C_GUIDED_NATIVE_PLACEHOLDER_TAKEOVER_FAILED';
  end if;

  select * into v_native
  from public.project_factory_native_content_venues_v1(
    p_actor_admin_id,
    p_operational_projection_run_id,
    p_blueprint_hash,
    p_operational_resources_hash,
    p_native_resources_hash,
    p_native_resources
  );

  if v_native.projection_run_id is null
     or v_native.production_hotel_id <> v_onboarding.production_hotel_id
     or v_native.sandbox_hotel_id <> v_onboarding.sandbox_hotel_id then
    raise exception 'P2C_GUIDED_NATIVE_PROJECTION_RESULT_INVALID';
  end if;

  update public.hotel_knowledge_configs k
  set status = 'placeholder',
      config_json = k.config_json || jsonb_build_object(
        '_factoryLifecycle',
        jsonb_build_object(
          'stage','step2c.3',
          'status','fail_closed_placeholder',
          'envelopeProjectionRunId',v_envelope.id
        )
      ),
      updated_at = v_now
  where k.hotel_id in (v_onboarding.production_hotel_id,v_onboarding.sandbox_hotel_id)
    and k.factory_managed = true
    and k.factory_projection_run_id = v_native.projection_run_id;
  get diagnostics v_mutated_count = row_count;
  if v_mutated_count <> 2 then
    raise exception 'P2C_GUIDED_NATIVE_KNOWLEDGE_NORMALIZATION_FAILED';
  end if;

  if exists (
    select 1 from public.venues venue
    where venue.factory_projection_run_id = v_native.projection_run_id
      and venue.active = true
  ) then
    raise exception 'P2C_GUIDED_NATIVE_VENUE_ACTIVATION_FORBIDDEN';
  end if;

  insert into public.control_plane_audit_log (
    actor_admin_id,organization_id,property_id,hotel_id,
    action,resource_type,resource_id,metadata_json
  ) values (
    p_actor_admin_id,v_onboarding.organization_id,v_onboarding.property_id,
    v_onboarding.production_hotel_id,
    'factory_guided_native_content_ready',
    'factory_native_content_projection_run',v_native.projection_run_id::text,
    jsonb_build_object(
      'stage','step2c.3',
      'envelopeProjectionRunId',v_envelope.id,
      'operationalProjectionRunId',p_operational_projection_run_id,
      'nativeResourcesHash',p_native_resources_hash,
      'knowledgeStatus','placeholder',
      'venueRuntimeActive',false,
      'productionActive',false,
      'sandboxActive',false
    )
  );

  return query select v_native.projection_run_id,
    v_native.production_hotel_id,v_native.sandbox_hotel_id,false;
end;
$project_factory_guided_native_content_venues_v1$;

revoke all on function public.project_factory_guided_native_content_venues_v1(
  uuid,uuid,text,text,text,jsonb
) from public,anon,authenticated;
grant execute on function public.project_factory_guided_native_content_venues_v1(
  uuid,uuid,text,text,text,jsonb
) to service_role;

comment on function public.project_factory_guided_native_content_venues_v1(uuid,uuid,text,text,text,jsonb) is
  'STEP 2C.3 guided native projection. Revalidates exact blueprint and operational hashes on fresh calls and idempotent replays, claims only exact P2.4 placeholders, and keeps both environments fail-closed.';

commit;
