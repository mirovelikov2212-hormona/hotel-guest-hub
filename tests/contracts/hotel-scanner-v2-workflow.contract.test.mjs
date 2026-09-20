import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("Scanner V2 durable workflow dependency and Next integration are pinned", async () => {
  const pkg = JSON.parse(await readProjectFile("package.json"));
  const nextConfig = await readProjectFile("next.config.ts");

  assert.equal(pkg.dependencies.workflow, "4.8.8");
  assert.match(nextConfig, /import \{ withWorkflow \} from "workflow\/next"/);
  assert.match(nextConfig, /export default withWorkflow\(nextConfig\)/);
});

test("Scanner V2 workflow checkpoints discovery separately from paid enrichment", async () => {
  const source = await readProjectFile("workflows/hotel-scanner-v2-workflow.ts");

  assert.match(source, /"use workflow"/);
  assert.match(source, /"use step"/);
  assert.match(source, /runDiscoveryCheckpointStep/);
  assert.match(source, /discoverHotelIntakeRenderedV2/);
  assert.doesNotMatch(source, /discoverHotelIntakeV2\(input\.url\)/);
  assert.match(source, /runEnrichmentStep/);
  assert.match(source, /runHotelIntakePipelineV2FromDiscovery/);
  assert.match(source, /FatalError/);
  assert.doesNotMatch(source, /runHotelIntakePipelineV2\(/);
  assert.doesNotMatch(source, /crawlPublicHotelWebsiteRenderedV2/);
});

test("Scanner V2 durable workflow pauses on exhausted credits and resumes enrichment without recrawling", async () => {
  const workflow = await readProjectFile("workflows/hotel-scanner-v2-workflow.ts");
  const resumeRoute = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-workflow/resume/route.ts");

  assert.match(workflow, /defineHook/);
  assert.match(workflow, /scannerV2QuotaResumeHook/);
  assert.match(workflow, /AI_QUOTA_EXHAUSTED/);
  assert.match(workflow, /document_ai_quota_exhausted/);
  assert.match(workflow, /scanner_v2_workflow_waiting_for_billing/);
  assert.match(workflow, /for await \(const event of resumeEvents\)/);
  assert.match(workflow, /retry_after_billing/);
  assert.match(workflow, /runEnrichmentStep\(input, checkpoint, attempt\)/);
  assert.match(resumeRoute, /enforceControlPlaneSameOrigin/);
  assert.match(resumeRoute, /getCurrentPlatformAdminSession/);
  assert.match(resumeRoute, /canMutateControlPlane/);
  assert.match(resumeRoute, /scannerV2QuotaResumeHook\.resume/);
  assert.match(resumeRoute, /retry_after_billing/);
});

test("Scanner V2 workflow start route returns both durable run id and scan lineage id", async () => {
  const source = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-workflow/route.ts");

  assert.match(source, /import \{ start \} from "workflow\/api"/);
  assert.match(source, /enforceControlPlaneSameOrigin/);
  assert.match(source, /getCurrentPlatformAdminSession/);
  assert.match(source, /const scanRunId = randomUUID\(\)/);
  assert.match(source, /start\(hotelScannerV2Workflow/);
  assert.match(source, /runId: run\.runId/);
  assert.match(source, /scanRunId/);
  assert.match(source, /createScannerV2WorkflowAccessToken/);
  assert.match(source, /runAccessToken/);
  assert.match(source, /202/);
});

test("Scanner V2 workflow status route returns a bounded persisted projection and recovers transport failures", async () => {
  const source = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-workflow/[runId]/route.ts");

  assert.match(source, /import \{ getRun \} from "workflow\/api"/);
  assert.match(source, /getCurrentPlatformAdminSession/);
  assert.match(source, /verifyScannerV2WorkflowAccessToken/);
  assert.match(source, /X-Scanner-Scan-Run-Id/);
  assert.match(source, /X-Scanner-Workflow-Token/);
  assert.match(source, /workflow_run_forbidden/);
  assert.match(source, /await run\.status/);
  assert.match(source, /status === "completed"/);
  assert.match(source, /loadPersistedHotelScannerV2ResultForActor/);
  assert.match(source, /projectHotelScannerV2ClientResult/);
  assert.doesNotMatch(source, /await run\.returnValue/);
  assert.match(source, /status === "failed"/);
  assert.match(source, /scanner_v2_workflow_transport_recovered_from_persistence/);
  assert.match(source, /recovered: true/);
});

test("Scanner V2 durable workflow never serializes the full multi-megabyte result at completion", async () => {
  const workflow = await readProjectFile("workflows/hotel-scanner-v2-workflow.ts");
  const projection = await readProjectFile("lib/server/hotel-scanner-v2-client-projection.ts");
  const persistence = await readProjectFile("lib/server/hotel-intelligence-persistence-v2.ts");

  assert.doesNotMatch(workflow, /return \{ \.\.\.result, persistence \}/);
  assert.match(workflow, /scanRunId: input\.scanRunId/);
  assert.match(workflow, /reviewId: persistence\.revisionId/);
  assert.match(workflow, /scanner_v2_workflow_completed/);
  assert.match(persistence, /loadPersistedHotelScannerV2ResultForActor/);
  assert.match(persistence, /scan\.actor_admin_id !== input\.actorAdminId/);
  assert.match(projection, /facts: \[\]/);
  assert.match(projection, /factCount: list\(document\.facts\)\.length/);
  assert.match(projection, /attributes: list\(card\.attributes\)\.slice\(0, 7\)/);
  assert.match(projection, /compactSourceUrls/);
});

test("Workflow Preview resumes a run after refresh and polls independently from the start request", async () => {
  const source = await readProjectFile("app/hotel-scanner-v2-workflow/HotelScannerV2WorkflowClient.tsx");

  assert.match(source, /stayhub_scanner_v2_workflow_run/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /scan-v2-workflow/);
  assert.match(source, /2500/);
  assert.match(source, /const currentRunId = runId/);
  assert.match(source, /runAccessToken/);
  assert.match(source, /X-Scanner-Scan-Run-Id/);
  assert.match(source, /X-Scanner-Workflow-Token/);
  assert.match(source, /encodeURIComponent\(currentRunId\)/);
});


test("Primary Scanner V2 UI uses the durable workflow client while sync route remains fallback-only", async () => {
  const page = await readProjectFile("app/hotel-scanner-v2/page.tsx");
  const syncRoute = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2/route.ts");

  assert.match(page, /HotelScannerV2WorkflowClient/);
  assert.doesNotMatch(page, /<HotelScannerV2Client/);
  assert.match(syncRoute, /runHotelIntakePipelineV2/);
  assert.doesNotMatch(syncRoute, /workflow\/api/);
});

test("Durable Scanner V2 workflow access token is HMAC-bound to actor, scan and run ids", async () => {
  const source = await readProjectFile("lib/server/hotel-scanner-v2-workflow-access.ts");

  assert.match(source, /createHmac\("sha256"/);
  assert.match(source, /actorAdminId/);
  assert.match(source, /scanRunId/);
  assert.match(source, /runId/);
  assert.match(source, /timingSafeEqual/);
});

test("Workflow callbacks are not intercepted by the existing staff middleware", async () => {
  const middleware = await readProjectFile("middleware.ts");

  assert.match(middleware, /matcher:\s*\["\/",\s*"\/staff\/:path\*"\]/);
  assert.doesNotMatch(middleware, /\.well-known\/workflow/);
});

test("Stable synchronous Scanner V2 remains available as an isolated fallback", async () => {
  const route = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2/route.ts");

  assert.match(route, /runHotelIntakePipelineV2/);
  assert.match(route, /maxDuration = 800/);
  assert.doesNotMatch(route, /workflow\/api/);
});

test("Workflow Preview remains evidence-only with no downstream production handoff", async () => {
  const files = await Promise.all([
    readProjectFile("workflows/hotel-scanner-v2-workflow.ts"),
    readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-workflow/route.ts"),
    readProjectFile("app/hotel-scanner-v2-workflow/page.tsx"),
  ]);
  const combined = files.join("\n");

  assert.doesNotMatch(combined, /factory-handoff|approvedHotelIntelligence\s*:/);
  assert.match(combined, /без Production handoff|no Production handoff/);
});


test("Scanner V2 workflow exposes a protected cancel route for stuck durable runs", async () => {
  const source = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-workflow/[runId]/cancel/route.ts");
  assert.match(source, /import \{ getRun \} from "workflow\/api"/);
  assert.match(source, /enforceControlPlaneSameOrigin/);
  assert.match(source, /canMutateControlPlane/);
  assert.match(source, /verifyScannerV2WorkflowAccessToken/);
  assert.match(source, /X-Scanner-Scan-Run-Id/);
  assert.match(source, /X-Scanner-Workflow-Token/);
  assert.match(source, /await run\.cancel\(\)/);
  assert.match(source, /scanner_v2_workflow_cancel_failed/);
});

test("Workflow Preview can cancel a stuck active run and release the scan form", async () => {
  const source = await readProjectFile("app/hotel-scanner-v2-workflow/HotelScannerV2WorkflowClient.tsx");
  assert.match(source, /async function cancelCurrentRun\(\)/);
  assert.match(source, /scan-v2-workflow\/\$\{encodeURIComponent\(runId\)\}\/cancel/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /copy\.cancelRun/);
  assert.match(source, /copy\.cancellingRun/);
  assert.match(source, /reset\(\)/);
});
