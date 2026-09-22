import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGuestDesignAssetUrl,
  collectVisibleHotelOfferAssetIds,
  getHotelOfferLocalDateKey,
  getVisibleHotelOffers,
  isHotelOfferVisible,
} from "../../lib/guest/hotel-offers.mjs";
import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const ASSET_A="11111111-1111-4111-8111-111111111111";
const ASSET_B="22222222-2222-4222-8222-222222222222";

function offer(overrides={}) {
  return {
    id:"33333333-3333-4333-8333-333333333333",
    key:"seasonal-offer",
    status:"active",
    sortOrder:1,
    validity:{startDate:null,endDate:null},
    assets:{coverAssetId:ASSET_A,galleryAssetIds:[],attachmentAssetIds:[ASSET_B]},
    ...overrides,
  };
}

test("hotel offer visibility uses hotel-local calendar date and respects scheduled windows", () => {
  const now=new Date("2026-12-01T00:30:00Z");
  assert.equal(getHotelOfferLocalDateKey("Europe/Berlin",now),"2026-12-01");
  assert.equal(isHotelOfferVisible(offer({status:"scheduled",validity:{startDate:"2026-12-01",endDate:"2026-12-24"}}),{timeZone:"Europe/Berlin",now}),true);
  assert.equal(isHotelOfferVisible(offer({status:"scheduled",validity:{startDate:"2026-12-02",endDate:null}}),{timeZone:"Europe/Berlin",now}),false);
  assert.equal(isHotelOfferVisible(offer({status:"active",validity:{startDate:null,endDate:"2026-11-30"}}),{timeZone:"Europe/Berlin",now}),false);
});

test("visible offer asset set contains only references from currently visible offers", () => {
  const now=new Date("2026-12-01T12:00:00Z");
  const offers=[
    offer(),
    offer({
      id:"44444444-4444-4444-8444-444444444444",
      key:"expired",
      validity:{startDate:null,endDate:"2026-11-30"},
      assets:{coverAssetId:"55555555-5555-4555-8555-555555555555",galleryAssetIds:[],attachmentAssetIds:[]},
    }),
  ];
  assert.equal(getVisibleHotelOffers(offers,{timeZone:"UTC",now}).length,1);
  assert.deepEqual(collectVisibleHotelOfferAssetIds(offers,{timeZone:"UTC",now}).sort(),[ASSET_A,ASSET_B].sort());
});

test("guest asset URL is same-origin and carries no storage path or signed token", () => {
  const url=buildGuestDesignAssetUrl("hotel-a",ASSET_A,{download:true});
  assert.equal(url,"/api/guest/design-asset?hotelSlug=hotel-a&assetId="+ASSET_A+"&download=1");
  assert.equal(url.includes("supabase"),false);
});

test("guest design asset endpoint authorizes through active hotel + published config + source key + visible offer reference", async () => {
  const source=await readProjectFile("app/api/guest/design-asset/route.ts");
  for(const fragment of [
    "getHotelByAnySlug(hotelSlug)",
    "getPublishedHotelConfigSnapshot(hotel.id)",
    "config.designAssetSourceKey",
    "collectVisibleHotelOfferAssetIds",
    '.from("hub_design_assets")',
    '.eq("source_key", sourceKey)',
    "authorizedAssetIds.has(assetId)",
    "createSignedUrl",
    "SIGNED_ASSET_TTL_SECONDS",
    "X-Content-Type-Options",
  ]) assertContains(source,fragment);

  assertNotContains(source,"getPublicUrl");
  assertNotContains(source,"public: true");
  assertNotContains(source,"SUPABASE_SERVICE_ROLE_KEY");
  assertNotContains(source,"storagePath=");
});
