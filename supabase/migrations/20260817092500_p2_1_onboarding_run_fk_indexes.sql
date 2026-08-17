begin;

create index if not exists factory_onboarding_runs_organization_idx
  on public.factory_onboarding_runs (organization_id);

create index if not exists factory_onboarding_runs_production_hotel_idx
  on public.factory_onboarding_runs (production_hotel_id);

create index if not exists factory_onboarding_runs_sandbox_hotel_idx
  on public.factory_onboarding_runs (sandbox_hotel_id);

create index if not exists factory_onboarding_runs_production_revision_idx
  on public.factory_onboarding_runs (production_revision_id);

create index if not exists factory_onboarding_runs_sandbox_revision_idx
  on public.factory_onboarding_runs (sandbox_revision_id);

commit;
