begin;

create table if not exists public.hub_design_workspaces (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  canonical_url text not null,
  hotel_name text not null,
  current_revision_id uuid null,
  created_by uuid not null references public.platform_admins(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hub_design_workspaces_source_key_check
    check (source_key ~ '^[a-f0-9]{64}$'),
  constraint hub_design_workspaces_source_key_unique unique (source_key),
  constraint hub_design_workspaces_canonical_url_check
    check (length(canonical_url) between 8 and 2048 and canonical_url ~ '^https?://'),
  constraint hub_design_workspaces_hotel_name_check
    check (length(btrim(hotel_name)) between 1 and 240)
);

create table if not exists public.hub_design_draft_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.hub_design_workspaces(id) on delete restrict,
  revision_no bigint not null,
  parent_revision_id uuid null,
  restored_from_revision_id uuid null,
  status text not null default 'draft',
  schema_version text not null,
  idempotency_key text not null,
  source_package_checksum text not null,
  payload_checksum text not null,
  source_package_json jsonb not null,
  payload_json jsonb not null,
  validation_json jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.platform_admins(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint hub_design_draft_revisions_revision_no_check
    check (revision_no > 0),
  constraint hub_design_draft_revisions_status_check
    check (status = 'draft'),
  constraint hub_design_draft_revisions_schema_version_check
    check (schema_version ~ '^hub-experience-design-draft-v[0-9]+$'),
  constraint hub_design_draft_revisions_idempotency_key_check
    check (length(idempotency_key) between 8 and 160 and idempotency_key ~ '^[A-Za-z0-9._:-]+$'),
  constraint hub_design_draft_revisions_source_package_checksum_check
    check (source_package_checksum ~ '^[a-f0-9]{64}$'),
  constraint hub_design_draft_revisions_payload_checksum_check
    check (payload_checksum ~ '^[a-f0-9]{64}$'),
  constraint hub_design_draft_revisions_source_package_json_check
    check (jsonb_typeof(source_package_json) = 'object'),
  constraint hub_design_draft_revisions_payload_json_check
    check (jsonb_typeof(payload_json) = 'object'),
  constraint hub_design_draft_revisions_validation_json_check
    check (jsonb_typeof(validation_json) = 'object'),
  constraint hub_design_draft_revisions_workspace_revision_unique
    unique (workspace_id, revision_no),
  constraint hub_design_draft_revisions_idempotency_key_unique
    unique (idempotency_key),
  constraint hub_design_draft_revisions_workspace_id_id_unique
    unique (workspace_id, id),
  constraint hub_design_draft_revisions_parent_workspace_fk
    foreign key (workspace_id, parent_revision_id)
    references public.hub_design_draft_revisions(workspace_id, id)
    on delete restrict,
  constraint hub_design_draft_revisions_restore_workspace_fk
    foreign key (workspace_id, restored_from_revision_id)
    references public.hub_design_draft_revisions(workspace_id, id)
    on delete restrict
);

alter table public.hub_design_workspaces
  add constraint hub_design_workspaces_current_revision_fk
  foreign key (id, current_revision_id)
  references public.hub_design_draft_revisions(workspace_id, id)
  on delete restrict;

create index if not exists hub_design_draft_revisions_workspace_created_idx
  on public.hub_design_draft_revisions (workspace_id, revision_no desc, created_at desc);

create index if not exists hub_design_draft_revisions_parent_idx
  on public.hub_design_draft_revisions (parent_revision_id)
  where parent_revision_id is not null;

create index if not exists hub_design_draft_revisions_restored_from_idx
  on public.hub_design_draft_revisions (restored_from_revision_id)
  where restored_from_revision_id is not null;

alter table public.hub_design_workspaces enable row level security;
alter table public.hub_design_draft_revisions enable row level security;

revoke all on table public.hub_design_workspaces from public, anon, authenticated, service_role;
revoke all on table public.hub_design_draft_revisions from public, anon, authenticated, service_role;
grant select on table public.hub_design_workspaces to service_role;
grant select on table public.hub_design_draft_revisions to service_role;

create or replace function public.guard_hub_design_draft_revision_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'HUB_DESIGN_REVISION_IMMUTABLE';
end;
$$;

create trigger hub_design_draft_revisions_immutable
before update or delete on public.hub_design_draft_revisions
for each row execute function public.guard_hub_design_draft_revision_mutation();

create or replace function public.save_hub_design_draft_revision_v1(
  p_actor_admin_id uuid,
  p_source_key text,
  p_canonical_url text,
  p_hotel_name text,
  p_idempotency_key text,
  p_schema_version text,
  p_source_package_checksum text,
  p_payload_checksum text,
  p_source_package jsonb,
  p_payload jsonb,
  p_validation jsonb,
  p_parent_revision_id uuid default null
)
returns table (
  workspace_id uuid,
  revision_id uuid,
  revision_no bigint,
  parent_revision_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_role text;
  v_workspace public.hub_design_workspaces%rowtype;
  v_existing public.hub_design_draft_revisions%rowtype;
  v_revision_id uuid;
  v_revision_no bigint;
begin
  select role into v_actor_role
  from public.platform_admins
  where id = p_actor_admin_id and active = true;

  if v_actor_role is null or v_actor_role not in ('super_admin', 'operator') then
    raise exception 'HUB_DESIGN_ADMIN_FORBIDDEN';
  end if;

  p_source_key := lower(btrim(coalesce(p_source_key, '')));
  p_canonical_url := btrim(coalesce(p_canonical_url, ''));
  p_hotel_name := btrim(coalesce(p_hotel_name, ''));
  p_idempotency_key := btrim(coalesce(p_idempotency_key, ''));
  p_schema_version := btrim(coalesce(p_schema_version, ''));
  p_source_package_checksum := lower(btrim(coalesce(p_source_package_checksum, '')));
  p_payload_checksum := lower(btrim(coalesce(p_payload_checksum, '')));

  if p_source_key !~ '^[a-f0-9]{64}$'
     or length(p_canonical_url) < 8 or length(p_canonical_url) > 2048
     or p_canonical_url !~ '^https?://'
     or length(p_hotel_name) < 1 or length(p_hotel_name) > 240
     or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 160
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
     or p_schema_version !~ '^hub-experience-design-draft-v[0-9]+$'
     or p_source_package_checksum !~ '^[a-f0-9]{64}$'
     or p_payload_checksum !~ '^[a-f0-9]{64}$'
     or p_source_package is null or jsonb_typeof(p_source_package) <> 'object'
     or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or p_validation is null or jsonb_typeof(p_validation) <> 'object' then
    raise exception 'HUB_DESIGN_INVALID_DRAFT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:hub-design:' || p_source_key, 0));

  select * into v_existing
  from public.hub_design_draft_revisions
  where idempotency_key = p_idempotency_key;

  if found then
    select * into v_workspace
    from public.hub_design_workspaces
    where id = v_existing.workspace_id;

    if v_workspace.source_key <> p_source_key
       or v_existing.schema_version <> p_schema_version
       or v_existing.source_package_checksum <> p_source_package_checksum
       or v_existing.payload_checksum <> p_payload_checksum then
      raise exception 'HUB_DESIGN_IDEMPOTENCY_CONFLICT';
    end if;

    return query select v_existing.workspace_id, v_existing.id, v_existing.revision_no,
      v_existing.parent_revision_id, true;
    return;
  end if;

  select * into v_workspace
  from public.hub_design_workspaces
  where source_key = p_source_key
  for update;

  if not found then
    insert into public.hub_design_workspaces (
      source_key, canonical_url, hotel_name, created_by
    ) values (
      p_source_key, p_canonical_url, p_hotel_name, p_actor_admin_id
    ) returning * into v_workspace;
  end if;

  if v_workspace.current_revision_id is distinct from p_parent_revision_id then
    raise exception 'HUB_DESIGN_PARENT_CONFLICT';
  end if;

  if p_parent_revision_id is not null and not exists (
    select 1 from public.hub_design_draft_revisions
    where workspace_id = v_workspace.id and id = p_parent_revision_id
  ) then
    raise exception 'HUB_DESIGN_PARENT_NOT_FOUND';
  end if;

  select coalesce(max(r.revision_no), 0) + 1 into v_revision_no
  from public.hub_design_draft_revisions r
  where r.workspace_id = v_workspace.id;

  insert into public.hub_design_draft_revisions (
    workspace_id, revision_no, parent_revision_id, status, schema_version,
    idempotency_key, source_package_checksum, payload_checksum,
    source_package_json, payload_json, validation_json, created_by
  ) values (
    v_workspace.id, v_revision_no, p_parent_revision_id, 'draft', p_schema_version,
    p_idempotency_key, p_source_package_checksum, p_payload_checksum,
    p_source_package, p_payload, p_validation, p_actor_admin_id
  ) returning id into v_revision_id;

  update public.hub_design_workspaces
  set current_revision_id = v_revision_id,
      canonical_url = p_canonical_url,
      hotel_name = p_hotel_name,
      updated_at = now()
  where id = v_workspace.id;

  insert into public.control_plane_audit_log (
    actor_admin_id, action, resource_type, resource_id, metadata_json
  ) values (
    p_actor_admin_id,
    'hub_design_draft_revision_created',
    'hub_design_draft_revision',
    v_revision_id::text,
    jsonb_build_object(
      'workspaceId', v_workspace.id,
      'revisionNo', v_revision_no,
      'parentRevisionId', p_parent_revision_id,
      'sourceKey', p_source_key,
      'payloadChecksum', p_payload_checksum,
      'status', 'draft',
      'liveActivated', false
    )
  );

  return query select v_workspace.id, v_revision_id, v_revision_no,
    p_parent_revision_id, false;
