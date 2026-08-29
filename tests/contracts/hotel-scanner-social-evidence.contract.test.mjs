import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const crawlerPath = "lib/server/factory-hotel-scanner.ts";
const socialEvidencePath = "lib/server/hotel-scanner-social-evidence.ts";
const routePath = "app/api/control-plane/hotel-scanner/scan/route.ts";

function loadSocialEvidenceModule(source, fetchImpl) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    URL,
    AbortSignal,
    TextDecoder,
    console,
    fetch: fetchImpl,
    require(specifier) {
      if (specifier === "server-only") return {};
      if (specifier === "@/lib/server/factory-hotel-scanner") {
        return {
          validatePublicHotelUrl: async (rawUrl) => new URL(String(rawUrl)),
        };
      }
      throw new Error(`Unexpected test import: ${specifier}`);
    },
  };

  vm.runInNewContext(compiled, context, { filename: socialEvidencePath });
  return module.exports;
}

test("Hotel Scanner records social profiles without crawling external social networks", async () => {
  const crawler = await readProjectFile(crawlerPath);
  const social = await readProjectFile(socialEvidencePath);

  assertContains(crawler, "candidate.origin !== base.origin");
  assertContains(social, "SOCIAL_HOSTS");
  assertContains(social, '"facebook.com"');
  assertContains(social, '"instagram.com"');
  assertContains(social, "SHARE_PATH_PATTERN");
  assertContains(social, "extractHotelSocialLinksFromHtml");
  assertContains(social, "candidate.origin !== base.origin");
  assertContains(social, "next.origin !== origin");
  assertNotContains(social, "fetch(candidate");
  assertNotContains(social, ".from(");
  assertNotContains(social, "publishRevision");
});

test("Social evidence discovery follows bounded same-origin hotel pages", async () => {
  const social = await readProjectFile(socialEvidencePath);

  assertContains(social, "MAX_PAGES = 6");
  assertContains(social, "MAX_REDIRECTS = 5");
  assertContains(social, "FETCH_TIMEOUT_MS = 6_000");
  assertContains(social, "MAX_RESPONSE_BYTES = 8_000_000");
  assertContains(social, "HTML_OVERLAP_CHARS = 16_384");
  assertContains(social, "response.body?.getReader()");
  assertContains(social, "bytesRead < MAX_RESPONSE_BYTES");
  assertContains(social, "reader.cancel()");
  assertContains(social, "HOTEL_PAGE_PRIORITY");
  assertContains(social, "extractSameOriginHotelLinks");
  assertContains(social, "fetchSocialPageEvidence");
  assertContains(social, "collectHotelSocialLinkEvidence(input: string | string[])");
  assertContains(social, "...first.hotelLinks");
  assertContains(social, "Promise.all(");
  assertContains(social, "allowedOrigin");
  assertContains(social, 'redirect: "manual"');
  assertNotContains(social, 'redirect: "error"');
  assertNotContains(social, "if (contentLength > MAX_HTML_BYTES) return null");
  assertNotContains(social, "(await response.text()).slice");
});

test("Large hotel HTML keeps footer Facebook and Instagram evidence", async () => {
  const source = await readProjectFile(socialEvidencePath);
  const fetchedUrls = [];
  const largeHtml = [
    "<!doctype html><html><body>",
    "x".repeat(1_100_000),
    '<footer><a href="https://www.facebook.com/examplehotel/">Facebook</a>',
    '<a href="https://www.instagram.com/examplehotel/">Instagram</a></footer>',
    "</body></html>",
  ].join("");

  const socialModule = loadSocialEvidenceModule(source, async (input) => {
    fetchedUrls.push(String(input));
    return new Response(largeHtml, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-length": String(Buffer.byteLength(largeHtml, "utf8")),
      },
    });
  });

  const links = await socialModule.collectHotelSocialLinkEvidence("https://hotel.example/");

  assert.deepEqual([...links], [
    "https://www.facebook.com/examplehotel/",
    "https://www.instagram.com/examplehotel/",
  ]);
  assert.deepEqual(fetchedUrls, ["https://hotel.example/"]);
  assert.equal(fetchedUrls.some((url) => /facebook|instagram/i.test(url)), false);
});

test("Detected social profiles become authoritative contact evidence", async () => {
  const route = await readProjectFile(routePath);

  assertContains(route, "collectHotelSocialLinkEvidence(crawledEvidence.canonicalUrl)");
  assertContains(route, "buildSocialFacts(detectedSocialLinks, evidence.canonicalUrl)");
  assertContains(route, 'category: "contact"');
  assertContains(route, "confidence: 1");
  assertContains(route, "socialLinks: detectedSocialLinks");
  assertContains(route, "SOCIAL_UNCERTAINTY_PATTERN");
  assertContains(route, "profileWithRichFacts.uncertainties.filter");
  assertContains(route, "detectedSocialLinkCount: detectedSocialLinks.length");
});
