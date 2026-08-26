begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists public.factory_communications_projection_runs (
  id uuid primary key default gen_random_uuid(),
  operational_projection_run_id uuid not null
    references public.factory_operational_resource_projection_runs(id) on delete restrict,
  communications_hash text not null,
  actor_admin_id uuid not null
    references public.platform_admins(id) on delete restrict,
  production_hotel_id uuid not null
    references public.hotels(id) on delete restrict,
  sandbox_hotel_id uuid not null
    references public.hotels(id) on delete restrict,
  departments_count integer not null,
  configured_departments_count integer not null,
  phone_channels_count integer not null,
  whatsapp_channels_count integer not null,
  email_channels_count integer not null,
  status text not null default 'completed',
  created_at timestamptz not null default now(),
  constraint factory_communications_projection_operational_unique
    unique (operational_projection_run_id),
  constraint factory_communications_projection_hash_check
    check (communications_hash ~ '^[a-f0-9]{64}$'),
  constraint factory_communications_projection_counts_check
    check (
      departments_count > 0
      and configured_departments_count >= 0
      and configured_departments_count <= departments_count
      and phone_channels_count >= 0
      and phone_channels_count <= departments_count
      and whatsapp_channels_count >= 0
      and whatsapp_channels_count <= departments_count
      and email_channels_count >= 0
      and email_channels_count <= departments_count
    ),
  constraint factory_communications_projection_status_check
    check (status = 'completed')
);

create index if not exists factory_communications_projection_actor_idx
  on public.factory_communications_projection_runs (actor_admin_id, created_at desc);
create index if not exists factory_communications_projection_production_idx
  on public.factory_communications_projection_runs (production_hotel_id, created_at desc);
create index if not exists factory_communications_projection_sandbox_idx
  on public.factory_communications_projection_runs (sandbox_hotel_id, created_at desc);

alter table public.factory_communications_projection_runs enable row level security;
revoke all on table public.factory_communications_projection_runs from anon, authenticated;
revoke all on table public.factory_communications_projection_runs from service_role;
grant select, insert on table public.factory_communications_projection_runs to service_role;

alter table public.departments
  add column if not exists phone_number text,
  add column if not exists factory_communications_managed boolean not null default false,
  add column if not exists factory_communications_projection_run_id uuid
    references public.factory_communications_projection_runs(id) on delete restrict;

create index if not exists departments_factory_communications_projection_idx
  on public.departments (factory_communications_projection_run_id)
  where factory_communications_projection_run_id is not null;

alter table public.departments
  add constraint departments_phone_number_length_check
    check (phone_number is null or char_length(phone_number) <= 160),
  add constraint departments_factory_communications_ownership_check
    check (
      factory_communications_managed = false
      or factory_communications_projection_run_id is not null
    );

