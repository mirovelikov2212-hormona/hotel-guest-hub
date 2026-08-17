begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.hotel_role_templates
  add constraint hotel_role_templates_permissions_fail_closed_check
  check (
    permissions_json->>'configured' = 'false'
    and jsonb_typeof(permissions_json->'permissions') = 'array'
    and jsonb_array_length(permissions_json->'permissions') = 0
  ) not valid;

alter table public.hotel_role_templates
  validate constraint hotel_role_templates_permissions_fail_closed_check;

comment on constraint hotel_role_templates_permissions_fail_closed_check
  on public.hotel_role_templates is
  'P2.4 role templates carry no active permissions until a later audited certification/configuration transition.';

commit;
