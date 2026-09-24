-- Forward-only hardening for already-deployed Factory runtime invalidation triggers.
-- These SECURITY DEFINER functions are trigger-only authority and must never be
-- callable through PostgREST by public, anon, authenticated, or service_role.

do $$
declare
  function_name text;
begin
  foreach function_name in array array[
    'invalidate_factory_tenant_runtime_hotel_identity_v1',
    'invalidate_factory_tenant_runtime_projection_delete_v1',
    'invalidate_factory_tenant_runtime_publication_delete_v1'
  ]
  loop
    if to_regprocedure(format('public.%I()', function_name)) is null then
      raise exception 'FACTORY_RUNTIME_INVALIDATION_FUNCTION_MISSING:%', function_name;
    end if;
  end loop;
end
$$;

revoke all on function public.invalidate_factory_tenant_runtime_hotel_identity_v1()
  from public, anon, authenticated, service_role;

revoke all on function public.invalidate_factory_tenant_runtime_projection_delete_v1()
  from public, anon, authenticated, service_role;

revoke all on function public.invalidate_factory_tenant_runtime_publication_delete_v1()
  from public, anon, authenticated, service_role;
