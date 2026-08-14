-- M11.1: explicit immutable Production -> Sandbox configuration cloning.
--
-- Sandbox runtime remains hotel-scoped and reads its own published revision.
-- This function creates only a sandbox-owned draft from an exact currently
-- published Production revision. It does not publish, project or mutate the
-- Production tenant and it is executable only by service_role/postgres.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $m11_1_preflight$
begin
  if to_regclass('public.hotels') is null
    or to_regclass('public.hotel_config_revisions') is null
    or to_regclass('public.hotel_config_publication_state') is null then
    raise exception 'M11.1 configuration clone prerequisites are missing';
  end if;
end
$m11_1_preflight$;

alter table public.hotel_config_revisions
  drop constraint if exists hotel_config_revisions_source_type_check;

alter table public.hotel_config_revisions
  add constraint hotel_config_revisions_source_type_check
  check (
    source_type = any (
      array[
        'sheet_snapshot'::text,
        'manual'::text,
        'local_demo'::text,
        'production_clone'::text
      ]
    )
  );

create or replace function public.clone_production_config_to_sandbox_draft(
  p_sandbox_hotel_id uuid,
  p_expected_production_revision_id uuid,
  p_actor text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $clone_production_config_to_sandbox_draft$
declare
  v_sandbox public.hotels%rowtype;
  v_published_revision_id uuid;
  v_production_revision public.hotel_config_revisions%rowtype;
  v_existing public.hotel_config_revisions%rowtype;
  v_revision_no bigint;
  v_revision_id uuid;
  v_actor text := left(
    coalesce(nullif(btrim(p_actor), ''), 'm11_sandbox_clone'),
    200
  );
begin
  if p_sandbox_hotel_id is null then
    raise exception using message = 'M11_SANDBOX_HOTEL_ID_REQUIRED';
  end if;

  if p_expected_production_revision_id is null then
    raise exception using message = 'M11_PRODUCTION_REVISION_ID_REQUIRED';
  end if;

  select h.*
  into v_sandbox
  from public.hotels as h
  where h.id = p_sandbox_hotel_id
    and h.active = true
    and h.is_sandbox = true
  for update;

  if not found then
    raise exception using message = 'M11_ACTIVE_SANDBOX_HOTEL_REQUIRED';
  end if;

  if v_sandbox.production_hotel_id is null then
    raise exception using message = 'M11_SANDBOX_PRODUCTION_LINK_REQUIRED';
  end if;

  perform 1
  from public.hotels as production
  where production.id = v_sandbox.production_hotel_id
    and production.active = true
    and coalesce(production.is_sandbox, false) = false;

  if not found then
    raise exception using message = 'M11_ACTIVE_PRODUCTION_HOTEL_REQUIRED';
  end if;

  select state.published_revision_id
  into v_published_revision_id
  from public.hotel_config_publication_state as state
  where state.hotel_id = v_sandbox.production_hotel_id
  for share;

  if not found or v_published_revision_id is null then
    raise exception using message = 'M11_PRODUCTION_PUBLICATION_STATE_REQUIRED';
  end if;

  if v_published_revision_id <> p_expected_production_revision_id then
    raise exception using message = 'M11_PRODUCTION_REVISION_CHANGED';
  end if;

  select revision.*
  into v_production_revision
  from public.hotel_config_revisions as revision
  where revision.hotel_id = v_sandbox.production_hotel_id
    and revision.id = p_expected_production_revision_id;

  if not found then
    raise exception using message = 'M11_PRODUCTION_REVISION_NOT_FOUND';
  end if;

  if v_production_revision.status <> 'published' then
    raise exception using message = 'M11_PRODUCTION_REVISION_NOT_PUBLISHED';
  end if;

  if coalesce((v_production_revision.validation_json->>'ok')::boolean, false) is not true then
    raise exception using message = 'M11_PRODUCTION_REVISION_NOT_VALIDATED';
  end if;

  if jsonb_typeof(v_production_revision.config_json) is distinct from 'object' then
    raise exception using message = 'M11_PRODUCTION_CONFIG_INVALID';
  end if;

  if v_production_revision.source_checksum !~ '^[A-Fa-f0-9]{64}$' then
    raise exception using message = 'M11_PRODUCTION_CHECKSUM_INVALID';
  end if;

  -- Idempotency is scoped to explicit clone lineage, not checksum alone.
  -- This intentionally allows the first production_clone revision even when
  -- an older sandbox sheet_snapshot has identical configuration bytes.
  select revision.*
  into v_existing
  from public.hotel_config_revisions as revision
  where revision.hotel_id = p_sandbox_hotel_id
    and revision.source_type = 'production_clone'
    and lower(revision.source_checksum) = lower(v_production_revision.source_checksum)
    and revision.source_metadata_json->>'productionRevisionId' = p_expected_production_revision_id::text
    and revision.status in ('draft', 'published', 'superseded')
    and revision.validation_json @> '{"ok": true}'::jsonb
  order by revision.revision_no desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'changed', false,
      'deduplicated', true,
      'sandbox_hotel_id', p_sandbox_hotel_id,
      'production_hotel_id', v_sandbox.production_hotel_id,
      'production_revision_id', p_expected_production_revision_id,
      'revision_id', v_existing.id,
      'revision_no', v_existing.revision_no,
      'status', v_existing.status,
      'source_checksum', v_existing.source_checksum
    );
  end if;

  select coalesce(max(revision.revision_no), 0) + 1
  into v_revision_no
  from public.hotel_config_revisions as revision
  where revision.hotel_id = p_sandbox_hotel_id;

  insert into public.hotel_config_revisions (
    hotel_id,
    revision_no,
    status,
    source_type,
    source_checksum,
    config_json,
    provenance_json,
    source_metadata_json,
    validation_json,
    created_by
  )
  values (
    p_sandbox_hotel_id,
    v_revision_no,
    'draft',
    'production_clone',
    lower(v_production_revision.source_checksum),
    v_production_revision.config_json,
    v_production_revision.provenance_json,
    jsonb_build_object(
      'clonedAt', clock_timestamp(),
      'cloneKind', 'production_published_revision',
      'sandboxHotelId', p_sandbox_hotel_id,
      'productionHotelId', v_sandbox.production_hotel_id,
      'productionRevisionId', p_expected_production_revision_id,
      'productionSourceChecksum', lower(v_production_revision.source_checksum)
    ),
    v_production_revision.validation_json,
    v_actor
  )
  returning id into v_revision_id;

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'deduplicated', false,
    'sandbox_hotel_id', p_sandbox_hotel_id,
    'production_hotel_id', v_sandbox.production_hotel_id,
    'production_revision_id', p_expected_production_revision_id,
    'revision_id', v_revision_id,
    'revision_no', v_revision_no,
    'status', 'draft',
    'source_checksum', lower(v_production_revision.source_checksum)
  );
end;
$clone_production_config_to_sandbox_draft$;

revoke all on function public.clone_production_config_to_sandbox_draft(uuid, uuid, text) from public;
revoke all on function public.clone_production_config_to_sandbox_draft(uuid, uuid, text) from anon;
revoke all on function public.clone_production_config_to_sandbox_draft(uuid, uuid, text) from authenticated;
grant execute on function public.clone_production_config_to_sandbox_draft(uuid, uuid, text) to service_role;
grant execute on function public.clone_production_config_to_sandbox_draft(uuid, uuid, text) to postgres;

commit;
