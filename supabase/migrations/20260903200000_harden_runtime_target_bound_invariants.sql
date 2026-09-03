begin;

-- P5.5 follow-up hardening discovered by adversarial live proof.
--
-- P5.4 validates target scope/capacity when a cell is moved. The P5.5 target
-- mutation guard must preserve the same invariants in the opposite direction:
-- target metadata cannot be edited into a state that is incompatible with
-- cells/hotels already bound to it. The target row lock serializes these edits
-- with move_runtime_cell_target_v1(), which also locks the target row.

create or replace function public.guard_runtime_target_readiness_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_config_changed boolean := false;
  v_latest_status text;
  v_latest_valid_until timestamptz;
  v_bound_cell_count integer := 0;
  v_bound_hotel_count integer := 0;
  v_incompatible_cell_count integer := 0;
begin
  if tg_op = 'INSERT' then
    if new.generation <> 1 then
      raise exception 'RUNTIME_TARGET_GENERATION_INSERT_INVALID';
    end if;
    if new.routing_mode = 'active' then
      raise exception 'RUNTIME_TARGET_DIRECT_ACTIVE_FORBIDDEN';
    end if;
    return new;
  end if;

  -- Preserve P5.4 environment isolation for already-bound cells. A target may
  -- become shared, or may keep/move to a scope compatible with every bound cell,
  -- but it cannot strand bindings in a mismatched environment.
  if new.environment_scope is distinct from old.environment_scope
     and new.environment_scope <> 'shared' then
    select count(*)::integer
      into v_incompatible_cell_count
    from public.runtime_cells c
    where c.routing_target_key = old.target_key
      and c.environment_scope <> new.environment_scope;

    if v_incompatible_cell_count > 0 then
      raise exception 'RUNTIME_TARGET_ENVIRONMENT_BINDING_CONFLICT';
    end if;
  end if;

  -- Capacity can be increased freely, but cannot be reduced below current
  -- occupancy. This keeps registry capacity truthful after cells are bound.
  if new.max_cells is distinct from old.max_cells then
    select count(*)::integer
      into v_bound_cell_count
    from public.runtime_cells c
    where c.routing_target_key = old.target_key;

    if new.max_cells < v_bound_cell_count then
      raise exception 'RUNTIME_TARGET_CELL_CAPACITY_BELOW_OCCUPANCY';
    end if;
  end if;

  if new.max_hotels is distinct from old.max_hotels then
    select count(*)::integer
      into v_bound_hotel_count
    from public.hotel_runtime_cell_assignments a
    join public.runtime_cells c on c.id = a.cell_id
    where c.routing_target_key = old.target_key;

    if new.max_hotels < v_bound_hotel_count then
      raise exception 'RUNTIME_TARGET_HOTEL_CAPACITY_BELOW_OCCUPANCY';
    end if;
  end if;

  v_config_changed :=
    new.target_class is distinct from old.target_class
    or new.environment_scope is distinct from old.environment_scope
    or new.provider is distinct from old.provider
    or new.compute_ref is distinct from old.compute_ref
    or new.data_ref is distinct from old.data_ref
    or new.region is distinct from old.region
    or new.max_cells is distinct from old.max_cells
    or new.max_hotels is distinct from old.max_hotels;

  if v_config_changed then
    if new.generation is distinct from old.generation then
      raise exception 'RUNTIME_TARGET_GENERATION_MANAGED';
    end if;
    new.generation := old.generation + 1;
    if new.routing_mode = 'active' then
      new.routing_mode := 'shadow';
    end if;
  elsif new.generation is distinct from old.generation then
    raise exception 'RUNTIME_TARGET_GENERATION_MANAGED';
  end if;

  if new.lifecycle_state <> 'active' and new.routing_mode = 'active' then
    new.routing_mode := 'shadow';
  end if;

  if new.routing_mode = 'active' then
    if new.lifecycle_state <> 'active' then
      raise exception 'RUNTIME_TARGET_ACTIVATION_LIFECYCLE_INVALID';
    end if;
    if nullif(btrim(coalesce(new.compute_ref, '')), '') is null
       or nullif(btrim(coalesce(new.data_ref, '')), '') is null then
      raise exception 'RUNTIME_TARGET_ACTIVATION_CONFIGURATION_INCOMPLETE';
    end if;

    select e.status, e.valid_until
      into v_latest_status, v_latest_valid_until
    from public.runtime_target_verification_evidence e
    where e.target_key = new.target_key
      and e.target_generation = new.generation
    order by e.checked_at desc, e.id desc
    limit 1;

    if v_latest_status is distinct from 'passed' then
      raise exception 'RUNTIME_TARGET_ACTIVATION_VERIFICATION_REQUIRED';
    end if;
    if v_latest_valid_until is null or v_latest_valid_until <= clock_timestamp() then
      raise exception 'RUNTIME_TARGET_ACTIVATION_VERIFICATION_STALE';
    end if;
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$function$;

revoke all on function public.guard_runtime_target_readiness_v1()
  from public, anon, authenticated;

commit;
