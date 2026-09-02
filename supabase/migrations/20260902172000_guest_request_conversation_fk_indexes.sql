begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The request-thread lookup indexes are tenant/query oriented. These dedicated
-- indexes cover the newly introduced foreign-key columns themselves so deletes
-- and FK maintenance remain bounded as communication volume grows.
create index if not exists guest_communications_request_id_fk_idx
  on public.guest_communications (request_id);

create index if not exists guest_communications_stay_id_fk_idx
  on public.guest_communications (stay_id);

create index if not exists guest_communications_stay_device_id_fk_idx
  on public.guest_communications (stay_device_id);

create index if not exists guest_communications_sender_session_id_fk_idx
  on public.guest_communications (sender_session_id);

create index if not exists guest_requests_conversation_last_communication_id_fk_idx
  on public.guest_requests (conversation_last_communication_id);

commit;
