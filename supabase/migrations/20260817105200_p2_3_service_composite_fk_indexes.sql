begin;

create index if not exists hotel_service_definitions_hotel_department_fk_idx
  on public.hotel_service_definitions (hotel_id, department_id);

create index if not exists hotel_service_definitions_hotel_workflow_fk_idx
  on public.hotel_service_definitions (hotel_id, workflow_id);

create index if not exists hotel_service_definitions_hotel_integration_fk_idx
  on public.hotel_service_definitions (hotel_id, integration_id);

commit;
