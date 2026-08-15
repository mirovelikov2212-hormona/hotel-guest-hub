begin;

create index if not exists massage_external_source_configs_source_hotel_id_idx
  on public.massage_external_source_configs (source_hotel_id)
  where source_hotel_id is not null;

commit;
