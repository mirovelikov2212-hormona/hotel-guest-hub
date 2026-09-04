begin;

alter table public.massage_runtime_bookings
  drop constraint if exists massage_runtime_bookings_mirror_status_check;

alter table public.massage_runtime_bookings
  add constraint massage_runtime_bookings_mirror_status_check
  check (
    mirror_status = any (
      array[
        'not_required'::text,
        'pending'::text,
        'mirrored'::text,
        'failed'::text,
        'conflict'::text,
        'manual_reconciliation_required'::text
      ]
    )
  );

comment on column public.massage_runtime_bookings.mirror_status is
  'Asynchronous Google Sheet adapter projection state. Native Supabase booking status remains authoritative. conflict/manual_reconciliation_required are terminal fail-safe projection states and are never retried automatically.';

-- A Sheet row carrying an SH marker is not sufficient proof that the row is a
-- mirror of a native booking. Manual rows can acquire such a marker as well.
-- Only an exact confirmed native booking for the same hotel/date/time/service/
-- room may make the Sheet row non-blocking. Everything else remains an active
-- external blocker so availability fails safe.
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
  v_stayhub_marker_count integer := 0;
  v_proven_native_mirror_count integer := 0;
  v_unmatched_stayhub_block_count integer := 0;
  v_active_block_count integer := 0;
  v_expected_active_block_count integer := 0;
