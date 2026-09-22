import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("CM5.3 offer editor validates typed Offer V2 records and builds server-side semantic diff", async () => {
  const source=await readProjectFile("lib/server/manager-offer-changes.ts");
  for(const fragment of [
    "validateHubOfferV2",
    "buildHotelConfigVersionDiff",
    "manager-offer-change-v1",
    'kind: "replace_offers"',
    "manager-offer-preview-v1",
    '"save_hotel_content_offer_draft_v1"',
  ]) assertContains(source,fragment);

  assertNotContains(source,"jsonPatch");
  assertNotContains(source,"p_config_json");
  assertNotContains(source,".update({ config_json");
});

test("CM5.3 offer editor supports six guest languages and preserves server authority", async () => {
  const source=await readProjectFile("lib/server/manager-offer-changes.ts");
  assertContains(source,'const GUEST_LANGUAGES = ["bg", "en", "de", "ro", "cs", "ru"]');
  assertContains(source,'kind: "change_editor"');
  assertContains(source,"sortOrder: index + 1");
  assertContains(source,"sourceRef: changeRequestId");
});

test("CM5.3 rejects foreign assets and unsupported runtime CTA destinations", async () => {
  const source=await readProjectFile("lib/server/manager-offer-changes.ts");
  for(const fragment of [
    "CM5_OFFER_ASSET_NOT_OWNED",
    'ALLOWED_INTERNAL_DESTINATIONS = new Set(["home", "page-services", "page-offers"])',
    "CM5_OFFER_REQUEST_SERVICE_UNSUPPORTED",
    "requestServiceDestinations(live.config)",
  ]) assertContains(source,fragment);
});

test("CM5.3 API remains manager-session and same-origin scoped", async () => {
  const route=await readProjectFile("app/api/staff/content-changes/offers/route.ts");
  const source=await readProjectFile("lib/server/manager-offer-changes.ts");
  assertContains(route,"enforceStaffSameOrigin(req)");
  assertContains(source,"resolveManagerContentChangeScope");
  assertContains(source,'.eq("hotel_id", scope.hotelId)');
  assertNotContains(route + source,"PlatformAdminAuthority");
});

test("CM5 diff classifier treats offers as content instead of operational routing", async () => {
  const diff=await readProjectFile("lib/server/factory-production-version-diff.mjs");
  assertContains(diff,'"offers",');
});

test("CM5.3 generic layer has no pilot hotel or fixed housekeeping schedule", async () => {
  const source=(await readProjectFile("lib/server/manager-offer-changes.ts")).toLowerCase();
  for(const forbidden of ["aquamarine","aquamarin","kranevo","kirman","08:00","17:00"]) {
    assertNotContains(source,forbidden);
  }
});
