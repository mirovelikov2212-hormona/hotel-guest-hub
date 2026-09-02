begin;

alter function public.get_factory_tenant_runtime_reconciliation_context_v1(uuid, uuid, text)
  security invoker;

alter function public.reactivate_factory_tenant_runtime_v1(uuid, uuid, text)
  security invoker;

comment on function public.get_factory_tenant_runtime_reconciliation_context_v1(uuid, uuid, text) is
'Sandbox-only pre-reconciliation guard executed with the service-role caller privileges. Records whether the exact published projection had trusted runtime reads activated before an automatic same-revision repair.';

comment on function public.reactivate_factory_tenant_runtime_v1(uuid, uuid, text) is
'Sandbox-only post-reconciliation gate executed with the service-role caller privileges. Restores materialized runtime reads only after the automatic projector proves exact revision/checksum and relational parity for a runtime that was already trusted before drift.';

commit;