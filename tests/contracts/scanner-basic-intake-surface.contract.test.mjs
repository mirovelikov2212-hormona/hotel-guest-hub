import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("legacy Scanner entrypoints converge on the bounded basic intake surface", async () => {
  for (const path of [
    "app/hotel-scanner/page.tsx",
    "app/hotel-scanner-v2/page.tsx",
  ]) {
    const source = await readProjectFile(path);
    assertContains(source, 'redirect(`/hotel-scanner-v2-workflow?lang=${lang}`)');
    assertNotContains(source, "HotelScannerClient");
    assertNotContains(source, "HotelScannerV2WorkflowClient");
  }
});

test("active Scanner intake UI uses only quick preview and exposes no deep workflow action", async () => {
  const source = await readProjectFile(
    "app/hotel-scanner-v2-workflow/HotelScannerV2WorkflowClient.tsx",
  );

  assertContains(
    source,
    'fetch("/api/control-plane/hotel-scanner/scan-v2-preview"',
  );
  assertNotContains(
    source,
    'fetch("/api/control-plane/hotel-scanner/scan"',
  );
  assertNotContains(source, "/scan-v2-workflow/resume");

  const page = await readProjectFile("app/hotel-scanner-v2-workflow/page.tsx");
  assertContains(page, "Basic Intake");
  assertContains(page, "bounded quick preview");
  assertContains(page, 'href={`/control-plane?lang=${lang}`}');
  assertNotContains(page, "durable workflow");
});

test("quick preview remains non-production and does not launch deep continuation", async () => {
  const route = await readProjectFile(
    "app/api/control-plane/hotel-scanner/scan-v2-preview/route.ts",
  );

  assertContains(route, "deepWorkflowStarted: false");
  assertNotContains(route, "resumeHotelIntakeRenderedV3");
  assertNotContains(route, "createHotelScanRun");
});
