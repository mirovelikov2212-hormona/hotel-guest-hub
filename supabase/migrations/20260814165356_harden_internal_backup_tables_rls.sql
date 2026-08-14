revoke all privileges on table public.guest_requests_backup_before_clean
  from public, anon, authenticated;
revoke all privileges on table public.hub_events_backup_20260603_final_before_clean
  from public, anon, authenticated;
revoke all privileges on table public.guest_requests_backup_20260603_sanitized
  from public, anon, authenticated;
revoke all privileges on table public.stayhub_cleanup_archive
  from public, anon, authenticated;
revoke all privileges on table public.backup_room103_cleanup_20260802
  from public, anon, authenticated;

alter table public.guest_requests_backup_before_clean
  enable row level security;
alter table public.hub_events_backup_20260603_final_before_clean
  enable row level security;
alter table public.guest_requests_backup_20260603_sanitized
  enable row level security;
alter table public.stayhub_cleanup_archive
  enable row level security;
alter table public.backup_room103_cleanup_20260802
  enable row level security;
