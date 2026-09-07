import assert from "node:assert/strict";
import test from "node:test";

import { extractPublicTechnologySignals } from "../../lib/server/hotel-scanner-public-technology.mjs";

const base = "https://hotel.test/";

test("public technology extractor captures bounded browser-visible integration signals", () => {
  const html = `
    <html>
      <head>
        <link rel="manifest" href="/manifest.webmanifest">
        <script src="https://cdn.vendor.test/widget.js"></script>
        <script>navigator.serviceWorker.register('/sw.js')</script>
      </head>
      <body>
        <a href="/rooms">Rooms</a>
        <a href="https://booking.quendoo.com/hotel/fixture">Book</a>
        <a href="https://accounts.hotel.test/login">Guest account</a>
        <iframe src="https://chat.vendor.test/embed"></iframe>
        <form action="https://forms.vendor.test/lead"></form>
      </body>
    </html>
  `;

  const result = extractPublicTechnologySignals(html, base);
  assert.deepEqual(result.externalLinks, [
    "https://booking.quendoo.com/hotel/fixture",
    "https://accounts.hotel.test/login",
  ]);
  assert.deepEqual(result.scriptSrcs, ["https://cdn.vendor.test/widget.js"]);
  assert.deepEqual(result.iframeSrcs, ["https://chat.vendor.test/embed"]);
  assert.deepEqual(result.formActions, ["https://forms.vendor.test/lead"]);
  assert.deepEqual(result.manifestUrls, ["https://hotel.test/manifest.webmanifest"]);
  assert.deepEqual(result.serviceWorkerUrls, ["https://hotel.test/sw.js"]);
});

test("public technology extractor ignores unsafe/non-http schemes and de-duplicates values", () => {
  const html = `
    <a href="mailto:info@hotel.test">Mail</a>
    <a href="javascript:alert(1)">Bad</a>
    <a href="https://booking.vendor.test/">Book</a>
    <a href="https://booking.vendor.test/#again">Book again</a>
    <script src="data:text/javascript,alert(1)"></script>
    <iframe src="javascript:void(0)"></iframe>
  `;
  const result = extractPublicTechnologySignals(html, base);
  assert.deepEqual(result.externalLinks, ["https://booking.vendor.test/"]);
  assert.deepEqual(result.scriptSrcs, []);
  assert.deepEqual(result.iframeSrcs, []);
});

test("public technology extraction remains explicitly bounded", () => {
  const links = Array.from({ length: 100 }, (_, index) => `<a href="https://vendor${index}.test/x">x</a>`).join("\n");
  const scripts = Array.from({ length: 100 }, (_, index) => `<script src="https://cdn${index}.test/x.js"></script>`).join("\n");
  const result = extractPublicTechnologySignals(`${links}${scripts}`, base);
  assert.equal(result.externalLinks.length, 40);
  assert.equal(result.scriptSrcs.length, 30);
});
