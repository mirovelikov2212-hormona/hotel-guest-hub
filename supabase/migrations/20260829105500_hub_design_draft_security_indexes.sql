begin;

create policy hub_design_workspaces_deny_direct_access
  on public.hub_design_workspaces
  for all
  to public
  using (false)
  with check (false);

create policy hub_design_draft_revisions_deny_direct_access
  on public.hub_design_draft_revisions
  for all
  to public
  using (false)
  with check (false);

create index if not exists hub_design_workspaces_created_by_idx
  on public.hub_design_workspaces (created_by);

create index if not exists hub_design_workspaces_current_revision_idx
  on public.hub_design_workspaces (id, current_revision_id)
  where current_revision_id is not null;

create index if not exists hub_design_draft_revisions_created_by_idx
  on public.hub_design_draft_revisions (created_by);

create index if not exists hub_design_draft_revisions_workspace_parent_idx
  on public.hub_design_draft_revisions (workspace_id, parent_revision_id)
  where parent_revision_id is not null;

create index if not exists hub_design_draft_revisions_workspace_restored_from_idx
  on public.hub_design_draft_revisions (workspace_id, restored_from_revision_id)
  where restored_from_revision_id is not null;

commit;
