-- M10.1 follow-up: cover the composite projection revision foreign key.
--
-- Supabase's performance advisor requires an index whose leading columns
-- match (hotel_id, projected_revision_id). The table primary key covers only
-- hotel_id, so the revision lookup needs this explicit composite index.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create index hotel_config_projection_state_revision_idx
  on public.hotel_config_projection_state (hotel_id, projected_revision_id);

commit;