end;
$$;

create or replace function public.restore_hub_design_draft_revision_v1(
  p_actor_admin_id uuid,
  p_workspace_id uuid,
  p_source_revision_id uuid,
  p_expected_current_revision_id uuid,
  p_idempotency_key text
)
returns table (
  workspace_id uuid,
  revision_id uuid,
  revision_no bigint,
  parent_revision_id uuid,
  restored_from_revision_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_role text;
  v_workspace public.hub_design_workspaces%rowtype;
  v_source public.hub_design_draft_revisions%rowtype;
  v_existing public.hub_design_draft_revisions%rowtype;
  v_revision_id uuid;
  v_revision_no bigint;
begin
  select role into v_actor_role
  from public.platform_admins
  where id = p_actor_admin_id and active = true;

  if v_actor_role is null or v_actor_role not in ('super_admin', 'operator') then
    raise exception 'HUB_DESIGN_ADMIN_FORBIDDEN';
  end if;

  p_idempotency_key := btrim(coalesce(p_idempotency_key, ''));
  if length(p_idempotency_key) < 8 or length(p_idempotency_key) > 160
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'HUB_DESIGN_INVALID_IDEMPOTENCY_KEY';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:hub-design-workspace:' || p_workspace_id::text, 0));

  select * into v_existing
  from public.hub_design_draft_revisions
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.workspace_id <> p_workspace_id
       or v_existing.restored_from_revision_id is distinct from p_source_revision_id then
      raise exception 'HUB_DESIGN_IDEMPOTENCY_CONFLICT';
    end if;

    return query select v_existing.workspace_id, v_existing.id, v_existing.revision_no,
      v_existing.parent_revision_id, v_existing.restored_from_revision_id, true;
    return;
  end if;

  select * into v_workspace
  from public.hub_design_workspaces
  where id = p_workspace_id
  for update;

  if not found then
    raise exception 'HUB_DESIGN_WORKSPACE_NOT_FOUND';
  end if;

  if v_workspace.current_revision_id is distinct from p_expected_current_revision_id then
    raise exception 'HUB_DESIGN_CURRENT_REVISION_CONFLICT';
  end if;

  select * into v_source
  from public.hub_design_draft_revisions
  where workspace_id = p_workspace_id and id = p_source_revision_id;

  if not found then
    raise exception 'HUB_DESIGN_SOURCE_REVISION_NOT_FOUND';
  end if;

  select coalesce(max(r.revision_no), 0) + 1 into v_revision_no
  from public.hub_design_draft_revisions r
  where r.workspace_id = p_workspace_id;

  insert into public.hub_design_draft_revisions (
    workspace_id, revision_no, parent_revision_id, restored_from_revision_id,
    status, schema_version, idempotency_key, source_package_checksum,
    payload_checksum, source_package_json, payload_json, validation_json, created_by
  ) values (
    p_workspace_id, v_revision_no, v_workspace.current_revision_id, p_source_revision_id,
    'draft', v_source.schema_version, p_idempotency_key, v_source.source_package_checksum,
    v_source.payload_checksum, v_source.source_package_json, v_source.payload_json,
    v_source.validation_json, p_actor_admin_id
  ) returning id into v_revision_id;

  update public.hub_design_workspaces
  set current_revision_id = v_revision_id,
      updated_at = now()
  where id = p_workspace_id;

  insert into public.control_plane_audit_log (
    actor_admin_id, action, resource_type, resource_id, metadata_json
  ) values (
    p_actor_admin_id,
    'hub_design_draft_revision_restored',
    'hub_design_draft_revision',
    v_revision_id::text,
    jsonb_build_object(
      'workspaceId', p_workspace_id,
      'revisionNo', v_revision_no,
      'parentRevisionId', v_workspace.current_revision_id,
      'restoredFromRevisionId', p_source_revision_id,
      'payloadChecksum', v_source.payload_checksum,
      'status', 'draft',
      'liveActivated', false
    )
  );

  return query select p_workspace_id, v_revision_id, v_revision_no,
    v_workspace.current_revision_id, p_source_revision_id, false;
end;
$$;

revoke all on function public.guard_hub_design_draft_revision_mutation() from public, anon, authenticated, service_role;
revoke all on function public.save_hub_design_draft_revision_v1(uuid, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.restore_hub_design_draft_revision_v1(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.save_hub_design_draft_revision_v1(uuid, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, uuid) to service_role;
grant execute on function public.restore_hub_design_draft_revision_v1(uuid, uuid, uuid, uuid, text) to service_role;

commit;
