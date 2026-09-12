import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("Control Plane login preserves Hotel Scanner V1 and V2 destinations", async () => {
  const source = await readProjectFile("lib/control-plane-next.ts");

  assert.match(source, /"\/hotel-scanner"/);
  assert.match(source, /pathname === prefix \|\| pathname\.startsWith\(`\$\{prefix\}\/`\)/);
});
