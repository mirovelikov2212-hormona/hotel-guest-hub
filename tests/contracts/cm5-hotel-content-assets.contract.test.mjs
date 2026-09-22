import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateHubCreativeTechnicalQuality,
  readHubCreativeImageDimensions,
} from "../../lib/product-factory/hub-creative-quality.mjs";
import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

function png(width,height) {
  const bytes=new Uint8Array(24);
  bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],0);
  bytes[16]=(width>>>24)&255; bytes[17]=(width>>>16)&255; bytes[18]=(width>>>8)&255; bytes[19]=width&255;
  bytes[20]=(height>>>24)&255; bytes[21]=(height>>>16)&255; bytes[22]=(height>>>8)&255; bytes[23]=height&255;
  return bytes;
}

test("Hub creative technical gate reads real image dimensions and separates website source from Hub approval", () => {
  assert.deepEqual(readHubCreativeImageDimensions(png(1080,1350),"image/png"),{width:1080,height:1350});

  const hub=evaluateHubCreativeTechnicalQuality({
    kind:"image",creativeSurface:"hub_ready",width:1080,height:1350,
  });
  assert.equal(hub.qualityStatus,"pass");
  assert.equal(hub.hubReviewStatus,"approved");

  const website=evaluateHubCreativeTechnicalQuality({
    kind:"image",creativeSurface:"website_source",width:1080,height:1350,
  });
  assert.equal(website.qualityStatus,"pass");
  assert.equal(website.hubReviewStatus,"pending_review");
});

test("low-resolution creatives fail closed and PDFs require mobile review", () => {
  const low=evaluateHubCreativeTechnicalQuality({
    kind:"image",creativeSurface:"hub_ready",width:500,height:300,
  });
  assert.equal(low.qualityStatus,"fail");
  assert.equal(low.hubReviewStatus,"rejected");

  const pdf=evaluateHubCreativeTechnicalQuality({
    kind:"document",creativeSurface:"hub_ready",
  });
  assert.equal(pdf.qualityStatus,"warning");
  assert.equal(pdf.hubReviewStatus,"pending_review");
});

test("manager asset pipeline is hotel + draft scoped and validates bytes before DB registration", async () => {
  const source=await readProjectFile("lib/server/hotel-content-assets.ts");
  for(const fragment of [
    "resolveManagerContentChangeScope",
    '.eq("hotel_id", input.hotelId)',
    '.eq("status", "draft")',
    "createSignedUploadUrl",
    ".download(storagePath)",
    "validateHubDesignAssetBytes",
    "readHubCreativeImageDimensions",
    "evaluateHubCreativeTechnicalQuality",
    '"register_hotel_content_asset_v1"',
    '"review_hotel_content_asset_v1"',
  ]) assertContains(source,fragment);
  assertNotContains(source,"getPublicUrl");
  assertNotContains(source,"public: true");
});

test("website creative cannot be silently treated as approved Hub creative", async () => {
  const source=await readProjectFile("lib/product-factory/hub-creative-quality.mjs");
  assertContains(source,'creativeSurface === "website_source"');
  assertContains(source,'"pending_review"');
  assertContains(source,'"PDF_MOBILE_READABILITY_REVIEW_REQUIRED"');
});

test("manager offer save accepts only approved asset metadata and enforces asset kind", async () => {
  const source=await readProjectFile("lib/server/manager-offer-changes.ts");
  for(const fragment of [
    '.eq("hub_review_status", "approved")',
    '.neq("quality_status", "fail")',
    "CM5_OFFER_COVER_ASSET_NOT_IMAGE",
    "CM5_OFFER_GALLERY_ASSET_NOT_IMAGE",
    "CM5_OFFER_READY_CREATIVE_KIND_MISMATCH",
  ]) assertContains(source,fragment);
});

test("guest asset route serves manager assets only after lifecycle activation and Hub approval", async () => {
  const source=await readProjectFile("app/api/guest/design-asset/route.ts");
  for(const fragment of [
    '.from("hotel_content_assets")',
    '.eq("hotel_id", hotel.id)',
    '.eq("lifecycle_status", "active")',
    '.eq("hub_review_status", "approved")',
    '.neq("quality_status", "fail")',
  ]) assertContains(source,fragment);
});
