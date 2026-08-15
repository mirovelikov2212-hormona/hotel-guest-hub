begin;

insert into public.massage_runtime_schedule_rules (
  hotel_id,
  resource_key,
  day_of_week,
  open_time,
  close_time,
  breaks_json,
  active,
  metadata_json
)
select
  h.id,
  'default',
  rule.day_of_week,
  '10:00'::time,
  '16:00'::time,
  '[]'::jsonb,
  true,
  jsonb_build_object('milestone', 'M14.4', 'purpose', 'generic certification schedule')
from public.hotels h
cross join (
  values (1::smallint), (2::smallint), (3::smallint), (4::smallint), (5::smallint)
) as rule(day_of_week)
where h.slug = 'certification-hotel'
on conflict (hotel_id, resource_key, day_of_week) do update set
  open_time = excluded.open_time,
  close_time = excluded.close_time,
  breaks_json = excluded.breaks_json,
  active = excluded.active,
  metadata_json = excluded.metadata_json,
  updated_at = now();

commit;
