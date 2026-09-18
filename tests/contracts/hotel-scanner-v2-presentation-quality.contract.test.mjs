import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("Scanner V2 localizes client-facing entity names without changing canonical inventory subjects", async () => {
  const config = await readProjectFile("lib/ai/hotel-scanner-v2-extraction-config.ts");
  const prompt = await readProjectFile("lib/ai/hotel-scanner-v2-extraction-openai.ts");
  const projection = await readProjectFile("lib/product-factory/hotel-intelligence-review-cards.ts");

  assert.match(config, /display_name/);
  assert.match(prompt, /subject MUST equal that item's exact nameHint/);
  assert.match(prompt, /display_name is presentation metadata only/);
  assert.match(prompt, /Never use display_name to invent an entity/);
  assert.match(projection, /projectedDisplayName/);
  assert.match(projection, /name: displayName \|\| clean\(item\.nameHint/);
});

test("Scanner V2 review projection groups repeated attributes and normalizes presentation synonyms", async () => {
  const projection = await readProjectFile("lib/product-factory/hotel-intelligence-review-cards.ts");

  assert.match(projection, /CANONICAL_REVIEW_ATTRIBUTES/);
  assert.match(projection, /hours: "opening_hours"/);
  assert.match(projection, /booking: "reservation"/);
  assert.match(projection, /const groups = new Map/);
  assert.match(projection, /renderedValues\.join/);
  assert.match(projection, /if \(itemName && entity\) return sameEntityName/);
});

test("Scanner V2 contact and source URLs are contained inside review cards", async () => {
  const client = await readProjectFile("app/hotel-scanner-v2/HotelScannerV2ReviewWorkspace.tsx");

  assert.match(client, /minmax\(0,1\.5fr\)/);
  assert.match(client, /overflowWrap: "anywhere"/);
  assert.match(client, /whitespace-pre-line/);
  assert.match(client, /max-w-full break-all/);
  assert.match(client, /overflow-hidden/);
});
