-- Pilot 4.1 recovery: additive FILE ONLY. Apply and validate separately in Supabase Preview.
-- Source-oriented platform evidence; these objects do not bind a hotel tenant.
begin;

-- Match the server's exact execution-metadata exclusions. Preserve all other
-- fields, including unknown future evidence. Digests always use stored UTF-8
-- canonical text, never PostgreSQL's differently formatted jsonb::text.
create or replace function public.semantic_hotel_scan_evidence_v2(r jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog, public as $$
declare e jsonb;
begin
  e := r #- '{source,scannedAt}' #- '{intelligenceCandidate,source,scannedAt}'
    #- '{intelligenceCandidate,generatedAt}' #- '{diagnostics,discoveryLatencyMs}'
    #- '{diagnostics,extractionLatencyMs}' #- '{diagnostics,documentLatencyMs}'
    #- '{diagnostics,verificationLatencyMs}' #- '{diagnostics,totalLatencyMs}'
    #- '{extraction,diagnostics,aiRequestCount}';
  if e#>'{extraction,domains}' is not null then
    e := jsonb_set(e, '{extraction,domains}', (select coalesce(jsonb_agg(d - 'latencyMs' - 'requestCount' order by n), '[]'::jsonb)
      from jsonb_array_elements(e#>'{extraction,domains}') with ordinality as domains(d, n)));
  end if;
  if e#>'{documents,documents}' is not null then
    e := jsonb_set(e, '{documents,documents}', (select coalesce(jsonb_agg(d - 'latencyMs' order by n), '[]'::jsonb)
      from jsonb_array_elements(e#>'{documents,documents}') with ordinality as documents(d, n)));
  end if;
  return e;
end;
$$;

-- RFC 9562 UUIDv8, identical fixed namespace, UTF-8 input and bit layout to TS.
create or replace function public.sync_hotel_scan_run_id_v2(p_actor_admin_id uuid, p_idempotency_key text)
returns uuid language plpgsql immutable set search_path = pg_catalog, public as $$
declare b bytea; h text;
begin
  if p_actor_admin_id is null or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,180}$' then
    raise exception 'V2_IDEMPOTENCY_INVALID';
  end if;
  b := substring(sha256(convert_to('gostaya:hotel-scanner-v2:sync:v1:' || p_actor_admin_id::text || ':' || p_idempotency_key, 'UTF8')) from 1 for 16);
  b := set_byte(b, 6, (get_byte(b, 6) & 15) | 128);
  b := set_byte(b, 8, (get_byte(b, 8) & 63) | 128);
  h := encode(b, 'hex');
  return (substring(h from 1 for 8) || '-' || substring(h from 9 for 4) || '-' || substring(h from 13 for 4)
    || '-' || substring(h from 17 for 4) || '-' || substring(h from 21 for 12))::uuid;
end;
$$;

create table if not exists public.hotel_scan_runs_v2 (
  id uuid primary key,
  actor_admin_id uuid not null references public.platform_admins(id) on delete restrict,
  source_key text not null check (source_key ~ '^[a-f0-9]{64}$'),
  envelope_text text not null,
  envelope_checksum text not null check (envelope_checksum ~ '^[a-f0-9]{64}$'),
  evidence_text text not null,
  evidence_checksum text not null check (evidence_checksum ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (id, evidence_checksum),
  constraint hotel_scan_runs_v2_digest check (
    evidence_checksum = encode(sha256(convert_to(evidence_text, 'UTF8')), 'hex')
    and envelope_checksum = encode(sha256(convert_to(envelope_text, 'UTF8')), 'hex')
  ),
  constraint hotel_scan_runs_v2_shape check ((
    jsonb_typeof(envelope_text::jsonb) = 'object'
    and envelope_text::jsonb->>'schemaVersion' = 'hotel-scan-envelope-v2'
    and envelope_text::jsonb->>'checksumVersion' = 'canonical-json-sha256-v1'
    and envelope_text::jsonb->>'scope' = 'platform_source'
    and envelope_text::jsonb->>'scanRunId' = id::text
    and envelope_text::jsonb->>'actorAdminId' = actor_admin_id::text
    and envelope_text::jsonb->>'sourceKey' = source_key
    and envelope_text::jsonb->>'outputLanguage' in ('en', 'bg')
    and envelope_text::jsonb->>'evidenceText' = evidence_text
    and evidence_text::jsonb = public.semantic_hotel_scan_evidence_v2(envelope_text::jsonb->'result')
    and (not (envelope_text::jsonb ? 'syncRequest') or (
      jsonb_typeof(envelope_text::jsonb->'syncRequest') = 'object'
      and jsonb_typeof(envelope_text::jsonb#>'{syncRequest,requestedUrl}') = 'string'
      and length(envelope_text::jsonb#>>'{syncRequest,requestedUrl}') > 0
      -- Scanner V2 stores both requested URLs in its existing canonical form.
      and envelope_text::jsonb#>>'{syncRequest,requestedUrl}' = envelope_text::jsonb#>>'{result,source,requestedUrl}'
      and envelope_text::jsonb#>>'{syncRequest,outputLanguage}' = envelope_text::jsonb->>'outputLanguage'
      and id = public.sync_hotel_scan_run_id_v2(actor_admin_id, envelope_text::jsonb#>>'{syncRequest,idempotencyKey}')
    ))
    and envelope_text::jsonb#>>'{result,schemaVersion}' = 'hotel-intake-pipeline-v2'
    and envelope_text::jsonb#>>'{result,stage}' = 'VALIDATION_COMPLETE'
    and envelope_text::jsonb#>>'{result,intelligenceCandidate,schemaVersion}' = 'hotel-intelligence-candidate-v2'
    and envelope_text::jsonb#>'{result,approvedHotelIntelligence}' = 'null'::jsonb
    and envelope_text::jsonb#>'{result,validationGate,downstreamHandoffAllowed}' = 'false'::jsonb
    and envelope_text::jsonb#>'{result,intelligenceCandidate,validation,downstreamHandoffAllowed}' = 'false'::jsonb
    and envelope_text::jsonb#>'{result,source}' = envelope_text::jsonb#>'{result,intelligenceCandidate,source}'
  ) is true)
);
create index if not exists hotel_scan_runs_v2_source_idx on public.hotel_scan_runs_v2(source_key, created_at desc);

-- A scan is a workspace with one immutable draft (revision 1). Approval appends
-- a receipt (revision 2); there is no mutable latest-by-source pointer.
create table if not exists public.hotel_intelligence_reviews_v2 (
  id uuid primary key default gen_random_uuid(),
  scan_run_id uuid not null unique,
  evidence_checksum text not null,
  review_text text not null,
  review_checksum text not null check (review_checksum ~ '^[a-f0-9]{64}$'),
  projection_version text not null default 'hotel-intelligence-review-v2'
    check (projection_version = 'hotel-intelligence-review-v2'),
  created_by uuid not null references public.platform_admins(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (scan_run_id, evidence_checksum) references public.hotel_scan_runs_v2(id, evidence_checksum) on delete restrict,
  unique (id, scan_run_id, evidence_checksum, review_checksum),
  constraint hotel_intelligence_reviews_v2_digest check (
    review_checksum = encode(sha256(convert_to(review_text, 'UTF8')), 'hex')
  ),
  constraint hotel_intelligence_reviews_v2_shape check ((
    jsonb_typeof(review_text::jsonb) = 'object'
    and review_text::jsonb->>'schemaVersion' = 'hotel-intelligence-review-v2'
    and review_text::jsonb->>'projectionVersion' = projection_version
    and review_text::jsonb->>'revisionId' = id::text
    and review_text::jsonb->>'scanRunId' = scan_run_id::text
    and review_text::jsonb->>'workspaceId' = scan_run_id::text
    and review_text::jsonb->'revisionNo' = '1'::jsonb
    and review_text::jsonb->>'evidenceChecksum' = evidence_checksum
    and review_text::jsonb->>'createdBy' = created_by::text
    and (review_text::jsonb->>'createdAt')::timestamptz = created_at
    and review_text::jsonb->>'status' = 'DRAFT'
    and review_text::jsonb->'downstreamHandoffAllowed' = 'false'::jsonb
    and jsonb_typeof(review_text::jsonb->'approvalEligible') = 'boolean'
    and jsonb_typeof(review_text::jsonb->'blockingReasons') = 'array'
    and jsonb_typeof(review_text::jsonb->'reviewSections') = 'array'
    and jsonb_typeof(review_text::jsonb->'missingInformation') = 'array'
    and jsonb_typeof(review_text::jsonb->'recomputedCompleteness') = 'object'
  ) is true)
);
create table if not exists public.hotel_intelligence_approvals_v2 (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null,
  scan_run_id uuid not null,
  evidence_checksum text not null,
  review_checksum text not null,
  approved_by uuid not null references public.platform_admins(id) on delete restrict,
  approved_at timestamptz not null default now(),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9._:-]{8,180}$'),
  unique (review_id),
  unique (approved_by, idempotency_key),
  foreign key (review_id, scan_run_id, evidence_checksum, review_checksum)
    references public.hotel_intelligence_reviews_v2(id, scan_run_id, evidence_checksum, review_checksum) on delete restrict
);

alter table public.hotel_scan_runs_v2 enable row level security;
alter table public.hotel_intelligence_reviews_v2 enable row level security;
alter table public.hotel_intelligence_approvals_v2 enable row level security;
revoke all on table public.hotel_scan_runs_v2 from public, anon, authenticated, service_role;
revoke all on table public.hotel_intelligence_reviews_v2 from public, anon, authenticated, service_role;
revoke all on table public.hotel_intelligence_approvals_v2 from public, anon, authenticated, service_role;
grant select on table public.hotel_scan_runs_v2 to service_role;
grant select on table public.hotel_intelligence_reviews_v2 to service_role;
grant select on table public.hotel_intelligence_approvals_v2 to service_role;

create or replace function public.reject_hotel_intelligence_v2_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'V2_RECORD_IMMUTABLE';
end;
$$;
-- Guard creation is repeatable without removing historical protections.
do $$
declare t text;
begin
  foreach t in array array['hotel_scan_runs_v2', 'hotel_intelligence_reviews_v2', 'hotel_intelligence_approvals_v2'] loop
    if not exists (select 1 from pg_trigger where tgrelid = ('public.' || t)::regclass and tgname = t || '_immutable') then
      execute format('create trigger %I before update or delete on public.%I for each row execute function public.reject_hotel_intelligence_v2_mutation()', t || '_immutable', t);
    end if;
    if not exists (select 1 from pg_trigger where tgrelid = ('public.' || t)::regclass and tgname = t || '_no_truncate') then
      execute format('create trigger %I before truncate on public.%I for each statement execute function public.reject_hotel_intelligence_v2_mutation()', t || '_no_truncate', t);
    end if;
  end loop;
end;
$$;

-- Internal helper; callable only by the function owner. The API authenticates
-- the Control Plane session; RPCs independently recheck its active admin role.
create or replace function public.assert_hotel_intelligence_v2_actor(p_actor_admin_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform 1 from public.platform_admins
    where id = p_actor_admin_id and active = true and role in ('super_admin', 'operator') for share;
  if not found then raise exception 'V2_ADMIN_FORBIDDEN'; end if;
end;
$$;

create or replace function public.verified_hotel_scan_envelope_v2(p_scan_run_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare s public.hotel_scan_runs_v2%rowtype; e jsonb;
begin
  select * into s from public.hotel_scan_runs_v2 where id = p_scan_run_id;
  if not found then raise exception 'V2_SCAN_NOT_FOUND'; end if;
  if s.evidence_checksum IS DISTINCT FROM encode(sha256(convert_to(s.evidence_text, 'UTF8')), 'hex') then
    raise exception 'V2_EVIDENCE_CHECKSUM_MISMATCH';
  end if;
  if s.envelope_checksum IS DISTINCT FROM encode(sha256(convert_to(s.envelope_text, 'UTF8')), 'hex') then
    raise exception 'V2_ENVELOPE_CHECKSUM_MISMATCH';
  end if;
  e := s.envelope_text::jsonb;
  if e->>'evidenceText' IS DISTINCT FROM s.evidence_text
    or s.evidence_text::jsonb IS DISTINCT FROM public.semantic_hotel_scan_evidence_v2(e->'result') then
    raise exception 'V2_EVIDENCE_CHECKSUM_MISMATCH';
  end if;
  if e->>'scanRunId' IS DISTINCT FROM s.id::text
    or e->>'actorAdminId' IS DISTINCT FROM s.actor_admin_id::text
    or e->>'sourceKey' IS DISTINCT FROM s.source_key then raise exception 'V2_SCAN_LINEAGE_MISMATCH'; end if;
  if e ? 'syncRequest' and (
    jsonb_typeof(e#>'{syncRequest,requestedUrl}') IS DISTINCT FROM 'string'
    or coalesce(length(e#>>'{syncRequest,requestedUrl}'), 0) = 0
    or e#>>'{syncRequest,requestedUrl}' IS DISTINCT FROM e#>>'{result,source,requestedUrl}'
  ) then raise exception 'V2_IDEMPOTENCY_CONFLICT'; end if;
  return e;
end;
$$;

-- Historical review verification checks stored bytes and lineage only. It does
-- not execute a projector, regenerate cards, or recalculate completeness.
create or replace function public.verified_hotel_intelligence_review_v2(p_review_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.hotel_intelligence_reviews_v2%rowtype; s public.hotel_scan_runs_v2%rowtype; v jsonb; e jsonb;
begin
  select * into r from public.hotel_intelligence_reviews_v2 where id = p_review_id;
  if not found then raise exception 'V2_REVIEW_NOT_FOUND'; end if;
  e := public.verified_hotel_scan_envelope_v2(r.scan_run_id);
  select * into s from public.hotel_scan_runs_v2 where id = r.scan_run_id;
  if r.review_checksum IS DISTINCT FROM encode(sha256(convert_to(r.review_text, 'UTF8')), 'hex') then
    raise exception 'V2_REVIEW_CHECKSUM_MISMATCH';
  end if;
  v := r.review_text::jsonb;
  if r.evidence_checksum IS DISTINCT FROM s.evidence_checksum
    or v->>'evidenceChecksum' IS DISTINCT FROM s.evidence_checksum
    or v->>'envelopeChecksum' IS DISTINCT FROM s.envelope_checksum
    or v->>'revisionId' IS DISTINCT FROM r.id::text
    or v->>'scanRunId' IS DISTINCT FROM s.id::text
    or v->>'workspaceId' IS DISTINCT FROM s.id::text
    or v->>'createdBy' IS DISTINCT FROM r.created_by::text
    or (v->>'createdAt')::timestamptz IS DISTINCT FROM r.created_at
    or v->>'projectionVersion' IS DISTINCT FROM r.projection_version
    or v->>'schemaVersion' IS DISTINCT FROM 'hotel-intelligence-review-v2'
    or v->>'scope' IS DISTINCT FROM e->>'scope'
    or v->>'sourceKey' IS DISTINCT FROM s.source_key
    or v->'candidate' IS DISTINCT FROM e#>'{result,intelligenceCandidate}'
    or v#>'{identity,source}' IS DISTINCT FROM e#>'{result,source}'
    or v->'documents' IS DISTINCT FROM e#>'{result,documents}'
    or v->'discovery' IS DISTINCT FROM e#>'{result,discovery}'
    or v->'extraction' IS DISTINCT FROM e#>'{result,extraction}'
    or v->'verification' IS DISTINCT FROM e#>'{result,verification}'
    or v->'diagnostics' IS DISTINCT FROM e#>'{result,diagnostics}'
    or v->'scannerReviewSections' IS DISTINCT FROM e#>'{result,reviewSections}' then
    raise exception 'V2_REVIEW_LINEAGE_MISMATCH';
  end if;
  return v;
end;
$$;

create or replace function public.create_hotel_scan_run_v2(p_actor_admin_id uuid, p_scan_run_id uuid, p_envelope_text text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare s public.hotel_scan_runs_v2%rowtype; e jsonb; stored jsonb; checksum text; envelope_digest text;
begin
  perform public.assert_hotel_intelligence_v2_actor(p_actor_admin_id);
  e := p_envelope_text::jsonb;
  if p_scan_run_id is null or p_envelope_text is null
    or e->>'actorAdminId' IS DISTINCT FROM p_actor_admin_id::text
    or e->>'scanRunId' IS DISTINCT FROM p_scan_run_id::text then raise exception 'V2_SCAN_LINEAGE_MISMATCH'; end if;
  checksum := encode(sha256(convert_to(e->>'evidenceText', 'UTF8')), 'hex');
  envelope_digest := encode(sha256(convert_to(p_envelope_text, 'UTF8')), 'hex');
  if (e->>'evidenceText')::jsonb IS DISTINCT FROM public.semantic_hotel_scan_evidence_v2(e->'result') then
    raise exception 'V2_EVIDENCE_CHECKSUM_MISMATCH';
  end if;
  if e ? 'syncRequest' then
    if jsonb_typeof(e->'syncRequest') IS DISTINCT FROM 'object'
      or jsonb_typeof(e#>'{syncRequest,requestedUrl}') IS DISTINCT FROM 'string'
      or coalesce(length(e#>>'{syncRequest,requestedUrl}'), 0) = 0
      or e#>>'{syncRequest,requestedUrl}' IS DISTINCT FROM e#>>'{result,source,requestedUrl}'
      or p_scan_run_id IS DISTINCT FROM public.sync_hotel_scan_run_id_v2(p_actor_admin_id, e#>>'{syncRequest,idempotencyKey}')
      or e#>>'{syncRequest,outputLanguage}' IS DISTINCT FROM e->>'outputLanguage' then
      raise exception 'V2_IDEMPOTENCY_CONFLICT';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gostaya:scan-v2:' || p_scan_run_id::text, 0));
  select * into s from public.hotel_scan_runs_v2 where id = p_scan_run_id;
  if found then
    stored := public.verified_hotel_scan_envelope_v2(s.id);
    if s.actor_admin_id IS DISTINCT FROM p_actor_admin_id then raise exception 'V2_IDEMPOTENCY_CONFLICT'; end if;
    if e ? 'syncRequest' then
      if stored->'syncRequest' IS DISTINCT FROM e->'syncRequest' then raise exception 'V2_IDEMPOTENCY_CONFLICT'; end if;
    elsif s.envelope_text IS DISTINCT FROM p_envelope_text or s.envelope_checksum IS DISTINCT FROM envelope_digest
      or s.evidence_checksum IS DISTINCT FROM checksum then raise exception 'V2_IDEMPOTENCY_CONFLICT'; end if;
    return to_jsonb(s);
  end if;
  insert into public.hotel_scan_runs_v2(id, actor_admin_id, source_key, envelope_text, envelope_checksum, evidence_text, evidence_checksum)
    values (p_scan_run_id, p_actor_admin_id, e->>'sourceKey', p_envelope_text, envelope_digest, e->>'evidenceText', checksum) returning * into s;
  perform public.verified_hotel_scan_envelope_v2(s.id);
  insert into public.control_plane_audit_log(actor_admin_id, action, resource_type, resource_id, metadata_json)
    values (p_actor_admin_id, 'hotel_scan_v2_persisted', 'hotel_scan_run_v2', s.id::text,
      jsonb_build_object('scanRunId', s.id, 'evidenceChecksum', checksum, 'envelopeChecksum', envelope_digest, 'sourceKey', s.source_key));
  return to_jsonb(s);
end;
$$;

create or replace function public.import_hotel_intelligence_review_v2(p_actor_admin_id uuid, p_scan_run_id uuid, p_review_text text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare s public.hotel_scan_runs_v2%rowtype; r public.hotel_intelligence_reviews_v2%rowtype; v jsonb;
begin
  perform public.assert_hotel_intelligence_v2_actor(p_actor_admin_id);
  -- Only the server builds initial projection content from verified evidence.
  -- The browser import API accepts identifiers only. Serialize first imports.
  select * into s from public.hotel_scan_runs_v2 where id = p_scan_run_id for update;
  if not found then raise exception 'V2_SCAN_NOT_FOUND'; end if;
  perform public.verified_hotel_scan_envelope_v2(s.id);
  select * into r from public.hotel_intelligence_reviews_v2 where scan_run_id = s.id;
  if found then
    perform public.verified_hotel_intelligence_review_v2(r.id);
    return to_jsonb(r);
  end if;
  v := p_review_text::jsonb;
  if p_review_text is null or v->>'createdBy' IS DISTINCT FROM p_actor_admin_id::text
    or v->>'scanRunId' IS DISTINCT FROM s.id::text or v->>'evidenceChecksum' IS DISTINCT FROM s.evidence_checksum then
    raise exception 'V2_REVIEW_LINEAGE_MISMATCH';
  end if;
  insert into public.hotel_intelligence_reviews_v2(id, scan_run_id, evidence_checksum, created_by, created_at, projection_version, review_text, review_checksum)
    values ((v->>'revisionId')::uuid, s.id, s.evidence_checksum, p_actor_admin_id, (v->>'createdAt')::timestamptz,
      v->>'projectionVersion', p_review_text, encode(sha256(convert_to(p_review_text, 'UTF8')), 'hex')) returning * into r;
  perform public.verified_hotel_intelligence_review_v2(r.id);
  insert into public.control_plane_audit_log(actor_admin_id, action, resource_type, resource_id, metadata_json)
    values (p_actor_admin_id, 'hotel_intelligence_v2_review_imported', 'hotel_intelligence_review_v2', r.id::text,
      jsonb_build_object('scanRunId', s.id, 'evidenceChecksum', s.evidence_checksum, 'reviewChecksum', r.review_checksum, 'projectionVersion', r.projection_version));
  return to_jsonb(r);
end;
$$;

-- Fail closed on absent fields or JSON types, including SQL NULL. Full
-- deterministic completeness was frozen in the server at initial review import.
create or replace function public.hotel_intelligence_v2_approval_ready(e jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
declare r jsonb := e->'result'; c jsonb := e#>'{result,intelligenceCandidate}';
begin
  if (
    r->>'pipelineStatus' = 'READY_FOR_APPROVAL'
    and r#>'{validationGate,approvalEligible}' = 'true'::jsonb
    and r#>'{validationGate,downstreamHandoffAllowed}' = 'false'::jsonb
    and r#>'{validationGate,blockingReasons}' = '[]'::jsonb
    and r->'approvedHotelIntelligence' = 'null'::jsonb
    and c#>>'{validation,status}' = 'READY_FOR_APPROVAL'
    and c#>'{validation,downstreamHandoffAllowed}' = 'false'::jsonb
    and c#>'{validation,blockingReasons}' = '[]'::jsonb
    and c->'conflicts' = '[]'::jsonb
    and c#>'{completeness,prerequisitesSatisfied}' = 'true'::jsonb
    and c#>>'{completeness,status}' = 'READY_FOR_HUMAN_REVIEW'
    and c#>'{completeness,blockingReasons}' = '[]'::jsonb
    and c#>'{completeness,documents,pending}' = '0'::jsonb
    and c#>'{completeness,conflicts,unresolved}' = '0'::jsonb
    and c#>'{completeness,conflicts,inventory}' = '0'::jsonb
    and r->'completeness' = c->'completeness'
    and r#>'{discovery,inventory}' = c->'inventory'
    and r#>'{discovery,coverage,coverageComplete}' = 'true'::jsonb
    and r#>'{discovery,coverage,failedRelevantCount}' = '0'::jsonb
    and r#>'{extraction,issues}' = '[]'::jsonb
    and jsonb_typeof(c->'facts') = 'array'
    and jsonb_typeof(c#>'{inventory,documents}') = 'array'
    and jsonb_typeof(c#>'{completeness,domains}') = 'array'
  ) is not true then return false; end if;
  if jsonb_array_length(c->'facts') = 0 then return false; end if;
  if exists (select 1 from jsonb_array_elements(c#>'{inventory,documents}') d
    where d->>'ingestionStatus' IS DISTINCT FROM 'INGESTED') then return false; end if;
  if exists (select 1 from jsonb_array_elements(c#>'{completeness,domains}') d
    where d->'blocking' IS DISTINCT FROM 'false'::jsonb or d->'missingItems' IS DISTINCT FROM '[]'::jsonb) then return false; end if;
  return true;
end;
$$;

create or replace function public.approve_hotel_intelligence_v2(
  p_actor_admin_id uuid, p_review_id uuid, p_expected_current_revision_id uuid,
  p_expected_evidence_checksum text, p_expected_review_checksum text, p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.hotel_intelligence_reviews_v2%rowtype;
  a public.hotel_intelligence_approvals_v2%rowtype; e jsonb; v jsonb;
begin
  perform public.assert_hotel_intelligence_v2_actor(p_actor_admin_id);
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,180}$' then raise exception 'V2_IDEMPOTENCY_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gostaya:approval-v2:' || p_actor_admin_id::text || ':' || p_idempotency_key, 0));
  select * into r from public.hotel_intelligence_reviews_v2 where id = p_review_id for update;
  if not found then raise exception 'V2_REVIEW_NOT_FOUND'; end if;
  if r.id IS DISTINCT FROM p_expected_current_revision_id then raise exception 'V2_CURRENT_REVISION_CONFLICT'; end if;
  e := public.verified_hotel_scan_envelope_v2(r.scan_run_id);
  v := public.verified_hotel_intelligence_review_v2(r.id);
  if r.review_checksum IS DISTINCT FROM p_expected_review_checksum then raise exception 'V2_REVIEW_CHECKSUM_MISMATCH'; end if;
  if r.evidence_checksum IS DISTINCT FROM p_expected_evidence_checksum
    or r.evidence_checksum IS DISTINCT FROM (select evidence_checksum from public.hotel_scan_runs_v2 where id = r.scan_run_id)
    or r.projection_version IS DISTINCT FROM 'hotel-intelligence-review-v2' then raise exception 'V2_REVIEW_LINEAGE_MISMATCH'; end if;
  if v->'approvalEligible' IS DISTINCT FROM 'true'::jsonb or v->'blockingReasons' IS DISTINCT FROM '[]'::jsonb
    or public.hotel_intelligence_v2_approval_ready(e) is not true then raise exception 'V2_APPROVAL_NOT_READY'; end if;
  select * into a from public.hotel_intelligence_approvals_v2 where review_id = r.id;
  if found then
    if a.approved_by IS DISTINCT FROM p_actor_admin_id or a.idempotency_key IS DISTINCT FROM p_idempotency_key then
      raise exception 'V2_CURRENT_REVISION_CONFLICT';
    end if;
    return to_jsonb(a); -- Exact retry returns the original immutable receipt.
  end if;
  if exists (select 1 from public.hotel_intelligence_approvals_v2 where approved_by = p_actor_admin_id and idempotency_key = p_idempotency_key) then
    raise exception 'V2_IDEMPOTENCY_CONFLICT';
  end if;
  insert into public.hotel_intelligence_approvals_v2(review_id, scan_run_id, evidence_checksum, review_checksum, approved_by, idempotency_key)
    values (r.id, r.scan_run_id, r.evidence_checksum, r.review_checksum, p_actor_admin_id, p_idempotency_key) returning * into a;
  insert into public.control_plane_audit_log(actor_admin_id, action, resource_type, resource_id, metadata_json)
    values (p_actor_admin_id, 'hotel_intelligence_v2_human_approved', 'hotel_intelligence_approval_v2', a.id::text,
      jsonb_build_object('reviewId', r.id, 'scanRunId', r.scan_run_id, 'evidenceChecksum', r.evidence_checksum,
        'reviewChecksum', r.review_checksum, 'approvedBy', a.approved_by, 'approvedAt', a.approved_at, 'idempotencyKey', a.idempotency_key));
  return to_jsonb(a);
end;
$$;

revoke all on function public.semantic_hotel_scan_evidence_v2(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.sync_hotel_scan_run_id_v2(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.verified_hotel_intelligence_review_v2(uuid) from public, anon, authenticated, service_role;
revoke all on function public.reject_hotel_intelligence_v2_mutation() from public, anon, authenticated, service_role;
revoke all on function public.assert_hotel_intelligence_v2_actor(uuid) from public, anon, authenticated, service_role;
revoke all on function public.verified_hotel_scan_envelope_v2(uuid) from public, anon, authenticated, service_role;
revoke all on function public.hotel_intelligence_v2_approval_ready(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.create_hotel_scan_run_v2(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.import_hotel_intelligence_review_v2(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.approve_hotel_intelligence_v2(uuid, uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.create_hotel_scan_run_v2(uuid, uuid, text) to service_role;
grant execute on function public.import_hotel_intelligence_review_v2(uuid, uuid, text) to service_role;
grant execute on function public.approve_hotel_intelligence_v2(uuid, uuid, uuid, text, text, text) to service_role;
commit;
