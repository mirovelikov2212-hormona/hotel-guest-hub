import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Scanner V2 projects review cards from canonical inventory, not arbitrary facts", async () => {
  const source = await read("lib/product-factory/hotel-intelligence-review-cards.ts");
  assert.match(source, /candidate\.inventory\.domains/);
  assert.match(source, /domain\.expectedItems\.map/);
  assert.match(source, /matchesItem/);
  assert.match(source, /dedicatedBasis/);
  assert.match(source, /statusFor/);
});

test("Hub review reuses the canonical live-content expiry semantics for dated events and offers", async () => {
  const source = await read("lib/product-factory/hotel-intelligence-review-cards.ts");
  assert.match(source, /parseHotelLiveContentValidity/);
  assert.match(source, /hotelLiveContentTemporalState/);
  assert.match(source, /isExpiredLiveReviewCard/);
  assert.match(source, /candidate\.source\.scannedAt/);
  assert.match(source, /domain\.domain === "events" \|\| domain\.domain === "offers"/);
});

test("safe pipeline exposes reviewSections beside immutable candidate evidence", async () => {
  const source = await read("lib/server/hotel-scanner-v2-pipeline-safe.ts");
  assert.match(source, /buildHotelReviewSectionsV2/);
  assert.match(source, /const reviewSections = buildHotelReviewSectionsV2\(intelligenceCandidate\)/);
  assert.match(source, /reviewSections,/);
  assert.match(source, /approvedHotelIntelligence:\s*null/);
});

test("client review workspace is website-like and keeps evidence secondary", async () => {
  const source = await read("app/hotel-scanner-v2/HotelScannerV2ReviewWorkspace.tsx");
  assert.match(source, /one real entity = one card|един реален обект = една карта/i);
  assert.match(source, /EntityCard/);
  assert.match(source, /SourceLinks/);
  assert.match(source, /Пълно техническо доказателство|Full technical evidence/);
  assert.match(source, /Реални проблеми и несъответствия|Real website issues/);
  assert.match(source, /card\.conflicts\.length/);
});
