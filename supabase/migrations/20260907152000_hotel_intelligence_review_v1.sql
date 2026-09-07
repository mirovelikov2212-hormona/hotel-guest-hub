begin;

create table if not exists public.hotel_intelligence_workspaces (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  canonical_url text not null,
  hotel_name text not null,
  current_revision_id uuid null,
  approved_revision_id uuid null,
  created_by uuid not null references public.platform_admins(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_intelligence_workspaces_source_key_check
    check (source_key ~ '^[a-f0-9]{64}$'),
  constraint hotel_intelligence_workspaces_source_key_unique unique (source_key),
  constraint hotel_intelligence_workspaces_canonical_url_check
    check (length(canonical_url) between 8 and 2048 and canonical_url ~ '^https?://'),
  constraint hotel_intelligence_workspaces_hotel_name_check
    check (length(btrim(hotel_name)) between 1 and 240)
);

create table if not exists public.hotel_intelligence_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.hotel_intelligence_workspaces(id) on delete restrict,
  revision_no bigint not null,
  parent_revision_id uuid null,
  approved_from_revision_id uuid null,
  status text not null,
  schema_version text not null,
  idempotency_key text not null,
  scanner_package_checksum text not null,
  content_checksum text not null,
  content_json jsonb not null,
  provenance_json jsonb not null default '{}'::jsonb,
  validation_json jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.platform_admins(id) on delete restrict,
  created_at timestamptz not null default now(),
  approved_by uuid null references public.platform_admins(id) on delete restrict,
  approved_at timestamptz null,
  constraint hotel_intelligence_revisions_revision_no_check check (revision_no > 0),
  constraint hotel_intelligence_revisions_status_check check (status in ('draft', 'approved')),
  constraint hotel_intelligence_revisions_schema_version_check
    check (schema_version = 'hotel-intelligence-review-v1'),
  constraint hotel_intelligence_revisions_idempotency_key_check
    check (length(idempotency_key) between 8 and 180 and idempotency_key ~ '^[A-Za-z0-9._:-]+$'),
  constraint hotel_intelligence_revisions_scanner_checksum_check
    check (scanner_package_checksum ~ '^[a-f0-9]{64}$'),
  constraint hotel_intelligence_revisions_content_checksum_check
    check (content_checksum ~ '^[a-f0-9]{64}$'),
  constraint hotel_intelligence_revisions_content_json_check
    check (jsonb_typeof(content_json) = 'object'),
  constraint hotel_intelligence_revisions_provenance_json_check
    check (jsonb_typeof(provenance_json) = 'object'),
  constraint hotel_intelligence_revisions_validation_json_check
    check (jsonb_typeof(validation_json) = 'object'),
  constraint hotel_intelligence_revisions_approval_shape_check
    check (
      (status = 'draft' and approved_from_revision_id is null and approved_by is null and approved_at is null)
      or
      (status = 'approved' and approved_from_revision_id is not null and approved_by is not null and approved_at is not null)
    ),
  constraint hotel_intelligence_revisions_workspace_revision_unique unique (workspace_id, revision_no),
  constraint hotel_intelligence_revisions_idempotency_key_unique unique (idempotency_key),
  constraint hotel_intelligence_revisions_workspace_id_id_unique unique (workspace_id, id),
  constraint hotel_intelligence_revisions_parent_workspace_fk
    foreign key (workspace_id, parent_revision_id)
    references public.hotel_intelligence_revisions(workspace_id, id)
    on delete restrict,
  constraint hotel_intelligence_revisions_approved_from_workspace_fk
    foreign key (workspace_id, approved_from_revision_id)
    references public.hotel_intelligence_revisions(workspace_id, id)
    on delete restrict
);

