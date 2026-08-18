create table public.factory_vercel_runtime_log_events (
  vercel_log_id text primary key check (char_length(vercel_log_id) between 1 and 160),
  project_id text not null check (char_length(project_id) between 1 and 128),
  deployment_id text not null check (deployment_id ~ '^dpl_[A-Za-z0-9]+$'),
  environment text not null check (environment in ('preview','production')),
  event_timestamp timestamptz not null,
  event_kind text not null check (event_kind in ('error','fatal','http_5xx','factory_smoke_marker')),
  level text not null check (level in ('debug','error','fatal','info','trace','warning')),
  source text not null check (char_length(source) between 1 and 64),
  host text null check (host is null or char_length(host) <= 255),
  request_path text null check (request_path is null or char_length(request_path) <= 512),
  status_code integer null check (status_code is null or status_code between 100 and 599),
  message_sha256 text not null check (message_sha256 ~ '^[a-f0-9]{64}$'),
  smoke_run_id uuid null,
  smoke_phase text null check (smoke_phase is null or smoke_phase in ('start','end','settle')),
  envelope_projection_run_id uuid null references public.factory_onboarding_envelope_projection_runs(id) on delete restrict,
  git_sha text null check (git_sha is null or git_sha ~ '^[a-f0-9]{40}$'),
  received_at timestamptz not null default now(),
  constraint factory_vercel_runtime_log_marker_shape check (
    (event_kind = 'factory_smoke_marker' and smoke_run_id is not null and smoke_phase is not null and envelope_projection_run_id is not null and git_sha is not null)
    or
    (event_kind <> 'factory_smoke_marker' and smoke_run_id is null and smoke_phase is null and envelope_projection_run_id is null and git_sha is null)
  )
);

create index factory_vercel_runtime_log_events_deployment_ts_idx
  on public.factory_vercel_runtime_log_events(deployment_id, event_timestamp);
create index factory_vercel_runtime_log_events_smoke_idx
  on public.factory_vercel_runtime_log_events(smoke_run_id, smoke_phase)
  where smoke_run_id is not null;

alter table public.factory_vercel_runtime_log_events enable row level security;
revoke all on table public.factory_vercel_runtime_log_events from public, anon, authenticated, service_role;
grant select, insert on table public.factory_vercel_runtime_log_events to service_role;

comment on table public.factory_vercel_runtime_log_events is
  'Immutable minimal P4.7 Vercel runtime-log evidence. Stores only error/fatal/5xx events and structured Factory smoke markers; raw log messages are never persisted.';

