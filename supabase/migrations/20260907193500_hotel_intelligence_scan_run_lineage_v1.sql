begin;

alter table public.hotel_intelligence_revisions
  add column if not exists scan_run_id uuid null references public.hotel_scan_runs(id) on delete restrict,
  add column if not exists scan_evidence_checksum text null;

alter table public.hotel_intelligence_revisions
  add constraint hotel_intelligence_revisions_scan_lineage_shape_check
  check (
    (scan_run_id is null and scan_evidence_checksum is null)
    or
    (scan_run_id is not null and scan_evidence_checksum ~ '^[a-f0-9]{64}$')
  );

create index if not exists hotel_intelligence_revisions_scan_run_idx
  on public.hotel_intelligence_revisions (scan_run_id, revision_no desc)
  where scan_run_id is not null;

revoke all on function public.save_hotel_intelligence_revision_v1(uuid, text, text, text, text, text, text, jsonb, jsonb, jsonb, uuid)
  from public, anon, authenticated, service_role;
drop function public.save_hotel_intelligence_revision_v1(uuid, text, text, text, text, text, text, jsonb, jsonb, jsonb, uuid);

create or replace function public.save_hotel_intelligence_revision_v1(
  p_actor_admin_id uuid,
  p_source_key text,
  p_canonical_url text,
  p_hotel_name text,
  p_idempotency_key text,
  p_scan_run_id uuid,
  p_scan_evidence_checksum text,
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
  scan_run_id uuid,
  scan_evidence_checksum text,
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
  v_scan_run public.hotel_scan_runs%rowtype;
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
  p_scan_evidence_checksum := lower(btrim(coalesce(p_scan_evidence_checksum, '')));
  p_scanner_package_checksum := lower(btrim(coalesce(p_scanner_package_checksum, '')));
  p_content_checksum := lower(btrim(coalesce(p_content_checksum, '')));

  if p_source_key !~ '^[a-f0-9]{64}$'
     or length(p_canonical_url) < 8 or length(p_canonical_url) > 2048 or p_canonical_url !~ '^https?://'
     or length(p_hotel_name) < 1 or length(p_hotel_name) > 240
     or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 180
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]+$'
     or p_scan_run_id is null
     or p_scan_evidence_checksum !~ '^[a-f0-9]{64}$'
     or p_scanner_package_checksum !~ '^[a-f0-9]{64}$'
     or p_content_checksum !~ '^[a-f0-9]{64}$'
     or p_content is null or jsonb_typeof(p_content) <> 'object'
     or p_content->>'schemaVersion' <> 'hotel-intelligence-review-v1'
     or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
     or p_validation is null or jsonb_typeof(p_validation) <> 'object' then
    raise exception 'HOTEL_INTELLIGENCE_INVALID_DRAFT';
  end if;

  select * into v_scan_run
  from public.hotel_scan_runs
  where id = p_scan_run_id;
  if not found then raise exception 'HOTEL_INTELLIGENCE_SCAN_RUN_NOT_FOUND'; end if;
  if v_scan_run.source_key <> p_source_key
     or v_scan_run.evidence_checksum <> p_scan_evidence_checksum then
    raise exception 'HOTEL_INTELLIGENCE_SCAN_RUN_LINEAGE_MISMATCH';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stayhub:hotel-intelligence:' || p_source_key, 0));

  select * into v_existing
  from public.hotel_intelligence_revisions
  where idempotency_key = p_idempotency_key;

  if found then
    select * into v_workspace from public.hotel_intelligence_workspaces where id = v_existing.workspace_id;
    if v_workspace.source_key <> p_source_key
       or v_existing.status <> 'draft'
       or v_existing.scan_run_id is distinct from p_scan_run_id
       or v_existing.scan_evidence_checksum <> p_scan_evidence_checksum
       or v_existing.scanner_package_checksum <> p_scanner_package_checksum
       or v_existing.content_checksum <> p_content_checksum then
      raise exception 'HOTEL_INTELLIGENCE_IDEMPOTENCY_CONFLICT';
    end if;
    return query select v_existing.workspace_id, v_existing.id, v_existing.revision_no,
      v_existing.parent_revision_id, v_workspace.approved_revision_id,
      v_existing.scan_run_id, v_existing.scan_evidence_checksum, true;
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
    idempotency_key, scan_run_id, scan_evidence_checksum,
    scanner_package_checksum, content_checksum,
    content_json, provenance_json, validation_json, created_by
  ) values (
    v_workspace.id, v_revision_no, p_parent_revision_id, 'draft', 'hotel-intelligence-review-v1',
    p_idempotency_key, p_scan_run_id, p_scan_evidence_checksum,
    p_scanner_package_checksum, p_content_checksum,
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
      'scanRunId', p_scan_run_id,
      'scanEvidenceChecksum', p_scan_evidence_checksum,
      'contentChecksum', p_content_checksum,
      'scannerPackageChecksum', p_scanner_package_checksum,
      'status', 'draft'
    )
  );

  return query select v_workspace.id, v_revision_id, v_revision_no,
    p_parent_revision_id, v_workspace.approved_revision_id,
    p_scan_run_id, p_scan_evidence_checksum, false;
