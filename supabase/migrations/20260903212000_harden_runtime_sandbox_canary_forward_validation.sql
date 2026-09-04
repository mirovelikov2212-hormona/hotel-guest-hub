begin;

-- P5.8 target-side authoritative recheck.
--
-- Vercel OIDC authenticates the forwarding deployment, but a forwarded request
-- must also prove that its exact hotel/target/evidence tuple is still the
-- currently routable Sandbox canary at execution time. This closes the window
-- where an already-issued forwarding request could otherwise outlive a disable,
-- failed target verification, target generation change, or binding drift.
create or replace function public.validate_guest_sandbox_canary_forward_v1(
  p_hotel_id uuid,
  p_target_key text,
  p_target_generation bigint,
  p_verification_evidence_id bigint,
  p_traffic_lease_evidence_id bigint,
  p_compute_ref text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.resolve_guest_sandbox_canary_route_v1(p_hotel_id) r
    where r.hotel_id = p_hotel_id
      and r.target_key = lower(btrim(coalesce(p_target_key, '')))
      and r.target_generation = p_target_generation
      and r.verification_evidence_id = p_verification_evidence_id
      and r.traffic_lease_evidence_id = p_traffic_lease_evidence_id
      and btrim(r.compute_ref) = btrim(coalesce(p_compute_ref, ''))
      and r.route_valid_until > clock_timestamp()
  );
$function$;

revoke all on function public.validate_guest_sandbox_canary_forward_v1(uuid, text, bigint, bigint, bigint, text)
  from public, anon, authenticated;
grant execute on function public.validate_guest_sandbox_canary_forward_v1(uuid, text, bigint, bigint, bigint, text)
  to service_role;

commit;
