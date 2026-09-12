import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const migration = read("supabase/migrations/20260907152000_hotel_intelligence_review_v1.sql");
const contract = read("lib/product-factory/hotel-intelligence-review.ts");
const service = read("lib/server/hotel-intelligence-revisions.ts");
const route = read("app/api/control-plane/hotel-intelligence/revisions/route.ts");
const handoff = read("app/api/control-plane/hotel-intelligence/handoff/route.ts");

test("Hotel Intelligence uses dedicated persisted workspace + immutable revisions without a second release engine", () => {
  assert.match(migration, /create table if not exists public\.hotel_intelligence_workspaces/i);
  assert.match(migration, /create table if not exists public\.hotel_intelligence_revisions/i);
  assert.match(migration, /hotel_intelligence_revisions_immutable/i);
  assert.match(migration, /HOTEL_INTELLIGENCE_REVISION_IMMUTABLE/);
  assert.doesNotMatch(migration, /production_readiness|sandbox_certification|production_publication|live_activation/i);
});

test("direct table mutation is denied and mutations go through service-role RPCs", () => {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.hotel_intelligence_workspaces from public, anon, authenticated, service_role/i);
  assert.match(migration, /revoke all on table public\.hotel_intelligence_revisions from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant select on table public\.hotel_intelligence_workspaces to service_role/i);
  assert.match(migration, /grant select on table public\.hotel_intelligence_revisions to service_role/i);
  assert.match(migration, /save_hotel_intelligence_revision_v1/);
  assert.match(migration, /approve_hotel_intelligence_revision_v1/);
});

test("draft writes are idempotent, parent-guarded and never overwrite approved truth", () => {
  assert.match(migration, /HOTEL_INTELLIGENCE_IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /HOTEL_INTELLIGENCE_PARENT_CONFLICT/);
  assert.match(migration, /current_revision_id = v_revision_id/);
  const saveSection = migration.split("create or replace function public.save_hotel_intelligence_revision_v1")[1]
    .split("create or replace function public.approve_hotel_intelligence_revision_v1")[0];
  assert.doesNotMatch(saveSection, /set[\s\S]*approved_revision_id\s*=/i);
  assert.match(saveSection, /hotel_intelligence_review_revision_created/);
});

test("approval creates a new immutable approved revision and advances approved pointer atomically", () => {
  const approvalSection = migration.split("create or replace function public.approve_hotel_intelligence_revision_v1")[1];
  assert.match(approvalSection, /status[\s\S]*'approved'/i);
  assert.match(approvalSection, /approved_from_revision_id/);
  assert.match(approvalSection, /current_revision_id = v_revision_id/);
  assert.match(approvalSection, /approved_revision_id = v_revision_id/);
  assert.match(approvalSection, /HOTEL_INTELLIGENCE_CURRENT_REVISION_CONFLICT/);
  assert.match(approvalSection, /HOTEL_INTELLIGENCE_PENDING_FACTS/);
  assert.match(approvalSection, /HOTEL_INTELLIGENCE_UNRESOLVED_NOTES/);
  assert.match(approvalSection, /hotel_intelligence_revision_approved/);
});

test("review contract requires explicit human decisions and blocks unresolved approval", () => {
  assert.match(contract, /"pending"/);
  assert.match(contract, /"approved"/);
  assert.match(contract, /"rejected"/);
  assert.match(contract, /"corrected"/);
  assert.match(contract, /"added"/);
  assert.match(contract, /forApproval && item\.decision === "pending"/);
  assert.match(contract, /unresolved_notes_present/);
  assert.match(contract, /buildApprovedHotelIntelligencePackage/);
  assert.match(contract, /reviewRequiredCount: 0/);
});

test("service derives deterministic checksums and validates exact approved content before handoff", () => {
  assert.match(service, /stableHotelIntelligenceStringify/);
  assert.match(service, /buildHotelIntelligenceSourceKey/);
  assert.match(service, /HOTEL_INTELLIGENCE_CONTENT_CHECKSUM_MISMATCH/);
  assert.match(service, /loadApprovedHotelIntelligenceEnvelope/);
  assert.match(service, /approved_hotel_intelligence_revision/);
  assert.match(service, /buildApprovedHotelIntelligencePackage/);
});

test("Control Plane API reuses same-origin, session and mutation RBAC", () => {
  assert.match(route, /enforceControlPlaneSameOrigin/);
  assert.match(route, /getCurrentPlatformAdminSession/);
  assert.match(route, /canMutateControlPlane/);
  assert.match(route, /action === "save"/);
  assert.match(route, /action === "approve"/);
  assert.match(route, /revision_conflict/);
  assert.match(route, /idempotency_conflict/);
});

test("Factory and Design handoff is gated by an exact approved revision and privacy-safe audit metadata", () => {
  assert.match(handoff, /approvedRevisionId/);
  assert.match(handoff, /\["factory", "design_studio"\]/);
  assert.match(handoff, /loadApprovedHotelIntelligenceEnvelope/);
  assert.match(handoff, /hotel_intelligence_handoff_prepared/);
  assert.match(handoff, /contentChecksum/);
  assert.doesNotMatch(handoff, /prompt|pageBody|rawHtml|rawEvidence/i);
});

test("persisted schema stores reviewed intelligence, not raw prompts or crawled page bodies", () => {
  assert.doesNotMatch(migration, /raw_prompt|prompt_json|page_body|raw_html|crawler_body/i);
  assert.doesNotMatch(service, /rawPrompt|pageBody|rawHtml/i);
});