create or replace function public.project_factory_guided_communications_v1(
  p_actor_admin_id uuid,
  p_operational_projection_run_id uuid,
  p_blueprint_hash text,
  p_operational_resources_hash text,
  p_communications_hash text,
  p_communications jsonb
)
returns table (
  projection_run_id uuid,
  production_hotel_id uuid,
  sandbox_hotel_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $project_factory_guided_communications_v1$
declare
  v_actor_role text;
  v_operational public.factory_operational_resource_projection_runs%rowtype;
  v_core public.factory_core_resource_projection_runs%rowtype;
  v_onboarding public.factory_onboarding_runs%rowtype;
  v_envelope public.factory_onboarding_envelope_projection_runs%rowtype;
  v_native public.factory_native_content_projection_runs%rowtype;
  v_existing public.factory_communications_projection_runs%rowtype;
  v_contacts jsonb;
  v_departments_count integer;
  v_configured_count integer;
  v_phone_count integer;
  v_whatsapp_count integer;
  v_email_count integer;
  v_projection_run_id uuid;
  v_mutated_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_admin_id is null or p_operational_projection_run_id is null then
    raise exception 'P2D_COMMUNICATION_REQUIRED_ID_MISSING';
  end if;

  select pa.role
    into v_actor_role
  from public.platform_admins pa
  where pa.id = p_actor_admin_id
    and pa.active = true;

  if v_actor_role is null or v_actor_role not in ('super_admin', 'operator') then
    raise exception 'P2D_COMMUNICATION_FACTORY_ADMIN_FORBIDDEN';
  end if;

  p_blueprint_hash := lower(btrim(coalesce(p_blueprint_hash, '')));
  p_operational_resources_hash := lower(btrim(coalesce(p_operational_resources_hash, '')));
  p_communications_hash := lower(btrim(coalesce(p_communications_hash, '')));
  if p_blueprint_hash !~ '^[a-f0-9]{64}$'
     or p_operational_resources_hash !~ '^[a-f0-9]{64}$'
     or p_communications_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'P2D_COMMUNICATION_HASH_INVALID';
  end if;

  if p_communications is null or jsonb_typeof(p_communications) <> 'object' then
    raise exception 'P2D_COMMUNICATION_OBJECT_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'stayhub:step2d:communications:' || p_operational_projection_run_id::text,
      0
    )
  );

  select opr.*
    into v_operational
  from public.factory_operational_resource_projection_runs opr
  where opr.id = p_operational_projection_run_id
    and opr.status = 'completed'
  for update;
  if not found then
    raise exception 'P2D_COMMUNICATION_OPERATIONAL_RUN_MISSING';
  end if;

  if v_operational.operational_resources_hash <> p_operational_resources_hash then
    raise exception 'P2D_COMMUNICATION_OPERATIONAL_HASH_MISMATCH';
  end if;

  select cpr.*
    into v_core
  from public.factory_core_resource_projection_runs cpr
  where cpr.id = v_operational.core_projection_run_id
    and cpr.status = 'completed'
  for update;
  if not found then
    raise exception 'P2D_COMMUNICATION_CORE_RUN_MISSING';
  end if;

  select obr.*
    into v_onboarding
  from public.factory_onboarding_runs obr
  where obr.id = v_core.onboarding_run_id
    and obr.status = 'completed'
  for update;
  if not found then
    raise exception 'P2D_COMMUNICATION_ONBOARDING_RUN_MISSING';
  end if;

  if v_onboarding.blueprint_hash <> p_blueprint_hash then
    raise exception 'P2D_COMMUNICATION_BLUEPRINT_HASH_MISMATCH';
  end if;

  select epr.*
    into v_envelope
  from public.factory_onboarding_envelope_projection_runs epr
  where epr.operational_projection_run_id = p_operational_projection_run_id
    and epr.status = 'completed'
  for update;
  if not found then
    raise exception 'P2D_COMMUNICATION_ENVELOPE_REQUIRED';
  end if;

  select npr.*
    into v_native
  from public.factory_native_content_projection_runs npr
  where npr.operational_projection_run_id = p_operational_projection_run_id
    and npr.status = 'completed'
  for update;
  if not found
     or v_native.production_hotel_id <> v_onboarding.production_hotel_id
     or v_native.sandbox_hotel_id <> v_onboarding.sandbox_hotel_id then
    raise exception 'P2D_COMMUNICATION_NATIVE_PROJECTION_REQUIRED';
  end if;

  if not exists (
      select 1
      from public.hotels h
      where h.id = v_onboarding.production_hotel_id
        and h.active = false
        and h.is_sandbox = false
    )
    or not exists (
      select 1
      from public.hotels h
      where h.id = v_onboarding.sandbox_hotel_id
        and h.active = false
        and h.is_sandbox = true
        and h.production_hotel_id = v_onboarding.production_hotel_id
    )
    or not exists (
      select 1
      from public.properties p
      where p.id = v_onboarding.property_id
        and p.lifecycle_state = 'draft'
    ) then
    raise exception 'P2D_COMMUNICATION_STATE_NOT_FAIL_CLOSED';
  end if;

  if (select count(*)
      from public.hotel_knowledge_configs k
      where k.hotel_id in (v_onboarding.production_hotel_id, v_onboarding.sandbox_hotel_id)
        and k.factory_managed = true
        and k.factory_projection_run_id = v_native.id
        and k.status = 'placeholder') <> 2
     or exists (
       select 1
       from public.venues venue
       where venue.factory_projection_run_id = v_native.id
         and venue.active = true
     ) then
    raise exception 'P2D_COMMUNICATION_NATIVE_FAIL_CLOSED_STATE_INVALID';
  end if;

  if p_communications->>'schema_version' <> 'step2d-communications-v1' then
    raise exception 'P2D_COMMUNICATION_SCHEMA_VERSION_INVALID';
  end if;

  v_contacts := p_communications->'department_contacts';
  if jsonb_typeof(v_contacts) <> 'array' then
    raise exception 'P2D_COMMUNICATION_CONTACTS_ARRAY_REQUIRED';
  end if;

  v_departments_count := jsonb_array_length(v_contacts);
  if v_departments_count < 1 or v_departments_count > 64
     or v_departments_count <> v_core.departments_count then
    raise exception 'P2D_COMMUNICATION_DEPARTMENT_COUNT_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_contacts) as contact(
      department_code text,
      phone text,
      whatsapp text,
      email text
    )
    where contact.department_code !~ '^[a-z][a-z0-9_-]{0,62}$'
      or length(coalesce(contact.phone, '')) > 160
      or length(coalesce(contact.whatsapp, '')) > 160
      or length(coalesce(contact.email, '')) > 320
      or (
        nullif(btrim(coalesce(contact.email, '')), '') is not null
        and btrim(contact.email) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
      )
  ) then
    raise exception 'P2D_COMMUNICATION_CONTACT_INVALID';
  end if;

  if exists (
    select contact.department_code
    from jsonb_to_recordset(v_contacts) as contact(department_code text)
    group by contact.department_code
    having count(*) > 1
  ) then
    raise exception 'P2D_COMMUNICATION_DEPARTMENT_DUPLICATED';
  end if;

  if (select count(*) from public.departments d
      where d.hotel_id = v_onboarding.production_hotel_id) <> v_departments_count
     or (select count(*) from public.departments d
         where d.hotel_id = v_onboarding.sandbox_hotel_id) <> v_departments_count
     or exists (
       select 1
       from jsonb_to_recordset(v_contacts) as contact(department_code text)
       where not exists (
         select 1 from public.departments d
         where d.hotel_id = v_onboarding.production_hotel_id
           and d.code = contact.department_code
       )
       or not exists (
         select 1 from public.departments d
         where d.hotel_id = v_onboarding.sandbox_hotel_id
           and d.code = contact.department_code
       )
     ) then
    raise exception 'P2D_COMMUNICATION_DEPARTMENT_AUTHORITY_MISMATCH';
  end if;

  select cpr.*
    into v_existing
  from public.factory_communications_projection_runs cpr
  where cpr.operational_projection_run_id = p_operational_projection_run_id;

  if found then
    if v_existing.communications_hash <> p_communications_hash
       or v_existing.production_hotel_id <> v_onboarding.production_hotel_id
       or v_existing.sandbox_hotel_id <> v_onboarding.sandbox_hotel_id then
      raise exception 'P2D_COMMUNICATION_IDEMPOTENCY_CONFLICT';
    end if;

    if (select count(*)
        from public.departments d
        join jsonb_to_recordset(v_contacts) as contact(
          department_code text,
          phone text,
          whatsapp text,
          email text
        ) on contact.department_code = d.code
        where d.hotel_id in (v_onboarding.production_hotel_id, v_onboarding.sandbox_hotel_id)
          and d.factory_communications_managed = true
          and d.factory_communications_projection_run_id = v_existing.id
          and d.phone_number is not distinct from nullif(btrim(coalesce(contact.phone, '')), '')
          and d.whatsapp_number is not distinct from nullif(btrim(coalesce(contact.whatsapp, '')), '')
          and d.email is not distinct from nullif(btrim(coalesce(contact.email, '')), '')
       ) <> (v_departments_count * 2) then
      raise exception 'P2D_COMMUNICATION_REPLAY_STATE_INVALID';
    end if;

    return query
    select v_existing.id, v_existing.production_hotel_id,
      v_existing.sandbox_hotel_id, true;
    return;
  end if;

  if exists (
    select 1
    from public.departments d
    join jsonb_to_recordset(v_contacts) as contact(
      department_code text,
      phone text,
      whatsapp text,
      email text
    ) on contact.department_code = d.code
    where d.hotel_id in (v_onboarding.production_hotel_id, v_onboarding.sandbox_hotel_id)
      and (
        d.factory_communications_managed = true
        or d.factory_communications_projection_run_id is not null
        or (d.phone_number is not null and d.phone_number is distinct from nullif(btrim(coalesce(contact.phone, '')), ''))
        or (d.whatsapp_number is not null and d.whatsapp_number is distinct from nullif(btrim(coalesce(contact.whatsapp, '')), ''))
        or (d.email is not null and d.email is distinct from nullif(btrim(coalesce(contact.email, '')), ''))
      )
  ) then
    raise exception 'P2D_COMMUNICATION_EXISTING_CONTACT_CONFLICT';
  end if;

  select
    count(*) filter (
      where nullif(btrim(coalesce(contact.phone, '')), '') is not null
         or nullif(btrim(coalesce(contact.whatsapp, '')), '') is not null
         or nullif(btrim(coalesce(contact.email, '')), '') is not null
    ),
    count(*) filter (where nullif(btrim(coalesce(contact.phone, '')), '') is not null),
    count(*) filter (where nullif(btrim(coalesce(contact.whatsapp, '')), '') is not null),
    count(*) filter (where nullif(btrim(coalesce(contact.email, '')), '') is not null)
    into v_configured_count, v_phone_count, v_whatsapp_count, v_email_count
  from jsonb_to_recordset(v_contacts) as contact(phone text, whatsapp text, email text);

  insert into public.factory_communications_projection_runs (
    operational_projection_run_id,
    communications_hash,
    actor_admin_id,
    production_hotel_id,
    sandbox_hotel_id,
    departments_count,
    configured_departments_count,
    phone_channels_count,
    whatsapp_channels_count,
    email_channels_count,
    status
  ) values (
    p_operational_projection_run_id,
    p_communications_hash,
    p_actor_admin_id,
    v_onboarding.production_hotel_id,
    v_onboarding.sandbox_hotel_id,
    v_departments_count,
    v_configured_count,
    v_phone_count,
    v_whatsapp_count,
    v_email_count,
    'completed'
  ) returning id into v_projection_run_id;

  update public.departments d
  set phone_number = nullif(btrim(coalesce(contact.phone, '')), ''),
      whatsapp_number = nullif(btrim(coalesce(contact.whatsapp, '')), ''),
      email = nullif(btrim(coalesce(contact.email, '')), ''),
      factory_communications_managed = true,
      factory_communications_projection_run_id = v_projection_run_id,
      updated_at = v_now
  from jsonb_to_recordset(v_contacts) as contact(
    department_code text,
    phone text,
    whatsapp text,
    email text
  )
  where d.hotel_id in (v_onboarding.production_hotel_id, v_onboarding.sandbox_hotel_id)
    and d.code = contact.department_code;
  get diagnostics v_mutated_count = row_count;

  if v_mutated_count <> (v_departments_count * 2) then
    raise exception 'P2D_COMMUNICATION_PROJECTION_COUNT_INVALID';
  end if;

  if exists (
    select 1 from public.hotels h
    where h.id in (v_onboarding.production_hotel_id, v_onboarding.sandbox_hotel_id)
      and h.active = true
  ) then
    raise exception 'P2D_COMMUNICATION_ACTIVATION_FORBIDDEN';
  end if;

  insert into public.control_plane_audit_log (
    actor_admin_id,
    organization_id,
    property_id,
    hotel_id,
    action,
    resource_type,
    resource_id,
    metadata_json
  ) values (
    p_actor_admin_id,
    v_onboarding.organization_id,
    v_onboarding.property_id,
    v_onboarding.production_hotel_id,
    'factory_guided_communications_ready',
    'factory_communications_projection_run',
    v_projection_run_id::text,
    jsonb_build_object(
      'stage', 'step2d.2',
      'envelopeProjectionRunId', v_envelope.id,
      'nativeProjectionRunId', v_native.id,
      'operationalProjectionRunId', p_operational_projection_run_id,
      'communicationsHash', p_communications_hash,
      'departmentsCount', v_departments_count,
      'configuredDepartmentsCount', v_configured_count,
      'productionActive', false,
      'sandboxActive', false
    )
  );

  return query
  select v_projection_run_id, v_onboarding.production_hotel_id,
    v_onboarding.sandbox_hotel_id, false;