create or replace function public.ingest_factory_vercel_runtime_log_batch_v1(p_events jsonb)
returns table(inserted_count integer, duplicate_count integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_event jsonb;
  v_count integer;
  v_inserted integer := 0;
  v_log_id text;
  v_project_id text;
  v_deployment_id text;
  v_environment text;
  v_kind text;
  v_level text;
  v_source text;
  v_host text;
  v_path text;
  v_status integer;
  v_message_hash text;
  v_ts_ms numeric;
  v_smoke_run_id uuid;
  v_smoke_phase text;
  v_envelope_run_id uuid;
  v_git_sha text;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'P4_7_LOG_BATCH_INVALID';
  end if;
  v_count := jsonb_array_length(p_events);
  if v_count > 500 then raise exception 'P4_7_LOG_BATCH_TOO_LARGE'; end if;

  for v_event in select value from jsonb_array_elements(p_events) loop
    if jsonb_typeof(v_event) <> 'object' then raise exception 'P4_7_LOG_EVENT_INVALID'; end if;

    v_log_id := btrim(coalesce(v_event->>'vercelLogId',''));
    v_project_id := btrim(coalesce(v_event->>'projectId',''));
    v_deployment_id := btrim(coalesce(v_event->>'deploymentId',''));
    v_environment := lower(btrim(coalesce(v_event->>'environment','')));
    v_kind := lower(btrim(coalesce(v_event->>'kind','')));
    v_level := lower(btrim(coalesce(v_event->>'level','')));
    v_source := btrim(coalesce(v_event->>'source',''));
    v_host := nullif(left(btrim(coalesce(v_event->>'host','')),255),'');
    v_path := nullif(left(split_part(btrim(coalesce(v_event->>'requestPath','')),'?',1),512),'');
    v_message_hash := lower(btrim(coalesce(v_event->>'messageSha256','')));

    if v_log_id = '' or char_length(v_log_id) > 160 then raise exception 'P4_7_LOG_ID_INVALID'; end if;
    if v_project_id = '' or char_length(v_project_id) > 128 then raise exception 'P4_7_PROJECT_ID_INVALID'; end if;
    if v_deployment_id !~ '^dpl_[A-Za-z0-9]+$' then raise exception 'P4_7_DEPLOYMENT_ID_INVALID'; end if;
    if v_environment not in ('preview','production') then raise exception 'P4_7_ENVIRONMENT_INVALID'; end if;
    if v_kind not in ('error','fatal','http_5xx','factory_smoke_marker') then raise exception 'P4_7_KIND_INVALID'; end if;
    if v_level not in ('debug','error','fatal','info','trace','warning') then raise exception 'P4_7_LEVEL_INVALID'; end if;
    if v_source = '' or char_length(v_source) > 64 then raise exception 'P4_7_SOURCE_INVALID'; end if;
    if v_message_hash !~ '^[a-f0-9]{64}$' then raise exception 'P4_7_MESSAGE_HASH_INVALID'; end if;
    if jsonb_typeof(v_event->'eventTimestampMs') <> 'number' then raise exception 'P4_7_TIMESTAMP_INVALID'; end if;
    v_ts_ms := (v_event->>'eventTimestampMs')::numeric;
    if v_ts_ms < 0 then raise exception 'P4_7_TIMESTAMP_INVALID'; end if;

    v_status := null;
    if v_event ? 'statusCode' and v_event->'statusCode' <> 'null'::jsonb then
      if jsonb_typeof(v_event->'statusCode') <> 'number' then raise exception 'P4_7_STATUS_INVALID'; end if;
      v_status := (v_event->>'statusCode')::integer;
      if v_status < 100 or v_status > 599 then raise exception 'P4_7_STATUS_INVALID'; end if;
    end if;

    v_smoke_run_id := null;
    v_smoke_phase := null;
    v_envelope_run_id := null;
    v_git_sha := null;
    if v_kind = 'factory_smoke_marker' then
      v_smoke_run_id := nullif(v_event->>'smokeRunId','')::uuid;
      v_smoke_phase := lower(btrim(coalesce(v_event->>'smokePhase','')));
      v_envelope_run_id := nullif(v_event->>'envelopeProjectionRunId','')::uuid;
      v_git_sha := lower(btrim(coalesce(v_event->>'gitSha','')));
      if v_smoke_run_id is null or v_envelope_run_id is null then raise exception 'P4_7_MARKER_ID_INVALID'; end if;
      if v_smoke_phase not in ('start','end','settle') then raise exception 'P4_7_MARKER_PHASE_INVALID'; end if;
      if v_git_sha !~ '^[a-f0-9]{40}$' then raise exception 'P4_7_MARKER_SHA_INVALID'; end if;
    end if;

    insert into public.factory_vercel_runtime_log_events(
      vercel_log_id, project_id, deployment_id, environment, event_timestamp,
      event_kind, level, source, host, request_path, status_code, message_sha256,
      smoke_run_id, smoke_phase, envelope_projection_run_id, git_sha
    ) values (
      v_log_id, v_project_id, v_deployment_id, v_environment, to_timestamp(v_ts_ms / 1000.0),
      v_kind, v_level, v_source, v_host, v_path, v_status, v_message_hash,
      v_smoke_run_id, v_smoke_phase, v_envelope_run_id, v_git_sha
    ) on conflict (vercel_log_id) do nothing;
    if found then v_inserted := v_inserted + 1; end if;
  end loop;

  return query select v_inserted, v_count - v_inserted;
end;
$function$;

revoke all on function public.ingest_factory_vercel_runtime_log_batch_v1(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_factory_vercel_runtime_log_batch_v1(jsonb) to service_role;

comment on function public.ingest_factory_vercel_runtime_log_batch_v1(jsonb) is
  'P4.7 service-role-only idempotent ingest for signature-verified, normalized Vercel runtime log evidence.';

create or replace function public.get_factory_vercel_runtime_log_window_v1(
  p_deployment_id text,
  p_smoke_run_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $function$
declare
  v_start public.factory_vercel_runtime_log_events%rowtype;
  v_end public.factory_vercel_runtime_log_events%rowtype;
  v_settle public.factory_vercel_runtime_log_events%rowtype;
  v_error_count integer := 0;
  v_marker_count integer := 0;
  v_consistent boolean := false;
begin
  p_deployment_id := btrim(coalesce(p_deployment_id,''));
  if p_deployment_id !~ '^dpl_[A-Za-z0-9]+$' or p_smoke_run_id is null then
    return jsonb_build_object('status','invalid','errorCount',0,'markerCount',0);
  end if;

  select * into v_start from public.factory_vercel_runtime_log_events
    where deployment_id=p_deployment_id and smoke_run_id=p_smoke_run_id and smoke_phase='start'
    order by event_timestamp asc limit 1;
  select * into v_end from public.factory_vercel_runtime_log_events
    where deployment_id=p_deployment_id and smoke_run_id=p_smoke_run_id and smoke_phase='end'
    order by event_timestamp asc limit 1;
  select * into v_settle from public.factory_vercel_runtime_log_events
    where deployment_id=p_deployment_id and smoke_run_id=p_smoke_run_id and smoke_phase='settle'
    order by event_timestamp asc limit 1;

  select count(*)::integer into v_marker_count
  from public.factory_vercel_runtime_log_events
  where deployment_id=p_deployment_id and smoke_run_id=p_smoke_run_id and event_kind='factory_smoke_marker';

  if v_start.vercel_log_id is null or v_end.vercel_log_id is null or v_settle.vercel_log_id is null then
    return jsonb_build_object('status','pending','errorCount',0,'markerCount',v_marker_count);
  end if;

  v_consistent :=
    v_start.project_id=v_end.project_id and v_end.project_id=v_settle.project_id
    and v_start.environment=v_end.environment and v_end.environment=v_settle.environment
    and v_start.envelope_projection_run_id=v_end.envelope_projection_run_id and v_end.envelope_projection_run_id=v_settle.envelope_projection_run_id
    and v_start.git_sha=v_end.git_sha and v_end.git_sha=v_settle.git_sha
    and v_start.event_timestamp < v_end.event_timestamp
    and v_end.event_timestamp + interval '60 seconds' <= v_settle.event_timestamp;

  if not v_consistent or v_marker_count <> 3 then
    return jsonb_build_object('status','failed','errorCount',0,'markerCount',v_marker_count,'reason','marker_inconsistent');
  end if;

  select count(*)::integer into v_error_count
  from public.factory_vercel_runtime_log_events e
  where e.deployment_id=p_deployment_id
    and e.event_timestamp between v_start.event_timestamp and v_settle.event_timestamp
    and e.event_kind in ('error','fatal','http_5xx');

  return jsonb_build_object(
    'status', case when v_error_count=0 then 'observed_clean' else 'failed' end,
    'errorCount', v_error_count,
    'markerCount', v_marker_count,
    'projectId', v_start.project_id,
    'environment', v_start.environment,
    'deploymentId', p_deployment_id,
    'smokeRunId', p_smoke_run_id,
    'envelopeProjectionRunId', v_start.envelope_projection_run_id,
    'gitSha', v_start.git_sha,
    'windowStart', v_start.event_timestamp,
    'windowEnd', v_settle.event_timestamp,
    'evidenceSemantics', 'observed_drain_window_not_p2_5_validation'
  );
end;
$function$;

revoke all on function public.get_factory_vercel_runtime_log_window_v1(text,uuid) from public, anon, authenticated;
grant execute on function public.get_factory_vercel_runtime_log_window_v1(text,uuid) to service_role;

comment on function public.get_factory_vercel_runtime_log_window_v1(text,uuid) is
  'P4.7 read-only summary of a three-marker Vercel Drain observation window. observed_clean is not itself P2.5 runtime_errors validation.';
