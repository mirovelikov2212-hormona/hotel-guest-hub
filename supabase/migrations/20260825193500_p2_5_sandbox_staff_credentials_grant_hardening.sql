revoke all on function public.provision_factory_sandbox_staff_credentials_v1(uuid, uuid, uuid, jsonb, jsonb) from public;
revoke execute on function public.provision_factory_sandbox_staff_credentials_v1(uuid, uuid, uuid, jsonb, jsonb) from anon;
revoke execute on function public.provision_factory_sandbox_staff_credentials_v1(uuid, uuid, uuid, jsonb, jsonb) from authenticated;

grant execute on function public.provision_factory_sandbox_staff_credentials_v1(uuid, uuid, uuid, jsonb, jsonb) to service_role, postgres;
