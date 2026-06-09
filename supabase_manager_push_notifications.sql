-- StayHub Manager PWA push subscriptions
-- Safe additive migration: creates a new table only.

create extension if not exists pgcrypto;

create table if not exists public.staff_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  role text not null default 'manager' check (role = 'manager'),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  expiration_time timestamptz null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint staff_push_subscriptions_hotel_role_endpoint_key
    unique (hotel_id, role, endpoint)
);

create index if not exists staff_push_subscriptions_manager_lookup_idx
  on public.staff_push_subscriptions (hotel_id, role, enabled);

alter table public.staff_push_subscriptions enable row level security;

revoke all on table public.staff_push_subscriptions from anon, authenticated;
grant all on table public.staff_push_subscriptions to service_role;