create table if not exists public.hotel_scan_runs (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  requested_url text not null,
  canonical_url text not null,
  scanned_urls jsonb not null,
  schema_version text not null,
  idempotency_key text not null,
  evidence_checksum text not null,
  evidence_json jsonb not null,
  technology_json jsonb not null,
  design_signals_json jsonb not null,
  scanner_metadata_json jsonb not null,
  diagnostics_json jsonb not null default '{}'::jsonb,
  scanned_at timestamptz not null,
  created_by uuid not null references public.platform_admins(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint hotel_scan_runs_source_key_check
    check (source_key ~ '^[a-f0-9]{64}$'),
  constraint hotel_scan_runs_requested_url_check
    check (length(requested_url) between 8 and 2048 and requested_url ~ '^https?://'),
  constraint hotel_scan_runs_canonical_url_check
    check (length(canonical_url) between 8 and 2048 and canonical_url ~ '^https?://'),
  constraint hotel_scan_runs_scanned_urls_check
    check (
      jsonb_typeof(scanned_urls) = 'array'
      and jsonb_array_length(scanned_urls) between 1 and 20
    ),
  constraint hotel_scan_runs_schema_version_check
    check (schema_version = 'hotel-scan-run-v1'),
  constraint hotel_scan_runs_idempotency_key_check
    check (length(idempotency_key) between 8 and 180 and idempotency_key ~ '^[A-Za-z0-9._:-]+$'),
  constraint hotel_scan_runs_idempotency_key_unique unique (idempotency_key),
  constraint hotel_scan_runs_evidence_checksum_check
    check (evidence_checksum ~ '^[a-f0-9]{64}$'),
  constraint hotel_scan_runs_evidence_json_check
    check (
      jsonb_typeof(evidence_json) = 'object'
      and evidence_json->>'schemaVersion' = 'hotel-scan-evidence-v1'
    ),
  constraint hotel_scan_runs_technology_json_check
    check (
      jsonb_typeof(technology_json) = 'object'
      and technology_json->>'schemaVersion' = 'hotel-technology-discovery-v1'
    ),
  constraint hotel_scan_runs_design_signals_json_check
    check (
      jsonb_typeof(design_signals_json) = 'object'
      and design_signals_json->>'schemaVersion' = 'hotel-scan-design-signals-v1'
    ),
  constraint hotel_scan_runs_scanner_metadata_json_check
    check (jsonb_typeof(scanner_metadata_json) = 'object'),
  constraint hotel_scan_runs_diagnostics_json_check
    check (jsonb_typeof(diagnostics_json) = 'object')
);

alter table public.hotel_intelligence_workspaces
  add constraint hotel_intelligence_workspaces_current_revision_fk
  foreign key (id, current_revision_id)
  references public.hotel_intelligence_revisions(workspace_id, id)
  on delete restrict;

alter table public.hotel_intelligence_workspaces
  add constraint hotel_intelligence_workspaces_approved_revision_fk
  foreign key (id, approved_revision_id)
  references public.hotel_intelligence_revisions(workspace_id, id)
  on delete restrict;

create index if not exists hotel_intelligence_workspaces_created_by_idx
  on public.hotel_intelligence_workspaces (created_by);
create index if not exists hotel_intelligence_workspaces_current_revision_idx
  on public.hotel_intelligence_workspaces (id, current_revision_id)
  where current_revision_id is not null;
create index if not exists hotel_intelligence_workspaces_approved_revision_idx
  on public.hotel_intelligence_workspaces (id, approved_revision_id)
  where approved_revision_id is not null;
create index if not exists hotel_intelligence_revisions_workspace_created_idx
  on public.hotel_intelligence_revisions (workspace_id, revision_no desc, created_at desc);
create index if not exists hotel_intelligence_revisions_parent_idx
  on public.hotel_intelligence_revisions (workspace_id, parent_revision_id)
  where parent_revision_id is not null;
create index if not exists hotel_intelligence_revisions_approved_from_idx
  on public.hotel_intelligence_revisions (workspace_id, approved_from_revision_id)
  where approved_from_revision_id is not null;
create index if not exists hotel_intelligence_revisions_created_by_idx
  on public.hotel_intelligence_revisions (created_by);
create index if not exists hotel_scan_runs_source_scanned_idx
  on public.hotel_scan_runs (source_key, scanned_at desc, created_at desc);
create index if not exists hotel_scan_runs_evidence_checksum_idx
  on public.hotel_scan_runs (evidence_checksum);
create index if not exists hotel_scan_runs_created_by_idx
  on public.hotel_scan_runs (created_by);

alter table public.hotel_intelligence_workspaces enable row level security;
alter table public.hotel_intelligence_revisions enable row level security;
alter table public.hotel_scan_runs enable row level security;

revoke all on table public.hotel_intelligence_workspaces from public, anon, authenticated, service_role;
revoke all on table public.hotel_intelligence_revisions from public, anon, authenticated, service_role;
revoke all on table public.hotel_scan_runs from public, anon, authenticated, service_role;
grant select on table public.hotel_intelligence_workspaces to service_role;
grant select on table public.hotel_intelligence_revisions to service_role;
grant select on table public.hotel_scan_runs to service_role;

create policy hotel_intelligence_workspaces_deny_direct_access
  on public.hotel_intelligence_workspaces for all to public using (false) with check (false);
create policy hotel_intelligence_revisions_deny_direct_access
  on public.hotel_intelligence_revisions for all to public using (false) with check (false);
create policy hotel_scan_runs_deny_direct_access
  on public.hotel_scan_runs for all to public using (false) with check (false);

create or replace function public.guard_hotel_intelligence_revision_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'HOTEL_INTELLIGENCE_REVISION_IMMUTABLE';
end;
$$;

create trigger hotel_intelligence_revisions_immutable
before update or delete on public.hotel_intelligence_revisions
for each row execute function public.guard_hotel_intelligence_revision_mutation();

create or replace function public.guard_hotel_scan_run_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'HOTEL_SCAN_RUN_IMMUTABLE';
end;
$$;

create trigger hotel_scan_runs_immutable
before update or delete on public.hotel_scan_runs
for each row execute function public.guard_hotel_scan_run_mutation();

create or replace function public.create_hotel_scan_run_v1(
  p_actor_admin_id uuid,
  p_source_key text,
  p_requested_url text,
  p_canonical_url text,
  p_scanned_urls jsonb,
  p_schema_version text,
  p_idempotency_key text,
  p_evidence_checksum text,
  p_evidence jsonb,
  p_technology jsonb,
  p_design_signals jsonb,
  p_scanner_metadata jsonb,
  p_diagnostics jsonb,
  p_scanned_at timestamptz
)
returns table (
  scan_run_id uuid,
  evidence_checksum text,
  scanned_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_role text;
  v_existing public.hotel_scan_runs%rowtype;
  v_scan_run_id uuid;
begin
  select role into v_actor_role
  from public.platform_admins
  where id = p_actor_admin_id and active = true;

  if v_actor_role is null or v_actor_role not in ('super_admin', 'operator') then
    raise exception 'HOTEL_SCAN_RUN_ADMIN_FORBIDDEN';
  end if;

  p_source_key := lower(btrim(coalesce(p_source_key, '')));
  p_requested_url := btrim(coalesce(p_requested_url, ''));
  p_canonical_url := btrim(coalesce(p_canonical_url, ''));
  p_schema_version := btrim(coalesce(p_schema_version, ''));
  p_idempotency_key := btrim(coalesce(p_idempotency_key, ''));
  p_evidence_checksum := lower(btrim(coalesce(p_evidence_checksum, '')));

  if p_source_key !~ '^[a-f0-9]{64}$'
     or length(p_requested_url) < 8 or length(p_requested_url) > 2048 or p_requested_url !~ '^https?://'
     or length(p_canonical_url) < 8 or length(p_canonical_url) > 2048 or p_canonical_url !~ '^https?://'
     or p_scanned_urls is null or jsonb_typeof(p_scanned_urls) <> 'array'
     or jsonb_array_length(p_scanned_urls) < 1 or jsonb_array_length(p_scanned_urls) > 20
     or p_schema_version <> 'hotel-scan-run-v1'
     or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 180
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
     or p_evidence_checksum !~ '^[a-f0-9]{64}$'
     or p_evidence is null or jsonb_typeof(p_evidence) <> 'object'
     or p_evidence->>'schemaVersion' <> 'hotel-scan-evidence-v1'
     or p_technology is null or jsonb_typeof(p_technology) <> 'object'
     or p_technology->>'schemaVersion' <> 'hotel-technology-discovery-v1'
     or p_design_signals is null or jsonb_typeof(p_design_signals) <> 'object'
     or p_design_signals->>'schemaVersion' <> 'hotel-scan-design-signals-v1'
     or p_scanner_metadata is null or jsonb_typeof(p_scanner_metadata) <> 'object'
     or p_diagnostics is null or jsonb_typeof(p_diagnostics) <> 'object'
     or p_scanned_at is null then
    raise exception 'HOTEL_SCAN_RUN_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:hotel-scan-run:' || p_idempotency_key, 0));

  select * into v_existing
  from public.hotel_scan_runs
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.source_key <> p_source_key
       or v_existing.schema_version <> p_schema_version
       or v_existing.evidence_checksum <> p_evidence_checksum
       or v_existing.scanned_at is distinct from p_scanned_at then
      raise exception 'HOTEL_SCAN_RUN_IDEMPOTENCY_CONFLICT';
    end if;
    return query select v_existing.id, v_existing.evidence_checksum, v_existing.scanned_at, true;
    return;
  end if;

  insert into public.hotel_scan_runs (
    source_key, requested_url, canonical_url, scanned_urls, schema_version,
    idempotency_key, evidence_checksum, evidence_json, technology_json,
    design_signals_json, scanner_metadata_json, diagnostics_json,
    scanned_at, created_by
  ) values (
    p_source_key, p_requested_url, p_canonical_url, p_scanned_urls, p_schema_version,
    p_idempotency_key, p_evidence_checksum, p_evidence, p_technology,
    p_design_signals, p_scanner_metadata, p_diagnostics,
    p_scanned_at, p_actor_admin_id
  ) returning id into v_scan_run_id;

  insert into public.control_plane_audit_log (
    actor_admin_id, action, resource_type, resource_id, metadata_json
  ) values (
    p_actor_admin_id,
    'hotel_scan_run_created',
    'hotel_scan_run',
    v_scan_run_id::text,
    jsonb_build_object(
      'sourceKey', p_source_key,
      'schemaVersion', p_schema_version,
      'evidenceChecksum', p_evidence_checksum,
      'scannedAt', p_scanned_at,
      'scannedUrlCount', jsonb_array_length(p_scanned_urls)
    )
  );

  return query select v_scan_run_id, p_evidence_checksum, p_scanned_at, false;
