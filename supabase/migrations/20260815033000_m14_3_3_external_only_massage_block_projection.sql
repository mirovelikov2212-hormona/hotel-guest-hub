begin;

-- M14.3.3: keep the proven M14.1 snapshot projection, but make the blocker
-- projection safe for native authority. StayHub-owned rows mirrored to the
-- Sheet are informational output and must never come back as external blocks.
-- Manual / external Sheet rows remain blockers.
create or replace function public.project_massage_snapshot_to_runtime_external_only(
  p_hotel_id uuid,
  p_snapshot_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_snapshot public.massage_calendar_snapshots%rowtype;
  v_result jsonb;
  v_external_block_count integer := 0;
  v_stayhub_mirror_count integer := 0;
  v_active_block_count integer := 0;
begin
  select *
    into v_snapshot
  from public.massage_calendar_snapshots
  where id = p_snapshot_id
    and hotel_id = p_hotel_id;

  if not found then
    raise exception 'MASSAGE_SNAPSHOT_NOT_FOUND_FOR_HOTEL';
  end if;

  -- Nested function execution is part of this same RPC transaction. The
  -- legacy projection therefore never commits its intermediate all-bookings
  -- block set before StayHub-owned mirrors are removed below.
  v_result := public.project_massage_snapshot_to_runtime(
    p_hotel_id,
    p_snapshot_id
  );

  if coalesce((v_result->>'ok')::boolean, false) is not true
    or coalesce(v_result->>'hotelId', '') <> p_hotel_id::text
    or coalesce(v_result->>'snapshotId', '') <> p_snapshot_id::text then
    raise exception 'MASSAGE_RUNTIME_EXTERNAL_PROJECTION_SCOPE_MISMATCH';
  end if;

  select
    count(*) filter (
      where not coalesce((booking->>'isStayHubMarker')::boolean, false)
    )::integer,
    count(*) filter (
      where coalesce((booking->>'isStayHubMarker')::boolean, false)
    )::integer
    into v_external_block_count, v_stayhub_mirror_count
  from jsonb_array_elements(
    coalesce(v_snapshot.bookings_json, '[]'::jsonb)
  ) as item(booking);

  -- A StayHub booking already exists authoritatively in
  -- massage_runtime_bookings. Any Sheet row carrying isStayHubMarker=true is
  -- only an asynchronous mirror and must never participate in availability.
  update public.massage_runtime_blocks
  set active = false,
      last_seen_at = now(),
      updated_at = now(),
      metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
        jsonb_build_object(
          'excludedFromNativeAuthority', true,
          'exclusionReason', 'stayhub_sheet_mirror',
          'projectionVersion', 'm14.3.3-external-only'
        )
  where hotel_id = p_hotel_id
    and source_kind = 'legacy_sheet_snapshot'
    and is_stayhub_marker = true;

  select count(*)::integer
    into v_active_block_count
  from public.massage_runtime_blocks
  where hotel_id = p_hotel_id
    and source_kind = 'legacy_sheet_snapshot'
    and active = true
    and booking_date between v_snapshot.range_start and v_snapshot.range_end;

  if v_active_block_count <> v_external_block_count then
    raise exception 'MASSAGE_RUNTIME_EXTERNAL_BLOCK_COUNT_MISMATCH expected %, got %',
      v_external_block_count, v_active_block_count;
  end if;

  update public.massage_runtime_projection_state
  set block_count = v_active_block_count,
      projected_at = now(),
      updated_at = now(),
      metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
        jsonb_build_object(
          'snapshotBookingCount', v_snapshot.booking_count,
          'snapshotExternalBlockCount', v_external_block_count,
          'snapshotStayHubMirrorCount', v_stayhub_mirror_count,
          'projectionVersion', 'm14.3.3-external-only'
        )
  where hotel_id = p_hotel_id
    and source_snapshot_id = p_snapshot_id;

  if not found then
    raise exception 'MASSAGE_RUNTIME_EXTERNAL_PROJECTION_STATE_MISSING';
  end if;

  return v_result || jsonb_build_object(
    'blockCount', v_active_block_count,
    'externalBlockCount', v_external_block_count,
    'stayHubMirrorCount', v_stayhub_mirror_count,
    'projectionVersion', 'm14.3.3-external-only'
  );
end;
$$;

revoke all on function public.project_massage_snapshot_to_runtime_external_only(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.project_massage_snapshot_to_runtime_external_only(uuid, uuid)
  to service_role, postgres;

comment on function public.project_massage_snapshot_to_runtime_external_only(uuid, uuid) is
  'Atomically projects a massage snapshot while retaining only manual/external Sheet rows as runtime blockers. StayHub-owned Sheet mirrors are explicitly non-authoritative.';

commit;
