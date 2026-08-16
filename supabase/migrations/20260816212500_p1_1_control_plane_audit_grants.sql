begin;

revoke all on table public.control_plane_audit_log from service_role;
grant select, insert on table public.control_plane_audit_log to service_role;

revoke all on sequence public.control_plane_audit_log_id_seq from service_role;
grant usage, select on sequence public.control_plane_audit_log_id_seq to service_role;

commit;
