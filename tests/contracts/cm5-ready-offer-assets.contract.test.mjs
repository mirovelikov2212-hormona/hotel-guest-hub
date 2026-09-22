import assert from "node:assert/strict";
import test from "node:test";

import { validateHubOfferV2 } from "../../lib/product-factory/hub-offer-contract.ts";
import { getHotelOfferReadyCreative } from "../../lib/guest/hotel-offers.mjs";
import { collectHubDesignAssetIds } from "../../lib/product-factory/hub-design-assets.ts";
import {
  assertContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const IMAGE="11111111-1111-4111-8111-111111111111";
const PDF="22222222-2222-4222-8222-222222222222";

function offer() {
  return {
    schemaVersion:"hub-offer-v2",
    id:"33333333-3333-4333-8333-333333333333",
    key:"agency-ready-offer",
    titleByLang:{en:"Agency offer"},
    shortDescriptionByLang:{},
    descriptionByLang:{},
    badgeByLang:{},
    pricing:{amountMinor:null,previousAmountMinor:null,currency:null},
    validity:{startDate:null,endDate:null},
    cta:{labelByLang:{},action:"none",destination:null},
    assets:{
      coverAssetId:null,
      galleryAssetIds:[],
      attachmentAssetIds:[],
      readyCreativeByLang:{
        default:{assetId:IMAGE,kind:"image"},
        de:{assetId:PDF,kind:"document"},
      },
    },
    presentationMode:"ready_asset",
    status:"active",
    sortOrder:1,
    source:{kind:"change_editor",sourceRef:null},
    designDraft:true,
  };
}

test("ready-made agency offers are first-class Offer V2 assets", () => {
  const value=offer();
  const validation=validateHubOfferV2(value);
  assert.equal(validation.ok,true,validation.errors.join(","));
  assert.deepEqual(collectHubDesignAssetIds([value]).sort(),[IMAGE,PDF].sort());
});

test("ready-made offer creative resolves by guest language with safe fallback", () => {
  const value=offer();
  assert.deepEqual(getHotelOfferReadyCreative(value,"de"),{assetId:PDF,kind:"document",language:"de"});
  assert.deepEqual(getHotelOfferReadyCreative(value,"ro"),{assetId:IMAGE,kind:"image",language:"default"});
});

test("ready_asset mode requires an actual ready creative", () => {
  const value=offer();
  value.assets.readyCreativeByLang={};
  const validation=validateHubOfferV2(value);
  assert.equal(validation.ok,false);
  assert.ok(validation.errors.includes("OFFER_READY_CREATIVE_REQUIRED"));
});

test("factory and manager paths preserve ready creative asset lineage", async () => {
  const factory=await readProjectFile("lib/product-factory/factory-design-runtime-model.mjs");
  const manager=await readProjectFile("lib/server/manager-offer-changes.ts");
  const guest=await readProjectFile("lib/guest/hotel-offers.mjs");
  for(const fragment of [
    "readyCreativeByLang",
    "presentationMode",
    "FACTORY_DESIGN_OFFER_READY_CREATIVE_REQUIRED",
  ]) assertContains(factory,fragment);
  for(const fragment of [
    "normalizeReadyCreativeByLang",
    "CM5_OFFER_READY_CREATIVE_REQUIRED",
    "readyCreativeByLang",
  ]) assertContains(manager,fragment);
  assertContains(guest,"getHotelOfferReadyCreative");
});
