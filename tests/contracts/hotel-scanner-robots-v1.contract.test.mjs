import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHotelScannerRobotsPolicy,
  isHotelScannerRobotsAllowed,
} from "../../lib/server/hotel-scanner-robots.mjs";

test("robots policy honors specific StayHub group over wildcard", () => {
  const policy = buildHotelScannerRobotsPolicy(`
User-agent: *
Disallow: /private/
Disallow: /account/

User-agent: StayHub-Hotel-Scanner
Disallow: /scanner-blocked/
Allow: /scanner-blocked/public/
Sitemap: https://hotel.test/sitemap.xml
`);
  assert.equal(isHotelScannerRobotsAllowed("https://hotel.test/private/page", policy), true);
  assert.equal(isHotelScannerRobotsAllowed("https://hotel.test/scanner-blocked/page", policy), false);
  assert.equal(isHotelScannerRobotsAllowed("https://hotel.test/scanner-blocked/public/menu", policy), true);
  assert.deepEqual(policy.sitemaps, ["https://hotel.test/sitemap.xml"]);
});

test("robots wildcard policy applies when no dedicated scanner group exists", () => {
  const policy = buildHotelScannerRobotsPolicy(`
User-agent: *
Disallow: /account/
Disallow: /search?private=*
Allow: /account/public-info
`);
  assert.equal(isHotelScannerRobotsAllowed("https://hotel.test/rooms", policy), true);
  assert.equal(isHotelScannerRobotsAllowed("https://hotel.test/account/profile", policy), false);
  assert.equal(isHotelScannerRobotsAllowed("https://hotel.test/account/public-info", policy), true);
  assert.equal(isHotelScannerRobotsAllowed("https://hotel.test/search?private=yes", policy), false);
});

test("empty robots disallow does not block crawling", () => {
  const policy = buildHotelScannerRobotsPolicy("User-agent: *\nDisallow:\n");
  assert.equal(isHotelScannerRobotsAllowed("https://hotel.test/", policy), true);
});
