begin;

-- P5.7 follow-up: runtime_cells must be genuinely read-only to service-role
-- callers. Earlier grants included REFERENCES/TRIGGER in addition to DML.
-- Security-definer control functions owned by the database owner remain the
-- only mutation authority.
revoke all on table public.runtime_cells from service_role;
grant select on table public.runtime_cells to service_role;

-- Keep the binding primitive internal-only even if an earlier grant is replayed.
revoke execute on function public.move_runtime_cell_target_v1(uuid, text, text, bigint, text)
  from public, anon, authenticated, service_role;

commit;
