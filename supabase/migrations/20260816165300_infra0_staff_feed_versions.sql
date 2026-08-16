create table if not exists public.staff_feed_versions (
  hotel_id uuid primary key references public.hotels(id) on delete cascade,
  requests_version bigint not null default 0,
  surveys_version bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.staff_feed_versions enable row level security;

insert into public.staff_feed_versions (hotel_id)
select id from public.hotels
on conflict (hotel_id) do nothing;

create or replace function public.bump_staff_feed_version()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_kind text := tg_argv[0];
  v_new_hotel_id uuid;
  v_old_hotel_id uuid;
begin
  if tg_op <> 'DELETE' then
    v_new_hotel_id := new.hotel_id;
  end if;
  if tg_op <> 'INSERT' then
    v_old_hotel_id := old.hotel_id;
  end if;

  if v_new_hotel_id is not null then
    insert into public.staff_feed_versions (hotel_id, requests_version, surveys_version, updated_at)
    values (
      v_new_hotel_id,
      case when v_kind = 'requests' then 1 else 0 end,
      case when v_kind = 'surveys' then 1 else 0 end,
      now()
    )
    on conflict (hotel_id) do update set
      requests_version = public.staff_feed_versions.requests_version + case when v_kind = 'requests' then 1 else 0 end,
      surveys_version = public.staff_feed_versions.surveys_version + case when v_kind = 'surveys' then 1 else 0 end,
      updated_at = now();
  end if;

  if v_old_hotel_id is not null and v_old_hotel_id is distinct from v_new_hotel_id then
    insert into public.staff_feed_versions (hotel_id, requests_version, surveys_version, updated_at)
    values (
      v_old_hotel_id,
      case when v_kind = 'requests' then 1 else 0 end,
      case when v_kind = 'surveys' then 1 else 0 end,
      now()
    )
    on conflict (hotel_id) do update set
      requests_version = public.staff_feed_versions.requests_version + case when v_kind = 'requests' then 1 else 0 end,
      surveys_version = public.staff_feed_versions.surveys_version + case when v_kind = 'surveys' then 1 else 0 end,
      updated_at = now();
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.bump_staff_feed_version() from public;
revoke all on function public.bump_staff_feed_version() from anon;
revoke all on function public.bump_staff_feed_version() from authenticated;

drop trigger if exists guest_requests_staff_feed_version_trg on public.guest_requests;
create trigger guest_requests_staff_feed_version_trg
after insert or update or delete on public.guest_requests
for each row execute function public.bump_staff_feed_version('requests');

drop trigger if exists guest_surveys_staff_feed_version_trg on public.guest_surveys;
create trigger guest_surveys_staff_feed_version_trg
after insert or update or delete on public.guest_surveys
for each row execute function public.bump_staff_feed_version('surveys');
