alter function public.set_massage_reliability_updated_at() set search_path = pg_catalog, public;
alter function public.set_guest_surveys_updated_at() set search_path = pg_catalog, public;
alter function public.set_guest_push_subscriptions_updated_at() set search_path = pg_catalog, public;
alter function public.stayhub_touch_updated_at() set search_path = pg_catalog, public;

create index if not exists control_plane_audit_log_actor_admin_id_idx
  on public.control_plane_audit_log(actor_admin_id);
create index if not exists control_plane_audit_log_hotel_id_idx
  on public.control_plane_audit_log(hotel_id);
create index if not exists control_plane_audit_log_organization_id_idx
  on public.control_plane_audit_log(organization_id);
create index if not exists guest_communication_deliveries_subscription_id_idx
  on public.guest_communication_deliveries(subscription_id);
create index if not exists guest_communications_department_id_idx
  on public.guest_communications(department_id);
create index if not exists hotel_tenant_runtime_materialized_production_hotel_id_idx
  on public.hotel_tenant_runtime_materialized(production_hotel_id);