begin
  select *
    into v_snapshot
  from public.massage_calendar_snapshots
  where id = p_snapshot_id
    and hotel_id = p_hotel_id;

  if not found then
    raise exception 'MASSAGE_SNAPSHOT_NOT_FOUND_FOR_HOTEL';
  end if;

  v_result := public.project_massage_snapshot_to_runtime(
    p_hotel_id,
    p_snapshot_id
  );

  if coalesce((v_result->>'ok')::boolean, false) is not true
    or coalesce(v_result->>'hotelId', '') <> p_hotel_id::text
    or coalesce(v_result->>'snapshotId', '') <> p_snapshot_id::text then
    raise exception 'MASSAGE_RUNTIME_EXTERNAL_PROJECTION_SCOPE_MISMATCH';
  end if;

  select count(*) filter (
    where coalesce((booking->>'isStayHubMarker')::boolean, false)
  )::integer
    into v_stayhub_marker_count
  from jsonb_array_elements(
    coalesce(v_snapshot.bookings_json, '[]'::jsonb)
  ) as item(booking);

  -- Start fail-safe: every row from the current Sheet snapshot is blocking.
  -- The base projector already sets current rows active=true, but this explicit
  -- update also self-heals rows made inactive by the previous broad SH rule.
  update public.massage_runtime_blocks rb
  set active = true,
      last_seen_at = now(),
      updated_at = now(),
      metadata_json = coalesce(rb.metadata_json, '{}'::jsonb) ||
        jsonb_build_object(
          'excludedFromNativeAuthority', false,
          'exclusionReason', null,
          'projectionVersion', 'm14.3.3-exact-native-mirror-only'
        )
  where rb.hotel_id = p_hotel_id
    and rb.source_kind = 'legacy_sheet_snapshot'
    and rb.source_snapshot_id = p_snapshot_id
    and rb.booking_date between v_snapshot.range_start and v_snapshot.range_end;

  -- Deactivate only a PROVEN mirror. Matching is deliberately strict. The
  -- Sheet parser can preserve suffixes such as "405 AM SH" in room_number, so
  -- both sides are reduced to the leading numeric room token before comparison.
  update public.massage_runtime_blocks rb
  set active = false,
      last_seen_at = now(),
      updated_at = now(),
      metadata_json = coalesce(rb.metadata_json, '{}'::jsonb) ||
        jsonb_build_object(
          'excludedFromNativeAuthority', true,
          'exclusionReason', 'proven_native_sheet_mirror',
          'projectionVersion', 'm14.3.3-exact-native-mirror-only'
        )
  where rb.hotel_id = p_hotel_id
    and rb.source_kind = 'legacy_sheet_snapshot'
    and rb.source_snapshot_id = p_snapshot_id
    and rb.is_stayhub_marker = true
    and rb.service_id is not null
    and substring(trim(coalesce(rb.room_number, rb.room_marker, '')) from '^([0-9]+)') is not null
    and exists (
      select 1
      from public.massage_runtime_bookings nb
      where nb.hotel_id = rb.hotel_id
        and nb.status = 'confirmed'
        and nb.is_test = false
        and nb.booking_date = rb.booking_date
        and nb.start_time = rb.start_time
        and nb.service_id = rb.service_id
        and substring(trim(nb.room_number) from '^([0-9]+)') =
            substring(trim(coalesce(rb.room_number, rb.room_marker, '')) from '^([0-9]+)')
    );

  select count(*)::integer
    into v_proven_native_mirror_count
  from public.massage_runtime_blocks rb
  where rb.hotel_id = p_hotel_id
    and rb.source_kind = 'legacy_sheet_snapshot'
    and rb.source_snapshot_id = p_snapshot_id
    and rb.is_stayhub_marker = true
    and rb.active = false
    and coalesce(rb.metadata_json->>'exclusionReason', '') = 'proven_native_sheet_mirror';

  v_unmatched_stayhub_block_count := greatest(
    0,
    v_stayhub_marker_count - v_proven_native_mirror_count
  );

  select count(*)::integer
    into v_active_block_count
  from public.massage_runtime_blocks rb
  where rb.hotel_id = p_hotel_id
    and rb.source_kind = 'legacy_sheet_snapshot'
    and rb.active = true
    and rb.booking_date between v_snapshot.range_start and v_snapshot.range_end;

  v_expected_active_block_count := greatest(
    0,
    v_snapshot.booking_count - v_proven_native_mirror_count
  );

  if v_active_block_count <> v_expected_active_block_count then
    raise exception 'MASSAGE_RUNTIME_EXTERNAL_BLOCK_COUNT_MISMATCH expected %, got %',
      v_expected_active_block_count, v_active_block_count;
  end if;

  update public.massage_runtime_projection_state
  set block_count = v_active_block_count,
      projected_at = now(),
      updated_at = now(),
      metadata_json = coalesce(metadata_json, '{}'::jsonb) ||
        jsonb_build_object(
          'snapshotBookingCount', v_snapshot.booking_count,
          'snapshotExternalBlockCount', v_active_block_count,
          'snapshotStayHubMarkerCount', v_stayhub_marker_count,
          'snapshotProvenNativeMirrorCount', v_proven_native_mirror_count,
          'snapshotUnmatchedStayHubBlockCount', v_unmatched_stayhub_block_count,
          'projectionVersion', 'm14.3.3-exact-native-mirror-only'
        )
  where hotel_id = p_hotel_id
    and source_snapshot_id = p_snapshot_id;

  if not found then
    raise exception 'MASSAGE_RUNTIME_EXTERNAL_PROJECTION_STATE_MISSING';
  end if;

  return v_result || jsonb_build_object(
    'blockCount', v_active_block_count,
    'externalBlockCount', v_active_block_count,
    'stayHubMarkerCount', v_stayhub_marker_count,
    'provenNativeMirrorCount', v_proven_native_mirror_count,
    'unmatchedStayHubBlockCount', v_unmatched_stayhub_block_count,
    'projectionVersion', 'm14.3.3-exact-native-mirror-only'
  );
end;
$$;

revoke all on function public.project_massage_snapshot_to_runtime_external_only(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.project_massage_snapshot_to_runtime_external_only(uuid, uuid)
  to service_role, postgres;

comment on function public.project_massage_snapshot_to_runtime_external_only(uuid, uuid) is
  'Projects a massage snapshot fail-safe for native authority: all Sheet rows block availability unless an SH-marked row is proven to match an exact confirmed non-test native booking for the same hotel/date/time/service/room.';

commit;
