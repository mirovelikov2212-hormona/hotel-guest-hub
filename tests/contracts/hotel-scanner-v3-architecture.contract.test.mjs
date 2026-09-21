import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("Scanner V3 structural engine is hotel-agnostic and independent from AI/domain regexes", async () => {
  const graph = await readProjectFile("lib/server/hotel-scanner-v3-site-graph.mjs");
  const lists = await readProjectFile("lib/server/hotel-scanner-v3-list-detector.mjs");
  const families = await readProjectFile("lib/server/hotel-scanner-v3-page-families.mjs");
  const inventory = await readProjectFile("lib/server/hotel-scanner-v3-structural-inventory.mjs");
  const dom = await readProjectFile("lib/server/hotel-scanner-v3-dom-structure.mjs");

  const combined = [graph, lists, families, inventory, dom].join("\n");
  assert.doesNotMatch(combined, /edelweiss|bahia|kirman|pavel|grand resort/iu);
  assert.doesNotMatch(combined, /OpenAI|openai\.responses|chat\.completions|normalizeHotelScanWithOpenAi/iu);
  assert.doesNotMatch(combined, /accommodation|gastronomy|restaurant|spa|wellness|room[_ -]?detail/iu);

  assert.match(graph, /hotel-scanner-v3-site-graph-1/);
  assert.match(lists, /content_block_link_cluster/);
  assert.match(families, /CONTENT_LIST/);
  assert.match(inventory, /hotel-scanner-v3-structural-inventory-1/);
  assert.match(inventory, /duplicateLabelsAcrossFamilies/);
  assert.match(inventory, /unresolvedMembers/);
  assert.match(dom, /templateFingerprint/);
  assert.match(dom, /repeated_dom_siblings/);
  assert.match(dom, /sha256/);
});

