import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Factory 620 contention uses 20 devices on an authoritative room", async () => {
  const source = await readFile(new URL("../../scripts/factory-final-620-peak.mjs", import.meta.url), "utf8");

  assert.match(source, /const contentionIdentityKey = \(actorIndex\) => `1:contention:\$\{actorIndex\}`;/);
  assert.match(source, /add\(1, 1, contentionIdentityKey\(actorIndex\)\);/);
  assert.match(source, /for \(let actorIndex = 1; actorIndex <= 20; actorIndex \+= 1\)/);
  assert.match(source, /"massage_contention",\s*1,\s*1,\s*identityByKey\.get\(contentionIdentityKey\(actorIndex\)\)/);
  assert.doesNotMatch(source, /for \(let roomIndex = 1; roomIndex <= 20; roomIndex \+= 1\)/);
  assert.match(source, /contentionRows\.length === 20/);
  assert.match(source, /expectedTotalOperations: 620/);
  assert.match(source, /contentionWinners\.length === 1 && contentionRejected\.length === 19/);
});
