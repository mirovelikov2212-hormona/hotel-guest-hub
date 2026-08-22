import test from "node:test";

import { assertContains, assertNotContains, readProjectFile } from "../helpers/source-contract.mjs";

const MIGRATION = "supabase/migrations/20260822193000_p2_6_3_recertification_qualified_previous_cert.sql";

test("P2.6.3 previous certification lookup is fully qualified against RETURNS TABLE names", async () => {
  const migration = await readProjectFile(MIGRATION);

  assertContains(migration, "select c.* into v_previous_cert");
  assertContains(migration, "from public.factory_production_runtime_certification_runs c");
  assertContains(migration, "c.publication_run_id=p_publication_run_id");
  assertContains(migration, "c.production_hotel_id=p_expected_production_hotel_id");
  assertContains(migration, "c.production_revision_id=p_expected_production_revision_id");
  assertContains(migration, "c.status='passed'");
  assertContains(migration, "order by c.created_at desc,c.id desc");
  assertContains(migration, "P2_6_3_RECERTIFICATION_PREVIOUS_CERT_SOURCE_GUARD_FAILED");
  assertContains(migration, "P2_6_3_RECERTIFICATION_PREVIOUS_CERT_PATCH_GUARD_FAILED");
  assertNotContains(migration, "update public.factory_production_runtime_certification_runs");
  assertNotContains(migration, "delete from public.factory_production_runtime_certification_runs");
  assertNotContains(migration, "set active=true");
  assertNotContains(migration, "last_known_good_revision_id=");
});
