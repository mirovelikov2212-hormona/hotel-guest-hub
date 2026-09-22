import test from "node:test";

import {
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("Hotel Standard authoring keeps hotel source separate from structured proposal", async () => {
  const source = await readProjectFile("lib/server/staff-standard-authoring.ts");

  for (const fragment of [
    '"manual"',
    '"document"',
    '"hotel_staff_standard_authoring"',
    '"staff_standard_source_documents"',
    "source_text",
    "structured_proposal_json",
    "proposal_hash",
    "normalizeHotelStaffStandard",
  ]) {
    assertContains(source, fragment);
  }
});

test("Hotel Standard source documents are private, declaration-bound and content-validated", async () => {
  const source = await readProjectFile("lib/server/staff-standard-authoring.ts");

  for (const fragment of [
    'const SOURCE_BUCKET = "staff-development-sources"',
    '"application/pdf"',
    '"application/vnd.openxmlformats-officedocument.wordprocessingml.document"',
    '"text/plain"',
    'prefix === "%PDF-"',
    'searchable.includes("[Content_Types].xml")',
    'searchable.includes("word/document.xml")',
    'new TextDecoder("utf-8", { fatal: true })',
    'crypto.createHash("sha256")',
    "createSignedUploadUrl",
    "createSignedUrl",
  ]) {
    assertContains(source, fragment);
  }
});

test("Structured Standard proposal preserves explicit Hotel vs Department scope supplied by Manager authority", async () => {
  const source = await readProjectFile("lib/server/staff-standard-authoring.ts");

  assertContains(source, "standardScope: authoring.standard_scope");
  assertContains(source, "departmentCodes: authoring.department_codes");
  assertContains(source, "standardKey: authoring.standard_key");
  assertContains(source, "revisionNo: 1");
  assertContains(source, 'status: "draft"');
  assertContains(source, "STAFF_STANDARD_AUTHORING_MANAGER_SCOPE_FORBIDDEN");
});

test("Publishing is a separate human Manager action and atomically creates Standard plus Training Plan", async () => {
  const source = await readProjectFile("lib/server/staff-standard-authoring.ts");
  const route = await readProjectFile(
    "app/api/staff/development/standards/authoring/route.ts",
  );
  const panel = await readProjectFile(
    "components/staff/StaffStandardAuthoringPanel.tsx",
  );

  for (const fragment of [
    "requireManagerIdentity(input.hotelSlug)",
    'allowedStatuses: ["proposal_ready"]',
    "deriveStaffTrainingPlan(publishedStandard)",
    '"publish_staff_standard_authoring_v2"',
    'action === "publish"',
    "window.confirm(copy.approvalWarning)",
  ]) {
    assertContains(source + route + panel, fragment);
  }

  assertNotContains(route, "body.hotelId");
  assertNotContains(route, "body.actorStaffUserId");
});

test("Authoring UI makes hotel ownership of Standards explicit and supports manual plus document intake", async () => {
  const panel = await readProjectFile(
    "components/staff/StaffStandardAuthoringPanel.tsx",
  );

  for (const fragment of [
    '"Хотелът качва собствените си стандарти.',
    'sourceKind === "manual"',
    'standardScope === "hotel"',
    'standardScope === "department"',
    "copy.hotelScope",
    "copy.departmentScope",
    'selected.source_kind === "document"',
    '".pdf,.docx,.txt',
    '"save_proposal"',
    '"publish"',
    "LANGUAGES",
    '"bg"',
    '"en"',
    '"de"',
    '"ro"',
    '"cs"',
    '"ru"',
  ]) {
    assertContains(panel, fragment);
  }
});

test("Authoring code does not auto-publish from AI output", async () => {
  const source =
    await readProjectFile("lib/server/staff-standard-authoring.ts")
    + await readProjectFile(
      "app/api/staff/development/standards/authoring/route.ts",
    );

  for (const forbidden of [
    "responses.create",
    "chat.completions",
    "auto_publish",
    "automatic_publish",
    "publish_from_ai",
  ]) {
    assertNotContains(source, forbidden);
  }
});
