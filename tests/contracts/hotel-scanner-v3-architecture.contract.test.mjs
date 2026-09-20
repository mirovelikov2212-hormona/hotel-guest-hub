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
  assert.match(client, /M5 deliberately avoids two concurrent crawlers hitting the same hotel/);
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
