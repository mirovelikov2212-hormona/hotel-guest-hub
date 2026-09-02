import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("normalized runtime cache payloads are explicitly schema-versioned across deployments", async () => {
  const source = await readProjectFile("lib/server/normalized-config-runtime.ts");

  assert.match(
    source,
    /NORMALIZED_RUNTIME_CACHE_SCHEMA_VERSION\s*=\s*"v2-request-def-contract"/,
  );
  assert.match(source, /namespace:\s*"normalized-config-runtime-v2"/);
  assert.match(
    source,
    /return `\$\{NORMALIZED_RUNTIME_CACHE_SCHEMA_VERSION\}:\$\{scope\}:\$\{hotelId\}:\$\{revisionId\}:\$\{sourceChecksum\}`/,
  );
  assert.doesNotMatch(
    source,
    /const cacheKey = `rooms:\$\{input\.hotelId\}:\$\{input\.published\.revisionId\}:\$\{input\.published\.sourceChecksum\}`/,
  );
  assert.doesNotMatch(
    source,
    /const cacheKey = `departments:\$\{input\.hotelId\}:\$\{input\.published\.revisionId\}:\$\{input\.published\.sourceChecksum\}`/,
  );
});
