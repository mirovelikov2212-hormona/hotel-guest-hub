begin;

create table if not exists public.manager_intelligence_recommendations (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  fingerprint text not null,
  source_type text not null check (source_type in ('request_pattern','ai_intent','incident_pattern','manual')),
  source_ref text null,
  incident_id text null,
  module text not null,
  department text null,
  action_mode text not null check (action_mode in ('recommendation_only','manager_approved_configuration','manual_action')),
  action_type text not null,
  status text not null default 'generated' check (
    status in (
      'generated','viewed','approved','rejected','expired',
      'execution_pending','executed','measurement_pending','measured'
    )
  ),
  title text not null,
  problem text not null,
  recommendation text not null,
  expected_outcome text not null,
  evidence_quality text not null default 'medium' check (evidence_quality in ('low','medium','high')),
  confidence numeric(5,4) null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence_json jsonb not null default '{}'::jsonb,
  action_payload_json jsonb not null default '{}'::jsonb,
  baseline_json jsonb not null default '{}'::jsonb,
  previous_value_json jsonb null,
  new_value_json jsonb null,
  manager_decision text null check (manager_decision is null or manager_decision in ('approved','rejected')),
  decided_by_session_id uuid null,
  decision_at timestamptz null,
  viewed_at timestamptz null,
  approved_at timestamptz null,
  rejected_at timestamptz null,
  execution_status text not null default 'not_started' check (
    execution_status in (
      'not_started','manual_required','pending','executed',
      'completed','failed','not_applicable'
    )
  ),
  execution_reference_type text null,
  execution_reference_id text null,
  executed_by_session_id uuid null,
  executed_at timestamptz null,
  measurement_window_start timestamptz null,
  measurement_window_end timestamptz null,
  impact_basis text null check (
    impact_basis is null or impact_basis in ('measured','estimated','insufficient_data')
  ),
  impact_outcome text null check (
    impact_outcome is null or impact_outcome in (
      'positive','no_material_change','negative','insufficient_data'
    )
  ),
  impact_json jsonb null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manager_intelligence_recommendations_hotel_fingerprint_unique
    unique (hotel_id, fingerprint)
);

create index if not exists manager_intelligence_recommendations_hotel_status_idx
  on public.manager_intelligence_recommendations (hotel_id, status, created_at desc);

create index if not exists manager_intelligence_recommendations_measurement_idx
  on public.manager_intelligence_recommendations (hotel_id, measurement_window_end)
  where executed_at is not null and impact_json is null;

create index if not exists manager_intelligence_recommendations_incident_idx
  on public.manager_intelligence_recommendations (hotel_id, incident_id)
  where incident_id is not null;

create table if not exists public.manager_intelligence_recommendation_events (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  recommendation_id uuid not null
    references public.manager_intelligence_recommendations(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'generated','viewed','approved','rejected','expired',
      'execution_started','executed','execution_failed',
      'measurement_started','measurement_calculated'
    )
  ),
  actor_session_id uuid null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists manager_intelligence_recommendation_events_history_idx
  on public.manager_intelligence_recommendation_events
  (hotel_id, recommendation_id, created_at asc);

alter table public.manager_intelligence_recommendations enable row level security;
alter table public.manager_intelligence_recommendation_events enable row level security;

revoke all on table public.manager_intelligence_recommendations
  from anon, authenticated, service_role;
revoke all on table public.manager_intelligence_recommendation_events
  from anon, authenticated, service_role;

grant select, insert, update on table public.manager_intelligence_recommendations
  to service_role;
grant select, insert on table public.manager_intelligence_recommendation_events
  to service_role;

commit;
