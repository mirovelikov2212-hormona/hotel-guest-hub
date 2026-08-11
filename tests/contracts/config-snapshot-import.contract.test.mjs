import test from "node:test";

import {
  assertBefore,
  assertContains,
  assertNotContains,
  readProjectFile,
} from "../helpers/source-contract.mjs";

test("M9 snapshot importer defaults to dry-run and requires internal bearer auth", async () => {
  const source = await readProjectFile(
    "app/api/admin/config-snapshots/import/route.ts",
  );

  assertContains(source, 'process.env.CONFIG_ADMIN_SECRET');
  assertContains(source, 'req.headers.get("authorization")');
  assertContains(source, "authorization === `Bearer ${configuredSecret}`");
  assertContains(source, "dryRun: body.dryRun !== false");

  assertBefore(
    source,
    "if (!isAuthorizedInternalRequest(req))",
    "importHotelConfigSnapshotDraft({",
  );
});

test("snapshot draft strips live identity/test fields and hashes canonical config", async () => {
  const source = await readProjectFile(
    "lib/server/config-snapshot-import.ts",
  );

  for (const field of [
    '"hotelId"',
    '"hotelSlug"',
    '"publicSlug"',
    '"isSandbox"',
    '"productionHotelId"',
    '"testRoomNumbers"',
  ]) {
    assertContains(source, field);
  }

  assertContains(source, 'createHash("sha256")');
  assertContains(source, "canonicalJson(config)");
  assertContains(source, "buildProvenance(config)");
  assertContains(source, "validateSnapshot(config)");
});

test("snapshot importer writes only through the hotel-scoped atomic draft RPC", async () => {
  const source = await readProjectFile(
    "lib/server/config-snapshot-import.ts",
  );

  assertContains(source, '"create_hotel_config_draft"');
  assertContains(source, "p_hotel_id: sources.hotelId");
  assertContains(source, 'p_source_type: "sheet_snapshot"');

  assertNotContains(
    source,
    '.from("hotel_config_revisions")',
    "Revision numbering and de-duplication must stay atomic inside the DB RPC.",
  );
});

test("snapshot importer always reads fresh editorial sheet config, not published runtime", async () => {
  const source = await readProjectFile("lib/server/config-snapshot-import.ts");

  assertContains(source, "getHotelConfigFromSheets");
  assertNotContains(
    source,
    "getHotelConfig(hotelSlug)",
    "Importer must not snapshot the already-published runtime configuration.",
  );
});
