begin;

create or replace function public.discard_factory_onboarding_proof_v1(
  p_actor_admin_id uuid,
  p_onboarding_run_id uuid,
  p_expected_blueprint_hash text,
  p_reason text
)
returns table(
  discarded boolean,
  onboarding_run_id uuid,
  production_hotel_id uuid,
  sandbox_hotel_id uuid,
  organization_deleted boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_role text;
  v_run public.factory_onboarding_runs%rowtype;
  v_production public.hotels%rowtype;
  v_sandbox public.hotels%rowtype;
  v_organization_slug text;
  v_property_key text;
  v_property_lifecycle text;
  v_envelope_run_ids uuid[] := array[]::uuid[];
  v_sandbox_certified boolean := false;
  v_environment_count integer := 0;
  v_revision_count integer := 0;
  v_deleted_organization_count integer := 0;
begin
  if p_actor_admin_id is null or p_onboarding_run_id is null then
    raise exception 'P2_PROOF_DISCARD_REQUIRED_ID_MISSING';
  end if;

  select role
    into v_actor_role
  from public.platform_admins
  where id = p_actor_admin_id
    and active = true;

  if v_actor_role is null or v_actor_role not in ('super_admin', 'operator') then
    raise exception 'P2_PROOF_DISCARD_ADMIN_FORBIDDEN';
  end if;

  p_expected_blueprint_hash := lower(btrim(coalesce(p_expected_blueprint_hash, '')));
  p_reason := btrim(coalesce(p_reason, ''));

  if p_expected_blueprint_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'P2_PROOF_DISCARD_BLUEPRINT_HASH_INVALID';
  end if;

  if length(p_reason) < 8 or length(p_reason) > 500 then
    raise exception 'P2_PROOF_DISCARD_REASON_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('stayhub:p2:proof-discard:' || p_onboarding_run_id::text, 0)
  );

  select *
    into v_run
  from public.factory_onboarding_runs
  where id = p_onboarding_run_id
  for update;

  if not found or v_run.status <> 'completed' then
    raise exception 'P2_PROOF_DISCARD_ONBOARDING_RUN_INVALID';
  end if;

  if v_run.idempotency_key not like 'proof:%' then
    raise exception 'P2_PROOF_DISCARD_NAMESPACE_FORBIDDEN';
  end if;

  if v_run.blueprint_hash <> p_expected_blueprint_hash then
    raise exception 'P2_PROOF_DISCARD_BLUEPRINT_HASH_MISMATCH';
  end if;

  select o.slug, p.property_key, p.lifecycle_state
    into v_organization_slug, v_property_key, v_property_lifecycle
  from public.properties p
  join public.organizations o on o.id = p.organization_id
  where p.id = v_run.property_id
    and p.organization_id = v_run.organization_id;

  if not found then
    raise exception 'P2_PROOF_DISCARD_PROPERTY_LINEAGE_INVALID';
  end if;

  if v_organization_slug not like 'proof-%' then
    raise exception 'P2_PROOF_DISCARD_ORGANIZATION_NAMESPACE_FORBIDDEN';
  end if;

  if v_property_key not like 'proof-%' then
    raise exception 'P2_PROOF_DISCARD_PROPERTY_NAMESPACE_FORBIDDEN';
  end if;

  if v_property_lifecycle <> 'draft' then
    raise exception 'P2_PROOF_DISCARD_PROPERTY_LIFECYCLE_FORBIDDEN';
  end if;

  select *
    into v_production
  from public.hotels
  where id = v_run.production_hotel_id
  for update;

  if not found
     or v_production.is_sandbox <> false
     or v_production.is_demo <> false then
    raise exception 'P2_PROOF_DISCARD_PRODUCTION_LINEAGE_INVALID';
  end if;

  if v_production.active then
    raise exception 'P2_PROOF_DISCARD_PRODUCTION_ACTIVE_FORBIDDEN';
  end if;

  select *
    into v_sandbox
  from public.hotels
  where id = v_run.sandbox_hotel_id
  for update;

  if not found
     or v_sandbox.is_sandbox <> true
     or v_sandbox.is_demo <> false
     or v_sandbox.production_hotel_id is distinct from v_run.production_hotel_id then
    raise exception 'P2_PROOF_DISCARD_SANDBOX_LINEAGE_INVALID';
  end if;

  select count(*)
    into v_environment_count
  from public.property_environments
  where property_id = v_run.property_id;

  if v_environment_count <> 2
     or not exists (
       select 1 from public.property_environments
       where property_id = v_run.property_id
         and hotel_id = v_run.production_hotel_id
         and environment = 'production'
     )
     or not exists (
       select 1 from public.property_environments
       where property_id = v_run.property_id
         and hotel_id = v_run.sandbox_hotel_id
         and environment = 'sandbox'
     ) then
    raise exception 'P2_PROOF_DISCARD_ENVIRONMENT_LINEAGE_INVALID';
  end if;

  if exists (
    select 1
    from public.property_commercial_state
    where property_id = v_run.property_id
  ) or exists (
    select 1
    from public.property_commercial_lifecycle_events
    where property_id = v_run.property_id
  ) then
    raise exception 'P2_PROOF_DISCARD_COMMERCIAL_STATE_FORBIDDEN';
  end if;

  if exists (
    select 1 from public.factory_production_readiness_runs
    where production_hotel_id = v_run.production_hotel_id
       or sandbox_hotel_id = v_run.sandbox_hotel_id
  ) or exists (
    select 1 from public.factory_production_publication_runs
    where production_hotel_id = v_run.production_hotel_id
  ) or exists (
    select 1 from public.factory_production_runtime_certification_runs
    where production_hotel_id = v_run.production_hotel_id
  ) or exists (
    select 1 from public.factory_production_live_activation_runs
    where production_hotel_id = v_run.production_hotel_id
  ) or exists (
    select 1 from public.factory_production_live_rollback_runs
    where production_hotel_id = v_run.production_hotel_id
  ) then
    raise exception 'P2_PROOF_DISCARD_PRODUCTION_GATE_STARTED';
  end if;

  if exists (
    select 1
    from public.hotel_config_publication_state
    where hotel_id in (v_run.production_hotel_id, v_run.sandbox_hotel_id)
      and (published_revision_id is not null or last_known_good_revision_id is not null)
  ) then
    raise exception 'P2_PROOF_DISCARD_PUBLISHED_STATE_FORBIDDEN';
  end if;

  select count(*)
    into v_revision_count
  from public.hotel_config_revisions
  where hotel_id in (v_run.production_hotel_id, v_run.sandbox_hotel_id);

  if v_revision_count < 2
     or not exists (
       select 1 from public.hotel_config_revisions
       where hotel_id = v_run.production_hotel_id
     )
     or not exists (
       select 1 from public.hotel_config_revisions
       where hotel_id = v_run.sandbox_hotel_id
     )
     or exists (
       select 1
       from public.hotel_config_revisions
       where hotel_id in (v_run.production_hotel_id, v_run.sandbox_hotel_id)
         and (source_type <> 'factory_blueprint' or status <> 'draft')
     ) then
    raise exception 'P2_PROOF_DISCARD_REVISION_STATE_FORBIDDEN';
  end if;

  if exists (
    select 1
    from public.hotels h
    where h.production_hotel_id = v_run.production_hotel_id
      and h.id <> v_run.sandbox_hotel_id
  ) or exists (
    select 1
    from public.massage_external_source_configs m
    where m.source_hotel_id in (v_run.production_hotel_id, v_run.sandbox_hotel_id)
      and m.hotel_id not in (v_run.production_hotel_id, v_run.sandbox_hotel_id)
  ) then
    raise exception 'P2_PROOF_DISCARD_EXTERNAL_REFERENCE_FORBIDDEN';
  end if;

  select coalesce(array_agg(e.id order by e.created_at), array[]::uuid[])
    into v_envelope_run_ids
  from public.factory_onboarding_envelope_projection_runs e
  join public.factory_operational_resource_projection_runs op
    on op.id = e.operational_projection_run_id
  join public.factory_core_resource_projection_runs c
    on c.id = op.core_projection_run_id
  where c.onboarding_run_id = v_run.id;

  select exists (
    select 1
    from public.factory_sandbox_certification_runs s
    where s.envelope_projection_run_id = any(v_envelope_run_ids)
      and s.status = 'passed'
  ) into v_sandbox_certified;

  insert into public.control_plane_audit_log (
    actor_admin_id,
    organization_id,
    property_id,
    hotel_id,
    action,
    resource_type,
    resource_id,
    metadata_json
  )
  values (
    p_actor_admin_id,
    v_run.organization_id,
    v_run.property_id,
    v_run.sandbox_hotel_id,
    'factory_onboarding_proof_discarded',
    'factory_onboarding_run',
    v_run.id::text,
    jsonb_build_object(
      'stage', 'disposable_proof_cleanup',
      'idempotencyKey', v_run.idempotency_key,
      'blueprintHash', v_run.blueprint_hash,
      'organizationSlug', v_organization_slug,
      'propertyKey', v_property_key,
      'productionHotelId', v_run.production_hotel_id,
      'sandboxHotelId', v_run.sandbox_hotel_id,
      'sandboxWasActive', v_sandbox.active,
      'sandboxWasCertified', v_sandbox_certified,
      'productionWasActive', v_production.active,
      'reason', p_reason
    )
  );

  delete from public.factory_vercel_runtime_log_events
  where envelope_projection_run_id = any(v_envelope_run_ids);

  delete from public.factory_sandbox_certification_runs
  where envelope_projection_run_id = any(v_envelope_run_ids);

  delete from public.factory_onboarding_envelope_projection_runs
  where id = any(v_envelope_run_ids);

  delete from public.factory_operational_resource_projection_runs
  where core_projection_run_id in (
    select id
    from public.factory_core_resource_projection_runs
    where onboarding_run_id = v_run.id
  );

  delete from public.factory_core_resource_projection_runs
  where onboarding_run_id = v_run.id;

  delete from public.factory_onboarding_runs
  where id = v_run.id;

  delete from public.hotel_health_certification_state
  where hotel_id in (v_run.production_hotel_id, v_run.sandbox_hotel_id);

  delete from public.hotel_config_publication_state
  where hotel_id in (v_run.production_hotel_id, v_run.sandbox_hotel_id);

  delete from public.hotel_config_projection_state
  where hotel_id in (v_run.production_hotel_id, v_run.sandbox_hotel_id);

  delete from public.property_environments
  where property_id = v_run.property_id;

  delete from public.hotel_config_revisions
  where hotel_id in (v_run.production_hotel_id, v_run.sandbox_hotel_id);

  delete from public.hotels where id = v_run.sandbox_hotel_id;
  delete from public.hotels where id = v_run.production_hotel_id;

  delete from public.properties where id = v_run.property_id;

  delete from public.organizations where id = v_run.organization_id
    and slug like 'proof-%'
    and not exists (
      select 1 from public.properties p where p.organization_id = v_run.organization_id
    )
    and not exists (
      select 1 from public.factory_onboarding_runs f where f.organization_id = v_run.organization_id
    )
    and not exists (
      select 1 from public.property_commercial_state s where s.organization_id = v_run.organization_id
    )
    and not exists (
      select 1 from public.property_commercial_lifecycle_events e where e.organization_id = v_run.organization_id
    );
  get diagnostics v_deleted_organization_count = row_count;

  return query
  select
    true,
    p_onboarding_run_id,
    v_run.production_hotel_id,
    v_run.sandbox_hotel_id,
    v_deleted_organization_count = 1;
end;
$function$;

revoke all on function public.discard_factory_onboarding_proof_v1(uuid, uuid, text, text)
from public, anon, authenticated;

grant execute on function public.discard_factory_onboarding_proof_v1(uuid, uuid, text, text)
to service_role;

comment on function public.discard_factory_onboarding_proof_v1(uuid, uuid, text, text) is
  'Deletes only proof:-namespaced Product Factory onboarding pairs before any P2.6 production gate, while preserving a control-plane audit tombstone.';

commit;