end;
$$;

create or replace function public.save_hotel_intelligence_revision_v1(
  p_actor_admin_id uuid,
  p_source_key text,
  p_canonical_url text,
  p_hotel_name text,
  p_idempotency_key text,
  p_scanner_package_checksum text,
  p_content_checksum text,
  p_content jsonb,
  p_provenance jsonb,
  p_validation jsonb,
  p_parent_revision_id uuid default null
)
returns table (
  workspace_id uuid,
  revision_id uuid,
  revision_no bigint,
  parent_revision_id uuid,
  approved_revision_id uuid,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_role text;
  v_workspace public.hotel_intelligence_workspaces%rowtype;
  v_existing public.hotel_intelligence_revisions%rowtype;
  v_revision_id uuid;
  v_revision_no bigint;
begin
  select role into v_actor_role
  from public.platform_admins
  where id = p_actor_admin_id and active = true;

  if v_actor_role is null or v_actor_role not in ('super_admin', 'operator') then
    raise exception 'HOTEL_INTELLIGENCE_ADMIN_FORBIDDEN';
  end if;

  p_source_key := lower(btrim(coalesce(p_source_key, '')));
  p_canonical_url := btrim(coalesce(p_canonical_url, ''));
  p_hotel_name := btrim(coalesce(p_hotel_name, ''));
  p_idempotency_key := btrim(coalesce(p_idempotency_key, ''));
  p_scanner_package_checksum := lower(btrim(coalesce(p_scanner_package_checksum, '')));
  p_content_checksum := lower(btrim(coalesce(p_content_checksum, '')));

  if p_source_key !~ '^[a-f0-9]{64}$'
     or length(p_canonical_url) < 8 or length(p_canonical_url) > 2048 or p_canonical_url !~ '^https?://'
     or length(p_hotel_name) < 1 or length(p_hotel_name) > 240
     or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 180
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
     or p_scanner_package_checksum !~ '^[a-f0-9]{64}$'
     or p_content_checksum !~ '^[a-f0-9]{64}$'
     or p_content is null or jsonb_typeof(p_content) <> 'object'
     or p_content->>'schemaVersion' <> 'hotel-intelligence-review-v1'
     or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
     or p_validation is null or jsonb_typeof(p_validation) <> 'object' then
    raise exception 'HOTEL_INTELLIGENCE_INVALID_DRAFT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:hotel-intelligence:' || p_source_key, 0));

  select * into v_existing
  from public.hotel_intelligence_revisions
  where idempotency_key = p_idempotency_key;

  if found then
    select * into v_workspace from public.hotel_intelligence_workspaces where id = v_existing.workspace_id;
    if v_workspace.source_key <> p_source_key
       or v_existing.status <> 'draft'
       or v_existing.scanner_package_checksum <> p_scanner_package_checksum
       or v_existing.content_checksum <> p_content_checksum then
      raise exception 'HOTEL_INTELLIGENCE_IDEMPOTENCY_CONFLICT';
    end if;
    return query select v_existing.workspace_id, v_existing.id, v_existing.revision_no,
      v_existing.parent_revision_id, v_workspace.approved_revision_id, true;
    return;
  end if;

  select * into v_workspace
  from public.hotel_intelligence_workspaces
  where source_key = p_source_key
  for update;

  if not found then
    insert into public.hotel_intelligence_workspaces (
      source_key, canonical_url, hotel_name, created_by
    ) values (
      p_source_key, p_canonical_url, p_hotel_name, p_actor_admin_id
    ) returning * into v_workspace;
  end if;

  if v_workspace.current_revision_id is distinct from p_parent_revision_id then
    raise exception 'HOTEL_INTELLIGENCE_PARENT_CONFLICT';
  end if;

  select coalesce(max(r.revision_no), 0) + 1 into v_revision_no
  from public.hotel_intelligence_revisions r
  where r.workspace_id = v_workspace.id;

  insert into public.hotel_intelligence_revisions (
    workspace_id, revision_no, parent_revision_id, status, schema_version,
    idempotency_key, scanner_package_checksum, content_checksum,
    content_json, provenance_json, validation_json, created_by
  ) values (
    v_workspace.id, v_revision_no, p_parent_revision_id, 'draft', 'hotel-intelligence-review-v1',
    p_idempotency_key, p_scanner_package_checksum, p_content_checksum,
    p_content, p_provenance, p_validation, p_actor_admin_id
  ) returning id into v_revision_id;

  update public.hotel_intelligence_workspaces
  set current_revision_id = v_revision_id,
      canonical_url = p_canonical_url,
      hotel_name = p_hotel_name,
      updated_at = now()
  where id = v_workspace.id;

  insert into public.control_plane_audit_log (
    actor_admin_id, action, resource_type, resource_id, metadata_json
  ) values (
    p_actor_admin_id,
    'hotel_intelligence_review_revision_created',
    'hotel_intelligence_revision',
    v_revision_id::text,
    jsonb_build_object(
      'workspaceId', v_workspace.id,
      'revisionNo', v_revision_no,
      'parentRevisionId', p_parent_revision_id,
      'sourceKey', p_source_key,
      'contentChecksum', p_content_checksum,
      'scannerPackageChecksum', p_scanner_package_checksum,
      'status', 'draft'
    )
  );

  return query select v_workspace.id, v_revision_id, v_revision_no,
    p_parent_revision_id, v_workspace.approved_revision_id, false;
