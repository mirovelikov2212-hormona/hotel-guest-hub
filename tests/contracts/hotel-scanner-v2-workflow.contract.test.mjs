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

test("Scanner V2 workflow wraps the accepted stable pipeline in a durable step", async () => {
  const source = await readProjectFile("workflows/hotel-scanner-v2-workflow.ts");

  assert.match(source, /"use workflow"/);
  assert.match(source, /"use step"/);
  assert.match(source, /runHotelIntakePipelineV2/);
  assert.match(source, /FatalError/);
  assert.doesNotMatch(source, /crawlPublicHotelWebsiteRenderedV2/);
});

test("Scanner V2 workflow start route returns a run id without owning the scan lifetime", async () => {
  const source = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-workflow/route.ts");

  assert.match(source, /import \{ start \} from "workflow\/api"/);
  assert.match(source, /enforceControlPlaneSameOrigin/);
  assert.match(source, /getCurrentPlatformAdminSession/);
  assert.match(source, /start\(hotelScannerV2Workflow/);
  assert.match(source, /runId: run\.runId/);
  assert.match(source, /202/);
});

test("Scanner V2 workflow status route reads durable status and final return value", async () => {
  const source = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-workflow/[runId]/route.ts");

  assert.match(source, /import \{ getRun \} from "workflow\/api"/);
  assert.match(source, /getCurrentPlatformAdminSession/);
  assert.match(source, /await run\.status/);
  assert.match(source, /status === "completed"/);
  assert.match(source, /await run\.returnValue/);
  assert.match(source, /status === "failed"/);
});

test("Workflow Preview resumes a run after refresh and polls independently from the start request", async () => {
  const source = await readProjectFile("app/hotel-scanner-v2-workflow/HotelScannerV2WorkflowClient.tsx");

  assert.match(source, /stayhub_scanner_v2_workflow_run/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /scan-v2-workflow/);
  assert.match(source, /2500/);
  assert.match(source, /encodeURIComponent\(runId\)/);
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
