import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveHotelPropertyScopeV2,
  isHotelPropertyDocumentUrlInScopeV2,
  isHotelPropertyPageUrlInScopeV2,
} from "../../lib/server/hotel-scanner-v2-property-scope.mjs";

test("chain hotel scan is scoped to exactly one property root across languages", () => {
  const scope = deriveHotelPropertyScopeV2(
    "https://chain.test/arycanda-kirman-premium",
    "https://chain.test/arycanda-kirman-premium",
  );

  assert.equal(scope.mode, "PATH_ROOT");
  assert.equal(scope.rootPath, "/arycanda-kirman-premium");

  assert.equal(
    isHotelPropertyPageUrlInScopeV2("https://chain.test/arycanda-kirman-premium/en/rooms", scope),
    true,
  );
  assert.equal(
    isHotelPropertyPageUrlInScopeV2("https://chain.test/tr/arycanda-kirman-premium/spa", scope),
    true,
  );
  assert.equal(
    isHotelPropertyPageUrlInScopeV2("https://chain.test/sidera-kirman-premium/en/spa", scope),
    false,
  );
  assert.equal(
    isHotelPropertyPageUrlInScopeV2("https://chain.test/en/offers", scope),
    false,
  );
});

test("root-domain hotel scans retain origin-wide behavior", () => {
  const scope = deriveHotelPropertyScopeV2("https://independent-hotel.test/bg/");
  assert.equal(scope.mode, "ORIGIN");
  assert.equal(isHotelPropertyPageUrlInScopeV2("https://independent-hotel.test/en/rooms", scope), true);
  assert.equal(isHotelPropertyPageUrlInScopeV2("https://other-hotel.test/en/rooms", scope), false);
});

test("property scope supports generic chain containers such as /hotels/property-name", () => {
  const scope = deriveHotelPropertyScopeV2("https://chain.test/hotels/blue-bay");
  assert.deepEqual(scope.rootSegments, ["hotels", "blue-bay"]);
  assert.equal(isHotelPropertyPageUrlInScopeV2("https://chain.test/en/hotels/blue-bay/spa", scope), true);
  assert.equal(isHotelPropertyPageUrlInScopeV2("https://chain.test/hotels/red-bay/spa", scope), false);
});

test("sitemap documents outside property root require property identity, while direct hotel links may use shared PDFs", () => {
  const scope = deriveHotelPropertyScopeV2("https://chain.test/arycanda-kirman-premium");

  assert.equal(
    isHotelPropertyDocumentUrlInScopeV2(
      "https://chain.test/factsheet/arycanda/factsheet-short-en.pdf",
      scope,
    ),
    true,
  );
  assert.equal(
    isHotelPropertyDocumentUrlInScopeV2(
      "https://chain.test/factsheet/sidera/factsheet-short-en.pdf",
      scope,
    ),
    false,
  );
  assert.equal(
    isHotelPropertyDocumentUrlInScopeV2(
      "https://chain.test/upload/shared-all-inclusive-concept.pdf",
      scope,
      { directlyLinkedFromProperty: true },
    ),
    true,
  );
});