test("Scanner V3 keeps family-scoped identity instead of global label dedupe", async () => {
  const families = await readProjectFile("lib/server/hotel-scanner-v3-page-families.mjs");
  assert.match(families, /identityKey/);
  assert.match(families, /family\.id/);
  assert.doesNotMatch(families, /new Set\([^\n]*label/);
});


test("Scanner V3 DOM evidence is attached to both HTTP and rendered crawl paths", async () => {
  const crawler = await readProjectFile("lib/server/hotel-scanner-v2-crawler.ts");
  const rendered = await readProjectFile("lib/server/hotel-scanner-v2-crawler-rendered.ts");
  const lists = await readProjectFile("lib/server/hotel-scanner-v3-list-detector.mjs");

  assert.match(crawler, /extractHotelDomStructureV3/);
  assert.match(crawler, /v3Structure/);
  assert.match(rendered, /richerV3Structure/);
  assert.match(rendered, /renderedV3Structure/);
  assert.match(lists, /repeated_dom_siblings/);
  assert.match(lists, /page\?\.v3Structure\?\.repeatedStructures/);
});


test("Scanner V3 M3 adaptive closure drives the crawler by default with V2 loops only as fallback", async () => {
  const crawler = await readProjectFile("lib/server/hotel-scanner-v2-crawler.ts");
  const frontier = await readProjectFile("lib/server/hotel-scanner-v3-frontier.mjs");

  assert.match(crawler, /buildHotelScannerAdaptivePlanV3/);
  assert.match(crawler, /useStructuralAdaptiveCrawl\s*=\s*options\.useStructuralAdaptiveCrawl\s*!==\s*false/);
  assert.match(crawler, /hotel-scanner-v3-adaptive-crawl-1/);
  assert.match(crawler, /SAFETY_CAP/);
  assert.match(crawler, /inventoryClosed:\s*finalPlan\.inventoryClosed/);
  assert.match(crawler, /else\s*\{\s*while \(pages\.length < maxInitialPages/s);

  assert.match(frontier, /SAMPLE_TERMINALITY/);
  assert.match(frontier, /EXPAND_ALL/);
  assert.match(frontier, /CLOSED_INFERRED_LEAF/);
  assert.match(frontier, /CLOSED_EXPANDED/);
  assert.match(frontier, /INVENTORY_BLOCKED/);
  assert.match(frontier, /INVENTORY_CLOSED/);
  assert.match(frontier, /sitemap_branch/);
  assert.match(frontier, /page_content/);
});

test("Scanner V3 M3 frontier remains hotel and domain agnostic", async () => {
  const frontier = await readProjectFile("lib/server/hotel-scanner-v3-frontier.mjs");

  assert.doesNotMatch(frontier, /edelweiss|bahia|kirman|pavel|grand resort/iu);
  assert.doesNotMatch(frontier, /\b(?:accommodation|gastronomy|restaurant|restaurants|spa|wellness|room|rooms)\b/iu);
  assert.doesNotMatch(frontier, /OpenAI|chat\.completions|responses\.create/iu);
});


test("Scanner V3 M4 ontology classifies families but cannot determine structural counts", async () => {
  const ontology = await readProjectFile("lib/server/hotel-scanner-v3-ontology.mjs");
  const canonical = await readProjectFile("lib/server/hotel-scanner-v3-canonical-inventory.mjs");

  assert.match(ontology, /classifyHotelStructuralFamilyV3/);
  assert.match(ontology, /HOTEL_SCANNER_V3_OPERATIONAL_DOMAINS/);
  assert.match(ontology, /UNKNOWN/);
  assert.doesNotMatch(ontology, /expectedCount|inventoryCount|entityCount\s*=/);
  assert.doesNotMatch(ontology, /edelweiss|bahia|kirman|pavel|grand resort/iu);
  assert.doesNotMatch(ontology, /OpenAI|chat\.completions|responses\.create/iu);

  assert.match(canonical, /buildHotelStructuralInventoryGraphV3/);
  assert.match(canonical, /classifyHotelStructuralFamiliesV3/);
  assert.match(canonical, /structuralEntities:\s*entities\.length/);
  assert.match(canonical, /hotelScannerV3LogicalUrlKey/);
  assert.match(canonical, /cross_family_domain_conflict/);
  assert.match(canonical, /inventory-v3:/);
  assert.match(canonical, /applyHotelInventoryEnrichmentV3/);
  assert.match(canonical, /compareHotelInventorySnapshotsV3/);
  assert.doesNotMatch(canonical, /edelweiss|bahia|kirman|pavel|grand resort/iu);
  assert.doesNotMatch(canonical, /OpenAI|chat\.completions|responses\.create/iu);
});

test("Scanner V3 M4 canonical snapshot is attached before and after browser enrichment", async () => {
  const crawler = await readProjectFile("lib/server/hotel-scanner-v2-crawler.ts");
  const rendered = await readProjectFile("lib/server/hotel-scanner-v2-crawler-rendered.ts");

  assert.match(crawler, /v3InventorySnapshot/);
  assert.match(crawler, /buildHotelInventorySnapshotV3/);
  assert.match(rendered, /refreshV3InventorySnapshot/);
  assert.match(rendered, /return refreshV3InventorySnapshot\(base\)/);
});


test("Scanner Intake no longer auto-starts Deep from the quick route", async () => {
  const previewRoute = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-preview/route.ts");
  const client = await readProjectFile("app/hotel-scanner-v2-workflow/HotelScannerV2WorkflowClient.tsx");

  assert.match(previewRoute, /scanner_intake_quick_completed/);
  assert.match(previewRoute, /deepWorkflowStarted:\s*false/);
  assert.doesNotMatch(previewRoute, /workflow\/api|hotelScannerV2Workflow|discoveryCheckpointGzip|createScannerV2WorkflowAccessToken/);

  assert.match(client, /\/api\/control-plane\/hotel-scanner\/scan-v2-preview/);
  assert.doesNotMatch(client, /scan-v2-workflow\/\$\{|quickWorkflow|runAccessToken|pollStartedAt|Deep Verification/);
});

test("Scanner V3 M5 authority keeps public crawling bounded and does not add bypass behavior", async () => {
  const crawler = await readProjectFile("lib/server/hotel-scanner-v2-crawler.ts");
  const rendered = await readProjectFile("lib/server/hotel-scanner-v2-crawler-rendered.ts");
  const token = await readProjectFile("lib/server/hotel-scanner-v3-authority-token.ts");

  assert.match(crawler, /isHotelScannerRobotsAllowed/);
  assert.match(crawler, /publicBusinessBoundary: true/);
  assert.match(rendered, /isHotelScannerRobotsAllowed/);
  assert.doesNotMatch([crawler, rendered, token].join("\n"), /bypass|captcha[-_ ]solver|stealth[-_ ]plugin|credential stuffing|login bypass/iu);
});


test("Scanner V3 deep continuation remains available internally but is not part of Intake", async () => {
  const crawler = await readProjectFile("lib/server/hotel-scanner-v2-crawler.ts");
  const intake = await readProjectFile("lib/server/hotel-scanner-v2-intake.ts");
  const workflow = await readProjectFile("workflows/hotel-scanner-v2-workflow.ts");
  const client = await readProjectFile("app/hotel-scanner-v2-workflow/HotelScannerV2WorkflowClient.tsx");

  assert.match(crawler, /continuePublicHotelWebsiteV3/);
  assert.match(intake, /resumeHotelIntakeRenderedV3/);
  assert.match(workflow, /resumeHotelIntakeRenderedV3/);
  assert.doesNotMatch(client, /resumeHotelIntakeRenderedV3|Deep Verification|workflow_run/);
});

test("Scanner V3 M6 continuation remains bounded, public-only and robots-aware", async () => {
  const crawler = await readProjectFile("lib/server/hotel-scanner-v2-crawler.ts");
  assert.match(crawler, /maxAdaptiveAttempts \?\? 40/);
  assert.match(crawler, /maxSupportAttempts \?\? 20/);
  assert.match(crawler, /FETCH_TIMEOUT_MS/);
  assert.match(crawler, /MAX_PAGE_BYTES/);
  assert.match(crawler, /deriveHotelPropertyScopeV2/);
  assert.match(crawler, /isHotelPropertyOperationalContentUrlV2/);
  assert.match(crawler, /scanner_v2_robots_disallowed/);

  assert.doesNotMatch(crawler, /captcha[-_ ]solver|stealth[-_ ]plugin|credential stuffing|login bypass|robots bypass/iu);
});


test("Scanner Intake ignores site-wide V3 authority and uses targeted room/dining landing pages", async () => {
  const quick = await readProjectFile("lib/server/hotel-scanner-v2-quick-preview.ts");
  const previewRoute = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-preview/route.ts");
  const pipeline = await readProjectFile("lib/server/hotel-scanner-v2-pipeline-safe.ts");

  assert.match(quick, /targetedDomainItems/);
  assert.match(quick, /deriveHotelPageInventoryHintsV2/);
  assert.match(quick, /hotelScannerPageTypeDomain\(classification\.primaryType\) !== domain/);
  assert.match(quick, /roomCardItems/);
  assert.match(quick, /atomicVenueItems/);
  assert.match(quick, /Intake deliberately ignores site-wide V3 inventory authority/);
  assert.match(quick, /inventoryAuthority:\s*null/);

  // V3 authority remains available to the internal deep/pipeline code, but it
  // no longer controls the lightweight onboarding Intake projection.
  assert.match(previewRoute, /hasReadyHotelInventoryAuthorityV3/);
  assert.match(pipeline, /observedAuthorityEligible/);
  assert.match(pipeline, /mergeHotelInventoryAuthoritiesV3/);
});

test("Scanner Intake bounds noisy landing-page candidates instead of exposing site-wide counts", async () => {
  const quick = await readProjectFile("lib/server/hotel-scanner-v2-quick-preview.ts");

  assert.match(quick, /uniqueIntakeItems\(items, domain === "accommodation" \? 30 : 20\)/);
  assert.match(quick, /homepageItems/);
  assert.match(quick, /detailSuffix/);
  assert.match(quick, /ROOM_AREA_SIGNAL/);
  assert.match(quick, /ROOM_OCCUPANCY_SIGNAL/);
  assert.match(quick, /const nearest = clocks\.sort/);
});

test("Scanner V3 Quick stays inside the interactive request budget as the final Intake path", async () => {
  const intake = await readProjectFile("lib/server/hotel-scanner-v2-intake.ts");
  const rendered = await readProjectFile("lib/server/hotel-scanner-v2-crawler-rendered.ts");
  const previewRoute = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-preview/route.ts");

  assert.match(previewRoute, /export const maxDuration = 90/);
  assert.doesNotMatch(previewRoute, /hotelScannerV2Workflow|workflow\/api/);
  assert.match(intake, /maxStructuralAdaptiveAttempts:\s*24/);
  assert.match(intake, /60_000 - elapsedMs/);
  assert.match(intake, /Math\.min\(25_000, remainingQuickMs\)/);
  assert.match(rendered, /QUICK_PREVIEW_MAX_BROWSER_RENDERS = 4/);
  assert.match(rendered, /QUICK_PREVIEW_BROWSER_WALL_MS = 25_000/);
  assert.match(rendered, /options: \{ wallMs\?: number \}/);
  assert.match(rendered, /Date\.now\(\) - startedAt >= wallMs/);
});


test("Scanner V3 M9 authority remains domain-scoped for internal deep verification", async () => {
  const canonical = await readProjectFile("lib/server/hotel-scanner-v3-canonical-inventory.mjs");
  const previewRoute = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-preview/route.ts");
  const pipeline = await readProjectFile("lib/server/hotel-scanner-v2-pipeline-safe.ts");

  assert.match(canonical, /authorityStatus/);
  assert.match(canonical, /"READY"/);
  assert.match(canonical, /"PARTIAL"/);
  assert.match(canonical, /"CONFLICT"/);
  assert.match(canonical, /"MANUAL"/);
  assert.match(canonical, /hasReadyHotelInventoryAuthorityV3/);
  assert.match(canonical, /mergeHotelInventoryAuthoritiesV3/);
  assert.match(canonical, /comparedDomains/);
  assert.match(canonical, /authorityLostDomains/);

  assert.match(previewRoute, /hasReadyHotelInventoryAuthorityV3\(projectedAuthority\)/);
  assert.match(pipeline, /mergeHotelInventoryAuthoritiesV3/);
  assert.match(pipeline, /lockedReadyDomains/);
  assert.match(pipeline, /effectiveReadyDomains/);
});

test("Scanner Intake is a broad categorized source index for manual onboarding", async () => {
  const quick = await readProjectFile("lib/server/hotel-scanner-v2-quick-preview.ts");
  const client = await readProjectFile("app/hotel-scanner-v2-workflow/HotelScannerV2WorkflowClient.tsx");
  const design = await readProjectFile("app/design-studio/VersionedDesignStudioClient.tsx");
  const pkg = await readProjectFile("lib/product-factory/hotel-intelligence-package.ts");

  assert.match(quick, /buildOnboardingSources/);
  assert.match(quick, /SOURCE_CATEGORY_ORDER/);
  assert.match(quick, /"wellness"/);
  assert.match(quick, /"services"/);
  assert.match(quick, /"experiences"/);
  assert.match(quick, /"events"/);
  assert.match(quick, /"offers"/);
  assert.match(quick, /"policies"/);
  assert.match(quick, /"contacts"/);
  assert.match(quick, /"documents"/);
  assert.match(quick, /buildIntakeInfo/);

  assert.match(client, /Onboarding източници/);
  assert.match(client, /groupedSources/);
  assert.match(client, /Отвори в Design Studio/);

  assert.match(pkg, /onboardingSources\?: HotelOnboardingSource\[\]/);
  assert.match(design, /Onboarding източници/);
  assert.match(design, /usedSourceIds/);
  assert.match(design, /localStorage\.setItem/);
});

