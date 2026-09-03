import test from "node:test";

import { assertContains, readProjectFile } from "../helpers/source-contract.mjs";

test("sandbox direct communication RPC allows test stays only for sandbox hotels", async () => {
  const migration = await readProjectFile(
    "supabase/migrations/20260903075500_allow_sandbox_test_stay_direct_rpc.sql",
  );

  assertContains(migration, "append_guest_direct_communication_v1");
  assertContains(migration, "coalesce(gs.is_test, false) = false");
  assertContains(migration, "h.id = p_hotel_id");
  assertContains(migration, "h.is_sandbox = true");
  assertContains(migration, "GUEST_DIRECT_COMMUNICATION_STAY_INVALID");
  assertContains(migration, "security invoker");
  assertContains(migration, "to service_role");
});
