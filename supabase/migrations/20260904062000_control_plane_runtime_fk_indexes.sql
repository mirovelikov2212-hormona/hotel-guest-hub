-- Cover the Control Plane / runtime-cell foreign keys reported by Supabase Performance Advisor.
-- Additive only; no data or routing semantics change.
-- Validated after Factory Release Gate hardening merged to main.

create index if not exists hotel_runtime_cell_assignments_assigned_by_admin_idx
  on public.hotel_runtime_cell_assignments (assigned_by_admin_id);

create index if not exists runtime_cell_cutover_plans_prepared_by_admin_idx
  on public.runtime_cell_cutover_plans (prepared_by_admin_id);

create index if not exists runtime_cell_cutover_plans_verification_evidence_idx
  on public.runtime_cell_cutover_plans (target_verification_evidence_id);

create index if not exists runtime_cell_cutover_plans_rollback_target_idx
  on public.runtime_cell_cutover_plans (rollback_target_key);

create index if not exists runtime_cell_cutover_plans_source_target_idx
  on public.runtime_cell_cutover_plans (source_target_key);

create index if not exists runtime_cells_routing_target_idx
  on public.runtime_cells (routing_target_key);

create index if not exists runtime_target_traffic_lease_actor_admin_idx
  on public.runtime_target_traffic_lease_evidence (actor_admin_id);

create index if not exists runtime_target_verification_actor_admin_idx
  on public.runtime_target_verification_evidence (actor_admin_id);
