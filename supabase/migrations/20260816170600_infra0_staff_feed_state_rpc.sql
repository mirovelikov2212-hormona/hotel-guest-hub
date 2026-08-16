create or replace function public.get_staff_feed_state(
  p_session_token_hash text,
  p_hotel_slug text,
  p_role text
)
returns table (
  requests_version bigint,
  surveys_version bigint,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select
    f.requests_version,
    f.surveys_version,
    f.updated_at
  from public.staff_sessions s
  join public.hotels h
    on h.id = s.hotel_id
   and h.active = true
  join public.staff_feed_versions f
    on f.hotel_id = h.id
  where s.session_token_hash = p_session_token_hash
    and s.revoked_at is null
    and s.expires_at > now()
    and s.role::text = lower(trim(p_role))
    and (
      lower(h.slug) = lower(trim(p_hotel_slug))
      or lower(coalesce(h.public_slug, '')) = lower(trim(p_hotel_slug))
    )
  limit 1;
$$;

revoke all on function public.get_staff_feed_state(text, text, text) from public;
revoke all on function public.get_staff_feed_state(text, text, text) from anon;
revoke all on function public.get_staff_feed_state(text, text, text) from authenticated;
grant execute on function public.get_staff_feed_state(text, text, text) to service_role;
