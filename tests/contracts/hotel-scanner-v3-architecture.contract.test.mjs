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


test("Scanner V3 M5 uses one signed quick inventory authority for the deep workflow", async () => {
  const previewRoute = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-preview/route.ts");
  const startRoute = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-workflow/route.ts");
  const workflow = await readProjectFile("workflows/hotel-scanner-v2-workflow.ts");
  const pipeline = await readProjectFile("lib/server/hotel-scanner-v2-pipeline-safe.ts");
  const client = await readProjectFile("app/hotel-scanner-v2-workflow/HotelScannerV2WorkflowClient.tsx");
  const token = await readProjectFile("lib/server/hotel-scanner-v3-authority-token.ts");

  assert.match(previewRoute, /createHotelInventoryAuthorityTokenV3/);
  assert.match(previewRoute, /inventoryAuthorityToken/);
  assert.match(startRoute, /verifyHotelInventoryAuthorityTokenV3/);
  assert.match(startRoute, /invalid_inventory_authority/);
  assert.match(workflow, /inventoryAuthority\?: Record<string, unknown>/);
  assert.match(workflow, /inventoryAuthority: input\.inventoryAuthority/);

  assert.match(pipeline, /applyHotelInventoryAuthorityV3/);
  assert.match(pipeline, /inventory_authority_delta_requires_review/);
  assert.match(pipeline, /authorityLocked: Boolean\(input\.inventoryAuthority\)/);
  assert.match(pipeline, /compareHotelInventorySnapshotsV3/);

  assert.match(client, /inventoryAuthorityToken/);
  assert.match(client, /No second crawl of the hotel is needed|Fallback for an oversized\/failed checkpoint handoff/);
  assert.doesNotMatch(client, /const quickRequest = fetch/);

  assert.match(token, /createHmac\("sha256"/);
  assert.match(token, /timingSafeEqual/);
  assert.match(token, /TOKEN_TTL_MS/);
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


test("Scanner V3 M6 resumes Deep Verification from the Quick crawl checkpoint", async () => {
  const crawler = await readProjectFile("lib/server/hotel-scanner-v2-crawler.ts");
  const rendered = await readProjectFile("lib/server/hotel-scanner-v2-crawler-rendered.ts");
  const intake = await readProjectFile("lib/server/hotel-scanner-v2-intake.ts");
  const previewRoute = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-preview/route.ts");
  const workflow = await readProjectFile("workflows/hotel-scanner-v2-workflow.ts");
  const client = await readProjectFile("app/hotel-scanner-v2-workflow/HotelScannerV2WorkflowClient.tsx");
  const checkpoint = await readProjectFile("lib/server/hotel-scanner-v3-discovery-checkpoint.ts");

  assert.match(crawler, /continuePublicHotelWebsiteV3/);
  assert.match(crawler, /already-read pages are authoritative crawl history/);
  assert.match(crawler, /attempted\.has\(url\)/);
  assert.match(crawler, /supportDomains = new Set\(\["policies", "faq", "contacts"\]\)/);
  assert.match(crawler, /isHotelScannerRobotsAllowed/);

  assert.match(rendered, /enrichHotelEvidenceRenderedV3/);
  assert.match(rendered, /renderMode === "browser"\) schedule\.delete/);
  assert.match(intake, /resumeHotelIntakeRenderedV3/);

  assert.match(checkpoint, /OPERATIONAL_TEXT_LIMIT/);
  assert.match(checkpoint, /SUPPORT_DOMAINS/);
  assert.match(checkpoint, /v3InventorySnapshot: undefined/);

  assert.match(previewRoute, /MAX_COMPRESSED_WORKFLOW_CHECKPOINT_BYTES/);
  assert.match(previewRoute, /gzipSync/);
  assert.match(previewRoute, /discoveryCheckpointGzip: checkpointGzip/);
  assert.match(previewRoute, /reusedDiscovery: true/);
  assert.match(previewRoute, /checkpointCompressedBytes <= MAX_COMPRESSED_WORKFLOW_CHECKPOINT_BYTES/);

  assert.match(workflow, /gunzipSync/);
  assert.match(workflow, /workflowDiscoveryCheckpoint/);
  assert.match(workflow, /input\.discoveryCheckpointGzip/);
  assert.match(workflow, /resumeHotelIntakeRenderedV3\(discoveryCheckpoint\)/);

  assert.match(client, /quickWorkflow\?\.runId/);
  assert.match(client, /No second crawl of the hotel is needed/);
  assert.match(client, /Fallback for an oversized\/failed checkpoint handoff/);
});

test("Scanner V3 M6 continuation remains bounded, public-only and robots-aware", async () => {
  const crawler = await readProjectFile("lib/server/hotel-scanner-v2-crawler.ts");
  const previewRoute = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-preview/route.ts");

  assert.match(crawler, /maxAdaptiveAttempts \?\? 40/);
  assert.match(crawler, /maxSupportAttempts \?\? 20/);
  assert.match(crawler, /FETCH_TIMEOUT_MS/);
  assert.match(crawler, /MAX_PAGE_BYTES/);
  assert.match(crawler, /deriveHotelPropertyScopeV2/);
  assert.match(crawler, /isHotelPropertyOperationalContentUrlV2/);
  assert.match(crawler, /scanner_v2_robots_disallowed/);

  assert.match(previewRoute, /400_000/);
  assert.doesNotMatch([crawler, previewRoute].join("\n"), /captcha[-_ ]solver|stealth[-_ ]plugin|credential stuffing|login bypass|robots bypass/iu);
});


test("Scanner V3 M7 canonical authority controls Quick entity count and list membership", async () => {
  const quick = await readProjectFile("lib/server/hotel-scanner-v2-quick-preview.ts");
  const previewRoute = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-preview/route.ts");
  const pipeline = await readProjectFile("lib/server/hotel-scanner-v2-pipeline-safe.ts");

  assert.match(quick, /domainHasV3Authority/);
  assert.match(quick, /allowEvidenceExpansion: !domainHasV3Authority/);
  assert.match(quick, /domainHasV3Authority\s*\?\s*domain\.expectedCount/s);
  assert.match(quick, /if \(options\.allowEvidenceExpansion === false\) return base/);

  assert.match(previewRoute, /hasReadyHotelInventoryAuthorityV3/);
  assert.doesNotMatch(previewRoute, /snapshot\.status === "READY"/);

  assert.match(pipeline, /observedAuthorityEligible/);
  assert.match(pipeline, /hasReadyHotelInventoryAuthorityV3/);
  assert.match(pipeline, /mergeHotelInventoryAuthoritiesV3/);
  assert.doesNotMatch(pipeline, /observedSnapshot\.status === "READY"/);
});

test("Scanner V3 M7 semantic enrichment cannot become an authority entity when V3 is locked", async () => {
  const quick = await readProjectFile("lib/server/hotel-scanner-v2-quick-preview.ts");

  const expansionGuard = quick.indexOf("if (options.allowEvidenceExpansion === false) return base");
  const evidenceHeadings = quick.indexOf("previewEvidenceHeadings(discovery, domain)", expansionGuard);
  assert.ok(expansionGuard >= 0);
  assert.ok(evidenceHeadings > expansionGuard);
});


test("Scanner V3 Quick stays inside the interactive request budget and hands unfinished work to Deep", async () => {
  const intake = await readProjectFile("lib/server/hotel-scanner-v2-intake.ts");
  const rendered = await readProjectFile("lib/server/hotel-scanner-v2-crawler-rendered.ts");
  const previewRoute = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-preview/route.ts");

  assert.match(previewRoute, /export const maxDuration = 90/);
  assert.match(intake, /maxStructuralAdaptiveAttempts:\s*24/);
  assert.match(intake, /60_000 - elapsedMs/);
  assert.match(intake, /Math\.min\(25_000, remainingQuickMs\)/);
  assert.match(rendered, /QUICK_PREVIEW_MAX_BROWSER_RENDERS = 4/);
  assert.match(rendered, /QUICK_PREVIEW_BROWSER_WALL_MS = 25_000/);
  assert.match(rendered, /options: \{ wallMs\?: number \}/);
  assert.match(rendered, /Date\.now\(\) - startedAt >= wallMs/);
});


test("Scanner V3 M9 authority is domain-scoped instead of hotel-wide all-or-nothing", async () => {
  const canonical = await readProjectFile("lib/server/hotel-scanner-v3-canonical-inventory.mjs");
  const quick = await readProjectFile("lib/server/hotel-scanner-v2-quick-preview.ts");
  const previewRoute = await readProjectFile("app/api/control-plane/hotel-scanner/scan-v2-preview/route.ts");
  const pipeline = await readProjectFile("lib/server/hotel-scanner-v2-pipeline-safe.ts");

  assert.match(canonical, /authorityStatus/);
  assert.match(canonical, /"READY"/);
  assert.match(canonical, /"PARTIAL"/);
  assert.match(canonical, /"CONFLICT"/);
  assert.match(canonical, /"MANUAL"/);
  assert.match(canonical, /hasReadyHotelInventoryAuthorityV3/);
  assert.match(canonical, /mergeHotelInventoryAuthoritiesV3/);
  assert.match(canonical, /if \(!authorityDomainReady\(authorityDomain/);
  assert.match(canonical, /comparedDomains/);
  assert.match(canonical, /authorityLostDomains/);

  assert.match(quick, /entry\.authorityStatus === "READY"/);
  assert.match(previewRoute, /hasReadyHotelInventoryAuthorityV3\(projectedAuthority\)/);
  assert.match(pipeline, /mergeHotelInventoryAuthoritiesV3/);
  assert.match(pipeline, /lockedReadyDomains/);
  assert.match(pipeline, /effectiveReadyDomains/);
});


test("Scanner Intake UI treats non-ready inventory as candidates and keeps manual domains manual", async () => {
  const quick = await readProjectFile("lib/server/hotel-scanner-v2-quick-preview.ts");
  const client = await readProjectFile("app/hotel-scanner-v2-workflow/HotelScannerV2WorkflowClient.tsx");
  const page = await readProjectFile("app/hotel-scanner-v2-workflow/page.tsx");

  assert.match(quick, /INTAKE_DOMAINS/);
  assert.match(quick, /candidateCount/);
  assert.match(quick, /authorityStatus/);
  assert.match(quick, /manualOnly = domain\.domain === "experiences"/);
  assert.doesNotMatch(quick, /INTAKE_DOMAINS = \[[^\]]*"offers"/s);

  assert.match(client, /Hotel Intake Preview/);
  assert.match(client, /INTAKE_VISIBLE_DOMAINS/);
  assert.match(client, /INTAKE_REVIEW_DOMAINS/);
  assert.match(client, /canonicalInventory\?\.authority\?\.domains/);
  assert.match(client, /canonicalInventory\?\.observed\?\.domains/);
  assert.match(client, /authorityStatus === "MANUAL"/);
  assert.match(client, /candidatesFound/);
  assert.match(client, /Извлечи данните/);
  assert.match(client, /result\.reviewSections\?\.filter/);
  assert.doesNotMatch(client, /\$\{copy\.found\}: \$\{inventoryLayer\.extracted\}\/\$\{inventoryLayer\.expected/);

  assert.match(page, /Hotel Scanner · Intake/);
  assert.match(page, /Internal Intake/);
});