end;
$$;

create or replace function public.approve_hotel_intelligence_revision_v1(
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
  approved_from_revision_id uuid,
  content_checksum text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_role text;
  v_workspace public.hotel_intelligence_workspaces%rowtype;
  v_source public.hotel_intelligence_revisions%rowtype;
  v_existing public.hotel_intelligence_revisions%rowtype;
  v_revision_id uuid;
  v_revision_no bigint;
  v_now timestamptz := now();
begin
  select role into v_actor_role
  from public.platform_admins
  where id = p_actor_admin_id and active = true;

  if v_actor_role is null or v_actor_role not in ('super_admin', 'operator') then
    raise exception 'HOTEL_INTELLIGENCE_ADMIN_FORBIDDEN';
  end if;

  p_idempotency_key := btrim(coalesce(p_idempotency_key, ''));
  if length(p_idempotency_key) < 8 or length(p_idempotency_key) > 180
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'HOTEL_INTELLIGENCE_INVALID_IDEMPOTENCY_KEY';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:hotel-intelligence-workspace:' || p_workspace_id::text, 0));

  select * into v_existing
  from public.hotel_intelligence_revisions
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.workspace_id <> p_workspace_id
       or v_existing.status <> 'approved'
       or v_existing.approved_from_revision_id is distinct from p_source_revision_id then
      raise exception 'HOTEL_INTELLIGENCE_IDEMPOTENCY_CONFLICT';
    end if;
    return query select v_existing.workspace_id, v_existing.id, v_existing.revision_no,
      v_existing.approved_from_revision_id, v_existing.content_checksum, true;
    return;
  end if;

  select * into v_workspace
  from public.hotel_intelligence_workspaces
  where id = p_workspace_id
  for update;
  if not found then raise exception 'HOTEL_INTELLIGENCE_WORKSPACE_NOT_FOUND'; end if;

  if v_workspace.current_revision_id is distinct from p_expected_current_revision_id
     or p_source_revision_id is distinct from p_expected_current_revision_id then
    raise exception 'HOTEL_INTELLIGENCE_CURRENT_REVISION_CONFLICT';
  end if;

  select * into v_source
  from public.hotel_intelligence_revisions
  where workspace_id = p_workspace_id and id = p_source_revision_id;
  if not found then raise exception 'HOTEL_INTELLIGENCE_SOURCE_REVISION_NOT_FOUND'; end if;
  if v_source.status <> 'draft' then raise exception 'HOTEL_INTELLIGENCE_SOURCE_NOT_DRAFT'; end if;
  if coalesce((v_source.validation_json->>'approvalReady')::boolean, false) is not true then
    raise exception 'HOTEL_INTELLIGENCE_APPROVAL_NOT_READY';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_source.content_json->'items', '[]'::jsonb)) item
    where coalesce(item->>'decision', 'pending') = 'pending'
  ) then
    raise exception 'HOTEL_INTELLIGENCE_PENDING_FACTS';
  end if;
  if jsonb_array_length(coalesce(v_source.content_json->'unresolvedNotes', '[]'::jsonb)) > 0 then
    raise exception 'HOTEL_INTELLIGENCE_UNRESOLVED_NOTES';
  end if;

  select coalesce(max(r.revision_no), 0) + 1 into v_revision_no
  from public.hotel_intelligence_revisions r
  where r.workspace_id = p_workspace_id;

  insert into public.hotel_intelligence_revisions (
    workspace_id, revision_no, parent_revision_id, approved_from_revision_id,
    status, schema_version, idempotency_key, scanner_package_checksum,
    content_checksum, content_json, provenance_json, validation_json,
    created_by, approved_by, approved_at
  ) values (
    p_workspace_id, v_revision_no, v_source.id, v_source.id,
    'approved', v_source.schema_version, p_idempotency_key, v_source.scanner_package_checksum,
    v_source.content_checksum, v_source.content_json,
    v_source.provenance_json || jsonb_build_object('approvalSourceRevisionId', v_source.id),
    v_source.validation_json, p_actor_admin_id, p_actor_admin_id, v_now
  ) returning id into v_revision_id;

  update public.hotel_intelligence_workspaces
  set current_revision_id = v_revision_id,
      approved_revision_id = v_revision_id,
      updated_at = v_now
  where id = p_workspace_id;

  insert into public.control_plane_audit_log (
    actor_admin_id, action, resource_type, resource_id, metadata_json
  ) values (
    p_actor_admin_id,
    'hotel_intelligence_revision_approved',
    'hotel_intelligence_revision',
    v_revision_id::text,
    jsonb_build_object(
      'workspaceId', p_workspace_id,
      'revisionNo', v_revision_no,
      'approvedFromRevisionId', v_source.id,
      'contentChecksum', v_source.content_checksum,
      'scannerPackageChecksum', v_source.scanner_package_checksum,
      'status', 'approved'
    )
  );

  return query select p_workspace_id, v_revision_id, v_revision_no,
    v_source.id, v_source.content_checksum, false;
end;
$$;

revoke all on function public.guard_hotel_intelligence_revision_mutation() from public, anon, authenticated, service_role;
revoke all on function public.guard_hotel_scan_run_mutation() from public, anon, authenticated, service_role;
revoke all on function public.create_hotel_scan_run_v1(uuid, text, text, text, jsonb, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.save_hotel_intelligence_revision_v1(uuid, text, text, text, text, text, text, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.approve_hotel_intelligence_revision_v1(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_hotel_scan_run_v1(uuid, text, text, text, jsonb, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, timestamptz) to service_role;
grant execute on function public.save_hotel_intelligence_revision_v1(uuid, text, text, text, text, text, text, jsonb, jsonb, jsonb, uuid) to service_role;
grant execute on function public.approve_hotel_intelligence_revision_v1(uuid, uuid, uuid, uuid, text) to service_role;

commit;