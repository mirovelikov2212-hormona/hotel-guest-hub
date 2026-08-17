begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.property_commercial_state (
  property_id uuid primary key references public.properties(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  status text not null check (status in ('pending','trial','active_customer','suspended','ended')),
  plan_code text null check (plan_code ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  trial_started_at timestamptz null,
  trial_ends_at timestamptz null,
  contract_started_at timestamptz null,
  suspended_from_status text null check (suspended_from_status in ('trial','active_customer')),
  suspended_at timestamptz null,
  ended_at timestamptz null,
  version bigint not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (trial_started_at is null and trial_ends_at is null)
    or (trial_started_at is not null and trial_ends_at is not null and trial_ends_at > trial_started_at)
  ),
  check (status <> 'trial' or (trial_started_at is not null and trial_ends_at is not null)),
  check (status <> 'active_customer' or contract_started_at is not null),
  check (
    (status = 'suspended' and suspended_from_status is not null and suspended_at is not null)
    or (status <> 'suspended' and suspended_from_status is null and suspended_at is null)
  ),
  check ((status = 'ended' and ended_at is not null) or (status <> 'ended' and ended_at is null))
);

create index property_commercial_state_org_idx
  on public.property_commercial_state(organization_id);

create index property_commercial_state_status_idx
  on public.property_commercial_state(status);

create index property_commercial_state_trial_ends_idx
  on public.property_commercial_state(trial_ends_at)
  where status = 'trial';

alter table public.property_commercial_state enable row level security;
revoke all on table public.property_commercial_state from public, anon, authenticated, service_role;
grant select on table public.property_commercial_state to service_role;

create table public.property_commercial_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  request_hash text not null unique check (request_hash ~ '^[a-f0-9]{64}$'),
  actor_admin_id uuid not null references public.platform_admins(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  action text not null check (action in ('initialize','start_trial','extend_trial','convert_to_customer','suspend','resume','end')),
  previous_status text null check (previous_status is null or previous_status in ('pending','trial','active_customer','suspended','ended')),
  new_status text not null check (new_status in ('pending','trial','active_customer','suspended','ended')),
  previous_version bigint null,
  resulting_version bigint not null check (resulting_version >= 1),
  plan_code text null,
  trial_started_at timestamptz null,
  trial_ends_at timestamptz null,
  contract_started_at timestamptz null,
  reason text not null check (char_length(reason) between 3 and 1000),
  created_at timestamptz not null default now()
);

create index property_commercial_events_actor_idx
  on public.property_commercial_lifecycle_events(actor_admin_id);

create index property_commercial_events_property_idx
  on public.property_commercial_lifecycle_events(property_id, created_at desc);

create index property_commercial_events_org_idx
  on public.property_commercial_lifecycle_events(organization_id, created_at desc);

alter table public.property_commercial_lifecycle_events enable row level security;
revoke all on table public.property_commercial_lifecycle_events from public, anon, authenticated, service_role;
grant select on table public.property_commercial_lifecycle_events to service_role;

create or replace function public.transition_property_commercial_lifecycle_v1(
  p_actor_admin_id uuid,
  p_property_id uuid,
  p_request_id uuid,
  p_request_hash text,
  p_action text,
  p_expected_version bigint,
  p_effective_at timestamptz,
  p_trial_days integer,
  p_trial_ends_at timestamptz,
  p_plan_code text,
  p_reason text
)
returns table(
  property_id uuid,
  organization_id uuid,
  status text,
  plan_code text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  contract_started_at timestamptz,
  version bigint,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_admin_role text;
  v_property public.properties%rowtype;
  v_state public.property_commercial_state%rowtype;
  v_existing_event public.property_commercial_lifecycle_events%rowtype;
  v_previous_status text;
  v_previous_version bigint;
  v_now timestamptz := coalesce(p_effective_at, clock_timestamp());
  v_plan_code text;
  v_reason text;
  v_target_status text;
  v_target_trial_ends timestamptz;
  v_production_hotel_id uuid;
begin
  if p_actor_admin_id is null or p_property_id is null or p_request_id is null then
    raise exception 'P3_1_REQUIRED_ID_MISSING';
  end if;

  p_request_hash := lower(btrim(coalesce(p_request_hash, '')));
  p_action := lower(btrim(coalesce(p_action, '')));
  v_plan_code := nullif(lower(btrim(coalesce(p_plan_code, ''))), '');
  v_reason := btrim(coalesce(p_reason, ''));

  if p_request_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'P3_1_REQUEST_HASH_INVALID';
  end if;
  if p_action not in ('initialize','start_trial','extend_trial','convert_to_customer','suspend','resume','end') then
    raise exception 'P3_1_ACTION_INVALID';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 1000 then
    raise exception 'P3_1_REASON_INVALID';
  end if;
  if v_plan_code is not null and v_plan_code !~ '^[a-z0-9][a-z0-9_-]{0,62}$' then
    raise exception 'P3_1_PLAN_CODE_INVALID';
  end if;

  select role
  into v_admin_role
  from public.platform_admins
  where id = p_actor_admin_id
    and active = true;

  if v_admin_role is null or v_admin_role not in ('super_admin','operator') then
    raise exception 'P3_1_FACTORY_ADMIN_FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:p3.1:commercial:' || p_property_id::text, 0));

  select *
  into v_existing_event
  from public.property_commercial_lifecycle_events as pcle
  where pcle.request_id = p_request_id
  for update;

  if found then
    if v_existing_event.request_hash <> p_request_hash
      or v_existing_event.property_id <> p_property_id
      or v_existing_event.action <> p_action then
      raise exception 'P3_1_IDEMPOTENCY_CONFLICT';
    end if;

    select *
    into v_state
    from public.property_commercial_state as pcs
    where pcs.property_id = p_property_id
    for update;

    if not found
      or v_state.status <> v_existing_event.new_status
      or v_state.version <> v_existing_event.resulting_version
      or v_state.plan_code is distinct from v_existing_event.plan_code
      or v_state.trial_started_at is distinct from v_existing_event.trial_started_at
      or v_state.trial_ends_at is distinct from v_existing_event.trial_ends_at
      or v_state.contract_started_at is distinct from v_existing_event.contract_started_at then
      raise exception 'P3_1_REPLAY_STATE_DRIFT';
    end if;

    return query
    select
      v_state.property_id,
      v_state.organization_id,
      v_state.status,
      v_state.plan_code,
      v_state.trial_started_at,
      v_state.trial_ends_at,
      v_state.contract_started_at,
      v_state.version,
      true;
    return;
  end if;

  select *
  into v_property
  from public.properties
  where id = p_property_id
  for update;

  if not found then
    raise exception 'P3_1_PROPERTY_NOT_FOUND';
  end if;

  if v_property.lifecycle_state in ('suspended','archived') then
    raise exception 'P3_1_PROPERTY_TECHNICAL_STATE_BLOCKED';
  end if;

  select *
  into v_state
  from public.property_commercial_state as pcs
  where pcs.property_id = p_property_id
  for update;

  if p_action = 'initialize' then
    if found then
      raise exception 'P3_1_COMMERCIAL_STATE_ALREADY_EXISTS';
    end if;
    if p_expected_version is not null then
      raise exception 'P3_1_EXPECTED_VERSION_INVALID';
    end if;

    insert into public.property_commercial_state(
      property_id,
      organization_id,
      status,
      version
    )
    values(
      v_property.id,
      v_property.organization_id,
      'pending',
      1
    )
    returning * into v_state;

    v_previous_status := null;
    v_previous_version := null;
  else
    if not found then
      raise exception 'P3_1_COMMERCIAL_STATE_MISSING';
    end if;
    if v_state.organization_id <> v_property.organization_id then
      raise exception 'P3_1_COMMERCIAL_ORGANIZATION_DRIFT';
    end if;
    if p_expected_version is null or p_expected_version <> v_state.version then
      raise exception 'P3_1_VERSION_CONFLICT';
    end if;

    v_previous_status := v_state.status;
    v_previous_version := v_state.version;

    if p_action in ('start_trial','convert_to_customer','resume') then
      if v_property.lifecycle_state not in ('pilot','active') then
        raise exception 'P3_1_PRODUCTION_NOT_LIVE';
      end if;

      select h.id
      into v_production_hotel_id
      from public.property_environments pe
      join public.hotels h on h.id = pe.hotel_id
      where pe.property_id = v_property.id
        and pe.environment = 'production'
        and h.active = true
        and h.is_sandbox = false
        and h.is_demo = false
      limit 1;

      if v_production_hotel_id is null then
        raise exception 'P3_1_PRODUCTION_NOT_LIVE';
      end if;
    end if;

    if p_action = 'start_trial' then
      if v_state.status <> 'pending' then
        raise exception 'P3_1_START_TRIAL_STATE_INVALID';
      end if;
      if p_trial_days is null or p_trial_days < 1 or p_trial_days > 60 then
        raise exception 'P3_1_TRIAL_DAYS_INVALID';
      end if;
      if p_trial_ends_at is not null then
        raise exception 'P3_1_TRIAL_END_NOT_ALLOWED';
      end if;

      v_target_trial_ends := v_now + make_interval(days => p_trial_days);

      update public.property_commercial_state as pcs
      set
        status = 'trial',
        plan_code = coalesce(v_plan_code, 'full_trial'),
        trial_started_at = v_now,
        trial_ends_at = v_target_trial_ends,
        contract_started_at = null,
        suspended_from_status = null,
        suspended_at = null,
        ended_at = null,
        version = pcs.version + 1,
        updated_at = v_now
      where pcs.property_id = v_property.id
        and pcs.version = p_expected_version
        and pcs.status = 'pending'
      returning * into v_state;

    elsif p_action = 'extend_trial' then
      if v_state.status <> 'trial' then
        raise exception 'P3_1_EXTEND_TRIAL_STATE_INVALID';
      end if;
      if p_trial_days is not null then
        raise exception 'P3_1_TRIAL_DAYS_NOT_ALLOWED';
      end if;
      if p_trial_ends_at is null
        or p_trial_ends_at <= greatest(v_state.trial_ends_at, v_now)
        or p_trial_ends_at > v_state.trial_started_at + interval '180 days' then
        raise exception 'P3_1_TRIAL_EXTENSION_INVALID';
      end if;

      update public.property_commercial_state as pcs
      set
        trial_ends_at = p_trial_ends_at,
        version = pcs.version + 1,
        updated_at = v_now
      where pcs.property_id = v_property.id
        and pcs.version = p_expected_version
        and pcs.status = 'trial'
      returning * into v_state;

    elsif p_action = 'convert_to_customer' then
      if v_state.status not in ('pending','trial','suspended') then
        raise exception 'P3_1_CONVERT_STATE_INVALID';
      end if;
      if v_plan_code is null then
        raise exception 'P3_1_CUSTOMER_PLAN_REQUIRED';
      end if;

      update public.property_commercial_state as pcs
      set
        status = 'active_customer',
        plan_code = v_plan_code,
        contract_started_at = coalesce(pcs.contract_started_at, v_now),
        suspended_from_status = null,
        suspended_at = null,
        ended_at = null,
        version = pcs.version + 1,
        updated_at = v_now
      where pcs.property_id = v_property.id
        and pcs.version = p_expected_version
        and pcs.status in ('pending','trial','suspended')
      returning * into v_state;

    elsif p_action = 'suspend' then
      if v_state.status not in ('trial','active_customer') then
        raise exception 'P3_1_SUSPEND_STATE_INVALID';
      end if;

      v_target_status := v_state.status;

      update public.property_commercial_state as pcs
      set
        status = 'suspended',
        suspended_from_status = v_target_status,
        suspended_at = v_now,
        version = pcs.version + 1,
        updated_at = v_now
      where pcs.property_id = v_property.id
        and pcs.version = p_expected_version
        and pcs.status = v_target_status
      returning * into v_state;

    elsif p_action = 'resume' then
      if v_state.status <> 'suspended' then
        raise exception 'P3_1_RESUME_STATE_INVALID';
      end if;
      if v_state.suspended_from_status = 'trial' and (v_state.trial_ends_at is null or v_state.trial_ends_at <= v_now) then
        raise exception 'P3_1_TRIAL_EXPIRED';
      end if;
      if v_state.suspended_from_status = 'active_customer' and v_state.contract_started_at is null then
        raise exception 'P3_1_CUSTOMER_CONTRACT_STATE_INVALID';
      end if;

      v_target_status := v_state.suspended_from_status;

      update public.property_commercial_state as pcs
      set
        status = v_target_status,
        suspended_from_status = null,
        suspended_at = null,
        version = pcs.version + 1,
        updated_at = v_now
      where pcs.property_id = v_property.id
        and pcs.version = p_expected_version
        and pcs.status = 'suspended'
      returning * into v_state;

    elsif p_action = 'end' then
      if v_state.status = 'ended' then
        raise exception 'P3_1_END_STATE_INVALID';
      end if;

      update public.property_commercial_state as pcs
      set
        status = 'ended',
        suspended_from_status = null,
        suspended_at = null,
        ended_at = v_now,
        version = pcs.version + 1,
        updated_at = v_now
      where pcs.property_id = v_property.id
        and pcs.version = p_expected_version
        and pcs.status <> 'ended'
      returning * into v_state;
    end if;

    if not found then
      raise exception 'P3_1_COMMERCIAL_CAS_FAILED';
    end if;
  end if;

  insert into public.property_commercial_lifecycle_events(
    request_id,
    request_hash,
    actor_admin_id,
    organization_id,
    property_id,
    action,
    previous_status,
    new_status,
    previous_version,
    resulting_version,
    plan_code,
    trial_started_at,
    trial_ends_at,
    contract_started_at,
    reason
  )
  values(
    p_request_id,
    p_request_hash,
    p_actor_admin_id,
    v_property.organization_id,
    v_property.id,
    p_action,
    v_previous_status,
    v_state.status,
    v_previous_version,
    v_state.version,
    v_state.plan_code,
    v_state.trial_started_at,
    v_state.trial_ends_at,
    v_state.contract_started_at,
    v_reason
  );

  insert into public.control_plane_audit_log(
    actor_admin_id,
    organization_id,
    property_id,
    hotel_id,
    action,
    resource_type,
    resource_id,
    metadata_json
  )
  values(
    p_actor_admin_id,
    v_property.organization_id,
    v_property.id,
    v_production_hotel_id,
    'property_commercial_' || p_action,
    'property_commercial_state',
    v_property.id::text,
    jsonb_build_object(
      'schemaVersion','p3.1',
      'requestId',p_request_id,
      'requestHash',p_request_hash,
      'previousStatus',v_previous_status,
      'status',v_state.status,
      'version',v_state.version,
      'planCode',v_state.plan_code,
      'trialStartedAt',v_state.trial_started_at,
      'trialEndsAt',v_state.trial_ends_at,
      'contractStartedAt',v_state.contract_started_at
    )
  );

  return query
  select
    v_state.property_id,
    v_state.organization_id,
    v_state.status,
    v_state.plan_code,
    v_state.trial_started_at,
    v_state.trial_ends_at,
    v_state.contract_started_at,
    v_state.version,
    false;
end;
$function$;

revoke all on function public.transition_property_commercial_lifecycle_v1(
  uuid, uuid, uuid, text, text, bigint, timestamptz, integer, timestamptz, text, text
) from public, anon, authenticated;

grant execute on function public.transition_property_commercial_lifecycle_v1(
  uuid, uuid, uuid, text, text, bigint, timestamptz, integer, timestamptz, text, text
) to service_role;

commit;
