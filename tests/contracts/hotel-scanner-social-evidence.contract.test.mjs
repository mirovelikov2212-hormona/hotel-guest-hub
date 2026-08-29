import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

const crawlerPath = "lib/server/factory-hotel-scanner.ts";
const socialEvidencePath = "lib/server/hotel-scanner-social-evidence.ts";
const routePath = "app/api/control-plane/hotel-scanner/scan/route.ts";

test("Hotel Scanner records social profiles without crawling external social networks", async () => {
  const crawler = await readProjectFile(crawlerPath);
  const social = await readProjectFile(socialEvidencePath);

  assertContains(crawler, "candidate.origin !== base.origin");
  assertContains(social, "SOCIAL_HOSTS");
  assertContains(social, '"facebook.com"');
  assertContains(social, '"instagram.com"');
  assertContains(social, "SHARE_PATH_PATTERN");
  assertContains(social, "extractHotelSocialLinksFromHtml");
  assertContains(social, "validatePublicHotelUrl(canonicalUrl)");
  assertContains(social, 'redirect: "error"');
  assertContains(social, "FETCH_TIMEOUT_MS = 6_000");
  assertContains(social, "MAX_HTML_BYTES = 1_000_000");
  assertNotContains(social, ".from(");
  assertNotContains(social, "publishRevision");
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
