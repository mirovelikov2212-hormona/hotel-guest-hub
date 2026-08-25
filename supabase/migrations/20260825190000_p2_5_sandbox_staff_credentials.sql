create or replace function public.provision_factory_sandbox_staff_credentials_v1(
  p_actor_admin_id uuid,
  p_sandbox_hotel_id uuid,
  p_expected_certified_revision_id uuid,
  p_credential_hashes jsonb,
  p_approval jsonb
)
returns table(
  sandbox_hotel_id uuid,
  certified_revision_id uuid,
  credential_count integer,
  roles text[]
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_role text;
  v_sandbox public.hotels%rowtype;
  v_property_id uuid;
  v_organization_id uuid;
  v_roles text[];
  v_role text;
  v_hash text;
  v_hash_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor_admin_id is null or p_sandbox_hotel_id is null or p_expected_certified_revision_id is null then
    raise exception 'P2_5_SANDBOX_CREDENTIAL_REQUIRED_ID_MISSING';
  end if;

  select pa.role
    into v_actor_role
  from public.platform_admins pa
  where pa.id = p_actor_admin_id
    and pa.active = true;

  if v_actor_role is null or v_actor_role not in ('super_admin', 'operator') then
    raise exception 'P2_5_SANDBOX_CREDENTIAL_ADMIN_FORBIDDEN';
  end if;

  if p_approval is distinct from jsonb_build_object(
    'provisionSandboxCredentials', true,
    'provisionProductionCredentials', false,
    'rotateExisting', true
  ) then
    raise exception 'P2_5_SANDBOX_CREDENTIAL_APPROVAL_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:p2.5:sandbox-credentials:' || p_sandbox_hotel_id::text, 0));

  select h.*
    into v_sandbox
  from public.hotels h
  where h.id = p_sandbox_hotel_id
  for update;

  if not found
     or v_sandbox.is_sandbox is distinct from true
     or v_sandbox.active is distinct from true
     or v_sandbox.production_hotel_id is null then
    raise exception 'P2_5_SANDBOX_CREDENTIAL_SANDBOX_INVALID';
  end if;

  if exists (
    select 1
    from public.hotels h
    where h.id = v_sandbox.production_hotel_id
      and h.active = true
  ) then
    raise exception 'P2_5_SANDBOX_CREDENTIAL_PRODUCTION_NOT_DARK';
  end if;

  if not exists (
    select 1
    from public.hotel_health_certification_state hs
    where hs.hotel_id = p_sandbox_hotel_id
      and hs.status = 'healthy'
      and hs.certification_status = 'passed'
      and hs.certified_revision_id = p_expected_certified_revision_id
  ) then
    raise exception 'P2_5_SANDBOX_CREDENTIAL_CERTIFICATION_MISMATCH';
  end if;

  if not exists (
    select 1
    from public.hotel_public_identity_configs pi
    where pi.hotel_id = p_sandbox_hotel_id
      and pi.status = 'certified'
  ) then
    raise exception 'P2_5_SANDBOX_CREDENTIAL_IDENTITY_NOT_CERTIFIED';
  end if;

  select pe.property_id, p.organization_id
    into v_property_id, v_organization_id
  from public.property_environments pe
  join public.properties p on p.id = pe.property_id
  where pe.hotel_id = p_sandbox_hotel_id
    and pe.environment = 'sandbox'
  limit 1;

  if v_property_id is null or v_organization_id is null then
    raise exception 'P2_5_SANDBOX_CREDENTIAL_PROPERTY_MAPPING_MISSING';
  end if;

  select array_agg(required_role order by required_role)
    into v_roles
  from (
    select 'manager'::text as required_role
    union
    select d.code::text
    from public.departments d
    where d.hotel_id = p_sandbox_hotel_id
      and d.active = true
  ) required;

  if coalesce(cardinality(v_roles), 0) < 2 then
    raise exception 'P2_5_SANDBOX_CREDENTIAL_ROLES_EMPTY';
  end if;

  if p_credential_hashes is null or jsonb_typeof(p_credential_hashes) <> 'object' then
    raise exception 'P2_5_SANDBOX_CREDENTIAL_HASHES_INVALID';
  end if;

  select count(*)::integer
    into v_hash_count
  from jsonb_object_keys(p_credential_hashes);

  if v_hash_count <> cardinality(v_roles) then
    raise exception 'P2_5_SANDBOX_CREDENTIAL_ROLE_SET_MISMATCH';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_credential_hashes) supplied(role)
    where not (supplied.role = any(v_roles))
  ) then
    raise exception 'P2_5_SANDBOX_CREDENTIAL_ROLE_SET_MISMATCH';
  end if;

  foreach v_role in array v_roles loop
    v_hash := coalesce(p_credential_hashes ->> v_role, '');
    if v_hash !~ '^scrypt\$16384\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$' then
      raise exception 'P2_5_SANDBOX_CREDENTIAL_HASH_INVALID:%', v_role;
    end if;
  end loop;

  update public.staff_access_pins sap
  set active = false,
      updated_at = v_now,
      rotated_at = v_now
  where sap.hotel_id = p_sandbox_hotel_id
    and not (sap.role = any(v_roles));

  foreach v_role in array v_roles loop
    insert into public.staff_access_pins(hotel_id, role, pin_hash, active, updated_at, rotated_at)
    values (p_sandbox_hotel_id, v_role, p_credential_hashes ->> v_role, true, v_now, v_now)
    on conflict (hotel_id, role) do update
      set pin_hash = excluded.pin_hash,
          active = true,
          updated_at = excluded.updated_at,
          rotated_at = excluded.rotated_at;
  end loop;

  update public.staff_sessions ss
  set revoked_at = v_now
  where ss.hotel_id = p_sandbox_hotel_id
    and ss.revoked_at is null;

  insert into public.control_plane_audit_log(
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
    v_organization_id,
    v_property_id,
    p_sandbox_hotel_id,
    'factory_sandbox_staff_credentials_provisioned',
    'hotel',
    p_sandbox_hotel_id::text,
    jsonb_build_object(
      'stage', 'p2.5.sandbox_credentials',
      'certifiedRevisionId', p_expected_certified_revision_id,
      'productionHotelId', v_sandbox.production_hotel_id,
      'credentialCount', cardinality(v_roles),
      'roles', to_jsonb(v_roles),
      'existingSessionsRevoked', true,
      'productionCredentialsProvisioned', false
    )
  );

  return query
  select p_sandbox_hotel_id, p_expected_certified_revision_id, cardinality(v_roles), v_roles;
end;
$function$;

revoke all on function public.provision_factory_sandbox_staff_credentials_v1(uuid, uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.provision_factory_sandbox_staff_credentials_v1(uuid, uuid, uuid, jsonb, jsonb) to service_role, postgres;
