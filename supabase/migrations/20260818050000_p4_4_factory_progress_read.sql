create or replace function public.get_factory_onboarding_progress_v1(
  p_onboarding_run_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_result jsonb;
begin
  if p_onboarding_run_id is null then
    select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb)
      into v_result
    from (
      select
        o.created_at,
        jsonb_build_object(
          'onboardingRunId', o.id,
          'blueprintHash', o.blueprint_hash,
          'createdAt', o.created_at,
          'property', jsonb_build_object(
            'id', p.id,
            'propertyKey', p.property_key,
            'displayName', p.display_name,
            'lifecycleState', p.lifecycle_state
          ),
          'production', jsonb_build_object(
            'hotelId', prod.id,
            'slug', prod.slug,
            'publicSlug', prod.public_slug,
            'active', prod.active,
            'isSandbox', prod.is_sandbox,
            'isDemo', prod.is_demo
          ),
          'sandbox', jsonb_build_object(
            'hotelId', sb.id,
            'slug', sb.slug,
            'publicSlug', sb.public_slug,
            'active', sb.active,
            'isSandbox', sb.is_sandbox,
            'isDemo', sb.is_demo
          ),
          'coreCompleted', c.id is not null,
          'operationalCompleted', op.id is not null,
          'envelopeCompleted', env.id is not null,
          'currentStage',
            case
              when env.id is not null then 'envelope'
              when op.id is not null then 'operational'
              when c.id is not null then 'core'
              else 'foundation'
            end
        ) as item
      from public.factory_onboarding_runs o
      join public.properties p on p.id = o.property_id
      join public.hotels prod on prod.id = o.production_hotel_id
      join public.hotels sb on sb.id = o.sandbox_hotel_id
      left join public.factory_core_resource_projection_runs c
        on c.onboarding_run_id = o.id and c.status = 'completed'
      left join public.factory_operational_resource_projection_runs op
        on op.core_projection_run_id = c.id and op.status = 'completed'
      left join public.factory_onboarding_envelope_projection_runs env
        on env.operational_projection_run_id = op.id and env.status = 'completed'
      where o.status = 'completed'
      order by o.created_at desc
      limit v_limit
    ) q;

    return jsonb_build_object('runs', v_result);
  end if;

  select jsonb_build_object(
    'onboardingRunId', o.id,
    'blueprintHash', o.blueprint_hash,
    'blueprint', o.blueprint_json,
    'createdAt', o.created_at,
    'property', jsonb_build_object(
      'id', p.id,
      'propertyKey', p.property_key,
      'displayName', p.display_name,
      'lifecycleState', p.lifecycle_state
    ),
    'production', jsonb_build_object(
      'hotelId', prod.id,
      'slug', prod.slug,
      'publicSlug', prod.public_slug,
      'active', prod.active,
      'isSandbox', prod.is_sandbox,
      'isDemo', prod.is_demo
    ),
    'sandbox', jsonb_build_object(
      'hotelId', sb.id,
      'slug', sb.slug,
      'publicSlug', sb.public_slug,
      'active', sb.active,
      'isSandbox', sb.is_sandbox,
      'isDemo', sb.is_demo
    ),
    'foundation', jsonb_build_object(
      'status', o.status,
      'productionRevisionId', o.production_revision_id,
      'sandboxRevisionId', o.sandbox_revision_id,
      'completedAt', o.completed_at
    ),
    'core',
      case when c.id is null then null else jsonb_build_object(
        'projectionRunId', c.id,
        'status', c.status,
        'productionRevisionId', c.production_revision_id,
        'sandboxRevisionId', c.sandbox_revision_id,
        'roomsCount', c.rooms_count,
        'activeRoomsCount', c.active_rooms_count,
        'departmentsCount', c.departments_count,
        'activeDepartmentsCount', c.active_departments_count,
        'createdAt', c.created_at
      ) end,
    'operational',
      case when op.id is null then null else jsonb_build_object(
        'projectionRunId', op.id,
        'status', op.status,
        'productionRevisionId', op.production_revision_id,
        'sandboxRevisionId', op.sandbox_revision_id,
        'servicesCount', op.services_count,
        'workflowsCount', op.workflows_count,
        'integrationsCount', op.integrations_count,
        'routingRulesCount', op.routing_rules_count,
        'createdAt', op.created_at
      ) end,
    'envelope',
      case when env.id is null then null else jsonb_build_object(
        'projectionRunId', env.id,
        'status', env.status,
        'productionRevisionId', env.production_revision_id,
        'sandboxRevisionId', env.sandbox_revision_id,
        'roleTemplatesCount', env.role_templates_count,
        'createdAt', env.created_at
      ) end,
    'nextStage',
      case
        when env.id is not null then 'sandbox_certification'
        when op.id is not null then 'envelope'
        when c.id is not null then 'operational'
        else 'core'
      end
  )
    into v_result
  from public.factory_onboarding_runs o
  join public.properties p on p.id = o.property_id
  join public.hotels prod on prod.id = o.production_hotel_id
  join public.hotels sb on sb.id = o.sandbox_hotel_id
  left join public.factory_core_resource_projection_runs c
    on c.onboarding_run_id = o.id and c.status = 'completed'
  left join public.factory_operational_resource_projection_runs op
    on op.core_projection_run_id = c.id and op.status = 'completed'
  left join public.factory_onboarding_envelope_projection_runs env
    on env.operational_projection_run_id = op.id and env.status = 'completed'
  where o.id = p_onboarding_run_id
    and o.status = 'completed';

  return v_result;
end;
$$;

revoke all on function public.get_factory_onboarding_progress_v1(uuid, integer) from public;
revoke all on function public.get_factory_onboarding_progress_v1(uuid, integer) from anon;
revoke all on function public.get_factory_onboarding_progress_v1(uuid, integer) from authenticated;
grant execute on function public.get_factory_onboarding_progress_v1(uuid, integer) to service_role;