end;
$project_factory_guided_communications_v1$;

revoke all on function public.project_factory_guided_communications_v1(
  uuid,uuid,text,text,text,jsonb
) from public,anon,authenticated;
grant execute on function public.project_factory_guided_communications_v1(
  uuid,uuid,text,text,text,jsonb
) to service_role;

create or replace function public.certify_factory_sandbox_after_communications_v1(
  p_actor_admin_id uuid,
  p_envelope_projection_run_id uuid,
  p_evidence_hash text,
  p_checks jsonb
)
returns table(
  certification_run_id uuid,
  sandbox_hotel_id uuid,
  sandbox_revision_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $certify_factory_sandbox_after_communications_v1$
declare
  v_envelope public.factory_onboarding_envelope_projection_runs%rowtype;
  v_operational public.factory_operational_resource_projection_runs%rowtype;
  v_communications public.factory_communications_projection_runs%rowtype;
  v_result record;
begin
  if p_actor_admin_id is null or p_envelope_projection_run_id is null then
    raise exception 'P2D_SANDBOX_COMMUNICATION_REQUIRED_ID_MISSING';
  end if;

  select epr.* into v_envelope
  from public.factory_onboarding_envelope_projection_runs epr
  where epr.id = p_envelope_projection_run_id
    and epr.status = 'completed';
  if not found then
    raise exception 'P2D_SANDBOX_COMMUNICATION_ENVELOPE_INVALID';
  end if;

  select opr.* into v_operational
  from public.factory_operational_resource_projection_runs opr
  where opr.id = v_envelope.operational_projection_run_id
    and opr.status = 'completed';
  if not found then
    raise exception 'P2D_SANDBOX_COMMUNICATION_OPERATIONAL_INVALID';
  end if;

  select cpr.* into v_communications
  from public.factory_communications_projection_runs cpr
  where cpr.operational_projection_run_id = v_operational.id
    and cpr.status = 'completed';
  if not found then
    raise exception 'P2D_SANDBOX_COMMUNICATION_PROJECTION_REQUIRED';
  end if;

  if (select count(*)
      from public.departments d
      where d.hotel_id in (
          v_communications.production_hotel_id,
          v_communications.sandbox_hotel_id
        )
        and d.factory_communications_managed = true
        and d.factory_communications_projection_run_id = v_communications.id
     ) <> (v_communications.departments_count * 2) then
    raise exception 'P2D_SANDBOX_COMMUNICATION_STATE_INVALID';
  end if;

  select * into v_result
  from public.certify_factory_sandbox_after_native_v1(
    p_actor_admin_id,
    p_envelope_projection_run_id,
    p_evidence_hash,
    p_checks
  );

  return query
  select v_result.certification_run_id,
    v_result.sandbox_hotel_id,
    v_result.sandbox_revision_id,
    v_result.replayed;
end;
$certify_factory_sandbox_after_communications_v1$;

revoke all on function public.certify_factory_sandbox_after_communications_v1(
  uuid,uuid,text,jsonb
) from public,anon,authenticated;
grant execute on function public.certify_factory_sandbox_after_communications_v1(
  uuid,uuid,text,jsonb
) to service_role;

commit;
