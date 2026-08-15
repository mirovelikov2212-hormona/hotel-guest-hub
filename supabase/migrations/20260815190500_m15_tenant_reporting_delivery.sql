begin;

-- Existing Aquamarine production keeps its already-configured environment
-- recipient, but only because this tenant explicitly opts into that legacy
-- adapter. No other tenant inherits the environment recipient implicitly.
insert into public.hotel_settings (hotel_id, key, value_json)
values (
  '843ec551-786a-46c4-989b-9da98956cd19'::uuid,
  'reporting_email_delivery',
  '{"enabled":true,"legacyEnvironmentRecipient":true}'::jsonb
)
on conflict (hotel_id, key) do update
set value_json = excluded.value_json,
    updated_at = now();

-- Non-production tenants are explicitly disabled. A newly onboarded real
-- hotel must provide its own reporting_email_delivery.email value.
insert into public.hotel_settings (hotel_id, key, value_json)
values
  ('05624aa0-ffcb-4f93-8cb8-a0bdc85e1962'::uuid, 'reporting_email_delivery', '{"enabled":false}'::jsonb),
  ('2a40d6fb-da53-461b-8432-2d9be0648721'::uuid, 'reporting_email_delivery', '{"enabled":false}'::jsonb),
  ('243c8e86-af66-455f-b664-ec2185d5f3f3'::uuid, 'reporting_email_delivery', '{"enabled":false}'::jsonb)
on conflict (hotel_id, key) do update
set value_json = excluded.value_json,
    updated_at = now();

commit;
