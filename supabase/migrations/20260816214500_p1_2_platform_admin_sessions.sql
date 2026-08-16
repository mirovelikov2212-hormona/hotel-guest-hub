begin;

create table if not exists public.platform_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.platform_admins(id) on delete cascade,
  session_token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz null,
  constraint platform_admin_sessions_token_unique unique (session_token_hash),
  constraint platform_admin_sessions_expiry_check check (expires_at > created_at)
);

create index if not exists platform_admin_sessions_admin_active_idx
  on public.platform_admin_sessions (admin_id, expires_at desc)
  where revoked_at is null;

create index if not exists platform_admin_sessions_expiry_idx
  on public.platform_admin_sessions (expires_at)
  where revoked_at is null;

alter table public.platform_admin_sessions enable row level security;
revoke all on table public.platform_admin_sessions from anon, authenticated, service_role;
grant select, insert, update on table public.platform_admin_sessions to service_role;

commit;