end;
$$;

revoke all on function public.approve_hotel_intelligence_revision_v1(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
drop function public.approve_hotel_intelligence_revision_v1(uuid, uuid, uuid, uuid, text);

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
  scan_run_id uuid,
  scan_evidence_checksum text,
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
  v_scan_run public.hotel_scan_runs%rowtype;
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
      v_existing.approved_from_revision_id, v_existing.scan_run_id,
      v_existing.scan_evidence_checksum, v_existing.content_checksum, true;
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
  if v_source.scan_run_id is null or v_source.scan_evidence_checksum is null then
    raise exception 'HOTEL_INTELLIGENCE_SCAN_RUN_LINEAGE_REQUIRED';
  end if;
  select * into v_scan_run from public.hotel_scan_runs where id = v_source.scan_run_id;
  if not found
     or v_scan_run.source_key <> v_workspace.source_key
     or v_scan_run.evidence_checksum <> v_source.scan_evidence_checksum then
    raise exception 'HOTEL_INTELLIGENCE_SCAN_RUN_LINEAGE_MISMATCH';
  end if;
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
    status, schema_version, idempotency_key,
    scan_run_id, scan_evidence_checksum, scanner_package_checksum,
    content_checksum, content_json, provenance_json, validation_json,
    created_by, approved_by, approved_at
  ) values (
    p_workspace_id, v_revision_no, v_source.id, v_source.id,
    'approved', v_source.schema_version, p_idempotency_key,
    v_source.scan_run_id, v_source.scan_evidence_checksum, v_source.scanner_package_checksum,
    v_source.content_checksum, v_source.content_json,
    v_source.provenance_json || jsonb_build_object(
      'approvalSourceRevisionId', v_source.id,
      'scanRunId', v_source.scan_run_id,
      'scanEvidenceChecksum', v_source.scan_evidence_checksum
    ),
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
      'scanRunId', v_source.scan_run_id,
      'scanEvidenceChecksum', v_source.scan_evidence_checksum,
      'contentChecksum', v_source.content_checksum,
      'scannerPackageChecksum', v_source.scanner_package_checksum,
      'status', 'approved'
    )
  );

  return query select p_workspace_id, v_revision_id, v_revision_no,
    v_source.id, v_source.scan_run_id, v_source.scan_evidence_checksum,
    v_source.content_checksum, false;
end;
$$;

revoke all on function public.save_hotel_intelligence_revision_v1(uuid, text, text, text, text, uuid, text, text, text, jsonb, jsonb, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.approve_hotel_intelligence_revision_v1(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.save_hotel_intelligence_revision_v1(uuid, text, text, text, text, uuid, text, text, text, jsonb, jsonb, jsonb, uuid)
  to service_role;
grant execute on function public.approve_hotel_intelligence_revision_v1(uuid, uuid, uuid, uuid, text)
  to service_role;

commit;
