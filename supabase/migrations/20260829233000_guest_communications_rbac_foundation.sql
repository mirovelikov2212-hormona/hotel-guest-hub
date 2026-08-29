-- Guest Communications foundation: hotel-scoped capabilities, messages and delivery evidence.
-- No policy here activates a hotel or sends a notification. Direct client access is denied by RLS;
-- trusted server routes use the service role and re-check staff session + hotel/department scope.

create table if not exists public.hotel_staff_role_capabilities (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  role_code text not null,
  capability text not null,
  enabled boolean not null default true,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hotel_staff_role_capabilities_role_code_chk check (role_code ~ '^[a-z][a-z0-9_-]{0,62}$'),
  constraint hotel_staff_role_capabilities_capability_chk check (capability in (
    'guest_communications.view_own',
    'guest_communications.view_all',
    'guest_communications.create',
    'guest_communications.send',
    'guest_communications.schedule',
    'guest_communications.approve',
    'guest_communications.emergency_send'
  )),
  unique (hotel_id, role_code, capability)
);

create index if not exists hotel_staff_role_capabilities_hotel_role_idx
  on public.hotel_staff_role_capabilities(hotel_id, role_code);

alter table public.hotel_staff_role_capabilities enable row level security;

create table if not exists public.guest_communications (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  actor_role text not null,
  category text not null default 'information',
  title text not null,
  body text not null,
  audience_type text not null default 'all_active_guests',
  status text not null default 'draft',
  scheduled_at timestamptz,
  queued_at timestamptz,
  sent_at timestamptz,
  display_from timestamptz,
  display_until timestamptz,
  delivery_total integer not null default 0,
  delivery_sent integer not null default 0,
  delivery_failed integer not null default 0,
  delivery_expired integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_communications_actor_role_chk check (actor_role ~ '^[a-z][a-z0-9_-]{0,62}$'),
  constraint guest_communications_category_chk check (category in ('information','event','change','offer','emergency','operational')),
  constraint guest_communications_audience_chk check (audience_type in ('all_active_guests')),
  constraint guest_communications_status_chk check (status in ('draft','scheduled','queued','sending','sent','partial_failed','failed','cancelled')),
  constraint guest_communications_title_len_chk check (char_length(title) between 1 and 120),
  constraint guest_communications_body_len_chk check (char_length(body) between 1 and 1000),
  constraint guest_communications_schedule_chk check (
    (status <> 'scheduled') or scheduled_at is not null
  )
);

create index if not exists guest_communications_hotel_created_idx
  on public.guest_communications(hotel_id, created_at desc);
create index if not exists guest_communications_hotel_status_schedule_idx
  on public.guest_communications(hotel_id, status, scheduled_at);
create index if not exists guest_communications_department_created_idx
  on public.guest_communications(hotel_id, department_id, created_at desc);

alter table public.guest_communications enable row level security;

create table if not exists public.guest_communication_deliveries (
  id uuid primary key default gen_random_uuid(),
  communication_id uuid not null references public.guest_communications(id) on delete cascade,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  subscription_id uuid references public.guest_push_subscriptions(id) on delete set null,
  status text not null default 'queued',
  attempted_at timestamptz,
  sent_at timestamptz,
  status_code integer,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_communication_deliveries_status_chk check (status in ('queued','sent','failed','expired','skipped')),
  unique (communication_id, subscription_id)
);

create index if not exists guest_communication_deliveries_hotel_comm_idx
  on public.guest_communication_deliveries(hotel_id, communication_id);

alter table public.guest_communication_deliveries enable row level security;

create or replace function public.enforce_guest_communication_department_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.department_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.departments d
    where d.id = new.department_id
      and d.hotel_id = new.hotel_id
      and d.active = true
  ) then
    raise exception 'guest communication department must belong to the same active hotel';
  end if;
  return new;
end;
$$;

drop trigger if exists guest_communications_department_scope_trg on public.guest_communications;
create trigger guest_communications_department_scope_trg
before insert or update of hotel_id, department_id on public.guest_communications
for each row execute function public.enforce_guest_communication_department_scope();
