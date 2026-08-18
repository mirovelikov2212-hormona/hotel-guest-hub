create index factory_vercel_runtime_log_events_envelope_idx
  on public.factory_vercel_runtime_log_events(envelope_projection_run_id)
  where envelope_projection_run_id is not null;

comment on index public.factory_vercel_runtime_log_events_envelope_idx is
  'P4.7 covering index for immutable Factory envelope lineage references in Vercel runtime-log evidence.';
