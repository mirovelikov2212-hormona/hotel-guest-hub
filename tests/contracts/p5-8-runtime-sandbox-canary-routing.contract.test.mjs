import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const LEASE_MIGRATION =
  "supabase/migrations/20260903211500_runtime_sandbox_canary_traffic.sql";
const FORWARD_HARDENING =
  "supabase/migrations/20260903212000_harden_runtime_sandbox_canary_forward_validation.sql";
const ROUTER = "lib/server/runtime-sandbox-canary-router.ts";
const REQUEST_ROUTE = "app/api/guest/request-create/route.ts";
const SURVEY_ROUTE = "app/api/guest/day3-survey/route.ts";
const COMMUNICATIONS_ROUTE = "app/api/guest/communications/route.ts";
const MASSAGE_ROOT = "app/api/guest/massages";

test("P5.8 traffic intent is immutable short-lived Sandbox-only evidence", async () => {
  const sql = await readProjectFile(LEASE_MIGRATION);

  assertContains(sql, "create table if not exists public.runtime_target_traffic_lease_evidence");
  assertContains(sql, "traffic_mode in ('sandbox_canary', 'disabled')");
  assertContains(sql, "p_valid_for_seconds > 900");
  assertContains(sql, "v_target.environment_scope <> 'sandbox'");
  assertContains(sql, "RUNTIME_TRAFFIC_CANARY_SANDBOX_TARGET_REQUIRED");
  assertContains(sql, "v_target.routing_mode <> 'active'");
  assertContains(sql, "v_verification.status <> 'passed'");
  assertContains(sql, "v_verification.valid_until <= v_now");
  assertContains(sql, "revoke all on table public.runtime_target_traffic_lease_evidence");
  assertContains(sql, "grant select on table public.runtime_target_traffic_lease_evidence to service_role");
  assertNotContains(sql, "grant insert on table public.runtime_target_traffic_lease_evidence");
  assertNotContains(sql, "grant update on table public.runtime_target_traffic_lease_evidence");
  assertNotContains(sql, "grant delete on table public.runtime_target_traffic_lease_evidence");
});

test("P5.8 Guest resolver is fail-closed and Production-ineligible", async () => {
  const sql = await readProjectFile(LEASE_MIGRATION);

  assertContains(sql, "create or replace function public.has_active_sandbox_canary_traffic_v1()");
  assertContains(sql, "create or replace function public.resolve_guest_sandbox_canary_route_v1(p_hotel_id uuid)");
  assertContains(sql, "h.is_sandbox = true");
  assertContains(sql, "c.environment_scope = 'sandbox'");
  assertContains(sql, "t.environment_scope = 'sandbox'");
  assertContains(sql, "verification.status = 'passed'");
  assertContains(sql, "verification.valid_until > clock_timestamp()");
  assertContains(sql, "lease.traffic_mode = 'sandbox_canary'");
  assertContains(sql, "lease.valid_until > clock_timestamp()");
  assertContains(sql, "revoke execute on function public.resolve_runtime_target_route_v1(uuid)");
  assertContains(sql, "from public, anon, authenticated, service_role");
  assertNotContains(sql, "environment_scope = 'production'");
});

test("P5.8 forwarded requests are revalidated against current exact route authority", async () => {
  const sql = await readProjectFile(FORWARD_HARDENING);
  const router = await readProjectFile(ROUTER);

  assertContains(sql, "create or replace function public.validate_guest_sandbox_canary_forward_v1");
  assertContains(sql, "from public.resolve_guest_sandbox_canary_route_v1(p_hotel_id) r");
  assertContains(sql, "r.target_generation = p_target_generation");
  assertContains(sql, "r.verification_evidence_id = p_verification_evidence_id");
  assertContains(sql, "r.traffic_lease_evidence_id = p_traffic_lease_evidence_id");
  assertContains(sql, "r.route_valid_until > clock_timestamp()");

  assertContains(router, "validate_guest_sandbox_canary_forward_v1");
  assertContains(router, "x-stayhub-runtime-verification-evidence-id");
  assertContains(router, "x-stayhub-runtime-traffic-lease-evidence-id");
  assertContains(router, "RUNTIME_FORWARD_AUTHORITY_REVOKED");
});

test("P5.8 remote forwarding uses request-context Vercel OIDC, trusted-source bypass, and strict compute allowlist", async () => {
  const router = await readProjectFile(ROUTER);

  assertContains(router, 'import { getVercelOidcToken } from "@vercel/functions/oidc"');
  assertContains(router, "const oidcToken = await getVercelOidcToken()");
  assertNotContains(router, "process.env.VERCEL_OIDC_TOKEN");
  assertContains(router, '"x-vercel-trusted-oidc-idp-token": oidcToken');
  assertContains(router, 'authorization: `Bearer ${oidcToken}`');
  assertContains(router, 'payload.owner_id !== EXPECTED_VERCEL_TEAM_ID');
  assertContains(router, 'payload.project_id !== EXPECTED_VERCEL_PROJECT_ID');
  assertContains(router, 'hostname.endsWith(".vercel.app")');
  assertContains(router, 'hostname.endsWith(".stayhub.app")');
  assertContains(router, 'url.protocol !== "https:"');
  assertContains(router, 'redirect: "error"');
  assertContains(router, "AbortSignal.timeout(ROUTE_FORWARD_TIMEOUT_MS)");
  assertNotContains(router, 'req.headers.get("x-vercel-oidc-token")');
});

test("P5.8 wires only the three core Guest routes through one fail-closed dispatcher", async () => {
  const [requestRoute, surveyRoute, communicationsRoute] = await Promise.all([
    readProjectFile(REQUEST_ROUTE),
    readProjectFile(SURVEY_ROUTE),
    readProjectFile(COMMUNICATIONS_ROUTE),
  ]);

  for (const source of [requestRoute, surveyRoute, communicationsRoute]) {
    assertContains(source, "maybeForwardSandboxGuestRequest");
    assertContains(source, "runtimeCanaryRoutingErrorResponse");
  }
  assertContains(requestRoute, 'routePath: "/api/guest/request-create"');
  assertContains(surveyRoute, 'routePath: "/api/guest/day3-survey"');
  assertContains(communicationsRoute, 'routePath: "/api/guest/communications"');

  // First canary deliberately excludes integration-heavy massage traffic.
  assertNotContains(requestRoute, "automaticRebalance");
  assertNotContains(surveyRoute, "automaticRebalance");
  assertNotContains(communicationsRoute, "automaticRebalance");
  assertNotContains(MASSAGE_ROOT, "runtime-sandbox-canary-router");
});